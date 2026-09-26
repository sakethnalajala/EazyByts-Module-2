import type { Currency, Exchange } from '../constants/markets.js';

// ---------------------------------------------------------------- watchlists

export interface WatchlistItem {
  instrumentId: string;
  symbol: string;
  exchange: Exchange;
  name: string;
  currency: Currency;
  note: string | null;
  addedAt: string;
  /** Null when no price could be fetched; the row shows a stale badge. */
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  isStale: boolean;
}

export interface Watchlist {
  id: string;
  name: string;
  isDefault: boolean;
  items: WatchlistItem[];
  createdAt: string;
}

// -------------------------------------------------------------------- alerts

export const ALERT_CONDITIONS = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'PCT_CHANGE_UP',
  'PCT_CHANGE_DOWN',
] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

export const ALERT_STATUSES = ['ACTIVE', 'TRIGGERED', 'CANCELLED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_CONDITION_LABELS: Readonly<Record<AlertCondition, string>> = {
  PRICE_ABOVE: 'Price rises above',
  PRICE_BELOW: 'Price falls below',
  PCT_CHANGE_UP: 'Day change rises above',
  PCT_CHANGE_DOWN: 'Day change falls below',
};

export interface PriceAlert {
  id: string;
  symbol: string;
  exchange: Exchange;
  instrumentName: string;
  currency: Currency;
  condition: AlertCondition;
  /** Minor units for PRICE_*, percent (e.g. 5 for 5%) for PCT_CHANGE_*. */
  threshold: number;
  status: AlertStatus;
  repeat: boolean;
  note: string | null;
  createdAt: string;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  lastCheckedAt: string | null;
}

// ------------------------------------------------------------- notifications

export const NOTIFICATION_TYPES = [
  'ALERT_TRIGGERED',
  'ORDER_FILLED',
  'ORDER_REJECTED',
  'ORDER_CANCELLED',
  'ORDER_EXPIRED',
  'ACCOUNT',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------- education

export const EDUCATION_CATEGORIES = [
  'basics',
  'analysis',
  'strategy',
  'risk',
  'markets-india',
  'markets-us',
  'platform',
] as const;
export type EducationCategory = (typeof EDUCATION_CATEGORIES)[number];

export const EDUCATION_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_CATEGORY_LABELS: Readonly<Record<EducationCategory, string>> = {
  basics: 'Market basics',
  analysis: 'Analysis',
  strategy: 'Strategy',
  risk: 'Risk management',
  'markets-india': 'Indian markets',
  'markets-us': 'US markets',
  platform: 'Using this platform',
};

export interface EducationResource {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: EducationCategory;
  level: EducationLevel;
  /** Markdown. Present on the detail endpoint, omitted from list responses. */
  content?: string;
  readMinutes: number;
  status: 'draft' | 'published';
  tags: string[];
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}
