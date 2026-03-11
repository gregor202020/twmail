import { describe, it, expect, afterAll } from 'vitest';
import { getApp, closeApp, loginAsAdmin, authHeader } from './setup.js';

afterAll(async () => {
  await closeApp();
});

describe('Segment Routes', () => {
  let token: string;
  let createdSegmentId: number;

  it('should authenticate before tests', async () => {
    const app = await getApp();
    token = await loginAsAdmin(app);
  });

  it('POST /api/segments creates a dynamic segment', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: 'Active Melbourne Users',
        type: 1,
        rules: {
          logic: 'and',
          rules: [
            { field: 'city', operator: 'eq', value: 'Melbourne' },
            { field: 'status', operator: 'eq', value: 1 },
          ],
        },
        description: 'All active contacts in Melbourne',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.data.name).toBe('Active Melbourne Users');
    createdSegmentId = body.data.id;
  });

  it('GET /api/segments returns segments', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/segments',
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeInstanceOf(Array);
  });

  it('GET /api/segments/:id/count returns count', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${createdSegmentId}/count`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(typeof body.data.count).toBe('number');
  });

  it('DELETE /api/segments/:id deletes a segment', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/segments/${createdSegmentId}`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(204);
  });
});
