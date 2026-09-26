/**
 * Market, exchange and currency constants.
 *
 * These encode the confirmed segregated-wallet decision: a user holds one INR
 * wallet that may only trade NSE/BSE and one USD wallet that may only trade
 * NASDAQ/NYSE. There is deliberately no FX conversion anywhere in the ledger,
 * so every exchange maps to exactly one market and one currency.
 */

export const EXCHANGES = ['NSE', 'BSE', 'NASDAQ', 'NYSE'] as const;
export type Exchange = (typeof EXCHANGES)[number];

export const MARKETS = ['IN', 'US'] as const;
export type Market = (typeof MARKETS)[number];

export const CURRENCIES = ['INR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const EXCHANGE_TO_MARKET: Readonly<Record<Exchange, Market>> = {
  NSE: 'IN',
  BSE: 'IN',
  NASDAQ: 'US',
  NYSE: 'US',
};

export const MARKET_TO_CURRENCY: Readonly<Record<Market, Currency>> = {
  IN: 'INR',
  US: 'USD',
};

export const CURRENCY_MINOR_UNITS: Readonly<Record<Currency, number>> = {
  INR: 100, // paise
  USD: 100, // cents
};

export const CURRENCY_SYMBOLS: Readonly<Record<Currency, string>> = {
  INR: '\u20B9',
  USD: '$',
};

/**
 * Opening virtual capital per wallet, in MINOR units.
 * INR: 10,00,000.00 -> 100_000_000 paise. USD: 10,000.00 -> 1_000_000 cents.
 * Super Admin can override these at runtime via system config.
 */
export const DEFAULT_INITIAL_CAPITAL_MINOR: Readonly<Record<Market, number>> = {
  IN: 100_000_000,
  US: 1_000_000,
};

export function marketForExchange(exchange: Exchange): Market {
  return EXCHANGE_TO_MARKET[exchange];
}

export function currencyForExchange(exchange: Exchange): Currency {
  return MARKET_TO_CURRENCY[EXCHANGE_TO_MARKET[exchange]];
}
