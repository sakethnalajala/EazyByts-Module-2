import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INITIAL_CAPITAL_MINOR,
  EXCHANGES,
  currencyForExchange,
  marketForExchange,
  paginationQuerySchema,
  PAGINATION_MAX_LIMIT,
} from '@smd/shared';
import { buildPaginationMeta } from '../utils/response.js';

describe('market/currency mapping', () => {
  // Guards the confirmed segregated-wallet decision: every exchange resolves to
  // exactly one market and one currency, and no FX path exists.
  it('maps Indian exchanges to the INR wallet', () => {
    expect(marketForExchange('NSE')).toBe('IN');
    expect(marketForExchange('BSE')).toBe('IN');
    expect(currencyForExchange('NSE')).toBe('INR');
    expect(currencyForExchange('BSE')).toBe('INR');
  });

  it('maps US exchanges to the USD wallet', () => {
    expect(marketForExchange('NASDAQ')).toBe('US');
    expect(marketForExchange('NYSE')).toBe('US');
    expect(currencyForExchange('NASDAQ')).toBe('USD');
    expect(currencyForExchange('NYSE')).toBe('USD');
  });

  it('resolves a currency for every known exchange', () => {
    for (const exchange of EXCHANGES) {
      expect(['INR', 'USD']).toContain(currencyForExchange(exchange));
    }
  });

  it('opens wallets at the agreed capital, expressed in minor units', () => {
    expect(DEFAULT_INITIAL_CAPITAL_MINOR.IN).toBe(100_000_000); // Rs 10,00,000
    expect(DEFAULT_INITIAL_CAPITAL_MINOR.US).toBe(1_000_000); // $10,000
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults when the query string is empty', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces numeric strings from the query string', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({
      page: 3,
      limit: 50,
    });
  });

  it('caps limit so a client cannot request an unbounded page', () => {
    const result = paginationQuerySchema.safeParse({ limit: String(PAGINATION_MAX_LIMIT + 1) });
    expect(result.success).toBe(false);
  });

  it('rejects a page below 1', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('buildPaginationMeta', () => {
  it('computes page boundaries for a middle page', () => {
    expect(buildPaginationMeta(2, 20, 57)).toEqual({
      page: 2,
      limit: 20,
      total: 57,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('reports no next page on the final page', () => {
    expect(buildPaginationMeta(3, 20, 57)).toMatchObject({ hasNext: false, hasPrev: true });
  });

  it('handles an empty result set without claiming a previous page', () => {
    expect(buildPaginationMeta(1, 20, 0)).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });
});
