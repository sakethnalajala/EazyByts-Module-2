import type { DataSource, Exchange } from '@smd/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { MarketDataProvider } from './providers/types.js';
import { yahooProvider } from './providers/yahoo.js';
import { finnhubProvider } from './providers/finnhub.js';
import { mockProvider } from './providers/mock.js';

/**
 * The provider chain and its circuit breaker.
 *
 * Order: Yahoo (primary, both markets) -> Finnhub (US, official, keyed) ->
 * deterministic simulator (always answers).
 *
 * The breaker matters more than it looks. Yahoo is an unofficial endpoint: when
 * it starts failing it usually fails for everything, and retrying it on every
 * request would add its full timeout to every page load. After three
 * consecutive failures the provider is skipped for five minutes.
 */

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 5 * 60 * 1000;

interface BreakerState {
  failures: number;
  openedAt: number | null;
  lastSuccessAt: number | null;
}

const breakers = new Map<DataSource, BreakerState>();

function stateFor(name: DataSource): BreakerState {
  let state = breakers.get(name);
  if (!state) {
    state = { failures: 0, openedAt: null, lastSuccessAt: null };
    breakers.set(name, state);
  }
  return state;
}

function isOpen(name: DataSource): boolean {
  const state = stateFor(name);
  if (state.openedAt === null) return false;

  if (Date.now() - state.openedAt >= OPEN_DURATION_MS) {
    // Half-open: let one request through to see if it recovered.
    state.openedAt = null;
    state.failures = 0;
    logger.info({ provider: name }, 'Circuit breaker half-open; retrying provider');
    return false;
  }
  return true;
}

function recordSuccess(name: DataSource): void {
  const state = stateFor(name);
  state.failures = 0;
  state.openedAt = null;
  state.lastSuccessAt = Date.now();
}

function recordFailure(name: DataSource, error: unknown): void {
  const state = stateFor(name);
  state.failures += 1;

  if (state.failures >= FAILURE_THRESHOLD && state.openedAt === null) {
    state.openedAt = Date.now();
    logger.warn(
      { provider: name, failures: state.failures, err: error },
      'Circuit breaker opened; provider skipped for 5 minutes',
    );
  } else {
    logger.debug({ provider: name, err: error }, 'Provider call failed');
  }
}

/** Ordered chain. The simulator is last and always answers. */
function orderedProviders(): MarketDataProvider[] {
  if (env.MARKET_DATA_FORCE_MOCK) return [mockProvider];
  return [yahooProvider, finnhubProvider, mockProvider];
}

export function providersFor(exchange: Exchange): MarketDataProvider[] {
  return orderedProviders().filter(
    (provider) => provider.isConfigured && provider.supports(exchange) && !isOpen(provider.name),
  );
}

export interface ChainResult<T> {
  value: T;
  provider: MarketDataProvider;
}

/**
 * Runs an operation down the chain, returning the first non-null result.
 *
 * A provider that throws or returns null is recorded and skipped. Because the
 * simulator never returns null, this only returns null if the simulator itself
 * was excluded - which happens when a caller restricts to real providers.
 */
export async function runChain<T>(
  exchange: Exchange,
  operation: (provider: MarketDataProvider) => Promise<T | null>,
): Promise<ChainResult<T> | null> {
  for (const provider of providersFor(exchange)) {
    try {
      const value = await operation(provider);
      if (value !== null && value !== undefined) {
        recordSuccess(provider.name);
        return { value, provider };
      }
      // A null is "no data for this symbol", not a provider fault, so it does
      // not count against the breaker.
    } catch (error) {
      recordFailure(provider.name, error);
    }
  }
  return null;
}

/** The simulator, for callers that need a guaranteed answer. */
export function getMockProvider(): MarketDataProvider {
  return mockProvider;
}

export interface ProviderHealth {
  name: string;
  state: 'up' | 'down' | 'circuit-open';
  lastSuccessAt: string | null;
  failureCount: number;
}

/** Provider status for the Super Admin system-health panel. */
export function getProviderHealth(): ProviderHealth[] {
  return orderedProviders().map((provider) => {
    const state = stateFor(provider.name);
    return {
      name: provider.name,
      state: state.openedAt !== null ? 'circuit-open' : state.failures > 0 ? 'down' : 'up',
      lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
      failureCount: state.failures,
    };
  });
}

/** Test seam. */
export function resetBreakers(): void {
  breakers.clear();
}
