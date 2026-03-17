import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { getDb, ErrorCode } from '@twmail/shared';
import { requireAdmin } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const BCRYPT_ROUNDS = 12;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1),
  expires_at: z.string().datetime().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z
    .array(z.enum(['read', 'write', 'admin']))
    .min(1)
    .optional(),
});

export const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin());

  // GET /api/api-keys
  app.get('/', async (request, reply) => {
    const db = getDb();

    const keys = await db
      .selectFrom('api_keys')
      .select(['id', 'name', 'key_prefix', 'scopes', 'last_used_at', 'expires_at', 'created_at'])
      .where('user_id', '=', request.user!.id)
      .orderBy('created_at', 'desc')
      .execute();

    return reply.send({ data: keys });
  });

  // POST /api/api-keys
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    // Generate key: mk_live_ + 40 random hex chars
    const rawKey = `mk_live_${crypto.randomBytes(20).toString('hex')}`;
    const prefix = rawKey.substring(0, 12);
    const hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const result = await db
      .insertInto('api_keys')
      .values({
        user_id: request.user!.id,
        name: body.name,
        key_prefix: prefix,
        key_hash: hash,
        scopes: body.scopes,
        expires_at: body.expires_at ? new Date(body.expires_at) : null,
      })
      .returning(['id', 'name', 'key_prefix', 'scopes', 'expires_at', 'created_at'])
      .executeTakeFirstOrThrow();

    // Return full key only on creation
    return reply.status(201).send({ data: { ...result, key: rawKey } });
  });

  // PATCH /api/api-keys/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();
    const id = Number(request.params.id);

    const existing = await db
      .selectFrom('api_keys')
      .select('id')
      .where('id', '=', id)
      .where('user_id', '=', request.user!.id)
      .executeTakeFirst();

    if (!existing) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'API key not found');
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates['name'] = body.name;
    if (body.scopes !== undefined) updates['scopes'] = body.scopes;

    if (Object.keys(updates).length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No fields to update');
    }

    const result = await db
      .updateTable('api_keys')
      .set(updates)
      .where('id', '=', id)
      .returning(['id', 'name', 'key_prefix', 'scopes', 'expires_at', 'created_at'])
      .executeTakeFirstOrThrow();

    return reply.send({ data: result });
  });

  // DELETE /api/api-keys/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const result = await db
      .deleteFrom('api_keys')
      .where('id', '=', id)
      .where('user_id', '=', request.user!.id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'API key not found');
    }

    return reply.status(204).send();
  });

  // POST /api/api-keys/:id/rotate
  app.post<{ Params: { id: string } }>('/:id/rotate', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const existing = await db
      .selectFrom('api_keys')
      .select(['id', 'name', 'scopes', 'expires_at'])
      .where('id', '=', id)
      .where('user_id', '=', request.user!.id)
      .executeTakeFirst();

    if (!existing) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'API key not found');
    }

    // Generate new key
    const rawKey = `mk_live_${crypto.randomBytes(20).toString('hex')}`;
    const prefix = rawKey.substring(0, 12);
    const hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const result = await db
      .updateTable('api_keys')
      .set({ key_prefix: prefix, key_hash: hash })
      .where('id', '=', id)
      .returning(['id', 'name', 'key_prefix', 'scopes', 'expires_at', 'created_at'])
      .executeTakeFirstOrThrow();

    return reply.send({ data: { ...result, key: rawKey } });
  });
};
