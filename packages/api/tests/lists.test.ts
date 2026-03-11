import { describe, it, expect, afterAll } from 'vitest';
import { getApp, closeApp, loginAsAdmin, authHeader } from './setup.js';

afterAll(async () => {
  await closeApp();
});

describe('List Routes', () => {
  let token: string;
  let createdListId: number;

  it('should authenticate before tests', async () => {
    const app = await getApp();
    token = await loginAsAdmin(app);
  });

  it('POST /api/lists creates a list', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: authHeader(token),
      payload: { name: 'Newsletter Subscribers', description: 'Main newsletter list' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.data.name).toBe('Newsletter Subscribers');
    createdListId = body.data.id;
  });

  it('GET /api/lists returns lists', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/lists/:id/count returns member count', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/lists/${createdListId}/count`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.count).toBe(0);
  });

  it('DELETE /api/lists/:id deletes a list', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/lists/${createdListId}`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(204);
  });
});
