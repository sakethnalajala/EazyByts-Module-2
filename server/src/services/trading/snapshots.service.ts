import type { Types } from 'mongoose';
import type { Market, PortfolioSnapshotPoint } from '@smd/shared';
import { logger } from '../../config/logger.js';
import { Portfolio, PortfolioSnapshot } from '../../modules/portfolios/portfolio.model.js';
import { summariseWallet } from './portfolio.service.js';

/**
 * Portfolio value history.
 *
 * A daily snapshot per wallet. Historical valuation cannot be reconstructed
 * after the fact - we would need the closing price of every holding on every
 * past day, which no free provider will serve in bulk - so the value has to be
 * recorded as it happens.
 *
 * Today's point is always computed live rather than read from storage, so the
 * chart's right-hand edge matches the dashboard exactly.
 */

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Writes today's snapshot for one wallet. Idempotent per day. */
export async function captureSnapshot(portfolioId: Types.ObjectId): Promise<void> {
  const portfolio = await Portfolio.findById(portfolioId);
  if (!portfolio) return;

  const { summary } = await summariseWallet(portfolio);

  await PortfolioSnapshot.updateOne(
    { portfolioId: portfolio._id, date: dateKey(new Date()) },
    {
      $set: {
        userId: portfolio.userId,
        market: portfolio.market,
        totalValue: summary.totalValue,
        cash: summary.cashAvailable + summary.cashBlocked,
        holdingsValue: summary.holdingsValue,
        invested: summary.investedAmount,
        unrealisedPnl: summary.unrealisedPnl,
        realisedPnlCumulative: summary.realisedPnl,
      },
    },
    { upsert: true },
  );
}

/** Captures snapshots for every wallet. Driven by the nightly worker. */
export async function captureAllSnapshots(): Promise<number> {
  const portfolios = await Portfolio.find({}, { _id: 1 });
  let captured = 0;

  for (const portfolio of portfolios) {
    try {
      await captureSnapshot(portfolio._id);
      captured += 1;
    } catch (error) {
      logger.warn({ err: error, portfolioId: portfolio._id.toString() }, 'Snapshot capture failed');
    }
  }

  return captured;
}

const RANGE_DAYS: Record<string, number> = {
  '1W': 7,
  '1M': 31,
  '3M': 92,
  '6M': 183,
  '1Y': 366,
  ALL: 3650,
};

export async function getPerformanceSeries(
  userId: Types.ObjectId,
  range: keyof typeof RANGE_DAYS,
  market?: Market,
): Promise<PortfolioSnapshotPoint[]> {
  const filter: Record<string, unknown> = { userId };
  if (market) filter.market = market;

  const since = new Date(Date.now() - (RANGE_DAYS[range] ?? 31) * 86_400_000);

  const snapshots = await PortfolioSnapshot.find({
    ...filter,
    date: { $gte: dateKey(since) },
  }).sort({ date: 1 });

  // Multiple wallets on the same date are summed into one portfolio-wide point.
  const byDate = new Map<string, PortfolioSnapshotPoint>();

  for (const snapshot of snapshots) {
    // USD wallets are summed at the indicative rate only when both markets are
    // requested together; a single-market series needs no conversion.
    const scale = !market && snapshot.market === 'US' ? 83 : 1;
    const existing = byDate.get(snapshot.date);

    const point: PortfolioSnapshotPoint = existing ?? {
      date: snapshot.date,
      totalValue: 0,
      cash: 0,
      holdingsValue: 0,
      invested: 0,
      unrealisedPnl: 0,
      realisedPnlCumulative: 0,
    };

    point.totalValue += snapshot.totalValue * scale;
    point.cash += snapshot.cash * scale;
    point.holdingsValue += snapshot.holdingsValue * scale;
    point.invested += snapshot.invested * scale;
    point.unrealisedPnl += snapshot.unrealisedPnl * scale;
    point.realisedPnlCumulative += snapshot.realisedPnlCumulative * scale;

    byDate.set(snapshot.date, point);
  }

  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Always append today, computed live, so the chart ends where the dashboard
  // says the portfolio is right now.
  const today = dateKey(new Date());
  const portfolios = await Portfolio.find(filter);

  let liveTotal = 0;
  let liveCash = 0;
  let liveHoldings = 0;
  let liveInvested = 0;
  let liveUnrealised = 0;
  let liveRealised = 0;

  for (const portfolio of portfolios) {
    const { summary } = await summariseWallet(portfolio);
    const scale = !market && portfolio.market === 'US' ? 83 : 1;
    liveTotal += summary.totalValue * scale;
    liveCash += (summary.cashAvailable + summary.cashBlocked) * scale;
    liveHoldings += summary.holdingsValue * scale;
    liveInvested += summary.investedAmount * scale;
    liveUnrealised += summary.unrealisedPnl * scale;
    liveRealised += summary.realisedPnl * scale;
  }

  const livePoint: PortfolioSnapshotPoint = {
    date: today,
    totalValue: Math.round(liveTotal),
    cash: Math.round(liveCash),
    holdingsValue: Math.round(liveHoldings),
    invested: Math.round(liveInvested),
    unrealisedPnl: Math.round(liveUnrealised),
    realisedPnlCumulative: Math.round(liveRealised),
  };

  const withoutToday = series.filter((point) => point.date !== today);

  // A brand-new account has no history at all. Anchoring the series at the
  // opening capital gives the chart a baseline instead of a single dot.
  if (withoutToday.length === 0) {
    const openingCapital = portfolios.reduce(
      (total, portfolio) =>
        total + portfolio.initialCapital * (!market && portfolio.market === 'US' ? 83 : 1),
      0,
    );

    withoutToday.push({
      date: dateKey(new Date(Date.now() - 86_400_000)),
      totalValue: Math.round(openingCapital),
      cash: Math.round(openingCapital),
      holdingsValue: 0,
      invested: 0,
      unrealisedPnl: 0,
      realisedPnlCumulative: 0,
    });
  }

  return [...withoutToday, livePoint].map((point) => ({
    ...point,
    totalValue: Math.round(point.totalValue),
    cash: Math.round(point.cash),
    holdingsValue: Math.round(point.holdingsValue),
    invested: Math.round(point.invested),
    unrealisedPnl: Math.round(point.unrealisedPnl),
    realisedPnlCumulative: Math.round(point.realisedPnlCumulative),
  }));
}
