import { DEFAULT_INITIAL_CAPITAL_MINOR, type SystemConfigView } from '@smd/shared';
import { SystemConfig, type SystemConfigDocument } from './audit.model.js';

/**
 * Runtime platform configuration.
 *
 * Cached briefly because the trading path reads it on every order. Writes
 * invalidate immediately, so the TTL only matters across instances.
 */

const CACHE_TTL_MS = 30_000;

let cached: { doc: SystemConfigDocument; loadedAt: number } | null = null;

export function invalidateConfigCache(): void {
  cached = null;
}

export async function getSystemConfig(): Promise<SystemConfigDocument> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.doc;

  // Upsert so the singleton always exists, even before the seed has run.
  const doc = await SystemConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $setOnInsert: {
        key: 'global',
        tradingEnabled: true,
        registrationEnabled: true,
        maintenanceMode: false,
        maintenanceMessage: '',
        initialCapitalInr: DEFAULT_INITIAL_CAPITAL_MINOR.IN,
        initialCapitalUsd: DEFAULT_INITIAL_CAPITAL_MINOR.US,
        featureFlags: {
          marketNews: true,
          education: true,
          stockComparison: true,
          priceAlerts: true,
          realtimeNotifications: true,
        },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  cached = { doc, loadedAt: Date.now() };
  return doc;
}

export function toSystemConfigView(doc: SystemConfigDocument): SystemConfigView {
  return {
    tradingEnabled: doc.tradingEnabled,
    registrationEnabled: doc.registrationEnabled,
    maintenanceMode: doc.maintenanceMode,
    maintenanceMessage: doc.maintenanceMessage,
    initialCapitalInr: doc.initialCapitalInr,
    initialCapitalUsd: doc.initialCapitalUsd,
    featureFlags: doc.featureFlags ?? {},
    updatedAt: doc.updatedAt.toISOString(),
    updatedByEmail: doc.updatedByEmail,
  };
}
