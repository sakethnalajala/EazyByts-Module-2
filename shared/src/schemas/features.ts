import { z } from 'zod';
import { EXCHANGES, MARKETS } from '../constants/markets.js';
import {
  ALERT_CONDITIONS,
  EDUCATION_CATEGORIES,
  EDUCATION_LEVELS,
  NOTIFICATION_TYPES,
} from '../types/features.js';
import { CANDLE_INTERVALS, HISTORY_RANGES } from '../types/market.js';
import { ROLES, USER_STATUSES } from '../types/roles.js';

// ---------------------------------------------------------------- market data

export const symbolParamSchema = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(20),
});

export const quoteQuerySchema = z.object({
  exchange: z.enum(EXCHANGES).optional(),
});

export const batchQuotesSchema = z.object({
  symbols: z
    .array(z.string().trim().toUpperCase().min(1).max(20))
    .min(1, 'Provide at least one symbol.')
    // Bounded so one request cannot fan out into an unlimited provider burst.
    .max(50, 'A maximum of 50 symbols can be requested at once.'),
});

/**
 * Instrument listing for the browse experience.
 *
 * Distinct from `searchQuerySchema`, whose `q` is required: this powers the
 * default, unfiltered view a visitor sees before typing anything.
 */
export const listInstrumentsQuerySchema = z.object({
  q: z.string().trim().max(50).optional(),
  exchange: z.enum(EXCHANGES).optional(),
  market: z.enum(MARKETS).optional(),
  sector: z.string().trim().max(60).optional(),
  // Covers the whole seeded universe in one page: truncating alphabetically
  // would silently hide every symbol after the cut (RELIANCE, TCS, ...).
  limit: z.coerce.number().int().min(1).max(300).default(100),
});
export type ListInstrumentsQuery = z.infer<typeof listInstrumentsQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter a search term.').max(50),
  exchange: z.enum(EXCHANGES).optional(),
  market: z.enum(MARKETS).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const historyQuerySchema = z.object({
  exchange: z.enum(EXCHANGES).optional(),
  range: z.enum(HISTORY_RANGES).default('1M'),
  interval: z.enum(CANDLE_INTERVALS).default('1d'),
});

export const moversQuerySchema = z.object({
  market: z.enum(MARKETS).default('IN'),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const compareQuerySchema = z.object({
  symbols: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().min(1).max(20))
        .min(2, 'Compare at least two symbols.')
        .max(4, 'Compare at most four symbols.'),
    ),
  range: z.enum(HISTORY_RANGES).default('3M'),
});

// ----------------------------------------------------------------- watchlists

export const createWatchlistSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(40),
});

export const renameWatchlistSchema = createWatchlistSchema;

export const watchlistItemSchema = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(20),
  exchange: z.enum(EXCHANGES),
  note: z.string().trim().max(200).optional(),
});
export type WatchlistItemInput = z.infer<typeof watchlistItemSchema>;

// --------------------------------------------------------------------- alerts

export const createAlertSchema = z
  .object({
    symbol: z.string().trim().toUpperCase().min(1).max(20),
    exchange: z.enum(EXCHANGES),
    condition: z.enum(ALERT_CONDITIONS),
    /** Major units for PRICE_*, plain percent for PCT_CHANGE_*. */
    threshold: z.coerce.number().refine((v) => v !== 0, 'Threshold cannot be zero.'),
    repeat: z.boolean().default(false),
    note: z.string().trim().max(200).optional(),
  })
  .refine((data) => !data.condition.startsWith('PRICE_') || data.threshold > 0, {
    message: 'A price threshold must be greater than zero.',
    path: ['threshold'],
  })
  .refine((data) => !data.condition.startsWith('PCT_') || Math.abs(data.threshold) <= 100, {
    message: 'A percentage threshold must be between -100 and 100.',
    path: ['threshold'],
  });
export type CreateAlertInput = z.infer<typeof createAlertSchema>;

export const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'TRIGGERED', 'CANCELLED']).optional(),
});

// -------------------------------------------------------------- notifications

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

// ----------------------------------------------------------------------- news

export const listNewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  symbol: z.string().trim().toUpperCase().max(20).optional(),
  market: z.enum(MARKETS).optional(),
});

// ------------------------------------------------------------------ education

export const listEducationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  category: z.enum(EDUCATION_CATEGORIES).optional(),
  level: z.enum(EDUCATION_LEVELS).optional(),
  q: z.string().trim().max(60).optional(),
});

export const upsertEducationSchema = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().min(10).max(400),
  category: z.enum(EDUCATION_CATEGORIES),
  level: z.enum(EDUCATION_LEVELS),
  content: z.string().trim().min(20, 'Article content is required.'),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  status: z.enum(['draft', 'published']).default('draft'),
});
export type UpsertEducationInput = z.infer<typeof upsertEducationSchema>;

// ---------------------------------------------------------------------- admin

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
  reason: z.string().trim().max(200).optional(),
});

export const listAdminTradesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().max(20).optional(),
  market: z.enum(MARKETS).optional(),
  userId: z.string().trim().max(40).optional(),
});

export const upsertInstrumentSchema = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(20),
  exchange: z.enum(EXCHANGES),
  name: z.string().trim().min(1).max(120),
  sector: z.string().trim().max(60).optional(),
  industry: z.string().trim().max(80).optional(),
  providerSymbol: z.string().trim().max(30).optional(),
  isActive: z.boolean().default(true),
});
export type UpsertInstrumentInput = z.infer<typeof upsertInstrumentSchema>;

export const createAdminSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'super_admin']),
});

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).max(100),
});

export const updateSystemConfigSchema = z.object({
  tradingEnabled: z.boolean().optional(),
  registrationEnabled: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().trim().max(300).optional(),
  initialCapitalInr: z.coerce.number().min(0).max(1_000_000_000).optional(),
  initialCapitalUsd: z.coerce.number().min(0).max(10_000_000).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
});

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().trim().max(60).optional(),
});

// ------------------------------------------------------------- preferences

export const updatePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  defaultMarket: z.enum(MARKETS).optional(),
  emailNotifications: z.boolean().optional(),
  widgets: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        visible: z.boolean(),
        order: z.number().int().min(0).max(50),
      }),
    )
    .max(30)
    .optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
