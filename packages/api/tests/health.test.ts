import { describe, it, expect, afterAll } from 'vitest';
import { getApp, closeApp } from './setup.js';

afterAll(async () => {
  await closeApp();
});

describe('Health Routes', () => {
  it('GET /health returns ok', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
