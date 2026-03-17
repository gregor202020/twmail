import { Queue, type ConnectionOptions } from 'bullmq';
import { getDb, getRedis, CampaignStatus } from '@twmail/shared';
import { logger } from './logger.js';

/** Campaigns stuck in SENDING longer than this are re-enqueued by the scheduler. */
export const STALE_SENDING_THRESHOLD_MS = 10 * 60 * 1000; // 600_000 ms = 10 minutes

/**
 * Scheduled campaign trigger + stale recovery.
 *
 * Polls every 60 seconds for:
 *   1. Campaigns with status=SCHEDULED and scheduled_at <= NOW() -- triggers them
 *   2. Campaigns with status=SENDING and send_started_at older than 10 minutes -- re-enqueues
 *
 * Race-safe: The UPDATE uses WHERE status = SCHEDULED as a guard.
 * If two worker replicas poll simultaneously, only one will successfully
 * update the row (PostgreSQL row-level locking). The other gets 0 rows
 * and skips.
 *
 * Stale recovery: campaigns stuck in SENDING for longer than STALE_SENDING_THRESHOLD_MS
 * are re-enqueued without changing status. The campaign-send worker handles
 * re-resolution of unsent contacts idempotently (shouldSkipSend dedup).
 */
export async function startScheduler(): Promise<{ interval: NodeJS.Timeout; queue: Queue }> {
  const db = getDb();
  const redis = getRedis();
  const campaignSendQueue = new Queue('campaign-send', {
    connection: redis as unknown as ConnectionOptions,
  });

  const poll = async () => {
    try {
      // 1. Find all campaigns due to fire (SCHEDULED and past their scheduled_at)
      const due = await db
        .selectFrom('campaigns')
        .select(['id'])
        .where('status', '=', CampaignStatus.SCHEDULED)
        .where('scheduled_at', '<=', new Date())
        .execute();

      for (const campaign of due) {
        // Atomic transition: only SCHEDULED -> SENDING if still SCHEDULED
        const result = await db
          .updateTable('campaigns')
          .set({ status: CampaignStatus.SENDING, send_started_at: new Date() })
          .where('id', '=', campaign.id)
          .where('status', '=', CampaignStatus.SCHEDULED)
          .returningAll()
          .executeTakeFirst();

        if (result) {
          await campaignSendQueue.add('send', { campaignId: campaign.id });
          logger.info(
            { campaignId: campaign.id },
            'Scheduler: campaign transitioned SCHEDULED -> SENDING',
          );
        }
      }

      // 2. SENDING stall recovery: re-enqueue campaigns stuck in SENDING > 10 minutes
      const staleThreshold = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS);
      const stuck = await db
        .selectFrom('campaigns')
        .select(['id'])
        .where('status', '=', CampaignStatus.SENDING)
        .where('send_started_at', '<=', staleThreshold)
        .execute();

      for (const campaign of stuck) {
        await campaignSendQueue.add('send', { campaignId: campaign.id });
        logger.warn(
          { campaignId: campaign.id },
          'Scheduler: re-enqueued stuck campaign (SENDING > 10min)',
        );
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler poll error');
    }
  };

  // Run immediately on start, then every 60 seconds
  await poll();
  const interval = setInterval(() => void poll(), 60_000);

  logger.info('Scheduler: polling every 60s for SCHEDULED campaigns');

  return { interval, queue: campaignSendQueue };
}
