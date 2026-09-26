import {
  Activity,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  Cog,
  FileClock,
  GaugeCircle,
  GitCompare,
  Globe2,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Newspaper,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS, type Permission, type Role } from '@smd/shared';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Omitted for items every signed-in user can reach. */
  permission?: Permission;
  /** Matches nested routes, e.g. /app/stocks/RELIANCE under /app/stocks. */
  matchPrefix?: boolean;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/**
 * View-only User navigation: exactly six portals.
 *
 * Deliberately a separate list rather than the trader list filtered by
 * permission. Filtering would leave the User with a sparse version of a
 * trader's sidebar; this is a smaller product surface designed on its own
 * terms, with no trading entry points at all.
 */
export const USER_NAV: NavSection[] = [
  {
    heading: 'Explore',
    items: [
      { label: 'Dashboard', to: '/u/dashboard', icon: LayoutDashboard },
      { label: 'Market', to: '/u/market', icon: Globe2, matchPrefix: true },
      { label: 'Watchlist', to: '/u/watchlist', icon: Star },
    ],
  },
  {
    heading: 'Learn',
    items: [
      { label: 'Market news', to: '/u/news', icon: Newspaper },
      { label: 'Education', to: '/u/education', icon: GraduationCap, matchPrefix: true },
    ],
  },
  {
    heading: 'Account',
    items: [{ label: 'Profile', to: '/u/profile', icon: Users }],
  },
];

/** Trader navigation. */
export const TRADER_NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', to: '/app/dashboard', icon: LayoutDashboard },
      { label: 'Market', to: '/app/market', icon: Globe2 },
      { label: 'Explore stocks', to: '/app/stocks', icon: Search, matchPrefix: true },
    ],
  },
  {
    heading: 'Trading',
    items: [
      {
        label: 'Portfolio',
        to: '/app/portfolio',
        icon: Briefcase,
        permission: PERMISSIONS.PORTFOLIO_READ,
      },
      {
        label: 'Holdings',
        to: '/app/holdings',
        icon: Wallet,
        permission: PERMISSIONS.PORTFOLIO_READ,
      },
      { label: 'Orders', to: '/app/orders', icon: Receipt, permission: PERMISSIONS.ORDER_READ },
      {
        label: 'Transactions',
        to: '/app/transactions',
        icon: FileClock,
        permission: PERMISSIONS.PORTFOLIO_READ,
      },
      {
        label: 'Analytics',
        to: '/app/analytics',
        icon: BarChart3,
        permission: PERMISSIONS.PORTFOLIO_READ,
      },
    ],
  },
  {
    heading: 'Tools',
    items: [
      {
        label: 'Watchlist',
        to: '/app/watchlist',
        icon: Star,
        permission: PERMISSIONS.WATCHLIST_MANAGE,
      },
      {
        label: 'Price alerts',
        to: '/app/alerts',
        icon: BellRing,
        permission: PERMISSIONS.ALERT_MANAGE,
      },
      {
        label: 'Notifications',
        to: '/app/notifications',
        icon: Bell,
        permission: PERMISSIONS.NOTIFICATION_READ,
      },
      { label: 'Compare', to: '/app/compare', icon: GitCompare },
    ],
  },
  {
    heading: 'Learn',
    items: [
      { label: 'Market news', to: '/app/news', icon: Newspaper, permission: PERMISSIONS.NEWS_READ },
      {
        label: 'Education',
        to: '/app/education',
        icon: GraduationCap,
        matchPrefix: true,
        permission: PERMISSIONS.EDUCATION_READ,
      },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: 'Profile', to: '/app/profile', icon: Users },
      { label: 'Settings', to: '/app/settings', icon: Settings },
    ],
  },
];

/** Admin console navigation. */
export const ADMIN_NAV: NavSection[] = [
  {
    heading: 'Administration',
    items: [
      {
        label: 'Admin dashboard',
        to: '/admin/dashboard',
        icon: GaugeCircle,
        permission: PERMISSIONS.ANALYTICS_READ,
      },
      { label: 'Users', to: '/admin/users', icon: Users, permission: PERMISSIONS.USER_READ },
      {
        label: 'Trade monitor',
        to: '/admin/trades',
        icon: Activity,
        permission: PERMISSIONS.TRADE_MONITOR,
      },
      {
        label: 'Platform analytics',
        to: '/admin/analytics',
        icon: LineChart,
        permission: PERMISSIONS.ANALYTICS_READ,
      },
      {
        label: 'Instruments',
        to: '/admin/instruments',
        icon: Building2,
        permission: PERMISSIONS.INSTRUMENT_MANAGE,
      },
      {
        label: 'Education CMS',
        to: '/admin/education',
        icon: BookOpen,
        permission: PERMISSIONS.EDUCATION_MANAGE,
      },
    ],
  },
];

/** Super Admin console navigation. */
export const SUPER_ADMIN_NAV: NavSection[] = [
  {
    heading: 'Platform control',
    items: [
      {
        label: 'Super Admin',
        to: '/super-admin/dashboard',
        icon: ShieldCheck,
        permission: PERMISSIONS.SYSTEM_MONITOR,
      },
      {
        label: 'Admin accounts',
        to: '/super-admin/admins',
        icon: Users,
        permission: PERMISSIONS.ADMIN_MANAGE,
      },
      {
        label: 'Permissions',
        to: '/super-admin/permissions',
        icon: ShieldCheck,
        permission: PERMISSIONS.PERMISSION_MANAGE,
      },
      {
        label: 'Configuration',
        to: '/super-admin/config',
        icon: Cog,
        permission: PERMISSIONS.CONFIG_MANAGE,
      },
      {
        label: 'System monitor',
        to: '/super-admin/system',
        icon: Activity,
        permission: PERMISSIONS.SYSTEM_MONITOR,
      },
      {
        label: 'Audit log',
        to: '/super-admin/audit',
        icon: ScrollText,
        permission: PERMISSIONS.AUDIT_READ,
      },
    ],
  },
];

/**
 * Builds the sidebar for a given permission set.
 *
 * Filtering here is a UX concern only - it avoids showing doors that lead
 * nowhere. The server enforces the same permissions independently on every
 * request, so hiding a link is never the actual security boundary.
 */
export function buildNavigation(permissions: Permission[], role?: Role): NavSection[] {
  // The User role gets its own fixed surface, not a filtered trader sidebar.
  if (role === 'user') return USER_NAV;

  const sections = [...TRADER_NAV, ...ADMIN_NAV, ...SUPER_ADMIN_NAV];

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || permissions.includes(item.permission),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
