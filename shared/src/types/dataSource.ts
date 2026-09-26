/**
 * Provenance metadata that MUST ride along with every market-data payload.
 *
 * The confirmed data strategy is a provider chain (Yahoo -> Finnhub ->
 * Alpha Vantage -> deterministic mock). Because any given quote may come from a
 * delayed feed or from the simulator, the UI is required to render a badge
 * built from these fields. Nothing in this app may present a price as real-time.
 */
export const DATA_SOURCES = ['yahoo', 'finnhub', 'alphavantage', 'mock', 'cache'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export interface SourceMeta {
  source: DataSource;
  /** ISO-8601 timestamp of the underlying observation, not of the response. */
  asOf: string;
  /** True for any feed that is not live, which on free tiers is all of them. */
  isDelayed: boolean;
  /** True when the value came from the simulator rather than a real provider. */
  isSimulated: boolean;
}

export type WithSource<T> = T & { sourceMeta: SourceMeta };
