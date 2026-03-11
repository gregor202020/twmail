import { describe, it, expect, afterAll } from 'vitest';
import { getApp, closeApp, loginAsAdmin, authHeader } from './setup.js';

afterAll(async () => {
  await closeApp();
});

describe('API Key Routes', () => {
  let token: string;
  let createdKeyId: number;

  it('should authenticate before tests', async () => {
    const app = await getApp();
    token = await loginAsAdmin(app);
  });

  it('POST /api/api-keys creates an API key', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/api-keys',
      headers: authHeader(token),
      payload: { name: 'Test Key', scopes: ['read', 'write'] },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.data.key).toBeDefined();
    expect(body.data.key.startsWith('mk_live_')).toBe(true);
    expect(body.data.name).toBe('Test Key');
    createdKeyId = body.data.id;
  });

  it('GET /api/api-keys lists keys without exposing full key', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/api-keys',
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data[0].key).toBeUndefined();
    expect(body.data[0].key_prefix).toBeDefined();
  });

  it('DELETE /api/api-keys/:id revokes a key', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/api-keys/${createdKeyId}`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(204);
  });
});
