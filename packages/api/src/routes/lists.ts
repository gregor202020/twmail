import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, ErrorCode, ContactListStatus, ContactStatus } from '@twmail/shared';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: z.number().min(1).max(2).optional(),
});

const updateSchema = createSchema.partial();

const addContactsSchema = z.object({
  contact_ids: z.array(z.number()).min(1).max(1000),
});

export const listRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/lists
  app.get('/', async (_request, reply) => {
    const db = getDb();

    const lists = await db
      .selectFrom('lists')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return reply.send({ data: lists });
  });

  // POST /api/lists
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    const list = await db
      .insertInto('lists')
      .values({
        name: body.name,
        description: body.description,
        type: body.type ?? 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: list });
  });

  // GET /api/lists/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const list = await db
      .selectFrom('lists')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!list) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
    }

    return reply.send({ data: list });
  });

  // PATCH /api/lists/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();

    const result = await db
      .updateTable('lists')
      .set(body)
      .where('id', '=', Number(request.params.id))
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
    }

    return reply.send({ data: result });
  });

  // DELETE /api/lists/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const result = await db
      .deleteFrom('lists')
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
    }

    return reply.status(204).send();
  });

  // GET /api/lists/:id/contacts
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/contacts', async (request, reply) => {
    const db = getDb();
    const listId = Number(request.params.id);
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;

    // Verify list exists
    const list = await db.selectFrom('lists').select('id').where('id', '=', listId).executeTakeFirst();
    if (!list) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
    }

    const [contacts, countResult] = await Promise.all([
      db
        .selectFrom('contacts')
        .innerJoin('contact_lists', 'contact_lists.contact_id', 'contacts.id')
        .selectAll('contacts')
        .where('contact_lists.list_id', '=', listId)
        .where('contact_lists.status', '=', ContactListStatus.CONFIRMED)
        .orderBy('contacts.created_at', 'desc')
        .limit(perPage)
        .offset(offset)
        .execute(),
      db
        .selectFrom('contact_lists')
        .select(db.fn.countAll<number>().as('count'))
        .where('list_id', '=', listId)
        .where('status', '=', ContactListStatus.CONFIRMED)
        .executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: contacts,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // POST /api/lists/:id/contacts
  app.post<{ Params: { id: string } }>('/:id/contacts', async (request, reply) => {
    const body = addContactsSchema.parse(request.body);
    const db = getDb();
    const listId = Number(request.params.id);

    // Verify list exists
    const list = await db.selectFrom('lists').select('id').where('id', '=', listId).executeTakeFirst();
    if (!list) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
    }

    let added = 0;
    for (const contactId of body.contact_ids) {
      try {
        await db
          .insertInto('contact_lists')
          .values({
            contact_id: contactId,
            list_id: listId,
            status: ContactListStatus.CONFIRMED,
          })
          .onConflict((oc) => oc.columns(['contact_id', 'list_id']).doNothing())
          .execute();
        added++;
      } catch {
        // Skip invalid contact IDs
      }
    }

    return reply.send({ data: { added } });
  });

  // DELETE /api/lists/:id/contacts/:contactId
  app.delete<{ Params: { id: string; contactId: string } }>(
    '/:id/contacts/:contactId',
    async (request, reply) => {
      const db = getDb();
      const listId = Number(request.params.id);
      const contactId = Number(request.params.contactId);

      const result = await db
        .deleteFrom('contact_lists')
        .where('list_id', '=', listId)
        .where('contact_id', '=', contactId)
        .executeTakeFirst();

      if (result.numDeletedRows === 0n) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not in this list');
      }

      return reply.status(204).send();
    },
  );

  // GET /api/lists/:id/count
  app.get<{ Params: { id: string } }>('/:id/count', async (request, reply) => {
    const db = getDb();
    const listId = Number(request.params.id);

    // Verify list exists
    const list = await db.selectFrom('lists').select('id').where('id', '=', listId).executeTakeFirst();
    if (!list) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
    }

    const result = await db
      .selectFrom('contact_lists')
      .innerJoin('contacts', 'contacts.id', 'contact_lists.contact_id')
      .select(db.fn.countAll<number>().as('count'))
      .where('contact_lists.list_id', '=', listId)
      .where('contact_lists.status', '=', ContactListStatus.CONFIRMED)
      .where('contacts.status', '=', ContactStatus.ACTIVE)
      .executeTakeFirstOrThrow();

    return reply.send({ data: { count: Number(result.count) } });
  });
};
