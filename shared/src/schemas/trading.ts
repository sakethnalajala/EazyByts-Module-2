import { z } from 'zod';
import { ORDER_SIDES, ORDER_TYPES, ORDER_VALIDITIES, ORDER_STATUSES } from '../types/trading.js';
import { EXCHANGES, MARKETS } from '../constants/markets.js';

/** Hard ceiling per order, so a typo cannot create a nonsense position. */
export const MAX_ORDER_QUANTITY = 100_000;

export const placeOrderSchema = z
  .object({
    symbol: z.string().trim().toUpperCase().min(1).max(20),
    exchange: z.enum(EXCHANGES),
    side: z.enum(ORDER_SIDES),
    type: z.enum(ORDER_TYPES),
    /** Whole shares only. No fractional trading in this simulation. */
    quantity: z.coerce
      .number()
      .int('Quantity must be a whole number of shares.')
      .min(1, 'Quantity must be at least 1.')
      .max(MAX_ORDER_QUANTITY, `Quantity cannot exceed ${MAX_ORDER_QUANTITY}.`),
    /** Major units from the client (e.g. 2543.50); converted server-side. */
    limitPrice: z.coerce.number().positive('Limit price must be greater than zero.').optional(),
    validity: z.enum(ORDER_VALIDITIES).default('DAY'),
    /** Queue the order for the next session instead of rejecting it. */
    queueIfClosed: z.boolean().default(false),
  })
  .refine((data) => data.type !== 'LIMIT' || data.limitPrice !== undefined, {
    message: 'A limit price is required for limit orders.',
    path: ['limitPrice'],
  })
  .refine((data) => data.type !== 'MARKET' || data.limitPrice === undefined, {
    message: 'Market orders cannot carry a limit price.',
    path: ['limitPrice'],
  });

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const orderPreviewSchema = placeOrderSchema;

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  side: z.enum(ORDER_SIDES).optional(),
  market: z.enum(MARKETS).optional(),
  symbol: z.string().trim().toUpperCase().max(20).optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  market: z.enum(MARKETS).optional(),
  type: z.enum(['BUY', 'SELL', 'DEPOSIT']).optional(),
  symbol: z.string().trim().toUpperCase().max(20).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const portfolioQuerySchema = z.object({
  market: z.enum(MARKETS).optional(),
});

export const performanceQuerySchema = z.object({
  market: z.enum(MARKETS).optional(),
  range: z.enum(['1W', '1M', '3M', '6M', '1Y', 'ALL']).default('1M'),
});
export type PerformanceQuery = z.infer<typeof performanceQuerySchema>;

export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
  market: z.enum(MARKETS).optional(),
  report: z.enum(['holdings', 'transactions', 'orders', 'summary']).default('summary'),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
