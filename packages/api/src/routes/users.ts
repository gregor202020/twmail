import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { getDb, UserRole, ErrorCode } from '@twmail/shared';
import { requireAdmin } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const BCRYPT_ROUNDS = 12;

const VALID_ROLES: number[] = [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER];

const USER_FIELDS = ['id', 'email', 'name', 'role', 'last_login_at', 'created_at', 'updated_at'] as const;

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.number().refine((r) => VALID_ROLES.includes(r), { message: 'Invalid role' }),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z
    .number()
    .refine((r) => VALID_ROLES.includes(r), { message: 'Invalid role' })
    .optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  // All user management routes require admin
  app.addHook('preHandler', requireAdmin());

  // GET /api/users
  app.get<{
    Querystring: { page?: string; per_page?: string };
  }>('/', async (request, reply) => {
    const db = getDb();
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = request.query.per_page ? Number(request.query.per_page) : 50;
    const offset = (page - 1) * perPage;

    const [users, countResult] = await Promise.all([
      db
        .selectFrom('users')
        .select([...USER_FIELDS])
        .orderBy('created_at', 'desc')
        .limit(perPage)
        .offset(offset)
        .execute(),
      db.selectFrom('users').select(db.fn.countAll().as('total')).executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.total);

    return reply.send({
      data: users,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // GET /api/users/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const user = await db
      .selectFrom('users')
      .select([...USER_FIELDS])
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!user) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
    }

    return reply.send({ data: user });
  });

  // POST /api/users
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', body.email.toLowerCase())
      .executeTakeFirst();

    if (existing) {
      throw new AppError(409, ErrorCode.CONFLICT, 'A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    const user = await db
      .insertInto('users')
      .values({
        email: body.email.toLowerCase(),
        name: body.name,
        password_hash: passwordHash,
        role: body.role,
      })
      .returning([...USER_FIELDS])
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: user });
  });

  // PATCH /api/users/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();

    const user = await db
      .updateTable('users')
      .set({ ...body, updated_at: new Date() })
      .where('id', '=', Number(request.params.id))
      .returning([...USER_FIELDS])
      .executeTakeFirst();

    if (!user) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
    }

    return reply.send({ data: user });
  });

  // POST /api/users/:id/reset-password
  app.post<{ Params: { id: string } }>('/:id/reset-password', async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    const db = getDb();
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    const user = await db
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where('id', '=', Number(request.params.id))
      .returning(['id'])
      .executeTakeFirst();

    if (!user) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
    }

    return reply.send({ data: { message: 'Password reset successfully' } });
  });

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (id === request.user!.id) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'You cannot delete your own account');
    }

    const db = getDb();
    const result = await db.deleteFrom('users').where('id', '=', id).executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
    }

    return reply.status(204).send();
  });
};
