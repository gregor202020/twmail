import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb } from '@twmail/shared';
import { requireAdmin } from '../middleware/auth.js';

const updateSchema = z.object({
  organization_name: z.string().max(255).optional(),
  default_sender_email: z.string().email().optional(),
  default_sender_name: z.string().max(255).optional(),
  timezone: z.string().max(100).optional(),
  physical_address: z.string().max(500).optional(),
});

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin());

  // GET /api/settings
  app.get('/', async (_request, reply) => {
    const db = getDb();

    let row = await db.selectFrom('settings').selectAll().where('id', '=', 1).executeTakeFirst();

    if (!row) {
      // Ensure the singleton row exists
      await db
        .insertInto('settings')
        .values({ id: 1 } as never)
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
      row = await db.selectFrom('settings').selectAll().where('id', '=', 1).executeTakeFirstOrThrow();
    }

    return reply.send({ data: row });
  });

  // PATCH /api/settings
  app.patch('/', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();

    const updated = await db
      .updateTable('settings')
      .set({ ...body, updated_at: new Date() })
      .where('id', '=', 1)
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.send({ data: updated });
  });
};
