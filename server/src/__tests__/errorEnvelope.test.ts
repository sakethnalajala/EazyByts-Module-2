import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ERROR_CODES } from '@smd/shared';
import { createApp } from '../app.js';

const app = createApp();

describe('error envelope', () => {
  it('returns a canonical NOT_FOUND body for an unmatched route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(res.body.error.message).toContain('/api/v1/does-not-exist');
    // A request id must always be present so a user report maps to a log line.
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('rejects malformed JSON as BAD_REQUEST rather than a 500', async () => {
    const res = await request(app)
      .post('/api/v1/does-not-exist')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ERROR_CODES.BAD_REQUEST);
  });

  it('never exposes x-powered-by', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('applies helmet security headers', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('CORS allowlist', () => {
  it('reflects an allowed origin with credentials enabled', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('withholds CORS headers from an origin that is not allowlisted', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
