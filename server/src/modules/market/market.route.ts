import { Router } from 'express';
import { z } from 'zod';
import {
  batchQuotesSchema,
  compareQuerySchema,
  historyQuerySchema,
  listInstrumentsQuerySchema,
  listNewsQuerySchema,
  moversQuerySchema,
  quoteQuerySchema,
  searchQuerySchema,
  symbolParamSchema,
  MARKETS,
} from '@smd/shared';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { marketDataLimiter } from '../../middleware/rateLimit.js';
import * as controller from './market.controller.js';

/**
 * Market data routes.
 *
 * Deliberately PUBLIC. Quotes and news are not user data, and leaving them open
 * lets the landing page show a live market snapshot before anyone signs in.
 * Provider keys stay on the server, and the rate limiter protects the upstream
 * quota that these endpoints consume.
 */
export const marketRouter: Router = Router();

marketRouter.use(marketDataLimiter);

marketRouter.get('/search', validateQuery(searchQuerySchema), controller.searchHandler);

// Browse listing: optional query term, quotes attached. Public like the rest
// of this router, so the landing page and the view-only User share it.
marketRouter.get(
  '/instruments',
  validateQuery(listInstrumentsQuerySchema),
  controller.listInstrumentsHandler,
);

marketRouter.get('/status', controller.marketStatusHandler);

marketRouter.get(
  '/status/:market',
  validateParams(z.object({ market: z.enum(MARKETS) })),
  controller.singleMarketStatusHandler,
);

marketRouter.get(
  '/indices',
  validateQuery(z.object({ market: z.enum(MARKETS).optional() })),
  controller.indicesHandler,
);

marketRouter.get('/movers', validateQuery(moversQuerySchema), controller.moversHandler);

marketRouter.get('/compare', validateQuery(compareQuerySchema), controller.compareHandler);

marketRouter.get('/news', validateQuery(listNewsQuerySchema), controller.newsHandler);

/** Batch endpoint: collapses N watchlist rows into one upstream call. */
marketRouter.post('/quotes', validateBody(batchQuotesSchema), controller.batchQuotesHandler);

marketRouter.get(
  '/quote/:symbol',
  validateParams(symbolParamSchema),
  validateQuery(quoteQuerySchema),
  controller.quoteHandler,
);

marketRouter.get(
  '/history/:symbol',
  validateParams(symbolParamSchema),
  validateQuery(historyQuerySchema),
  controller.historyHandler,
);

// Declared last: a bare /:symbol would otherwise shadow /search and /status.
marketRouter.get(
  '/:symbol',
  validateParams(symbolParamSchema),
  validateQuery(quoteQuerySchema),
  controller.stockDetailHandler,
);
