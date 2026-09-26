import type { Request, Response } from 'express';
import {
  type Exchange,
  type Instrument as InstrumentDto,
  type Market,
  type InstrumentWithQuote,
  type ListInstrumentsQuery,
  type SearchQuery,
  type StockDetail,
} from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { body, params, query } from '../../middleware/validate.js';
import { Instrument, type InstrumentDocument } from '../instruments/instrument.model.js';
import {
  findInstrument,
  getFundamentals,
  getHistory,
  getQuote,
  getQuotes,
} from '../../services/market/marketData.service.js';
import {
  compareInstruments,
  getIndices,
  getMovers,
} from '../../services/market/indices.service.js';
import { listNews } from '../../services/market/news.service.js';
import { getAllMarketStatuses, getMarketStatus } from '../../services/market/marketHours.js';

export function toInstrumentDto(instrument: InstrumentDocument): InstrumentDto {
  return {
    id: instrument._id.toString(),
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    market: instrument.market,
    currency: instrument.currency,
    name: instrument.name,
    sector: instrument.sector,
    industry: instrument.industry,
    isActive: instrument.isActive,
    providerSymbol: instrument.providerSymbol,
  };
}

/**
 * Instrument search.
 *
 * Queries this platform's curated universe rather than the provider's global
 * catalogue: every result must be something the user can actually trade here.
 * Returning a symbol we cannot price or trade would be a broken promise.
 */
export async function searchHandler(req: Request, res: Response): Promise<void> {
  const { q, exchange, market, limit } = query<SearchQuery>(req);

  const filter: Record<string, unknown> = { isActive: true };
  if (exchange) filter.exchange = exchange;
  if (market) filter.market = market;

  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  filter.$or = [{ symbol: pattern }, { name: pattern }];

  const matches = await Instrument.find(filter).limit(limit);

  // Exact symbol matches first, then prefix matches, then the rest.
  const upper = q.toUpperCase();
  const ranked = [...matches].sort((a, b) => {
    const score = (instrument: InstrumentDocument): number => {
      if (instrument.symbol === upper) return 0;
      if (instrument.symbol.startsWith(upper)) return 1;
      if (instrument.name.toUpperCase().startsWith(upper)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });

  sendSuccess(res, { results: ranked.map(toInstrumentDto), query: q });
}

/**
 * Instrument listing for the browse/explore experience.
 *
 * Differs from `searchHandler` in two ways that matter: the query term is
 * OPTIONAL, so the first page load shows the universe rather than an empty
 * state, and each row carries its latest quote. Quotes come from the same
 * batched service the watchlist uses, so listing 50 instruments is one
 * upstream fan-out, not 50.
 */
export async function listInstrumentsHandler(req: Request, res: Response): Promise<void> {
  const { q, exchange, market, sector, limit } = query<ListInstrumentsQuery>(req);

  const filter: Record<string, unknown> = { isActive: true };
  if (exchange) filter.exchange = exchange;
  if (market) filter.market = market;
  if (sector) filter.sector = sector;

  if (q) {
    // Escape regex metacharacters so a search for "S&P (500)" is a literal.
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ symbol: pattern }, { name: pattern }];
  }

  const instruments = await Instrument.find(filter).sort({ symbol: 1 }).limit(limit);
  const quotes = await getQuotes(instruments);

  const results: InstrumentWithQuote[] = instruments.map((instrument) => {
    const quote = quotes.get(`${instrument.exchange}:${instrument.symbol}`);
    return {
      ...toInstrumentDto(instrument),
      ltp: quote?.ltp ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
      isStale: quote === undefined,
    };
  });

  const sectors = await Instrument.distinct('sector', { isActive: true });

  sendSuccess(res, {
    results,
    total: await Instrument.countDocuments(filter),
    sectors: (sectors as (string | null)[]).filter((v): v is string => Boolean(v)).sort(),
  });
}

export async function quoteHandler(req: Request, res: Response): Promise<void> {
  const { symbol } = params<{ symbol: string }>(req);
  const { exchange } = query<{ exchange?: Exchange }>(req);

  const instrument = await findInstrument(symbol, exchange);
  if (!instrument) throw ApiError.notFound(`No instrument found for symbol '${symbol}'.`);

  sendSuccess(res, await getQuote(instrument));
}

/** Batch quotes: one request for a whole watchlist or portfolio. */
export async function batchQuotesHandler(req: Request, res: Response): Promise<void> {
  const { symbols } = body<{ symbols: string[] }>(req);

  const instruments = await Instrument.find({ symbol: { $in: symbols }, isActive: true });
  const quotes = await getQuotes(instruments);

  sendSuccess(res, {
    quotes: Object.fromEntries(quotes),
    requested: symbols.length,
    resolved: quotes.size,
  });
}

export async function stockDetailHandler(req: Request, res: Response): Promise<void> {
  const { symbol } = params<{ symbol: string }>(req);
  const { exchange } = query<{ exchange?: Exchange }>(req);

  const instrument = await findInstrument(symbol, exchange);
  if (!instrument) throw ApiError.notFound(`No instrument found for symbol '${symbol}'.`);

  const [quote, fundamentals] = await Promise.all([
    getQuote(instrument),
    getFundamentals(instrument),
  ]);

  const payload: StockDetail = {
    instrument: toInstrumentDto(instrument),
    quote,
    fundamentals,
  };

  sendSuccess(res, payload);
}

export async function historyHandler(req: Request, res: Response): Promise<void> {
  const { symbol } = params<{ symbol: string }>(req);
  const { exchange, range, interval } = query<{
    exchange?: Exchange;
    range: '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';
    interval: '1d' | '1wk' | '1mo';
  }>(req);

  const instrument = await findInstrument(symbol, exchange);
  if (!instrument) throw ApiError.notFound(`No instrument found for symbol '${symbol}'.`);

  sendSuccess(res, await getHistory(instrument, range, interval));
}

export async function indicesHandler(req: Request, res: Response): Promise<void> {
  const { market } = query<{ market?: Market }>(req);
  sendSuccess(res, { indices: await getIndices(market) });
}

export async function moversHandler(req: Request, res: Response): Promise<void> {
  const { market, limit } = query<{ market: Market; limit: number }>(req);
  sendSuccess(res, await getMovers(market, limit));
}

export async function compareHandler(req: Request, res: Response): Promise<void> {
  const { symbols, range } = query<{
    symbols: string[];
    range: '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';
  }>(req);

  const entries = await compareInstruments(symbols, range);
  if (entries.length < 2) {
    throw ApiError.badRequest(
      'At least two of the requested symbols must exist in the instrument universe.',
    );
  }

  sendSuccess(res, { entries, range });
}

export function marketStatusHandler(_req: Request, res: Response): void {
  sendSuccess(res, {
    markets: getAllMarketStatuses(),
    serverTime: new Date().toISOString(),
    notice: 'All prices are delayed or simulated. Nothing here is a live feed.',
  });
}

export function singleMarketStatusHandler(req: Request, res: Response): void {
  const { market } = params<{ market: Market }>(req);
  sendSuccess(res, getMarketStatus(market));
}

export async function newsHandler(req: Request, res: Response): Promise<void> {
  const { page, limit, symbol, market } = query<{
    page: number;
    limit: number;
    symbol?: string;
    market?: Market;
  }>(req);

  const { articles, total } = await listNews({
    page,
    limit,
    ...(symbol ? { symbol } : {}),
    ...(market ? { market } : {}),
  });

  sendPaginated(res, articles, { page, limit, total });
}
