import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// Set test env vars before any imports that read config
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://twmail:twmail_dev_password@localhost:5432/twmail';
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-must-be-at-least-32-characters-long!!';
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'error';

let app: FastifyInstance;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
  }
}

export async function loginAsAdmin(appInstance: FastifyInstance) {
  const response = await appInstance.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email: 'admin@twmail.local',
      password: 'admin123',
    },
  });

  const body = JSON.parse(response.body);
  return body.data?.access_token as string;
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}
