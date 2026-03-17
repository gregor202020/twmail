import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDb, ErrorCode } from '@twmail/shared';
import { getConfig } from '../config.js';
import { AppError } from '../plugins/error-handler.js';
import type { JwtPayload } from '../plugins/auth.js';
import { requireAuth } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

function generateToken(
  user: { id: number; email: string; role: number },
  type: 'access' | 'refresh',
  expiresIn: string,
): string {
  const cfg = getConfig();
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type,
  };
  return jwt.sign(payload as object, cfg.JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const db = getDb();
    const cfg = getConfig();

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', body.email)
      .executeTakeFirst();

    if (!user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    // Update last_login_at
    await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();

    const accessToken = generateToken(user, 'access', cfg.JWT_EXPIRES_IN);
    const refreshToken = generateToken(user, 'refresh', cfg.JWT_REFRESH_EXPIRES_IN);

    return reply.status(200).send({
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  });

  // POST /api/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const cfg = getConfig();
    const db = getDb();

    let payload: JwtPayload;
    try {
      payload = jwt.verify(body.refresh_token, cfg.JWT_SECRET) as unknown as JwtPayload;
    } catch {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid token type');
    }

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', payload.sub)
      .executeTakeFirst();

    if (!user) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'User not found');
    }

    const accessToken = generateToken(user, 'access', cfg.JWT_EXPIRES_IN);
    const newRefreshToken = generateToken(user, 'refresh', cfg.JWT_REFRESH_EXPIRES_IN);

    return reply.status(200).send({
      data: {
        access_token: accessToken,
        refresh_token: newRefreshToken,
      },
    });
  });

  // POST /api/auth/logout
  app.post('/logout', { preHandler: [requireAuth] }, async (_request, reply) => {
    return reply.status(204).send();
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getDb();

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'name', 'role', 'last_login_at', 'created_at'])
      .where('id', '=', request.user!.id)
      .executeTakeFirst();

    if (!user) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
    }

    return reply.status(200).send({ data: user });
  });
};
