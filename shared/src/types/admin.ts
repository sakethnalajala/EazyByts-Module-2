import type { Permission } from '../constants/permissions.js';
import type { Role, UserStatus } from './roles.js';
import type { DependencyStatus } from './health.js';

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  isDemo: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  orderCount: number;
  portfolioValueInr: number;
  portfolioValueUsd: number;
}

export interface PlatformAnalytics {
  users: {
    total: number;
    active: number;
    pending: number;
    suspended: number;
    demo: number;
    newLast7Days: number;
    byRole: Record<Role, number>;
  };
  trading: {
    totalOrders: number;
    filledOrders: number;
    pendingOrders: number;
    rejectedOrders: number;
    ordersLast24h: number;
    totalVolumeInr: number;
    totalVolumeUsd: number;
    totalFeesInr: number;
    totalFeesUsd: number;
  };
  content: {
    instruments: number;
    activeInstruments: number;
    educationPublished: number;
    educationDrafts: number;
    newsArticles: number;
  };
  engagement: {
    watchlistItems: number;
    activeAlerts: number;
    unreadNotifications: number;
  };
  /** Order counts per day for the activity chart. */
  ordersTrend: { date: string; orders: number; filled: number }[];
  topTradedSymbols: { symbol: string; exchange: string; orders: number }[];
}

export interface AdminTradeRow {
  id: string;
  userEmail: string;
  userName: string;
  symbol: string;
  exchange: string;
  side: string;
  type: string;
  status: string;
  quantity: number;
  price: number | null;
  netAmount: number | null;
  currency: string;
  placedAt: string;
}

export interface RolePermissionsView {
  role: Role;
  label: string;
  permissions: Permission[];
  /** Number of accounts currently holding this role. */
  userCount: number;
  isSystem: boolean;
}

export interface SystemConfigView {
  tradingEnabled: boolean;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  initialCapitalInr: number;
  initialCapitalUsd: number;
  /** Feature flags consumed by the SPA. */
  featureFlags: Record<string, boolean>;
  updatedAt: string;
  updatedByEmail: string | null;
}

export interface SystemHealthView {
  status: 'ready' | 'degraded';
  uptimeSeconds: number;
  nodeVersion: string;
  environment: string;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  dependencies: { mongo: DependencyStatus; redis: DependencyStatus };
  marketDataProviders: {
    name: string;
    state: 'up' | 'down' | 'circuit-open';
    lastSuccessAt: string | null;
    failureCount: number;
  }[];
  counts: { users: number; orders: number; instruments: number };
  workers: { name: string; lastRunAt: string | null; lastRunStatus: string }[];
}

export interface AuditLogRow {
  id: string;
  actorEmail: string | null;
  actorRole: Role | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  ip: string | null;
  createdAt: string;
}
