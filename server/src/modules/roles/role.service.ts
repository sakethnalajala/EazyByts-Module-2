import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_LABELS,
  ROLES,
  type Permission,
  type Role,
} from '@smd/shared';
import { RoleModel } from './role.model.js';
import { logger } from '../../config/logger.js';

/**
 * Role -> permission resolution.
 *
 * Every authorized request needs this, so it is cached in-process for a short
 * window rather than hitting Mongo each time. The cache is explicitly
 * invalidated whenever a Super Admin edits a bundle, so the TTL is a safety net
 * for multi-instance deployments rather than the primary correctness mechanism.
 */

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: Permission[];
  permissionVersion: number;
  loadedAt: number;
}

const cache = new Map<Role, CacheEntry>();

export function invalidateRoleCache(role?: Role): void {
  if (role) cache.delete(role);
  else cache.clear();
}

async function loadRole(role: Role): Promise<CacheEntry> {
  const doc = await RoleModel.findOne({ name: role }).lean();

  if (!doc) {
    // The seed has not run, or the row was deleted. Falling back to the
    // compiled defaults keeps authorization working (and closed) rather than
    // locking every admin out of the platform.
    logger.warn({ role }, 'Role document missing; falling back to default permissions');
    return {
      permissions: DEFAULT_ROLE_PERMISSIONS[role],
      permissionVersion: 1,
      loadedAt: Date.now(),
    };
  }

  return {
    permissions: doc.permissions,
    permissionVersion: doc.permissionVersion,
    loadedAt: Date.now(),
  };
}

export async function getRoleEntry(role: Role): Promise<CacheEntry> {
  const cached = cache.get(role);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;

  const entry = await loadRole(role);
  cache.set(role, entry);
  return entry;
}

export async function getRolePermissions(role: Role): Promise<Permission[]> {
  return (await getRoleEntry(role)).permissions;
}

export async function getPermissionVersion(role: Role): Promise<number> {
  return (await getRoleEntry(role)).permissionVersion;
}

export async function roleHasPermission(role: Role, permission: Permission): Promise<boolean> {
  return (await getRolePermissions(role)).includes(permission);
}

/**
 * Replaces a role's permission bundle and bumps its version, which invalidates
 * every access token already issued under the old bundle.
 */
export async function setRolePermissions(
  role: Role,
  permissions: Permission[],
): Promise<{ permissions: Permission[]; permissionVersion: number }> {
  const updated = await RoleModel.findOneAndUpdate(
    { name: role },
    { $set: { permissions }, $inc: { permissionVersion: 1 } },
    { upsert: true, returnDocument: 'after' },
  ).lean();

  invalidateRoleCache(role);

  return {
    permissions: updated?.permissions ?? permissions,
    permissionVersion: updated?.permissionVersion ?? 1,
  };
}

/** Creates any missing system roles. Safe to run repeatedly. */
export async function ensureRolesSeeded(): Promise<void> {
  for (const role of ROLES) {
    await RoleModel.updateOne(
      { name: role },
      {
        $setOnInsert: {
          name: role,
          label: ROLE_LABELS[role],
          description: `${ROLE_LABELS[role]} system role`,
          permissions: DEFAULT_ROLE_PERMISSIONS[role],
          isSystem: true,
          permissionVersion: 1,
        },
      },
      { upsert: true },
    );
  }

  /*
   * Backfill for the watchlist:read / watchlist:manage split.
   *
   * `$setOnInsert` above deliberately never rewrites an existing role, so a
   * Super Admin's custom bundles survive a redeploy. But splitting one
   * permission into two would have silently locked existing traders and admins
   * out of their own watchlists, because their stored bundle predates
   * watchlist:read.
   *
   * This grants the new read permission only to roles that already hold the
   * write permission - it widens nothing that was not already allowed, and
   * $addToSet makes it idempotent.
   */
  await RoleModel.updateMany(
    { permissions: { $all: [PERMISSIONS.WATCHLIST_MANAGE], $nin: [PERMISSIONS.WATCHLIST_READ] } },
    { $addToSet: { permissions: PERMISSIONS.WATCHLIST_READ } },
  );

  invalidateRoleCache();
}
