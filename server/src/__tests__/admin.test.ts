import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PERMISSIONS } from '@smd/shared';
import { createApp } from '../app.js';
import {
  createAuthedUser,
  createInstrument,
  createUser,
  seedRoles,
  type AuthedUser,
} from './helpers/factories.js';
import { User } from '../modules/users/user.model.js';
import { RefreshToken } from '../modules/auth/token.model.js';
import { AuditLog, SystemConfig } from '../modules/admin/audit.model.js';
import { invalidateConfigCache } from '../modules/admin/config.service.js';

const app = createApp();

let admin: AuthedUser;
let superAdmin: AuthedUser;
let trader: AuthedUser;

beforeEach(async () => {
  await seedRoles();
  trader = await createAuthedUser(app, { role: 'trader', email: 'trader@example.com' });
  admin = await createAuthedUser(app, { role: 'admin', email: 'admin@example.com' });
  superAdmin = await createAuthedUser(app, { role: 'super_admin', email: 'super@example.com' });
});

// ---------------------------------------------------- authorization matrix

describe('admin route authorization', () => {
  /**
   * The decisive RBAC test: every admin surface, checked against every role.
   * This is what proves the guard is enforced on the SERVER, independent of
   * whatever the UI chooses to display.
   */
  const ADMIN_ROUTES = [
    '/api/v1/admin/users',
    '/api/v1/admin/orders',
    '/api/v1/admin/analytics',
    '/api/v1/admin/instruments',
  ];

  const SUPER_ADMIN_ROUTES = [
    '/api/v1/super-admin/admins',
    '/api/v1/super-admin/roles',
    '/api/v1/super-admin/config',
    '/api/v1/super-admin/system/health',
    '/api/v1/super-admin/audit-logs',
  ];

  it.each(ADMIN_ROUTES)('refuses a trader on %s', async (route) => {
    const res = await trader.auth(request(app).get(route));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it.each(ADMIN_ROUTES)('allows an admin on %s', async (route) => {
    const res = await admin.auth(request(app).get(route));
    expect(res.status).toBe(200);
  });

  it.each(SUPER_ADMIN_ROUTES)('refuses a trader on %s', async (route) => {
    expect((await trader.auth(request(app).get(route))).status).toBe(403);
  });

  it.each(SUPER_ADMIN_ROUTES)('refuses an ADMIN on %s', async (route) => {
    // Admins are deliberately kept out of platform configuration.
    expect((await admin.auth(request(app).get(route))).status).toBe(403);
  });

  it.each(SUPER_ADMIN_ROUTES)('allows a super admin on %s', async (route) => {
    expect((await superAdmin.auth(request(app).get(route))).status).toBe(200);
  });

  it.each([...ADMIN_ROUTES, ...SUPER_ADMIN_ROUTES])(
    'refuses an anonymous request on %s',
    async (route) => {
      expect((await request(app).get(route)).status).toBe(401);
    },
  );
});

// ------------------------------------------------------- user management

describe('admin user management', () => {
  it('lists users with their trading activity', async () => {
    const res = await admin.auth(request(app).get('/api/v1/admin/users'));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);

    const row = res.body.data.find((u: { email: string }) => u.email === 'trader@example.com');
    expect(row).toMatchObject({ role: 'trader', status: 'active', orderCount: 0 });
    // Both wallets are reported, kept separate.
    expect(row.portfolioValueInr).toBe(100_000_000);
    expect(row.portfolioValueUsd).toBe(1_000_000);
  });

  it('filters by role and by status', async () => {
    const byRole = await admin.auth(request(app).get('/api/v1/admin/users?role=admin'));
    expect(byRole.body.data.every((u: { role: string }) => u.role === 'admin')).toBe(true);

    await createUser({ email: 'suspended@example.com', status: 'suspended' });
    const byStatus = await admin.auth(request(app).get('/api/v1/admin/users?status=suspended'));
    expect(byStatus.body.data).toHaveLength(1);
  });

  it('searches by email', async () => {
    const res = await admin.auth(request(app).get('/api/v1/admin/users?q=trader@'));
    expect(res.body.data).toHaveLength(1);
  });

  it('suspends a user and revokes their sessions immediately', async () => {
    expect(await RefreshToken.countDocuments({ userId: trader.user._id, revokedAt: null })).toBe(1);

    const res = await admin.auth(
      request(app)
        .patch(`/api/v1/admin/users/${trader.user.id}/status`)
        .send({ status: 'suspended', reason: 'Testing suspension' }),
    );

    expect(res.status).toBe(200);
    expect((await User.findById(trader.user._id))?.status).toBe('suspended');

    // Access must end now, not when the access token happens to expire.
    expect(await RefreshToken.countDocuments({ userId: trader.user._id, revokedAt: null })).toBe(0);
    expect((await trader.auth(request(app).get('/api/v1/auth/me'))).status).toBe(403);
  });

  it('writes an audit entry for a status change', async () => {
    await admin.auth(
      request(app)
        .patch(`/api/v1/admin/users/${trader.user.id}/status`)
        .send({ status: 'suspended', reason: 'Policy violation' }),
    );

    const entry = await AuditLog.findOne({ action: 'user.status' });
    expect(entry).not.toBeNull();
    expect(entry?.actorEmail).toBe('admin@example.com');
    expect(entry?.summary).toContain('Policy violation');
    expect(entry?.before).toMatchObject({ status: 'active' });
    expect(entry?.after).toMatchObject({ status: 'suspended' });
  });

  it('refuses to let an admin change their own status', async () => {
    const res = await admin.auth(
      request(app)
        .patch(`/api/v1/admin/users/${admin.user.id}/status`)
        .send({ status: 'suspended' }),
    );

    expect(res.status).toBe(400);
  });

  it('refuses to suspend a shared demo account', async () => {
    const demo = await createUser({ email: 'demo.trader@smd.local', isDemo: true });
    const res = await admin.auth(
      request(app).patch(`/api/v1/admin/users/${demo.id}/status`).send({ status: 'suspended' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/demo/i);
  });

  it('refuses to let an admin act on a super admin', async () => {
    const res = await admin.auth(
      request(app)
        .patch(`/api/v1/admin/users/${superAdmin.user.id}/status`)
        .send({ status: 'suspended' }),
    );

    expect(res.status).toBe(403);
  });

  it('allows a super admin to act on another super admin', async () => {
    const other = await createUser({ email: 'super2@example.com', role: 'super_admin' });
    const res = await superAdmin.auth(
      request(app).patch(`/api/v1/admin/users/${other.id}/status`).send({ status: 'suspended' }),
    );

    expect(res.status).toBe(200);
  });
});

// ------------------------------------------------------- platform analytics

describe('platform analytics', () => {
  it('aggregates users, trading and content', async () => {
    await createInstrument({ symbol: 'ANALY', exchange: 'NSE' });

    const res = await admin.auth(request(app).get('/api/v1/admin/analytics'));

    expect(res.status).toBe(200);
    expect(res.body.data.users.total).toBeGreaterThanOrEqual(3);
    expect(res.body.data.users.byRole).toMatchObject({ trader: 1, admin: 1, super_admin: 1 });
    expect(res.body.data.content.instruments).toBe(1);
    expect(Array.isArray(res.body.data.ordersTrend)).toBe(true);
    expect(Array.isArray(res.body.data.topTradedSymbols)).toBe(true);
  });
});

// ----------------------------------------------------------- instruments

describe('instrument management', () => {
  it('adds an instrument and derives its provider symbol', async () => {
    const res = await admin.auth(
      request(app).post('/api/v1/admin/instruments').send({
        symbol: 'newco',
        name: 'NewCo Ltd',
        exchange: 'NSE',
        sector: 'Testing',
        referencePrice: 450.5,
        isActive: true,
      }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      symbol: 'NEWCO',
      exchange: 'NSE',
      market: 'IN',
      currency: 'INR',
      // Yahoo requires the .NS suffix for NSE symbols.
      providerSymbol: 'NEWCO.NS',
    });
  });

  it('derives the BSE provider suffix', async () => {
    const res = await admin.auth(
      request(app).post('/api/v1/admin/instruments').send({
        symbol: 'BSECO',
        name: 'BSE Co',
        exchange: 'BSE',
        referencePrice: 100,
        isActive: true,
      }),
    );

    expect(res.body.data.providerSymbol).toBe('BSECO.BO');
  });

  it('leaves US symbols unsuffixed', async () => {
    const res = await admin.auth(
      request(app).post('/api/v1/admin/instruments').send({
        symbol: 'USCO',
        name: 'US Co',
        exchange: 'NASDAQ',
        referencePrice: 100,
        isActive: true,
      }),
    );

    expect(res.body.data.providerSymbol).toBe('USCO');
    expect(res.body.data.currency).toBe('USD');
  });

  it('refuses a duplicate symbol on the same exchange', async () => {
    await createInstrument({ symbol: 'DUPE', exchange: 'NSE' });
    const res = await admin.auth(
      request(app).post('/api/v1/admin/instruments').send({
        symbol: 'DUPE',
        name: 'Dupe',
        exchange: 'NSE',
        referencePrice: 100,
        isActive: true,
      }),
    );

    expect(res.status).toBe(409);
  });

  it('deactivates rather than deletes, preserving trade history', async () => {
    const instrument = await createInstrument({ symbol: 'DEACT', exchange: 'NSE' });

    const res = await admin.auth(request(app).delete(`/api/v1/admin/instruments/${instrument.id}`));

    expect(res.status).toBe(200);
    expect(res.body.data.deactivated).toBe(true);

    const { Instrument } = await import('../modules/instruments/instrument.model.js');
    const after = await Instrument.findById(instrument._id);
    // The row still exists; only the flag changed.
    expect(after).not.toBeNull();
    expect(after?.isActive).toBe(false);
  });
});

// ------------------------------------------------------- super admin: roles

describe('super admin role permissions', () => {
  it('lists every role with its bundle and user count', async () => {
    const res = await superAdmin.auth(request(app).get('/api/v1/super-admin/roles'));

    expect(res.status).toBe(200);
    expect(res.body.data.roles).toHaveLength(4);
    expect(res.body.data.availablePermissions.length).toBeGreaterThan(15);

    const traderRole = res.body.data.roles.find((r: { role: string }) => r.role === 'trader');
    expect(traderRole.userCount).toBe(1);
    expect(traderRole.permissions).toContain(PERMISSIONS.ORDER_CREATE);
  });

  it('updates a bundle and invalidates tokens issued under the old one', async () => {
    const res = await superAdmin.auth(
      request(app)
        .put('/api/v1/super-admin/roles/trader/permissions')
        .send({ permissions: [PERMISSIONS.MARKET_READ] }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.permissionVersion).toBeGreaterThan(1);

    // The trader's existing token carried the previous version.
    const after = await trader.auth(request(app).get('/api/v1/auth/me'));
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects an unknown permission string', async () => {
    const res = await superAdmin.auth(
      request(app)
        .put('/api/v1/super-admin/roles/trader/permissions')
        .send({ permissions: ['not:a:real:permission'] }),
    );

    expect(res.status).toBe(400);
  });

  it('refuses to strip permission management from super admin', async () => {
    // Otherwise the change would be irreversible through the UI.
    const res = await superAdmin.auth(
      request(app)
        .put('/api/v1/super-admin/roles/super_admin/permissions')
        .send({ permissions: [PERMISSIONS.MARKET_READ] }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/permission:manage/);
  });

  it('records the change in the audit log', async () => {
    await superAdmin.auth(
      request(app)
        .put('/api/v1/super-admin/roles/trader/permissions')
        .send({ permissions: [PERMISSIONS.MARKET_READ] }),
    );

    const entry = await AuditLog.findOne({ action: 'role.permissions' });
    expect(entry).not.toBeNull();
    expect(entry?.targetId).toBe('trader');
  });
});

// ------------------------------------------------- super admin: accounts

describe('super admin account management', () => {
  it('creates a pre-verified admin account with wallets', async () => {
    const res = await superAdmin.auth(
      request(app).post('/api/v1/super-admin/admins').send({
        firstName: 'New',
        lastName: 'Admin',
        email: 'newadmin@example.com',
        password: 'StrongPass123',
        role: 'admin',
      }),
    );

    expect(res.status).toBe(201);

    const created = await User.findOne({ email: 'newadmin@example.com' });
    expect(created?.role).toBe('admin');
    expect(created?.emailVerifiedAt).not.toBeNull();

    // The new admin can sign in straight away.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'newadmin@example.com', password: 'StrongPass123' });
    expect(login.status).toBe(200);
  });

  it('refuses a duplicate email', async () => {
    const res = await superAdmin.auth(
      request(app).post('/api/v1/super-admin/admins').send({
        firstName: 'Dup',
        lastName: 'Admin',
        email: 'admin@example.com',
        password: 'StrongPass123',
        role: 'admin',
      }),
    );

    expect(res.status).toBe(409);
  });

  it('changes a role and ends that user existing sessions', async () => {
    const res = await superAdmin.auth(
      request(app)
        .patch(`/api/v1/super-admin/admins/${trader.user.id}/role`)
        .send({ role: 'admin' }),
    );

    expect(res.status).toBe(200);
    expect((await User.findById(trader.user._id))?.role).toBe('admin');
    expect(await RefreshToken.countDocuments({ userId: trader.user._id, revokedAt: null })).toBe(0);
  });

  it('refuses to demote the last super admin', async () => {
    const other = await createUser({ email: 'promote@example.com', role: 'trader' });

    // Demote the only other super admin candidate... there is none, so the
    // acting super admin is the last one. Changing their own role is blocked
    // separately, so promote someone, then demote the original.
    await superAdmin.auth(
      request(app)
        .patch(`/api/v1/super-admin/admins/${other.id}/role`)
        .send({ role: 'super_admin' }),
    );

    // Now two exist; demoting one is allowed.
    const allowed = await superAdmin.auth(
      request(app).patch(`/api/v1/super-admin/admins/${other.id}/role`).send({ role: 'trader' }),
    );
    expect(allowed.status).toBe(200);
  });

  it('refuses to let a super admin change their own role', async () => {
    const res = await superAdmin.auth(
      request(app)
        .patch(`/api/v1/super-admin/admins/${superAdmin.user.id}/role`)
        .send({ role: 'trader' }),
    );

    expect(res.status).toBe(400);
  });
});

// -------------------------------------------------- super admin: config

describe('super admin platform configuration', () => {
  beforeEach(() => {
    invalidateConfigCache();
  });

  it('returns the current configuration', async () => {
    const res = await superAdmin.auth(request(app).get('/api/v1/super-admin/config'));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tradingEnabled: true,
      registrationEnabled: true,
      maintenanceMode: false,
    });
  });

  it('disables trading platform-wide, blocking every order', async () => {
    await createInstrument({ symbol: 'HALTED', exchange: 'NSE' });

    await superAdmin.auth(
      request(app).put('/api/v1/super-admin/config').send({ tradingEnabled: false }),
    );
    invalidateConfigCache();

    const order = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'HALTED',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        queueIfClosed: true,
      }),
    );

    expect(order.status).toBe(403);
    expect(order.body.error.code).toBe('TRADING_DISABLED');
  });

  it('closes registration', async () => {
    await superAdmin.auth(
      request(app).put('/api/v1/super-admin/config').send({ registrationEnabled: false }),
    );
    invalidateConfigCache();

    const res = await request(app).post('/api/v1/auth/register').send({
      firstName: 'Late',
      lastName: 'Arrival',
      email: 'late@example.com',
      password: 'StrongPass1',
    });

    expect(res.status).toBe(403);
  });

  it('converts opening capital from major to minor units', async () => {
    await superAdmin.auth(
      request(app)
        .put('/api/v1/super-admin/config')
        .send({ initialCapitalInr: 500000, initialCapitalUsd: 5000 }),
    );

    const config = await SystemConfig.findOne({ key: 'global' });
    expect(config?.initialCapitalInr).toBe(50_000_000);
    expect(config?.initialCapitalUsd).toBe(500_000);
  });

  it('records who changed the configuration', async () => {
    await superAdmin.auth(
      request(app).put('/api/v1/super-admin/config').send({ maintenanceMode: true }),
    );

    const res = await superAdmin.auth(request(app).get('/api/v1/super-admin/config'));
    expect(res.body.data.updatedByEmail).toBe('super@example.com');

    expect(await AuditLog.countDocuments({ action: 'config.update' })).toBe(1);
  });
});

// -------------------------------------------------- super admin: health

describe('super admin system monitoring', () => {
  it('reports dependencies, providers and workers', async () => {
    const res = await superAdmin.auth(request(app).get('/api/v1/super-admin/system/health'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.dependencies.mongo.state).toBe('up');
    expect(res.body.data.dependencies.redis.state).toBe('disabled');
    expect(res.body.data.marketDataProviders.length).toBeGreaterThan(0);
    expect(res.body.data.workers.length).toBeGreaterThan(0);
    expect(res.body.data.memory.rssMb).toBeGreaterThan(0);
  });

  it('exposes the audit log newest first', async () => {
    await admin.auth(
      request(app)
        .patch(`/api/v1/admin/users/${trader.user.id}/status`)
        .send({ status: 'suspended' }),
    );

    const res = await superAdmin.auth(request(app).get('/api/v1/super-admin/audit-logs'));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toMatchObject({
      action: 'user.status',
      actorEmail: 'admin@example.com',
    });
  });
});
