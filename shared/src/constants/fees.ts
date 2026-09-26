import type { Market } from './markets.js';

/**
 * Simulated brokerage, exchange and statutory charges.
 *
 * These approximate an Indian discount broker's equity-delivery slab and a US
 * zero-commission broker, as of the 2026 rates used for this simulation. They
 * exist so that P&L reflects that trading is not free - they are NOT tax advice
 * and the app says so wherever they appear.
 */

export interface FeeBreakdown {
  /** Broker's own charge. */
  brokerage: number;
  /** Securities Transaction Tax (India). */
  stt: number;
  /** Exchange transaction charge. */
  exchange: number;
  /** SEBI turnover fee (India). */
  sebi: number;
  /** Stamp duty (India, buy side only). */
  stamp: number;
  /** GST on brokerage + exchange + SEBI (India). */
  gst: number;
  /** SEC Section 31 fee (US, sell side only). */
  secFee: number;
  /** FINRA Trading Activity Fee (US, sell side only). */
  taf: number;
  /** Sum of every line above, in minor units. */
  total: number;
}

export const EMPTY_FEE_BREAKDOWN: FeeBreakdown = {
  brokerage: 0,
  stt: 0,
  exchange: 0,
  sebi: 0,
  stamp: 0,
  gst: 0,
  secFee: 0,
  taf: 0,
  total: 0,
};

export interface IndiaFeeConfig {
  /** Equity delivery is brokerage-free at most Indian discount brokers. */
  brokerageRate: number;
  brokerageCapMinor: number;
  sttRate: number;
  exchangeRate: number;
  sebiRate: number;
  stampRate: number;
  gstRate: number;
}

export interface UsFeeConfig {
  brokerageRate: number;
  /** SEC fee, applied to sell proceeds. */
  secFeeRate: number;
  /** FINRA TAF per share, in minor units (cents). */
  tafPerShareMinor: number;
  tafCapMinor: number;
}

export const DEFAULT_INDIA_FEES: IndiaFeeConfig = {
  brokerageRate: 0, // delivery
  brokerageCapMinor: 2_000, // Rs 20 cap, applies if a rate is ever configured
  sttRate: 0.001, // 0.1% both sides
  exchangeRate: 0.0000297, // 0.00297%
  sebiRate: 0.000001, // Rs 10 per crore
  stampRate: 0.00015, // 0.015%, buy side only
  gstRate: 0.18, // on brokerage + exchange + SEBI
};

export const DEFAULT_US_FEES: UsFeeConfig = {
  brokerageRate: 0,
  secFeeRate: 0.0000278,
  tafPerShareMinor: 0.0166, // $0.000166 per share, in cents
  tafCapMinor: 830, // $8.30
};

export const DEFAULT_FEE_CONFIG: Readonly<Record<Market, IndiaFeeConfig | UsFeeConfig>> = {
  IN: DEFAULT_INDIA_FEES,
  US: DEFAULT_US_FEES,
};

/** Human-readable explanation, rendered on the fee-breakdown panel. */
export const FEE_LABELS: Readonly<Record<keyof Omit<FeeBreakdown, 'total'>, string>> = {
  brokerage: 'Brokerage',
  stt: 'Securities Transaction Tax',
  exchange: 'Exchange transaction charge',
  sebi: 'SEBI turnover fee',
  stamp: 'Stamp duty',
  gst: 'GST (18%)',
  secFee: 'SEC fee',
  taf: 'FINRA trading activity fee',
};
