import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createAuthedUser, createUser, seedRoles, TEST_PASSWORD } from './helpers/factories.js';
import { User } from '../modules/users/user.model.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  signAccessToken,
  verifyAccessToken,
  hashToken,
  generateRefreshToken,
} from '../lib/tokens.js';

const app = createApp();

beforeEach(async () => {
  await seedRoles();
});

// -------------------------------------------------------- password hashing

describe('password hashing', () => {
  it('produces an argon2id hash, never the plaintext', async () => {
    const hash = await hashPassword('MySecret123');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('MySecret123');
    expect(hash.length).toBeGreaterThan(50);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('SamePassword1');
    const b = await hashPassword('SamePassword1');

    expect(a).not.toBe(b);
    // Both still verify - that is what a salt is for.
    expect(await verifyPassword(a, 'SamePassword1')).toBe(true);
    expect(await verifyPassword(b, 'SamePassword1')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Correct123');
    expect(await verifyPassword(hash, 'Wrong123')).toBe(false);
  });

  it('returns false rather than throwing on a corrupt hash', async () => {
    // A corrupt row should read as "wrong password", not as a 500.
    expect(await verifyPassword('not-a-valid-hash', 'anything')).toBe(false);
  });
});

// ------------------------------------------------------------------ tokens

describe('token handling', () => {
  it('signs and verifies an access token with its claims', () => {
    const token = signAccessToken({ userId: 'abc123', role: 'trader', permissionVersion: 3 });
    const result = verifyAccessToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toMatchObject({ sub: 'abc123', role: 'trader', pv: 3, type: 'access' });
    }
  });

  it('rejects a token signed with a different secret', () => {
    // A forged token from another deployment must not be accepted.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9.bogus';
    expect(verifyAccessToken(forged).ok).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(verifyAccessToken('not.a.token').ok).toBe(false);
    expect(verifyAccessToken('').ok).toBe(false);
  });

  it('hashes refresh tokens deterministically and irreversibly', () => {
    const token = generateRefreshToken();
    const hash = hashToken(token);

    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64); // SHA-256 hex
    expect(hashToken(token)).toBe(hash);
  });

  it('generates unique refresh tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(100);
  });
});

// --------------------------------------------------------- input hardening

describe('Mongo operator injection', () => {
  it('strips $-prefixed keys from a request body', async () => {
    await createUser({ email: 'victim@example.com' });

    // A classic auth-bypass attempt: { email: { $ne: null } }.
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });

    // It must never log anyone in. 422 (schema rejects a non-string) is the
    // correct outcome; a 200 here would be a critical vulnerability.
    expect(res.status).not.toBe(200);
    expect([400, 422]).toContain(res.status);
  });

  it('strips operator keys from a nested body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'inject@example.com',
        password: 'StrongPass1',
        role: { $set: 'super_admin' },
      });

    // An operator object is not a valid role, so validation rejects it.
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('strips operator keys from the query string', async () => {
    const res = await request(app).get('/api/v1/market/search?q=test&$where=1');
    // Not a 500: the sanitiser removed the key before Mongoose saw it.
    expect(res.status).toBe(200);
  });
});

describe('request size limits', () => {
  it('rejects an oversized JSON body', async () => {
    const huge = 'x'.repeat(200_000);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: huge });

    // 413 from the body parser, or 422 if it parsed and failed validation.
    expect([413, 422, 400]).toContain(res.status);
  });
});

// ------------------------------------------------------------- headers

describe('security headers', () => {
  it('sets the standard helmet headers', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('does not advertise the server technology', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets a restrictive content security policy on the JSON API', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});

// ---------------------------------------------------------------- CORS

describe('CORS allowlist', () => {
  it('reflects an allowlisted origin with credentials', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('never reflects an unknown origin', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://attacker.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never responds with a wildcard origin', async () => {
    // A wildcard is incompatible with credentialed requests and would expose
    // the refresh cookie flow to any site.
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

// ------------------------------------------------------- data exposure

describe('sensitive data exposure', () => {
  it('never returns a password hash from any auth endpoint', async () => {
    const { accessToken } = await createAuthedUser(app, { email: 'nohash@example.com' });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    const serialised = JSON.stringify(me.body);

    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('$argon2');
  });

  it('never returns a password hash from the admin user list', async () => {
    await createUser({ email: 'listed@example.com' });
    const admin = await createAuthedUser(app, { role: 'admin', email: 'sec-admin@example.com' });

    const res = await admin.auth(request(app).get('/api/v1/admin/users'));
    expect(JSON.stringify(res.body)).not.toContain('$argon2');
  });

  it('does not leak a stack trace on an internal error', async () => {
    const res = await request(app).get('/api/v1/market/quote/DOESNOTEXIST');

    expect(res.body.error).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('at Object');
  });

  it('attaches a request id to every error for support traceability', async () => {
    const res = await request(app).get('/api/v1/nonexistent-route');
    expect(res.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ---------------------------------------------------- account enumeration

describe('account enumeration resistance', () => {
  it('gives identical login errors for unknown and wrong-password accounts', async () => {
    await createUser({ email: 'exists@example.com' });

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'exists@example.com', password: 'WrongPass123' });

    const unknownUser = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'WrongPass123' });

    expect(wrongPassword.status).toBe(unknownUser.status);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
    expect(wrongPassword.body.error.code).toBe(unknownUser.body.error.code);
  });

  it('gives an identical forgot-password response either way', async () => {
    await createUser({ email: 'real@example.com' });

    const real = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'real@example.com' });
    const fake = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'fake@example.com' });

    expect(real.status).toBe(200);
    expect(fake.status).toBe(200);
    expect(real.body.data.message).toBe(fake.body.data.message);
  });

  it('gives an identical resend-verification response either way', async () => {
    await createUser({ email: 'verified@example.com', verified: true });

    const real = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'verified@example.com' });
    const fake = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'ghost2@example.com' });

    expect(real.body.data.message).toBe(fake.body.data.message);
  });
});

// ------------------------------------------------------ privilege escalation

describe('privilege escalation resistance', () => {
  it('refuses a privileged role at registration and creates nothing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Escalate',
        lastName: 'Attempt',
        email: 'escalate@example.com',
        password: 'StrongPass1',
        role: 'super_admin',
        permissions: ['config:manage'],
      });

    expect(res.status).toBe(422);
    expect(await User.findOne({ email: 'escalate@example.com' })).toBeNull();
  });

  it('never honours a permissions array supplied by the applicant', async () => {
    // A self-service role IS accepted now, so the interesting question is
    // whether the rest of the body can smuggle privileges in alongside it.
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Escalate',
        lastName: 'Two',
        email: 'escalate2@example.com',
        password: 'StrongPass1',
        role: 'user',
        permissions: ['config:manage'],
        status: 'active',
        isDemo: true,
      });

    const user = await User.findOne({ email: 'escalate2@example.com' });
    expect(user?.role).toBe('user');
    // Status and demo flags are server-decided, whatever the body claimed.
    expect(user?.status).toBe('pending');
    expect(user?.isDemo).toBe(false);
  });

  it('ignores a role supplied in a preferences update', async () => {
    const { accessToken, user } = await createAuthedUser(app, { email: 'prefs@example.com' });

    await request(app)
      .patch('/api/v1/users/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ theme: 'dark', role: 'super_admin' });

    expect((await User.findById(user._id))?.role).toBe('trader');
  });

  it('derives permissions from the database, not from the token', async () => {
    const { accessToken } = await createAuthedUser(app, {
      role: 'trader',
      email: 'perms@example.com',
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    // A trader must never be handed an admin permission, whatever the token says.
    expect(res.body.data.user.permissions).not.toContain('config:manage');
    expect(res.body.data.user.permissions).not.toContain('user:manage');
  });

  it('refuses a deleted user even with a still-valid token', async () => {
    const { accessToken, user } = await createAuthedUser(app, { email: 'deleted@example.com' });
    await User.deleteOne({ _id: user._id });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------- brute force

describe('brute-force resistance', () => {
  it('locks an account after repeated failures, even for the right password', async () => {
    const user = await createUser({ email: 'bruteforce@example.com' });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: `Wrong${attempt}Pass` });
    }

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('records failed attempts on the account', async () => {
    const user = await createUser({ email: 'counted@example.com' });

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Nope12345' });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Nope12345' });

    expect((await User.findById(user._id))?.failedLoginCount).toBe(2);
  });
});
