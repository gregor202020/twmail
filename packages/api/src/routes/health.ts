import type { FastifyPluginAsync } from 'fastify';
import { getDb, getRedis } from '@twmail/shared';
import { sql } from 'kysely';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // GET /health
  app.get('/health', async (_request, reply) => {
    const services: Record<string, string> = {};
    let allOk = true;

    try {
      const db = getDb();
      await sql`SELECT 1`.execute(db);
      services['db'] = 'ok';
    } catch {
      services['db'] = 'error';
      allOk = false;
    }

    try {
      const redis = getRedis();
      await redis.ping();
      services['redis'] = 'ok';
    } catch {
      services['redis'] = 'error';
      allOk = false;
    }

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      services,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /ready
  app.get('/ready', async (_request, reply) => {
    const services: Record<string, string> = {};

    try {
      const db = getDb();
      await sql`SELECT 1`.execute(db);
      services['db'] = 'ok';
    } catch {
      services['db'] = 'error';
    }

    try {
      const redis = getRedis();
      await redis.ping();
      services['redis'] = 'ok';
    } catch {
      services['redis'] = 'error';
    }

    const allOk = Object.values(services).every((v) => v === 'ok');
    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'not_ready',
      services,
      timestamp: new Date().toISOString(),
    });
  });
};
