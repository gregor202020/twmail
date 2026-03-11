import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@twmail/shared';
import { requireAdmin } from '../middleware/auth.js';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
} from '../services/users.service.js';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.number().refine((r) => [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER].includes(r as any), {
    message: 'Invalid role',
  }),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.number().refine((r) => [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER].includes(r as any), {
    message: 'Invalid role',
  }).optional(),
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
  }>('/', async (request) => {
    const { page, per_page } = request.query;
    return listUsers({
      page: page ? Number(page) : undefined,
      per_page: per_page ? Number(per_page) : undefined,
    });
  });

  // GET /api/users/:id
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const user = await getUser(Number(request.params.id));
    return { data: user };
  });

  // POST /api/users
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const user = await createUser(body);
    reply.status(201);
    return { data: user };
  });

  // PATCH /api/users/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = updateSchema.parse(request.body);
    const user = await updateUser(Number(request.params.id), body);
    return { data: user };
  });

  // POST /api/users/:id/reset-password
  app.post<{ Params: { id: string } }>('/:id/reset-password', async (request) => {
    const body = resetPasswordSchema.parse(request.body);
    await resetUserPassword(Number(request.params.id), body.password);
    return { data: { message: 'Password reset successfully' } };
  });

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteUser(Number(request.params.id), request.user!.id);
    reply.status(204);
  });
};
