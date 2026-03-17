import { Worker, Queue, type Job, type ConnectionOptions } from 'bullmq';
import { getDb, getRedis, WebhookDeliveryStatus } from '@twmail/shared';
import { createHmac } from 'crypto';
import { logger } from '../logger.js';

export interface WebhookJobData {
  deliveryId: number;
  endpointId: number;
  url: string;
  secret: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempt: number;
}

/**
 * Exponential backoff delays for retry attempts:
 *   Attempt 1: 1 minute
 *   Attempt 2: 5 minutes
 *   Attempt 3: 30 minutes
 */
const BACKOFF_DELAYS_MS = [
  1 * 60 * 1000,    // 1 minute
  5 * 60 * 1000,    // 5 minutes
  30 * 60 * 1000,   // 30 minutes
];

const MAX_ATTEMPTS = 3;

/**
 * Webhook delivery worker: POSTs event payloads to subscribed webhook endpoints.
 *
 * Processing:
 *   1. Dedup: skip if delivery already completed or permanently failed
 *   2. Sign payload with HMAC-SHA256 using endpoint secret
 *   3. POST to endpoint URL with headers (Content-Type, X-Webhook-Signature, X-Webhook-Event)
 *   4. On success (2xx): mark DELIVERED, reset endpoint failure count
 *   5. On failure: increment endpoint failure count, retry with exponential backoff
 *   6. After max attempts: mark delivery as FAILED
 *   7. After 50 consecutive endpoint failures: disable the endpoint
 */
export function createWebhookWorker(): Worker {
  const redis = getRedis();
  const webhookQueue = new Queue('webhook', {
    connection: redis as unknown as ConnectionOptions,
  });

  const worker = new Worker<WebhookJobData>(
    'webhook',
    async (job: Job<WebhookJobData>) => {
      const { deliveryId, endpointId, url, secret, eventType, payload, attempt } = job.data;
      const db = getDb();

      // Dedup: skip if this delivery has already been completed or permanently failed
      const existing = await db
        .selectFrom('webhook_deliveries')
        .select('status')
        .where('id', '=', deliveryId)
        .executeTakeFirst();

      if (
        existing &&
        (existing.status === WebhookDeliveryStatus.DELIVERED ||
          existing.status === WebhookDeliveryStatus.FAILED)
      ) {
        return { skipped: true, reason: 'already_processed' };
      }

      // Sign payload with HMAC-SHA256
      const body = JSON.stringify(payload);
      const signature = createHmac('sha256', secret).update(body).digest('hex');

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': eventType,
            'User-Agent': 'TWMail-Webhook/1.0',
          },
          body,
          signal: AbortSignal.timeout(30000), // 30s timeout
        });

        const responseBody = await response.text().catch(() => '');

        if (response.ok) {
          // Success: update delivery status to DELIVERED
          await db
            .updateTable('webhook_deliveries')
            .set({
              status: WebhookDeliveryStatus.DELIVERED,
              response_code: response.status,
              response_body: responseBody.substring(0, 1000),
              attempts: attempt,
            })
            .where('id', '=', deliveryId)
            .execute();

          // Reset failure count on endpoint
          await db
            .updateTable('webhook_endpoints')
            .set({ failure_count: 0, last_triggered_at: new Date() })
            .where('id', '=', endpointId)
            .execute();

          return { delivered: true };
        }

        // Non-2xx response: record response details before retrying
        await db
          .updateTable('webhook_deliveries')
          .set({
            response_code: response.status,
            response_body: responseBody.substring(0, 1000),
            attempts: attempt,
          })
          .where('id', '=', deliveryId)
          .execute();

        throw new Error(`Webhook returned ${response.status}`);
      } catch (err: unknown) {
        // Update delivery attempt count
        await db
          .updateTable('webhook_deliveries')
          .set({ attempts: attempt })
          .where('id', '=', deliveryId)
          .execute();

        // Increment endpoint failure count
        await db
          .updateTable('webhook_endpoints')
          .set((eb) => ({ failure_count: eb('failure_count', '+', 1) }))
          .where('id', '=', endpointId)
          .execute();

        // Disable endpoint after 50 consecutive failures
        const endpoint = await db
          .selectFrom('webhook_endpoints')
          .select('failure_count')
          .where('id', '=', endpointId)
          .executeTakeFirst();

        if (endpoint && endpoint.failure_count >= 50) {
          await db
            .updateTable('webhook_endpoints')
            .set({ active: false })
            .where('id', '=', endpointId)
            .execute();
          logger.warn({ endpointId }, 'Webhook endpoint disabled after 50 consecutive failures');
        }

        // Mark as permanently failed after max retries
        if (attempt >= MAX_ATTEMPTS) {
          await db
            .updateTable('webhook_deliveries')
            .set({ status: WebhookDeliveryStatus.FAILED })
            .where('id', '=', deliveryId)
            .execute();

          logger.error(
            { deliveryId, endpointId, attempt },
            'Webhook delivery permanently failed after max retries',
          );

          return { failed: true, error: err instanceof Error ? err.message : String(err) };
        }

        // Re-enqueue with exponential backoff delay
        const delayMs = BACKOFF_DELAYS_MS[attempt - 1] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1]!;
        const nextRetryAt = new Date(Date.now() + delayMs);

        await db
          .updateTable('webhook_deliveries')
          .set({ next_retry_at: nextRetryAt })
          .where('id', '=', deliveryId)
          .execute();

        await webhookQueue.add(
          'deliver',
          {
            deliveryId,
            endpointId,
            url,
            secret,
            eventType,
            payload,
            attempt: attempt + 1,
          },
          { delay: delayMs },
        );

        logger.info(
          { deliveryId, endpointId, attempt, nextDelayMs: delayMs },
          'Webhook delivery scheduled for retry',
        );

        return { retrying: true, attempt, nextDelayMs: delayMs };
      }
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, deliveryId: job?.data?.deliveryId, err },
      'Webhook delivery job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Webhook worker error');
  });

  return worker;
}
