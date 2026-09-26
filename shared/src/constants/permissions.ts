import type { Role } from '../types/roles.js';

/**
 * Permission catalogue.
 *
 * Authorization is permission-based, not role-based, at the route level: a
 * route declares the permission it needs and never names a role. Roles are just
 * named bundles of permissions, which is what lets a Super Admin re-bundle them
 * at runtime without any code change.
 */
export const PERMISSIONS = {
  // --- trader surface ------------------------------------------------------
  PORTFOLIO_READ: 'portfolio:read',
  ORDER_CREATE: 'order:create',
  ORDER_READ: 'order:read',
  ORDER_CANCEL: 'order:cancel',
  WATCHLIST_READ: 'watchlist:read',
  WATCHLIST_MANAGE: 'watchlist:manage',
  ALERT_MANAGE: 'alert:manage',
  NOTIFICATION_READ: 'notification:read',
  MARKET_READ: 'market:read',
  EDUCATION_READ: 'education:read',
  NEWS_READ: 'news:read',

  // --- admin surface -------------------------------------------------------
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
  TRADE_MONITOR: 'trade:monitor',
  ANALYTICS_READ: 'analytics:read',
  INSTRUMENT_MANAGE: 'instrument:manage',
  EDUCATION_MANAGE: 'education:manage',
  NEWS_MANAGE: 'news:manage',

  // --- super admin surface -------------------------------------------------
  ADMIN_MANAGE: 'admin:manage',
  PERMISSION_MANAGE: 'permission:manage',
  CONFIG_MANAGE: 'config:manage',
  SYSTEM_MONITOR: 'system:monitor',
  AUDIT_READ: 'audit:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/*
 * View-only. Deliberately excludes every mutating permission: no orders, no
 * portfolio, no watchlist writes. The API enforces this, so a User who edits
 * the SPA still gets a 403 from the server.
 */
const USER_PERMISSIONS: Permission[] = [
  PERMISSIONS.MARKET_READ,
  PERMISSIONS.NEWS_READ,
  PERMISSIONS.EDUCATION_READ,
  PERMISSIONS.NOTIFICATION_READ,
  PERMISSIONS.WATCHLIST_READ,
];

const TRADER_PERMISSIONS: Permission[] = [
  PERMISSIONS.PORTFOLIO_READ,
  PERMISSIONS.ORDER_CREATE,
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.ORDER_CANCEL,
  PERMISSIONS.WATCHLIST_READ,
  PERMISSIONS.WATCHLIST_MANAGE,
  PERMISSIONS.ALERT_MANAGE,
  PERMISSIONS.NOTIFICATION_READ,
  PERMISSIONS.MARKET_READ,
  PERMISSIONS.EDUCATION_READ,
  PERMISSIONS.NEWS_READ,
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...TRADER_PERMISSIONS,
  PERMISSIONS.USER_READ,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.TRADE_MONITOR,
  PERMISSIONS.ANALYTICS_READ,
  PERMISSIONS.INSTRUMENT_MANAGE,
  PERMISSIONS.EDUCATION_MANAGE,
  PERMISSIONS.NEWS_MANAGE,
];

const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  PERMISSIONS.ADMIN_MANAGE,
  PERMISSIONS.PERMISSION_MANAGE,
  PERMISSIONS.CONFIG_MANAGE,
  PERMISSIONS.SYSTEM_MONITOR,
  PERMISSIONS.AUDIT_READ,
];

/** Seed bundles. The live source of truth is the `roles` collection. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<Role, Permission[]>> = {
  user: USER_PERMISSIONS,
  trader: TRADER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  super_admin: SUPER_ADMIN_PERMISSIONS,
};

/** Routes a role may reach in the SPA, used for navigation and guards. */
export const ROLE_HOME_PATH: Readonly<Record<Role, string>> = {
  user: '/u/dashboard',
  trader: '/app/dashboard',
  admin: '/admin/dashboard',
  super_admin: '/super-admin/dashboard',
};
