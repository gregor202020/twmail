import { Worker, Queue, type Job, type ConnectionOptions } from 'bullmq';
import { getDb, getRedis } from '@twmail/shared';
import type { CampaignVariant } from '@twmail/shared';
import { logger } from '../logger.js';

export interface AbEvalJobData {
  campaignId: number;
}

export function createAbEvalWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<AbEvalJobData>(
    'ab-eval',
    async (job: Job<AbEvalJobData>) => {
      const { campaignId } = job.data;
      const db = getDb();

      const variants = await db
        .selectFrom('campaign_variants')
        .selectAll()
        .where('campaign_id', '=', campaignId)
        .execute();

      if (variants.length < 2) {
        return { error: 'not_enough_variants' };
      }

      // DATA-04: Minimum sample size guard
      const campaign = await db
        .selectFrom('campaigns')
        .select('ab_test_config')
        .where('id', '=', campaignId)
        .executeTakeFirst();

      const abConfig = (campaign?.ab_test_config ?? {}) as {
        min_sample_size?: number;
      };
      const minSampleSize = abConfig.min_sample_size ?? 100;

      const totalSent = variants.reduce((sum, v) => sum + (v.total_sent ?? 0), 0);
      if (totalSent < minSampleSize) {
        return { skipped: true, reason: 'insufficient_sample', total_sent: totalSent, min_required: minSampleSize };
      }

      // Calculate Bayesian win probabilities
      const winProbs = calculateBayesianWinProbability(variants);

      // Update variant win probabilities
      for (let i = 0; i < variants.length; i++) {
        await db
          .updateTable('campaign_variants')
          .set({ win_probability: winProbs[i] })
          .where('id', '=', variants[i]!.id)
          .execute();
      }

      // DATA-04: Require 95% win probability before declaring winner
      const WIN_PROBABILITY_THRESHOLD = 0.95;
      const maxProb = Math.max(...winProbs);

      if (maxProb < WIN_PROBABILITY_THRESHOLD) {
        return { skipped: true, reason: 'no_confident_winner', probabilities: winProbs };
      }

      const winnerIdx = winProbs.indexOf(maxProb);
      const winner = variants[winnerIdx]!;

      // Mark winner
      await db.updateTable('campaign_variants').set({ is_winner: true }).where('id', '=', winner.id).execute();

      // BUG-03: Read holdback from PostgreSQL (persisted by campaign-send orchestrator)
      const holdbackRows = await db
        .selectFrom('campaign_holdback_contacts')
        .select('contact_id')
        .where('campaign_id', '=', campaignId)
        .execute();
      const holdbackContactIds = holdbackRows.map((r) => r.contact_id);

      if (holdbackContactIds.length > 0) {
        const bulkSendQueue = new Queue('bulk-send', { connection: redis as unknown as ConnectionOptions });

        for (const contactId of holdbackContactIds) {
          await bulkSendQueue.add('send', {
            contactId,
            campaignId,
            variantId: winner.id,
          });
        }

        await bulkSendQueue.close();

        // Clean up holdback records after winner contacts are queued
        await db.deleteFrom('campaign_holdback_contacts').where('campaign_id', '=', campaignId).execute();
      }

      return { winnerId: winner.id, winProbability: maxProb };
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'A/B eval job failed');
  });

  return worker;
}

// Bayesian win probability using Beta distribution sampling
export function calculateBayesianWinProbability(variants: CampaignVariant[]): number[] {
  const samples = 10000;
  const winCounts = new Array(variants.length).fill(0);

  for (let s = 0; s < samples; s++) {
    let bestRate = -1;
    let bestIdx = 0;

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]!;
      const clicks = v.total_human_clicks || 0;
      const sent = v.total_sent || 0;
      const nonClicks = sent - clicks;

      // Beta(clicks + 1, non_clicks + 1) sample
      const rate = betaSample(clicks + 1, nonClicks + 1);
      if (rate > bestRate) {
        bestRate = rate;
        bestIdx = i;
      }
    }

    winCounts[bestIdx]!++;
  }

  return winCounts.map((c: number) => Number((c / samples).toFixed(4)));
}

// Sample from Beta distribution using Jöhnk's algorithm (simple approximation)
function betaSample(alpha: number, beta: number): number {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

// Simple gamma sampling using Marsaglia and Tsang's method
function gammaSample(shape: number): number {
  if (shape < 1) {
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Standard normal random using Box-Muller
function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
