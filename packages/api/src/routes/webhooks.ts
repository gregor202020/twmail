import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, getRedis, ErrorCode, WebhookDeliveryStatus } from '@twmail/shared';
import { Queue, type ConnectionOptions } from 'bullmq';
import { randomBytes } from 'crypto';
import { requireAdmin } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const VALID_EVENTS = [
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'contact.unsubscribed',
  'email.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'campaign.scheduled',
  'campaign.sending',
  'campaign.completed',
  'campaign.ab_winner',
  'import.completed',
  'webhook.test',
];

const createSchema = z.object({
  url: z.string().url(),
  events: z
    .array(z.string().refine((e) => VALID_EVENTS.includes(e), { message: 'Invalid event type' }))
    .min(1),
});

const updateSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin());

  // GET /api/webhooks
  app.get('/', async (_request, reply) => {
    const db = getDb();

    const endpoints = await db
      .selectFrom('webhook_endpoints')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    // Mask secrets
    return reply.send({
      data: endpoints.map((ep) => ({
        ...ep,
        secret: ep.secret.substring(0, 10) + '...',
      })),
    });
  });

  // POST /api/webhooks
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    const secret = `whsec_${randomBytes(32).toString('hex')}`;

    const endpoint = await db
      .insertInto('webhook_endpoints')
      .values({
        url: body.url,
        secret,
        events: body.events,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: endpoint });
  });

  // PATCH /api/webhooks/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();

    const result = await db
      .updateTable('webhook_endpoints')
      .set(body)
      .where('id', '=', Number(request.params.id))
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook endpoint not found');
    }

    return reply.send({
      data: { ...result, secret: result.secret.substring(0, 10) + '...' },
    });
  });

  // DELETE /api/webhooks/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const result = await db
      .deleteFrom('webhook_endpoints')
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook endpoint not found');
    }

    return reply.status(204).send();
  });

  // POST /api/webhooks/:id/test
  app.post<{ Params: { id: string } }>('/:id/test', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const endpoint = await db
      .selectFrom('webhook_endpoints')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!endpoint) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook endpoint not found');
    }

    const payload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        endpoint_id: id,
        timestamp: new Date().toISOString(),
      },
    };

    // Create delivery record
    const delivery = await db
      .insertInto('webhook_deliveries')
      .values({
        endpoint_id: endpoint.id,
        event_type: 'webhook.test',
        payload,
        status: WebhookDeliveryStatus.PENDING,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Enqueue via BullMQ
    const redis = getRedis();
    const queue = new Queue('webhook', { connection: redis as unknown as ConnectionOptions });
    await queue.add('deliver', {
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      eventType: 'webhook.test',
      payload,
      attempt: 1,
    });
    await queue.close();

    return reply.send({ data: { message: 'Test webhook queued' } });
  });

  // GET /api/webhooks/:id/deliveries
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/deliveries', async (request, reply) => {
    const db = getDb();
    const endpointId = Number(request.params.id);
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;

    const [deliveries, countResult] = await Promise.all([
      db
        .selectFrom('webhook_deliveries')
        .selectAll()
        .where('endpoint_id', '=', endpointId)
        .orderBy('created_at', 'desc')
        .limit(perPage)
        .offset(offset)
        .execute(),
      db
        .selectFrom('webhook_deliveries')
        .select(db.fn.countAll<number>().as('count'))
        .where('endpoint_id', '=', endpointId)
        .executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: deliveries,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });
};
