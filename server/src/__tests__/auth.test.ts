import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ERROR_CODES } from '@smd/shared';
import { createApp } from '../app.js';
import { User } from '../modules/users/user.model.js';
import { RefreshToken, VerificationToken } from '../modules/auth/token.model.js';
import { Portfolio } from '../modules/portfolios/portfolio.model.js';
import { hashToken } from '../lib/tokens.js';
import { createAuthedUser, createUser, seedRoles, TEST_PASSWORD } from './helpers/factories.js';

const app = createApp();

beforeEach(async () => {
  await seedRoles();
});

// --------------------------------------------------------------- registration

describe('POST /api/v1/auth/register', () => {
  const validBody = {
    firstName: 'Asha',
    lastName: 'Menon',
    email: 'asha.menon@example.com',
    password: 'StrongPass1',
  };

  it('creates a pending, unverified account', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: 'asha.menon@example.com',
      role: 'trader',
      status: 'pending',
      emailVerified: false,
    });
    // No session is issued until the address is verified.
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.accessToken).toBeUndefined();
  });

  it('creates a view-only User when that account type is chosen', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, email: 'viewer@example.com', role: 'user' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'user', status: 'pending' });
  });

  it('creates a Trader when that account type is chosen', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, email: 'dealer@example.com', role: 'trader' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'trader' });
  });

  it.each(['admin', 'super_admin', 'wizard', ''])(
    'refuses to self-register the role %p',
    async (role) => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validBody, email: `esc-${String(role) || 'blank'}@example.com`, role });

      // Rejected by validation before the service runs: privileged roles are
      // provisioned by the platform, never requested by the applicant.
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    },
  );

  it('opens both segregated wallets at registration', async () => {
    await request(app).post('/api/v1/auth/register').send(validBody);
    const user = await User.findOne({ email: validBody.email });
    const wallets = await Portfolio.find({ userId: user?._id }).sort({ market: 1 });

    expect(wallets).toHaveLength(2);
    expect(wallets[0]).toMatchObject({
      market: 'IN',
      currency: 'INR',
      cashAvailable: 100_000_000, // Rs 10,00,000 in paise
    });
    expect(wallets[1]).toMatchObject({
      market: 'US',
      currency: 'USD',
      cashAvailable: 1_000_000, // $10,000 in cents
    });
  });

  it('never stores the password in plain text', async () => {
    await request(app).post('/api/v1/auth/register').send(validBody);
    const user = await User.findOne({ email: validBody.email }).select('+passwordHash');

    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash).not.toContain(validBody.password);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/v1/auth/register').send(validBody);
    const res = await request(app).post('/api/v1/auth/register').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.CONFLICT);
  });

  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'lowercase123'],
    ['no lowercase', 'UPPERCASE123'],
    ['no digit', 'NoDigitsHere'],
  ])('rejects a weak password (%s)', async (_label, password) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, password });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(res.body.error.details.some((d: { path: string }) => d.path === 'password')).toBe(true);
  });

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, email: 'not-an-email' });

    expect(res.status).toBe(422);
  });

  it('normalises the email to lowercase', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, email: 'MiXeD.Case@Example.COM' });

    expect(await User.findOne({ email: 'mixed.case@example.com' })).not.toBeNull();
  });
});

// -------------------------------------------------------- email verification

describe('email verification', () => {
  it('activates the account and is single-use', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      firstName: 'Vik',
      lastName: 'Rao',
      email: 'vik@example.com',
      password: 'StrongPass1',
    });

    // SMTP is unconfigured under test, so the link comes back in the response.
    const url = res.body.data.verificationUrl as string;
    expect(url).toContain('/verify-email?token=');
    const token = new URL(url).searchParams.get('token');

    const verify = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(verify.status).toBe(200);
    expect(verify.body.data.user).toMatchObject({ status: 'active', emailVerified: true });

    // Replaying the same link must fail.
    const replay = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(replay.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const user = await createUser({ verified: false, status: 'pending' });
    const token = 'a'.repeat(40);
    await VerificationToken.create({
      userId: user._id,
      type: 'verify',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'z'.repeat(40) });
    expect(res.status).toBe(400);
  });

  it('does not reveal whether an address needs verification', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'nobody@example.com' });

    // Same 200 for a real and a fake address: no account oracle.
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
  });
});

// ---------------------------------------------------------------------- login

describe('POST /api/v1/auth/login', () => {
  it('issues an access token and a refresh cookie', async () => {
    const user = await createUser({ email: 'login@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.expiresIn).toBe(900); // 15 minutes
    expect(res.body.data.user.email).toBe('login@example.com');
    expect(res.body.data.user.permissions).toContain('order:create');

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('smd_rt='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api/v1/auth');
  });

  it('stores only a HASH of the refresh token', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const raw = /smd_rt=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';

    const stored = await RefreshToken.findOne({ userId: user._id });
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(raw);
    expect(stored?.tokenHash).toBe(hashToken(decodeURIComponent(raw)));
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const user = await createUser({ email: 'known@example.com' });

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPass123' });

    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.com', password: 'WrongPass123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical message: nothing here reveals which accounts exist.
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('blocks an unverified account with a distinct code', async () => {
    const user = await createUser({ verified: false, status: 'pending' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.EMAIL_NOT_VERIFIED);
  });

  it('blocks a suspended account', async () => {
    const user = await createUser({ status: 'suspended' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.ACCOUNT_SUSPENDED);
  });

  it('locks the account after 10 consecutive failures', async () => {
    const user = await createUser({ email: 'lockme@example.com' });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'WrongPass123' });
    }

    // Even the CORRECT password is now refused.
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe(ERROR_CODES.ACCOUNT_LOCKED);
  });

  it('resets the failure counter after a successful login', async () => {
    const user = await createUser();
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPass123' });

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect((await User.findById(user._id))?.failedLoginCount).toBe(0);
  });
});

// ------------------------------------------------------------------- refresh

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the token and returns a new session', async () => {
    const { cookies } = await createAuthedUser(app);

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();

    const newCookies = res.headers['set-cookie'] as unknown as string[];
    expect(newCookies.join(';')).toContain('smd_rt=');
    // The old token must not still be valid.
    expect(newCookies.join(';')).not.toBe(cookies.join(';'));
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const { user, cookies } = await createAuthedUser(app);

    // First refresh rotates the original token.
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(first.status).toBe(200);

    // Replaying the ORIGINAL token is the signature of a stolen cookie.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe(ERROR_CODES.TOKEN_REUSED);

    // Everything in that lineage, including the freshly issued token, is dead.
    const live = await RefreshToken.countDocuments({ userId: user._id, revokedAt: null });
    expect(live).toBe(0);

    const afterBreach = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', first.headers['set-cookie'] as unknown as string[]);
    expect(afterBreach.status).toBe(401);
  });

  it('rejects a request with no cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  it('rejects an expired refresh token', async () => {
    const { user, cookies } = await createAuthedUser(app);
    await RefreshToken.updateMany(
      { userId: user._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(res.status).toBe(401);
  });
});

// -------------------------------------------------------------------- logout

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { user, cookies } = await createAuthedUser(app);

    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', cookies);
    expect(res.status).toBe(200);

    expect(await RefreshToken.countDocuments({ userId: user._id, revokedAt: null })).toBe(0);

    // The revoked cookie can no longer be exchanged.
    const retry = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(retry.status).toBe(401);
  });

  it('succeeds even without a session', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(200);
  });
});

// ----------------------------------------------------------------------- /me

describe('GET /api/v1/auth/me', () => {
  it('returns the caller with resolved permissions', async () => {
    const { accessToken, user } = await createAuthedUser(app);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.permissions).toEqual(expect.arrayContaining(['market:read']));
  });

  it('rejects a missing token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('rejects a token for a user who was since suspended', async () => {
    const { accessToken, user } = await createAuthedUser(app);
    await User.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    // The user doc is re-read per request, so this takes effect immediately
    // rather than at token expiry.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.ACCOUNT_SUSPENDED);
  });
});

// ------------------------------------------------------------ password reset

describe('password reset', () => {
  it('resets the password and invalidates every existing session', async () => {
    const { user, cookies } = await createAuthedUser(app, { email: 'reset@example.com' });

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });
    expect(forgot.status).toBe(200);

    const token = new URL(forgot.body.data.url as string).searchParams.get('token');
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'BrandNewPass9' });
    expect(reset.status).toBe(200);

    // Old password no longer works.
    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    // New password does.
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'BrandNewPass9' });
    expect(newLogin.status).toBe(200);

    // Sessions opened before the reset are dead - the point of the exercise if
    // the reset was triggered by a compromise.
    const stale = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(stale.status).toBe(401);
  });

  it('returns 200 for an unknown address without revealing anything', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeUndefined();
  });

  it('rejects a reset token that was already used', async () => {
    const user = await createUser({ email: 'once@example.com' });
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });
    const token = new URL(forgot.body.data.url as string).searchParams.get('token');

    await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'FirstPass11' });
    const replay = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'SecondPass22' });

    expect(replay.status).toBe(400);
  });

  it('will not issue a reset for a demo account', async () => {
    await createUser({ email: 'demo.trader@smd.local', isDemo: true });
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'demo.trader@smd.local' });

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeUndefined();
    expect(await VerificationToken.countDocuments({ type: 'reset' })).toBe(0);
  });
});

// ----------------------------------------------------------- change password

describe('POST /api/v1/auth/change-password', () => {
  it('changes the password when the current one is correct', async () => {
    const { accessToken, user } = await createAuthedUser(app);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'ChangedPass1' });

    expect(res.status).toBe(200);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'ChangedPass1' });
    expect(login.status).toBe(200);
  });

  it('rejects an incorrect current password', async () => {
    const { accessToken } = await createAuthedUser(app);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'NotMyPass1', newPassword: 'ChangedPass1' });

    expect(res.status).toBe(400);
  });

  it('blocks demo accounts from changing shared credentials', async () => {
    const { accessToken } = await createAuthedUser(app, {
      email: 'demo.trader@smd.local',
      isDemo: true,
    });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Hijacked123' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.DEMO_ACCOUNT_RESTRICTED);
  });
});
