import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { destroyDb, destroyRedis } from '@twmail/shared';

async function main() {
  const cfg = getConfig();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await destroyDb();
    await destroyRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: cfg.API_PORT, host: cfg.API_HOST });
    app.log.info(`TWMail API running on ${cfg.API_HOST}:${cfg.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
