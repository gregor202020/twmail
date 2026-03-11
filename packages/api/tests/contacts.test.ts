import { describe, it, expect, afterAll } from 'vitest';
import { getApp, closeApp, loginAsAdmin, authHeader } from './setup.js';

afterAll(async () => {
  await closeApp();
});

describe('Contact Routes', () => {
  let token: string;
  let createdContactId: number;

  it('should authenticate before tests', async () => {
    const app = await getApp();
    token = await loginAsAdmin(app);
    expect(token).toBeDefined();
  });

  it('POST /api/contacts creates a contact', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: authHeader(token),
      payload: {
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        source: 'api',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.data.email).toBe('test@example.com');
    expect(body.data.first_name).toBe('Test');
    createdContactId = body.data.id;
  });

  it('GET /api/contacts lists contacts', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/contacts',
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  it('GET /api/contacts/:id returns a contact', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/contacts/${createdContactId}`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBe(createdContactId);
  });

  it('PATCH /api/contacts/:id updates a contact', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/contacts/${createdContactId}`,
      headers: authHeader(token),
      payload: { company: 'Acme Corp' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.company).toBe('Acme Corp');
  });

  it('POST /api/contacts returns 409 on duplicate email', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: authHeader(token),
      payload: { email: 'test@example.com' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('DELETE /api/contacts/:id deletes a contact', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/contacts/${createdContactId}`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(204);
  });
});
