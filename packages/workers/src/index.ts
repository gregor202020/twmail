import { destroyDb, destroyRedis } from '@twmail/shared';
import type { Worker } from 'bullmq';
import { logger } from './logger.js';

const workerType = process.env['WORKER_TYPE'] ?? 'bulk';

async function main() {
  logger.info({ workerType }, `TWMail Worker starting (type: ${workerType})...`);

  const workers: Worker[] = [];
  let schedulerCleanup: (() => Promise<void>) | null = null;

  if (workerType === 'bulk') {
    const { createBulkSendWorker } = await import('./workers/bulk-send.worker.js');
    const { createCampaignSendWorker } = await import('./workers/campaign-send.worker.js');
    const { createAbEvalWorker } = await import('./workers/ab-eval.worker.js');
    const { createResendWorker } = await import('./workers/resend.worker.js');

    workers.push(createBulkSendWorker());
    workers.push(createCampaignSendWorker());
    workers.push(createAbEvalWorker());
    workers.push(createResendWorker());

    // Start scheduled campaign polling
    const { startScheduler } = await import('./scheduler.js');
    const scheduler = await startScheduler();
    schedulerCleanup = async () => {
      clearInterval(scheduler.interval);
      await scheduler.queue.close();
    };

    logger.info('Started: bulk-send, campaign-send, ab-eval, resend workers + scheduler');
  } else if (workerType === 'system') {
    const { createImportWorker } = await import('./workers/import.worker.js');
    const { createWebhookWorker } = await import('./workers/webhook.worker.js');

    workers.push(createImportWorker());
    workers.push(createWebhookWorker());

    logger.info('Started: import, webhook workers');
  } else {
    logger.error({ workerType }, `Unknown WORKER_TYPE: ${workerType}`);
    process.exit(1);
  }

  logger.info({ workerType }, `TWMail Worker (${workerType}) ready -- waiting for jobs...`);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, `Received ${signal}, shutting down workers...`);

    if (schedulerCleanup) {
      await schedulerCleanup();
    }

    await Promise.all(workers.map((w) => w.close()));
    await destroyDb();
    await destroyRedis();

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
