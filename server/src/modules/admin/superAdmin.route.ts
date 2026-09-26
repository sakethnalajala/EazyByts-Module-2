import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  createAdminSchema,
  listAuditLogsQuerySchema,
  updateRolePermissionsSchema,
  updateSystemConfigSchema,
  type AuditLogRow,
  type Permission,
  type Role,
  type RolePermissionsView,
  type SystemHealthView,
} from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import {
  body,
  params,
  query,
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import { User } from '../users/user.model.js';
import { Order } from '../orders/order.model.js';
import { Instrument } from '../instruments/instrument.model.js';
import { AuditLog, SystemConfig } from './audit.model.js';
import { recordAudit } from './audit.service.js';
import { getSystemConfig, invalidateConfigCache, toSystemConfigView } from './config.service.js';
import { getRolePermissions, setRolePermissions } from '../roles/role.service.js';
import { RoleModel } from '../roles/role.model.js';
import { hashPassword } from '../../lib/password.js';
import { ensureWallets } from '../portfolios/portfolio.service.js';
import { logoutAllSessions } from '../auth/auth.service.js';
import { checkDatabase } from '../../config/db.js';
import { checkCache } from '../../services/cache/cache.js';
import { getProviderHealth } from '../../services/market/providerChain.js';
import { getWorkerRuns } from '../../workers/registry.js';
import { env } from '../../config/env.js';

export const superAdminRouter: Router = Router();

superAdminRouter.use(authenticate);

const roleParam = z.object({ role: z.enum(ROLES) });
const idParam = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id.') });

// ------------------------------------------------------------ admin accounts

superAdminRouter.get(
  '/admins',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  async (_req: Request, res: Response) => {
    const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } }).sort({
      createdAt: -1,
    });

    sendSuccess(res, {
      admins: admins.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        status: user.status,
        isDemo: user.isDemo,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      })),
    });
  },
);

superAdminRouter.post(
  '/admins',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateBody(createAdminSchema),
  async (req: Request, res: Response) => {
    const input = body<{
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      role: 'admin' | 'super_admin';
    }>(req);

    if (await User.findOne({ email: input.email })) {
      throw ApiError.conflict('CONFLICT', 'An account with that email already exists.');
    }

    const user = await User.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: 'active',
      // Created by a Super Admin, so the address is treated as vouched for.
      emailVerifiedAt: new Date(),
    });

    await ensureWallets(user._id);

    await recordAudit(req, {
      action: 'admin.create',
      targetType: 'User',
      targetId: user.id,
      summary: `Created ${input.role} account ${user.email}`,
    });

    sendSuccess(res, { id: user.id, email: user.email, role: user.role }, 201);
  },
);

superAdminRouter.patch(
  '/admins/:id/role',
  requirePermission(PERMISSIONS.ADMIN_MANAGE),
  validateParams(idParam),
  validateBody(z.object({ role: z.enum(ROLES) })),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = params<{ id: string }>(req);
    const { role } = body<{ role: Role }>(req);

    const target = await User.findById(id);
    if (!target) throw ApiError.notFound('User not found.');

    if (target.id === auth.userId) {
      throw ApiError.badRequest('You cannot change your own role.');
    }
    if (target.isDemo) {
      throw ApiError.badRequest('Demo account roles are fixed so the public demo stays coherent.');
    }

    // Refuse to remove the last Super Admin - that would lock everyone out of
    // the permission system with no way back in.
    if (target.role === 'super_admin' && role !== 'super_admin') {
      const remaining = await User.countDocuments({
        role: 'super_admin',
        isDemo: false,
        _id: { $ne: target._id },
      });
      if (remaining === 0) {
        throw ApiError.badRequest(
          'This is the last Super Admin. Promote another account before demoting this one.',
        );
      }
    }

    const before = target.role;
    target.role = role;
    await target.save();

    // The old token carries the old role, so end every session.
    await logoutAllSessions(target.id);

    await recordAudit(req, {
      action: 'admin.role',
      targetType: 'User',
      targetId: target.id,
      summary: `Changed ${target.email} role from ${before} to ${role}`,
      before: { role: before },
      after: { role },
    });

    sendSuccess(res, { id: target.id, email: target.email, role: target.role });
  },
);

// --------------------------------------------------------------- permissions

superAdminRouter.get(
  '/roles',
  requirePermission(PERMISSIONS.PERMISSION_MANAGE),
  async (_req: Request, res: Response) => {
    const views: RolePermissionsView[] = [];

    for (const role of ROLES) {
      const [permissions, userCount, doc] = await Promise.all([
        getRolePermissions(role),
        User.countDocuments({ role }),
        RoleModel.findOne({ name: role }).lean(),
      ]);

      views.push({
        role,
        label: ROLE_LABELS[role],
        permissions,
        userCount,
        isSystem: doc?.isSystem ?? true,
      });
    }

    sendSuccess(res, { roles: views, availablePermissions: ALL_PERMISSIONS });
  },
);

superAdminRouter.put(
  '/roles/:role/permissions',
  requirePermission(PERMISSIONS.PERMISSION_MANAGE),
  validateParams(roleParam),
  validateBody(updateRolePermissionsSchema),
  async (req: Request, res: Response) => {
    const { role } = params<{ role: Role }>(req);
    const { permissions } = body<{ permissions: string[] }>(req);

    const unknown = permissions.filter(
      (permission) => !ALL_PERMISSIONS.includes(permission as Permission),
    );
    if (unknown.length > 0) {
      throw ApiError.badRequest(`Unknown permission(s): ${unknown.join(', ')}`);
    }

    // Stripping permission management from super_admin would make the change
    // irreversible through the UI.
    if (role === 'super_admin' && !permissions.includes(PERMISSIONS.PERMISSION_MANAGE)) {
      throw ApiError.badRequest(
        'Super Admin must retain permission:manage, or no one could edit roles again.',
      );
    }

    const before = await getRolePermissions(role);
    const result = await setRolePermissions(role, permissions as Permission[]);

    await recordAudit(req, {
      action: 'role.permissions',
      targetType: 'Role',
      targetId: role,
      summary: `Updated ${role} permissions (${before.length} -> ${permissions.length})`,
      before: { permissions: before },
      after: { permissions },
    });

    sendSuccess(res, {
      role,
      ...result,
      note: 'Existing sessions for this role have been invalidated and must sign in again.',
    });
  },
);

// -------------------------------------------------------------------- config

superAdminRouter.get(
  '/config',
  requirePermission(PERMISSIONS.CONFIG_MANAGE),
  async (_req: Request, res: Response) => {
    sendSuccess(res, toSystemConfigView(await getSystemConfig()));
  },
);

superAdminRouter.put(
  '/config',
  requirePermission(PERMISSIONS.CONFIG_MANAGE),
  validateBody(updateSystemConfigSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = body<Record<string, unknown>>(req);

    const current = await getSystemConfig();
    const before = toSystemConfigView(current);

    const update: Record<string, unknown> = { ...input };
    // Capital arrives in major units from the UI; stored in minor units.
    if (typeof input.initialCapitalInr === 'number') {
      update.initialCapitalInr = Math.round(input.initialCapitalInr * 100);
    }
    if (typeof input.initialCapitalUsd === 'number') {
      update.initialCapitalUsd = Math.round(input.initialCapitalUsd * 100);
    }
    update.updatedById = auth.user._id;
    update.updatedByEmail = auth.user.email;

    const updated = await SystemConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: update },
      { upsert: true, returnDocument: 'after' },
    );
    invalidateConfigCache();

    if (!updated) throw ApiError.internal('Configuration could not be saved.');

    await recordAudit(req, {
      action: 'config.update',
      targetType: 'SystemConfig',
      targetId: 'global',
      summary: `Updated platform configuration (${Object.keys(input).join(', ')})`,
      before: before as unknown as Record<string, unknown>,
      after: toSystemConfigView(updated) as unknown as Record<string, unknown>,
    });

    sendSuccess(res, toSystemConfigView(updated));
  },
);

// -------------------------------------------------------------------- health

superAdminRouter.get(
  '/system/health',
  requirePermission(PERMISSIONS.SYSTEM_MONITOR),
  async (_req: Request, res: Response) => {
    const [mongo, redis, users, orders, instruments] = await Promise.all([
      checkDatabase(),
      checkCache(),
      User.countDocuments(),
      Order.countDocuments(),
      Instrument.countDocuments(),
    ]);

    const memory = process.memoryUsage();

    const payload: SystemHealthView = {
      status: mongo.state === 'up' ? 'ready' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      environment: env.NODE_ENV,
      memory: {
        rssMb: Math.round(memory.rss / 1_048_576),
        heapUsedMb: Math.round(memory.heapUsed / 1_048_576),
        heapTotalMb: Math.round(memory.heapTotal / 1_048_576),
      },
      dependencies: { mongo, redis },
      marketDataProviders: getProviderHealth(),
      counts: { users, orders, instruments },
      workers: getWorkerRuns(),
    };

    sendSuccess(res, payload);
  },
);

superAdminRouter.get(
  '/audit-logs',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateQuery(listAuditLogsQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, action } = query<{ page: number; limit: number; action?: string }>(req);

    const filter: Record<string, unknown> = {};
    if (action) filter.action = action;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    const rows: AuditLogRow[] = logs.map((log) => ({
      id: log._id.toString(),
      actorEmail: log.actorEmail,
      actorRole: log.actorRole,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      summary: log.summary,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
    }));

    sendPaginated(res, rows, { page, limit, total });
  },
);

/** Database connection detail, useful when diagnosing an Atlas problem. */
superAdminRouter.get(
  '/system/database',
  requirePermission(PERMISSIONS.SYSTEM_MONITOR),
  async (_req: Request, res: Response) => {
    const connection = mongoose.connection;
    const collections = await connection.db?.listCollections().toArray();

    sendSuccess(res, {
      readyState: connection.readyState,
      database: connection.name,
      host: connection.host,
      collections: (collections ?? []).map((collection) => collection.name).sort(),
      transactionsSupported:
        'Multi-document transactions require a replica set. MongoDB Atlas always provides one.',
    });
  },
);
