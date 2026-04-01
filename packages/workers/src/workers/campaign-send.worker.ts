import { Worker, Queue, type Job, type ConnectionOptions } from 'bullmq';
import {
  getDb,
  getRedis,
  CampaignStatus,
  ContactStatus,
  resolveSegmentContactIds,
} from '@twmail/shared';
import { logger } from '../logger.js';

export interface CampaignSendJobData {
  campaignId: number;
}

/**
 * Campaign-send worker: orchestrates the fan-out of individual email sends.
 *
 * When a campaign is triggered (manually or by the scheduler), a single job
 * lands on the 'campaign-send' queue. This worker:
 *   1. Loads the campaign
 *   2. Resolves recipient contact IDs (segment or list)
 *   3. Handles A/B test variant distribution + holdback persistence
 *   4. Creates individual bulk-send jobs for each contact
 *   5. Sets the Redis counter for campaign completion tracking
 */
export function createCampaignSendWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<CampaignSendJobData>(
    'campaign-send',
    async (job: Job<CampaignSendJobData>) => {
      const { campaignId } = job.data;
      const db = getDb();

      const campaign = await db
        .selectFrom('campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

      if (!campaign) {
        logger.error({ campaignId }, 'Campaign not found');
        return { error: 'campaign_not_found' };
      }

      // Resolve recipient contact IDs
      let contactIds: number[] = [];

      if (campaign.segment_id) {
        contactIds = await resolveSegmentContactIds(campaign.segment_id);
      } else if (campaign.list_id) {
        const rows = await db
          .selectFrom('contacts')
          .select('contacts.id')
          .innerJoin('contact_lists', 'contact_lists.contact_id', 'contacts.id')
          .where('contact_lists.list_id', '=', campaign.list_id)
          .where('contacts.status', '=', ContactStatus.ACTIVE)
          .execute();
        contactIds = rows.map((r) => r.id);
      }

      if (contactIds.length === 0) {
        logger.warn({ campaignId }, 'No contacts to send to, marking campaign as SENT');
        await db
          .updateTable('campaigns')
          .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
          .where('id', '=', campaignId)
          .execute();
        return { sent: 0 };
      }

      // Update send_started_at if not already set
      if (!campaign.send_started_at) {
        await db
          .updateTable('campaigns')
          .set({ send_started_at: new Date() })
          .where('id', '=', campaignId)
          .execute();
      }

      const bulkSendQueue = new Queue('bulk-send', {
        connection: redis as unknown as ConnectionOptions,
      });

      try {
        if (campaign.warmup_enabled && campaign.warmup_config) {
          await handleWarmupSend(db, redis, bulkSendQueue, campaignId, contactIds, campaign);
        } else if (campaign.ab_test_enabled && campaign.ab_test_config) {
          await handleAbTestSend(db, redis, bulkSendQueue, campaignId, contactIds, campaign);
        } else {
          await handleStandardSend(redis, bulkSendQueue, campaignId, contactIds);
        }
      } finally {
        await bulkSendQueue.close();
      }

      logger.info(
        { campaignId, totalContacts: contactIds.length },
        'Campaign send orchestration complete',
      );

      return { queued: contactIds.length };
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, campaignId: job?.data?.campaignId, err }, 'Campaign send job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Campaign send worker error');
  });

  return worker;
}

/**
 * Standard (non-A/B) send: enqueue a bulk-send job for every contact.
 */
async function handleStandardSend(
  redis: ReturnType<typeof getRedis>,
  bulkSendQueue: Queue,
  campaignId: number,
  contactIds: number[],
): Promise<void> {
  // Set Redis counter for completion tracking (TTL 7 days)
  await redis.set(`twmail:remaining:${campaignId}`, contactIds.length, 'EX', 604800);

  for (const contactId of contactIds) {
    await bulkSendQueue.add('send', { contactId, campaignId });
  }
}

/**
 * A/B test send:
 *   - Split contacts into test group + holdback group based on test_percentage
 *   - Distribute test contacts across variants by percentage
 *   - Persist holdback contacts to PostgreSQL (survives Redis eviction)
 *   - Schedule an ab-eval job to determine the winner
 */
async function handleAbTestSend(
  db: ReturnType<typeof getDb>,
  redis: ReturnType<typeof getRedis>,
  bulkSendQueue: Queue,
  campaignId: number,
  contactIds: number[],
  campaign: { ab_test_config: Record<string, unknown> | null },
): Promise<void> {
  const abConfig = (campaign.ab_test_config ?? {}) as {
    test_percentage?: number;
    winner_wait_hours?: number;
  };
  const testPct = abConfig.test_percentage ?? 20;
  const testSize = Math.ceil(contactIds.length * (testPct / 100));

  // Shuffle contacts for random assignment (Fisher-Yates)
  const shuffled = [...contactIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const testContacts = shuffled.slice(0, testSize);
  const holdbackContacts = shuffled.slice(testSize);

  // Fetch variants for this campaign
  const variants = await db
    .selectFrom('campaign_variants')
    .selectAll()
    .where('campaign_id', '=', campaignId)
    .orderBy('created_at', 'asc')
    .execute();

  if (variants.length < 2) {
    // Not enough variants for A/B, fall back to standard send
    logger.warn({ campaignId }, 'A/B test enabled but fewer than 2 variants; falling back to standard send');
    await handleStandardSend(redis, bulkSendQueue, campaignId, contactIds);
    return;
  }

  // Distribute test contacts across variants by percentage
  // Each variant's percentage determines its share of the test pool
  const totalPercentage = variants.reduce((sum, v) => sum + v.percentage, 0);
  let assigned = 0;

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i]!;
    const isLast = i === variants.length - 1;
    // For the last variant, take remaining contacts to avoid rounding issues
    const count = isLast
      ? testContacts.length - assigned
      : Math.round(testContacts.length * (variant.percentage / totalPercentage));

    const variantContacts = testContacts.slice(assigned, assigned + count);
    assigned += count;

    for (const contactId of variantContacts) {
      await bulkSendQueue.add('send', {
        contactId,
        campaignId,
        variantId: variant.id,
      });
    }
  }

  // Set Redis counter for test contacts only
  await redis.set(`twmail:remaining:${campaignId}`, testContacts.length, 'EX', 604800);

  // Persist holdback contacts to PostgreSQL (BUG-03: survives Redis restart/eviction)
  if (holdbackContacts.length > 0) {
    const holdbackRows = holdbackContacts.map((contactId: number) => ({
      campaign_id: campaignId,
      contact_id: contactId,
    }));

    // Insert in batches of 500 to avoid exceeding parameter limits
    for (let i = 0; i < holdbackRows.length; i += 500) {
      const batch = holdbackRows.slice(i, i + 500);
      await db.insertInto('campaign_holdback_contacts').values(batch).execute();
    }

    // Schedule A/B evaluation job with configurable delay
    const waitHours = abConfig.winner_wait_hours ?? 4;
    const abEvalQueue = new Queue('ab-eval', {
      connection: redis as unknown as ConnectionOptions,
    });
    await abEvalQueue.add('evaluate', { campaignId }, { delay: waitHours * 3600 * 1000 });
    await abEvalQueue.close();

    logger.info(
      { campaignId, testContacts: testContacts.length, holdback: holdbackContacts.length, variants: variants.length },
      'A/B test contacts distributed',
    );
  }
}

/**
 * Warmup send: splits contacts into daily batches with increasing volumes.
 * Prioritises Gmail contacts first, then Microsoft, then others.
 * Each day's batch is delayed by 24h increments using BullMQ delayed jobs.
 */

const WARMUP_SCHEDULES: Record<string, number[]> = {
  week1: [500, 500, 750, 750, 800, 800, 0], // 0 = remainder
  week2: [1500, 1500, 2000, 2000, 3000, 3000, 4000],
  week3: [5000, 5000, 7500, 7500, 10000, 10000, 12500],
  week4: [15000, 15000, 20000, 20000, 25000, 25000, 30000],
  week5: [40000, 50000, 60000, 75000, 90000, 110000, 130000],
  week6: [150000, 150000, 150000, 150000, 150000, 150000, 150000],
};

async function handleWarmupSend(
  db: ReturnType<typeof getDb>,
  redis: ReturnType<typeof getRedis>,
  bulkSendQueue: Queue,
  campaignId: number,
  contactIds: number[],
  campaign: { warmup_config: Record<string, unknown> | null },
): Promise<void> {
  const config = (campaign.warmup_config ?? {}) as {
    week?: string;
    send_hour?: number;
  };
  const week = config.week ?? 'week1';
  const schedule = WARMUP_SCHEDULES[week] ?? WARMUP_SCHEDULES.week1!;

  // Load contact emails for domain-based sorting
  const contacts = await db
    .selectFrom('contacts')
    .select(['id', 'email'])
    .where('id', 'in', contactIds)
    .execute();

  // Sort: Gmail first, then Microsoft, then Yahoo, then others
  const gmail: number[] = [];
  const microsoft: number[] = [];
  const yahoo: number[] = [];
  const other: number[] = [];

  for (const c of contacts) {
    const domain = c.email.split('@')[1]?.toLowerCase() ?? '';
    if (domain === 'gmail.com') gmail.push(c.id);
    else if (['hotmail.com', 'outlook.com', 'live.com', 'live.com.au', 'msn.com'].includes(domain)) microsoft.push(c.id);
    else if (domain.includes('yahoo.')) yahoo.push(c.id);
    else other.push(c.id);
  }

  const sorted = [...gmail, ...microsoft, ...yahoo, ...other];

  // Split into daily batches
  let offset = 0;
  const batches: number[][] = [];
  for (let day = 0; day < schedule.length; day++) {
    const volume = schedule[day]!;
    if (volume === 0 || day === schedule.length - 1) {
      // Last day or remainder: take everything left
      batches.push(sorted.slice(offset));
      break;
    }
    batches.push(sorted.slice(offset, offset + volume));
    offset += volume;
    if (offset >= sorted.length) break;
  }

  // Set Redis counter for ALL contacts (campaign completion tracks total)
  await redis.set(`twmail:remaining:${campaignId}`, sorted.length, 'EX', 604800 * 2);

  // Enqueue each day's batch with a 24h delay increment
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  for (let day = 0; day < batches.length; day++) {
    const batch = batches[day]!;
    if (batch.length === 0) continue;

    const delay = day * MS_PER_DAY; // Day 0 = now, Day 1 = +24h, etc.

    for (const contactId of batch) {
      await bulkSendQueue.add('send', { contactId, campaignId }, delay > 0 ? { delay } : {});
    }

    logger.info(
      { campaignId, day: day + 1, count: batch.length, delayHours: delay / 3600000 },
      'Warmup batch queued',
    );
  }

  logger.info(
    { campaignId, totalContacts: sorted.length, totalDays: batches.length, week },
    'Warmup send orchestration complete',
  );
}
