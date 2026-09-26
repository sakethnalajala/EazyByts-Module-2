import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  createWatchlistSchema,
  watchlistItemSchema,
  type Exchange,
  type Watchlist as WatchlistDto,
  type WatchlistItem,
  type WatchlistItemInput,
} from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { body, params, validateBody, validateParams } from '../../middleware/validate.js';
import { Watchlist, type WatchlistDocument } from './watchlist.model.js';
import { Instrument } from '../instruments/instrument.model.js';
import { getQuotes } from '../../services/market/marketData.service.js';

export const watchlistRouter: Router = Router();

/*
 * Reading a watchlist and changing one are separate permissions, so the
 * view-only User role can open the Watchlist portal while remaining unable to
 * add, rename or delete anything. Every mutating route below re-checks
 * WATCHLIST_MANAGE individually.
 */
watchlistRouter.use(authenticate, requirePermission(PERMISSIONS.WATCHLIST_READ));

const requireWatchlistWrite = requirePermission(PERMISSIONS.WATCHLIST_MANAGE);

const idParam = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid watchlist id.'),
});

const itemParam = idParam.extend({
  symbol: z.string().trim().toUpperCase().min(1).max(20),
  exchange: z.enum(['NSE', 'BSE', 'NASDAQ', 'NYSE']),
});

const MAX_LISTS = 10;
const MAX_ITEMS_PER_LIST = 50;

/**
 * Hydrates a watchlist with live prices.
 *
 * All symbols across the list go through ONE batched quote call. Fetching per
 * row would turn a 30-stock watchlist into 30 upstream requests on every page
 * load, which no free provider tier tolerates.
 */
async function hydrate(doc: WatchlistDocument): Promise<WatchlistDto> {
  const instruments = await Instrument.find({
    _id: { $in: doc.items.map((item) => item.instrumentId) },
  });
  const byId = new Map(instruments.map((i) => [i._id.toString(), i]));

  const quotes = await getQuotes(instruments);

  const items: WatchlistItem[] = doc.items.map((item) => {
    const instrument = byId.get(item.instrumentId.toString());
    const quote = instrument
      ? quotes.get(`${instrument.exchange}:${instrument.symbol}`)
      : undefined;

    return {
      instrumentId: item.instrumentId.toString(),
      symbol: item.symbol,
      exchange: item.exchange,
      name: instrument?.name ?? item.symbol,
      currency: instrument?.currency ?? 'INR',
      note: item.note,
      addedAt: item.addedAt.toISOString(),
      ltp: quote?.ltp ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
      isStale: quote === undefined,
    };
  });

  return {
    id: doc._id.toString(),
    name: doc.name,
    isDefault: doc.isDefault,
    items,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Every list is created on demand, so a new user is never shown an error. */
async function ensureDefaultList(userId: WatchlistDocument['userId']): Promise<WatchlistDocument> {
  const existing = await Watchlist.findOne({ userId }).sort({ isDefault: -1, createdAt: 1 });
  if (existing) return existing;

  return Watchlist.create({ userId, name: 'My Watchlist', isDefault: true, items: [] });
}

watchlistRouter.get('/', async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  await ensureDefaultList(auth.user._id);

  const docs = await Watchlist.find({ userId: auth.user._id }).sort({
    isDefault: -1,
    createdAt: 1,
  });
  const lists = await Promise.all(docs.map(hydrate));

  sendSuccess(res, { watchlists: lists });
});

watchlistRouter.post(
  '/',
  requireWatchlistWrite,
  validateBody(createWatchlistSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { name } = body<{ name: string }>(req);

    if ((await Watchlist.countDocuments({ userId: auth.user._id })) >= MAX_LISTS) {
      throw ApiError.badRequest(`You can have at most ${MAX_LISTS} watchlists.`);
    }

    if (await Watchlist.findOne({ userId: auth.user._id, name })) {
      throw ApiError.conflict('CONFLICT', 'You already have a watchlist with that name.');
    }

    const doc = await Watchlist.create({ userId: auth.user._id, name, items: [] });
    sendSuccess(res, await hydrate(doc), 201);
  },
);

watchlistRouter.patch(
  '/:id',
  requireWatchlistWrite,
  validateParams(idParam),
  validateBody(createWatchlistSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = params<{ id: string }>(req);
    const { name } = body<{ name: string }>(req);

    const doc = await Watchlist.findOne({ _id: id, userId: auth.user._id });
    if (!doc) throw ApiError.notFound('Watchlist not found.');

    doc.name = name;
    await doc.save();
    sendSuccess(res, await hydrate(doc));
  },
);

watchlistRouter.delete('/:id', requireWatchlistWrite, validateParams(idParam), async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const { id } = params<{ id: string }>(req);

  const doc = await Watchlist.findOne({ _id: id, userId: auth.user._id });
  if (!doc) throw ApiError.notFound('Watchlist not found.');

  // Deleting the last list would leave the page with nothing to render.
  if ((await Watchlist.countDocuments({ userId: auth.user._id })) <= 1) {
    throw ApiError.badRequest('You must keep at least one watchlist.');
  }

  await doc.deleteOne();
  sendSuccess(res, { deleted: true });
});

watchlistRouter.post(
  '/:id/items',
  requireWatchlistWrite,
  validateParams(idParam),
  validateBody(watchlistItemSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = params<{ id: string }>(req);
    const input = body<WatchlistItemInput>(req);

    const doc = await Watchlist.findOne({ _id: id, userId: auth.user._id });
    if (!doc) throw ApiError.notFound('Watchlist not found.');

    const instrument = await Instrument.findOne({
      symbol: input.symbol,
      exchange: input.exchange,
      isActive: true,
    });
    if (!instrument) {
      throw ApiError.notFound(`${input.symbol} is not available on ${input.exchange}.`);
    }

    if (
      doc.items.some((item) => item.symbol === input.symbol && item.exchange === input.exchange)
    ) {
      throw ApiError.conflict('CONFLICT', `${input.symbol} is already on this watchlist.`);
    }

    if (doc.items.length >= MAX_ITEMS_PER_LIST) {
      throw ApiError.badRequest(`A watchlist can hold at most ${MAX_ITEMS_PER_LIST} symbols.`);
    }

    doc.items.push({
      instrumentId: instrument._id,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      note: input.note ?? null,
      addedAt: new Date(),
    });
    await doc.save();

    sendSuccess(res, await hydrate(doc), 201);
  },
);

watchlistRouter.delete(
  '/:id/items/:exchange/:symbol',
  requireWatchlistWrite,
  validateParams(itemParam),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id, symbol, exchange } = params<{ id: string; symbol: string; exchange: Exchange }>(
      req,
    );

    const doc = await Watchlist.findOne({ _id: id, userId: auth.user._id });
    if (!doc) throw ApiError.notFound('Watchlist not found.');

    const before = doc.items.length;
    doc.items = doc.items.filter((item) => !(item.symbol === symbol && item.exchange === exchange));

    if (doc.items.length === before) {
      throw ApiError.notFound(`${symbol} is not on this watchlist.`);
    }

    await doc.save();
    sendSuccess(res, await hydrate(doc));
  },
);
