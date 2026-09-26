import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DEFAULT_ROLE_PERMISSIONS, ERROR_CODES, PERMISSIONS, ROLES, type Role } from '@smd/shared';
import { createApp } from '../app.js';
import { createAuthedUser, createUser, seedRoles } from './helpers/factories.js';
import { setRolePermissions } from '../modules/roles/role.service.js';

const app = createApp();

/** Mirrors the four seeded demo accounts. */
const DEMO_EMAILS: Record<Role, string> = {
  user: 'user.demo@stockdashboard.com',
  trader: 'trader.demo@stockdashboard.com',
  admin: 'admin.demo@stockdashboard.com',
  super_admin: 'superadmin.demo@stockdashboard.com',
};

async function seedDemoAccounts(): Promise<void> {
  await seedRoles();
  for (const role of ROLES) {
    await createUser({ email: DEMO_EMAILS[role], role, isDemo: true, verified: true });
  }
}

// ----------------------------------------------------------------- demo login

describe('POST /api/v1/auth/demo-login', () => {
  beforeEach(seedDemoAccounts);

  it.each(ROLES)('signs in as the %s demo account with no password', async (role) => {
    const res = await request(app).post('/api/v1/auth/demo-login').send({ role });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      email: DEMO_EMAILS[role],
      role,
      isDemo: true,
      emailVerified: true,
    });
    expect(res.body.data.accessToken).toBeTruthy();

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain('smd_rt=');
  });

  it('gives each demo role the permissions its bundle defines', async () => {
    for (const role of ROLES) {
      const res = await request(app).post('/api/v1/auth/demo-login').send({ role });
      expect(new Set(res.body.data.user.permissions)).toEqual(
        new Set(DEFAULT_ROLE_PERMISSIONS[role]),
      );
    }
  });

  it('rejects an unknown role', async () => {
    const res = await request(app).post('/api/v1/auth/demo-login').send({ role: 'wizard' });
    expect(res.status).toBe(422);
  });

  it('reports a clear error when the demo accounts are not seeded', async () => {
    const { User } = await import('../modules/users/user.model.js');
    await User.deleteMany({ isDemo: true });

    const res = await request(app).post('/api/v1/auth/demo-login').send({ role: 'trader' });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toContain('seed');
  });

  it('lists the demo accounts for the login screen', async () => {
    const res = await request(app).get('/api/v1/auth/demo-accounts');

    expect(res.status).toBe(200);
    expect(res.body.data.accounts).toHaveLength(4);
    expect(res.body.data.accounts[0]).toHaveProperty('password');
    // Ordered least- to most-privileged, matching the login screen.
    expect(res.body.data.accounts.map((a: { role: string }) => a.role)).toEqual([
      'user',
      'trader',
      'admin',
      'super_admin',
    ]);
  });

  it('refuses a suspended demo account', async () => {
    const { User } = await import('../modules/users/user.model.js');
    await User.updateOne({ email: DEMO_EMAILS.trader }, { $set: { status: 'suspended' } });

    const res = await request(app).post('/api/v1/auth/demo-login').send({ role: 'trader' });
    expect(res.status).toBe(403);
  });
});

// ----------------------------------------------------------------------- RBAC

describe('role-based access control', () => {
  beforeEach(seedRoles);

  it('gives a trader trading permissions but no admin permissions', async () => {
    const { accessToken } = await createAuthedUser(app, { role: 'trader' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    const permissions = res.body.data.user.permissions as string[];
    expect(permissions).toContain(PERMISSIONS.ORDER_CREATE);
    expect(permissions).toContain(PERMISSIONS.PORTFOLIO_READ);
    expect(permissions).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.CONFIG_MANAGE);
  });

  it('gives an admin user management but not platform configuration', async () => {
    const { accessToken } = await createAuthedUser(app, { role: 'admin' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    const permissions = res.body.data.user.permissions as string[];
    expect(permissions).toContain(PERMISSIONS.USER_MANAGE);
    expect(permissions).toContain(PERMISSIONS.TRADE_MONITOR);
    expect(permissions).not.toContain(PERMISSIONS.CONFIG_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.ADMIN_MANAGE);
  });

  it('gives a super admin every permission', async () => {
    const { accessToken } = await createAuthedUser(app, { role: 'super_admin' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    const permissions = res.body.data.user.permissions as string[];
    for (const permission of Object.values(PERMISSIONS)) {
      expect(permissions).toContain(permission);
    }
  });

  it('inherits: every trader permission is also held by admin and super admin', () => {
    for (const permission of DEFAULT_ROLE_PERMISSIONS.trader) {
      expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain(permission);
      expect(DEFAULT_ROLE_PERMISSIONS.super_admin).toContain(permission);
    }
  });

  it('retires live tokens when a role bundle is edited', async () => {
    const { accessToken } = await createAuthedUser(app, { role: 'admin' });

    // Works before the change.
    expect(
      (await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`))
        .status,
    ).toBe(200);

    // A Super Admin re-bundles the admin role, bumping permissionVersion.
    await setRolePermissions('admin', [PERMISSIONS.MARKET_READ]);

    const after = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    // The old token carried the previous version, so it no longer applies.
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe(ERROR_CODES.TOKEN_EXPIRED);
  });

  it('does not let a client claim a role through the request body', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      firstName: 'Sneaky',
      lastName: 'User',
      email: 'sneaky@example.com',
      password: 'StrongPass1',
      role: 'super_admin',
    });

    /*
     * Registration now accepts a role, but only from SELF_SERVICE_ROLES
     * ('user' | 'trader'). A privileged role is rejected outright rather than
     * silently downgraded, and no account is created.
     */
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// --------------------------------------------------------------- preferences

describe('PATCH /api/v1/users/preferences', () => {
  beforeEach(seedRoles);

  it('persists theme and widget layout', async () => {
    const { accessToken } = await createAuthedUser(app);

    const res = await request(app)
      .patch('/api/v1/users/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        theme: 'dark',
        defaultMarket: 'US',
        widgets: [
          { id: 'portfolio-summary', visible: true, order: 0 },
          { id: 'market-movers', visible: false, order: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.preferences).toMatchObject({
      theme: 'dark',
      defaultMarket: 'US',
    });
    expect(res.body.data.user.preferences.widgets).toHaveLength(2);
  });

  it('allows demo accounts to customise their own view', async () => {
    const { accessToken } = await createAuthedUser(app, {
      email: 'trader.demo@stockdashboard.com',
      isDemo: true,
    });

    const res = await request(app)
      .patch('/api/v1/users/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ theme: 'light' });

    // Deliberately permitted: a reviewer should be able to flip the theme.
    expect(res.status).toBe(200);
  });

  it('blocks demo accounts from editing the shared profile', async () => {
    const { accessToken } = await createAuthedUser(app, {
      email: 'trader.demo@stockdashboard.com',
      isDemo: true,
    });

    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Renamed' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.DEMO_ACCOUNT_RESTRICTED);
  });
});
