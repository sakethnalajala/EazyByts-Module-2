/*
 * Ordered least- to most-privileged. 'user' is a view-only account that can
 * explore the market, news and education but cannot trade; 'trader' keeps the
 * full trading surface it has always had.
 */
export const ROLES = ['user', 'trader', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  user: 'User',
  trader: 'Trader',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export const USER_STATUSES = ['pending', 'active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
