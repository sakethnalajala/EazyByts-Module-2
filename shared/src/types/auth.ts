import type { Permission } from '../constants/permissions.js';
import type { Role, UserStatus } from './roles.js';

/** The authenticated user as the client sees it. Never includes a hash. */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  isDemo: boolean;
  emailVerified: boolean;
  permissions: Permission[];
  preferences: UserPreferences;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  /** Which market the dashboard opens on. Wallets stay segregated regardless. */
  defaultMarket: 'IN' | 'US';
  /** Dashboard widget visibility and order, persisted server-side. */
  widgets: WidgetPreference[];
  emailNotifications: boolean;
}

export interface WidgetPreference {
  id: string;
  visible: boolean;
  order: number;
}

/** Returned by every endpoint that establishes a session. */
export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/** Claims carried inside the access token. */
export interface AccessTokenClaims {
  sub: string;
  role: Role;
  /** Bumped when a role's permissions change, invalidating live tokens. */
  pv: number;
  type: 'access';
}

export interface DemoAccountInfo {
  role: Role;
  label: string;
  email: string;
  /** Documented publicly on purpose - these are throwaway demo accounts. */
  password: string;
  description: string;
}
