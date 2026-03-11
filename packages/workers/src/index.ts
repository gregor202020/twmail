import { destroyDb, destroyRedis } from '@twmail/shared';

const workerType = process.env['WORKER_TYPE'] ?? 'bulk';

async function main() {
  console.log(`TWMail Worker starting (type: ${workerType})...`);

  // Workers will be implemented in Plan 2
  // - bulk: bulk-send, ab-eval, resend workers
  // - system: import, webhook delivery, maintenance workers

  console.log(`TWMail Worker (${workerType}) ready — waiting for jobs...`);

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down worker...`);
    await destroyDb();
    await destroyRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
