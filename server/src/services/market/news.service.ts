import type { Market, NewsArticle, SourceMeta } from '@smd/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { cached } from '../cache/cache.js';
import { NewsArticleModel, type NewsArticleDocument } from '../../modules/news/news.model.js';
import { Instrument } from '../../modules/instruments/instrument.model.js';

/**
 * Market news.
 *
 * Yahoo's search endpoint returns a news array alongside symbol matches, which
 * is the only free news source with Indian coverage. Articles are persisted so
 * the feed survives a provider outage, and a deterministic simulated feed backs
 * it up - clearly labelled, like every other simulated surface.
 */

const NEWS_TTL = 15 * 60;

function meta(source: SourceMeta['source'], isSimulated: boolean, asOf: Date): SourceMeta {
  return { source, asOf: asOf.toISOString(), isDelayed: true, isSimulated };
}

interface YahooNewsItem {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number | Date;
  thumbnail?: { resolutions?: { url?: string }[] };
  relatedTickers?: string[];
}

async function fetchYahooNews(query: string): Promise<YahooNewsItem[]> {
  const { default: YahooFinance } = await import('yahoo-finance2');
  const client = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

  const result = (await Promise.race([
    client.search(query, { newsCount: 12, quotesCount: 0 }),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('news timeout')), 8000)),
  ])) as { news?: YahooNewsItem[] } | undefined;

  return result?.news ?? [];
}

function toDate(value: number | Date | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value * 1000);
  return new Date();
}

/**
 * Pulls the latest articles into the database.
 *
 * Upserts on URL, so repeated syncs top up rather than duplicate.
 */
export async function syncNews(query = 'stock market'): Promise<number> {
  if (env.MARKET_DATA_FORCE_MOCK) return 0;

  try {
    const items = await fetchYahooNews(query);
    let stored = 0;

    for (const item of items) {
      if (!item.link || !item.title) continue;

      await NewsArticleModel.updateOne(
        { url: item.link },
        {
          $set: {
            title: item.title.slice(0, 300),
            summary: '',
            source: item.publisher ?? 'Yahoo Finance',
            imageUrl: item.thumbnail?.resolutions?.[0]?.url ?? null,
            symbols: (item.relatedTickers ?? []).map((t) => t.replace(/\.(NS|BO)$/, '')),
            publishedAt: toDate(item.providerPublishTime),
            provider: 'yahoo',
            isSimulated: false,
          },
        },
        { upsert: true },
      );
      stored += 1;
    }

    return stored;
  } catch (error) {
    logger.warn({ err: error }, 'News sync failed; the simulated feed will be used');
    return 0;
  }
}

/** Deterministic simulated headlines, used when no real article is available. */
function simulatedArticles(symbols: string[], count: number): NewsArticle[] {
  const templates = [
    {
      t: '%S% posts quarterly results in line with street estimates',
      s: 'Revenue and margins tracked analyst consensus, with management reiterating full-year guidance.',
    },
    {
      t: 'Analysts revise outlook on %S% after sector rotation',
      s: 'Brokerages updated target prices citing changing demand conditions across the sector.',
    },
    {
      t: '%S% announces capacity expansion plan',
      s: 'The board approved additional investment to be funded through internal accruals.',
    },
    {
      t: 'Institutional flows shift in %S%',
      s: 'Shareholding disclosures show a change in institutional positioning over the quarter.',
    },
    {
      t: 'Volatility rises across benchmark indices',
      s: 'Broader indices saw wider intraday ranges amid global macro uncertainty.',
    },
    {
      t: 'Sector update: what the latest data means for %S%',
      s: 'Monthly industry data offered a mixed read on near-term demand.',
    },
  ];

  const now = Date.now();
  const articles: NewsArticle[] = [];

  for (let index = 0; index < count; index += 1) {
    const template = templates[index % templates.length];
    const symbol = symbols[index % Math.max(symbols.length, 1)] ?? 'the market';
    if (!template) continue;

    const publishedAt = new Date(now - index * 3.5 * 60 * 60 * 1000);

    articles.push({
      id: `sim-${index}-${publishedAt.toISOString().slice(0, 10)}`,
      title: template.t.replace('%S%', symbol),
      summary: template.s,
      // Deliberately not a real link: this is simulated content and must not
      // masquerade as a genuine published article.
      url: `#simulated-article-${index}`,
      source: 'Simulated feed',
      imageUrl: null,
      symbols: symbol === 'the market' ? [] : [symbol],
      publishedAt: publishedAt.toISOString(),
      sourceMeta: meta('mock', true, publishedAt),
    });
  }

  return articles;
}

function toNewsArticle(doc: NewsArticleDocument): NewsArticle {
  return {
    id: doc._id.toString(),
    title: doc.title,
    summary: doc.summary,
    url: doc.url,
    source: doc.source,
    imageUrl: doc.imageUrl,
    symbols: doc.symbols,
    publishedAt: doc.publishedAt.toISOString(),
    sourceMeta: meta(doc.isSimulated ? 'mock' : 'yahoo', doc.isSimulated, doc.publishedAt),
  };
}

export interface NewsQuery {
  page: number;
  limit: number;
  symbol?: string;
  market?: Market;
}

export async function listNews(
  query: NewsQuery,
): Promise<{ articles: NewsArticle[]; total: number }> {
  const filter: Record<string, unknown> = {};
  if (query.symbol) filter.symbols = query.symbol;
  if (query.market) filter.market = query.market;

  const [docs, total] = await Promise.all([
    NewsArticleModel.find(filter)
      .sort({ publishedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    NewsArticleModel.countDocuments(filter),
  ]);

  if (docs.length > 0) {
    return { articles: docs.map(toNewsArticle), total };
  }

  // Nothing stored yet: try a live sync once, then fall back to the simulator
  // so the page always has content rather than an unexplained empty state.
  const synced = await cached(`news:sync:${query.symbol ?? 'general'}`, NEWS_TTL, () =>
    syncNews(query.symbol ?? 'stock market NSE NASDAQ'),
  );

  if (synced > 0) {
    const refreshed = await NewsArticleModel.find(filter)
      .sort({ publishedAt: -1 })
      .limit(query.limit);
    if (refreshed.length > 0) {
      return {
        articles: refreshed.map(toNewsArticle),
        total: await NewsArticleModel.countDocuments(filter),
      };
    }
  }

  const symbols = query.symbol
    ? [query.symbol]
    : (await Instrument.find({ isActive: true }).limit(8).lean()).map((i) => i.symbol);

  const simulated = simulatedArticles(symbols, query.limit);
  return { articles: simulated, total: simulated.length };
}
