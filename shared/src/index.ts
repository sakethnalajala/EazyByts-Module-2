/**
 * @smd/shared - the single source of truth for contracts crossing the wire.
 *
 * Both the Express server and the React client import from here, so a change to
 * a validation rule or a response shape cannot drift between the two.
 */

// constants
export * from './constants/errorCodes.js';
export * from './constants/markets.js';
export * from './constants/permissions.js';
export * from './constants/fees.js';
export * from './constants/marketHours.js';

// types
export * from './types/api.js';
export * from './types/roles.js';
export * from './types/dataSource.js';
export * from './types/health.js';
export * from './types/auth.js';
export * from './types/market.js';
export * from './types/trading.js';
export * from './types/features.js';
export * from './types/admin.js';

// schemas
export * from './schemas/pagination.js';
export * from './schemas/auth.js';
export * from './schemas/trading.js';
export * from './schemas/features.js';

// utils
export * from './utils/money.js';

/** Bumped when a breaking change lands in the API contract. */
export const API_VERSION = 'v1';
