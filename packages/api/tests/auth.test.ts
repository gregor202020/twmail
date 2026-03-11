import { describe, it, expect, afterAll } from 'vitest';
import { getApp, closeApp, loginAsAdmin, authHeader } from './setup.js';

afterAll(async () => {
  await closeApp();
});

describe('Auth Routes', () => {
  it('POST /api/auth/login returns tokens on valid credentials', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@twmail.local', password: 'admin123' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.access_token).toBeDefined();
    expect(body.data.refresh_token).toBeDefined();
    expect(body.data.user.email).toBe('admin@twmail.local');
  });

  it('POST /api/auth/login returns 401 on invalid password', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@twmail.local', password: 'wrongpassword' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/auth/me returns current user when authenticated', async () => {
    const app = await getApp();
    const token = await loginAsAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.email).toBe('admin@twmail.local');
  });

  it('GET /api/auth/me returns 401 without token', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(response.statusCode).toBe(401);
  });
});
