/**
 * Canonical machine-readable error codes.
 *
 * The server puts one of these in `error.code` on every failed response and the
 * client switches on them. Adding a code here is the only way to add one to the
 * API, which keeps the two sides from inventing divergent strings.
 */
export const ERROR_CODES = {
  // --- auth / access -------------------------------------------------------
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSED: 'TOKEN_REUSED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  DEMO_ACCOUNT_RESTRICTED: 'DEMO_ACCOUNT_RESTRICTED',

  // --- request shape -------------------------------------------------------
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',

  // --- trading -------------------------------------------------------------
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_HOLDINGS: 'INSUFFICIENT_HOLDINGS',
  MARKET_CLOSED: 'MARKET_CLOSED',
  DUPLICATE_ORDER: 'DUPLICATE_ORDER',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INSTRUMENT_INACTIVE: 'INSTRUMENT_INACTIVE',
  STALE_QUOTE: 'STALE_QUOTE',
  TRADING_DISABLED: 'TRADING_DISABLED',
  /** Attempted to trade a USD instrument from the INR wallet, or vice versa. */
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  ORDER_NOT_CANCELLABLE: 'ORDER_NOT_CANCELLABLE',

  // --- infrastructure ------------------------------------------------------
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
