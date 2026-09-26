import { CURRENCY_SYMBOLS, type Currency } from '../constants/markets.js';

/**
 * Money handling.
 *
 * Every monetary value in this system is an INTEGER number of minor units
 * (paise or cents). Floats are never used for money: `0.1 + 0.2 !== 0.3` is an
 * amusing curiosity in a blog post and a corrupted ledger in a trading app.
 *
 * Minor units stay inside JS safe-integer range comfortably - the INR wallet
 * opens at 100,000,000 paise against a limit of 9,007,199,254,740,991.
 */

/** An integer count of minor units. Negative values represent debits. */
export type Minor = number;

export const MINOR_PER_MAJOR = 100;

export function isValidMinor(value: unknown): value is Minor {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertMinor(value: number, label = 'amount'): Minor {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer in minor units, received ${String(value)}`);
  }
  return value;
}

/** Converts a major-unit decimal (12.34) into minor units (1234). */
export function toMinor(major: number): Minor {
  if (!Number.isFinite(major)) throw new Error(`Cannot convert ${String(major)} to minor units`);
  // Round rather than truncate so 12.345 -> 1235 rather than 1234, and add a
  // tiny epsilon correction for values like 8.115 that float slightly low.
  return Math.round((major + Number.EPSILON * Math.sign(major)) * MINOR_PER_MAJOR);
}

/** Converts minor units back to a major-unit number, for display only. */
export function toMajor(minor: Minor): number {
  return minor / MINOR_PER_MAJOR;
}

/**
 * Multiplies a minor-unit price by a whole quantity.
 * Exact, because both operands are integers.
 */
export function multiplyMinor(priceMinor: Minor, quantity: number): Minor {
  if (!Number.isInteger(quantity)) {
    throw new Error(`Quantity must be a whole number of shares, received ${String(quantity)}`);
  }
  return assertMinor(priceMinor * quantity, 'product');
}

/**
 * Applies a rate (e.g. 0.001 for 0.1%) to a minor amount.
 *
 * Rounds UP by default. Fees always round in the platform's favour, which is
 * how real brokers work, and rounding down would let a user shave fractions off
 * every trade.
 */
export function applyRate(
  amountMinor: Minor,
  rate: number,
  mode: 'ceil' | 'round' = 'ceil',
): Minor {
  const raw = amountMinor * rate;
  return mode === 'ceil' ? Math.ceil(raw) : Math.round(raw);
}

/**
 * Weighted average cost per share, in minor units, rounded to the nearest
 * minor unit. Used for the holdings cost basis.
 */
export function weightedAverage(totalCostMinor: Minor, totalQuantity: number): Minor {
  if (totalQuantity <= 0) return 0;
  return Math.round(totalCostMinor / totalQuantity);
}

/** Percentage change, returned as a number like 2.35 meaning +2.35%. */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface FormatMoneyOptions {
  /** Include the currency symbol. Default true. */
  symbol?: boolean;
  /** Force a leading + for positive values, for P&L display. */
  signed?: boolean;
  /** Abbreviate large values (1.2L, 3.4Cr for INR; 1.2K, 3.4M for USD). */
  compact?: boolean;
  decimals?: number;
}

/**
 * Formats minor units for display.
 *
 * INR uses the Indian digit grouping (1,23,456.78) via en-IN, USD uses en-US.
 * Getting this wrong is immediately obvious to an Indian user.
 */
export function formatMoney(
  minor: Minor,
  currency: Currency,
  options: FormatMoneyOptions = {},
): string {
  const { symbol = true, signed = false, compact = false, decimals = 2 } = options;
  const major = toMajor(minor);
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';

  let body: string;
  if (compact) {
    body = formatCompact(major, currency);
  } else {
    body = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.abs(major));
  }

  const sign = major < 0 ? '-' : signed && major > 0 ? '+' : '';
  return `${sign}${symbol ? CURRENCY_SYMBOLS[currency] : ''}${body}`;
}

function formatCompact(major: number, currency: Currency): string {
  const abs = Math.abs(major);
  if (currency === 'INR') {
    // Indian numbering: lakh (1e5) and crore (1e7).
    if (abs >= 1e7) return `${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `${(abs / 1e5).toFixed(2)}L`;
    if (abs >= 1e3) return `${(abs / 1e3).toFixed(2)}K`;
  } else {
    if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(abs / 1e3).toFixed(2)}K`;
  }
  return abs.toFixed(2);
}

/** Formats a percentage, always signed, for P&L and day-change display. */
export function formatPercent(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Formats a share count with locale grouping. */
export function formatQuantity(quantity: number, currency: Currency = 'INR'): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US').format(quantity);
}
