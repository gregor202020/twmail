import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, ErrorCode } from '@twmail/shared';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().max(100).optional(),
  content_html: z.string().optional(),
  content_json: z.record(z.unknown()).optional(),
  thumbnail_url: z.string().url().optional(),
  is_default: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

export const templateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/templates
  app.get<{
    Querystring: { page?: string; per_page?: string; category?: string };
  }>('/', async (request, reply) => {
    const db = getDb();
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;

    let query = db.selectFrom('templates').selectAll();
    let countQuery = db.selectFrom('templates').select(db.fn.countAll<number>().as('count'));

    if (request.query.category) {
      query = query.where('category', '=', request.query.category);
      countQuery = countQuery.where('category', '=', request.query.category);
    }

    query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

    const [templates, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: templates,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // POST /api/templates
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    const template = await db
      .insertInto('templates')
      .values({
        name: body.name,
        category: body.category,
        content_html: body.content_html,
        content_json: body.content_json ?? {},
        thumbnail_url: body.thumbnail_url,
        is_default: body.is_default ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: template });
  });

  // GET /api/templates/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const template = await db
      .selectFrom('templates')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!template) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Template not found');
    }

    return reply.send({ data: template });
  });

  // PATCH /api/templates/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();

    const result = await db
      .updateTable('templates')
      .set(body)
      .where('id', '=', Number(request.params.id))
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Template not found');
    }

    return reply.send({ data: result });
  });

  // DELETE /api/templates/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const result = await db
      .deleteFrom('templates')
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Template not found');
    }

    return reply.status(204).send();
  });

  // POST /api/templates/:id/clone
  app.post<{ Params: { id: string } }>('/:id/clone', async (request, reply) => {
    const db = getDb();

    const original = await db
      .selectFrom('templates')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!original) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Template not found');
    }

    const clone = await db
      .insertInto('templates')
      .values({
        name: `${original.name} (Copy)`,
        category: original.category,
        content_html: original.content_html,
        content_json: original.content_json,
        thumbnail_url: original.thumbnail_url,
        is_default: false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: clone });
  });
};
