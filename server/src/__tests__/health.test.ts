import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { REQUEST_ID_HEADER } from '../middleware/httpLogger.js';

const app = createApp();

describe('GET /api/v1/health (liveness)', () => {
  it('returns 200 without touching any dependency', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      service: 'stock-market-dashboard-api',
      environment: 'test',
    });
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
    expect(new Date(res.body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('echoes an inbound correlation id', async () => {
    const res = await request(app).get('/api/v1/health').set(REQUEST_ID_HEADER, 'trace-me-123');

    expect(res.headers[REQUEST_ID_HEADER]).toBe('trace-me-123');
  });

  it('mints a correlation id when none is supplied', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GET /api/v1/ready (readiness)', () => {
  // The suite runs against an in-memory replica set, so this is the healthy
  // path. The degraded path is covered by readiness.degraded.test.ts, which
  // disconnects Mongo deliberately.
  it('reports ready with 200 when MongoDB is reachable', async () => {
    const res = await request(app).get('/api/v1/ready');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.dependencies.mongo.state).toBe('up');
    expect(typeof res.body.data.dependencies.mongo.latencyMs).toBe('number');
  });

  it('treats an unconfigured Redis as disabled, not as a failure', async () => {
    const res = await request(app).get('/api/v1/ready');
    // Redis is optional by design, so its absence must not degrade readiness.
    expect(res.body.data.dependencies.redis.state).toBe('disabled');
    expect(res.body.data.status).toBe('ready');
  });
});
