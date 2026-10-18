import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('GET /api/v1/health', () => {
  it('should return 200 OK with server health metadata', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('status', 'HEALTHY');
    expect(response.body.data).toHaveProperty('service', 'LPU Lost & Found REST API');
    expect(response.body.data).toHaveProperty('database');
    expect(response.body.data.database).toHaveProperty('state');
    expect(response.body.data).toHaveProperty('uptimeSeconds');
  });

  it('should return 404 for an unknown endpoint', async () => {
    const response = await request(app).get('/api/v1/unknown-endpoint');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body.error).toHaveProperty('code', 'ROUTE_NOT_FOUND');
  });
});
