import { Worker, Queue, type Job, type ConnectionOptions } from 'bullmq';
import { getDb, getRedis, CampaignStatus, ContactStatus } from '@twmail/shared';
import { logger } from '../logger.js';

export interface ResendJobData {
  campaignId: number;
}

/**
 * Resend worker: sends a follow-up campaign to contacts who did not engage
 * with the original campaign.
 *
 * Processing:
 *   1. Load original campaign + resend_config
 *   2. Find contacts who were sent the campaign but never opened (or never clicked)
 *   3. Filter to ACTIVE contacts with recent activity
 *   4. Create a new resend campaign (resend_of = original campaignId)
 *   5. Enqueue campaign-send job for the new campaign
 */
export function createResendWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<ResendJobData>(
    'resend',
    async (job: Job<ResendJobData>) => {
      const { campaignId } = job.data;
      const db = getDb();

      const campaign = await db
        .selectFrom('campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

      if (!campaign) {
        logger.error({ campaignId }, 'Resend: campaign not found');
        return { error: 'campaign_not_found' };
      }

      if (!campaign.resend_enabled || !campaign.resend_config) {
        logger.info({ campaignId }, 'Resend: not enabled for this campaign');
        return { skipped: true, reason: 'resend_not_enabled' };
      }

      const config = campaign.resend_config as {
        trigger?: string;
        new_subject?: string;
        new_preview_text?: string;
        content_mode?: string;
        only_engaged_days?: number;
      };

      const trigger = config.trigger ?? 'non_open';
      const engagedDays = config.only_engaged_days ?? 90;

      // Find non-engagers based on trigger type
      let nonEngagedQuery = db
        .selectFrom('messages')
        .select('contact_id')
        .where('campaign_id', '=', campaignId)
        .where('status', '>=', 2); // at least SENT

      if (trigger === 'non_open') {
        // Contacts who were sent the email but never opened it
        nonEngagedQuery = nonEngagedQuery.where('first_open_at', 'is', null);
      } else if (trigger === 'non_click') {
        // Contacts who opened but did not click
        nonEngagedQuery = nonEngagedQuery
          .where('first_open_at', 'is not', null)
          .where('first_click_at', 'is', null);
      }

      const nonEngaged = await nonEngagedQuery.execute();
      const contactIds = nonEngaged.map((m) => m.contact_id);

      if (contactIds.length === 0) {
        logger.info({ campaignId }, 'Resend: no non-engaged contacts found');
        return { sent: 0 };
      }

      // Filter to active contacts with recent activity
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - engagedDays);

      const eligibleContacts = await db
        .selectFrom('contacts')
        .select('id')
        .where('id', 'in', contactIds)
        .where('status', '=', ContactStatus.ACTIVE)
        .where((eb) =>
          eb.or([
            eb('last_activity_at', '>=', cutoffDate),
            eb('last_activity_at', 'is', null), // new contacts with no activity yet
          ]),
        )
        .execute();

      const eligibleIds = eligibleContacts.map((c) => c.id);

      if (eligibleIds.length === 0) {
        logger.info({ campaignId }, 'Resend: no eligible contacts after filtering');
        return { sent: 0 };
      }

      // Create a new campaign as a resend of the original
      const resendCampaign = await db
        .insertInto('campaigns')
        .values({
          name: `${campaign.name} (Resend)`,
          subject: config.new_subject ?? campaign.subject,
          preview_text: config.new_preview_text ?? campaign.preview_text,
          from_name: campaign.from_name,
          from_email: campaign.from_email,
          reply_to: campaign.reply_to,
          template_id: campaign.template_id,
          content_html: campaign.content_html,
          content_json: campaign.content_json,
          resend_of: campaignId,
          status: CampaignStatus.SENDING,
          send_started_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Set Redis counter for the resend campaign
      await redis.set(`twmail:remaining:${resendCampaign.id}`, eligibleIds.length, 'EX', 604800);

      // Enqueue individual send jobs
      const bulkSendQueue = new Queue('bulk-send', {
        connection: redis as unknown as ConnectionOptions,
      });

      for (const contactId of eligibleIds) {
        await bulkSendQueue.add('send', {
          contactId,
          campaignId: resendCampaign.id,
        });
      }

      await bulkSendQueue.close();

      logger.info(
        { originalCampaignId: campaignId, resendCampaignId: resendCampaign.id, eligibleCount: eligibleIds.length },
        'Resend: campaign created and jobs enqueued',
      );

      return { resendCampaignId: resendCampaign.id, queued: eligibleIds.length };
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, campaignId: job?.data?.campaignId, err }, 'Resend job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Resend worker error');
  });

  return worker;
}
