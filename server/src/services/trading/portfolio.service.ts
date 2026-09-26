import type { Types } from 'mongoose';
import {
  percentChange,
  type AllocationSlice,
  type Holding as HoldingDto,
  type Market,
  type PortfolioOverview,
  type TradeStatistics,
  type TransactionRecord,
  type WalletSummary,
} from '@smd/shared';
import {
  Holding,
  Portfolio,
  type PortfolioDocument,
} from '../../modules/portfolios/portfolio.model.js';
import { Order, Transaction } from '../../modules/orders/order.model.js';
import { Instrument } from '../../modules/instruments/instrument.model.js';
import { getQuotes } from '../market/marketData.service.js';

/**
 * Portfolio valuation and analytics.
 *
 * Formula reference (all amounts in minor units):
 *
 *   averageCost     = SUM(buyQty x buyPrice + buyFees) / SUM(buyQty)
 *   investedAmount  = averageCost x quantity
 *   marketValue     = lastPrice x quantity
 *   unrealisedPnl   = (lastPrice - averageCost) x quantity
 *   realisedPnl     = (sellPrice x qty - sellFees) - (averageCost x qty)
 *   dayChange       = SUM((lastPrice - previousClose) x quantity)
 *   totalValue      = cashAvailable + cashBlocked + SUM(marketValue)
 *   overallReturn   = totalValue + cumulativeRealisedPnl - initialCapital
 *
 * When a price cannot be fetched the holding is marked `isStale`, its
 * valuation fields are null, and the UI shows a warning rather than a
 * confidently wrong number.
 */

/** Indicative display rate. NEVER used in the ledger - see the disclaimer. */
const INDICATIVE_USD_INR = 83;

interface ValuedHolding {
  dto: HoldingDto;
  marketValue: number;
  dayChange: number;
  invested: number;
  isStale: boolean;
  sector: string | null;
}

async function valueHoldings(portfolio: PortfolioDocument): Promise<ValuedHolding[]> {
  const holdings = await Holding.find({ portfolioId: portfolio._id });
  if (holdings.length === 0) return [];

  const instruments = await Instrument.find({
    _id: { $in: holdings.map((holding) => holding.instrumentId) },
  });
  const instrumentById = new Map(instruments.map((i) => [i._id.toString(), i]));

  const quotes = await getQuotes(instruments);

  return holdings.map((holding) => {
    const instrument = instrumentById.get(holding.instrumentId.toString());
    const quote = instrument
      ? quotes.get(`${instrument.exchange}:${instrument.symbol}`)
      : undefined;

    const lastPrice = quote?.ltp ?? null;
    const isStale = lastPrice === null;

    const marketValue = lastPrice === null ? null : lastPrice * holding.quantity;
    const unrealisedPnl =
      marketValue === null ? null : marketValue - holding.averageCost * holding.quantity;
    const dayChange =
      quote === undefined ? null : (quote.ltp - quote.previousClose) * holding.quantity;

    const dto: HoldingDto = {
      id: holding._id.toString(),
      symbol: holding.symbol,
      exchange: holding.exchange as HoldingDto['exchange'],
      instrumentName: holding.instrumentName,
      currency: portfolio.currency,
      quantity: holding.quantity,
      blockedQuantity: holding.blockedQuantity,
      averageCost: holding.averageCost,
      investedAmount: holding.investedAmount,
      lastPrice,
      marketValue,
      unrealisedPnl,
      unrealisedPnlPercent:
        unrealisedPnl === null || holding.investedAmount === 0
          ? null
          : Number(((unrealisedPnl / holding.investedAmount) * 100).toFixed(2)),
      dayChange,
      dayChangePercent:
        quote === undefined
          ? null
          : Number(percentChange(quote.ltp, quote.previousClose).toFixed(2)),
      realisedPnl: holding.realisedPnl,
      isStale,
    };

    return {
      dto,
      marketValue: marketValue ?? 0,
      dayChange: dayChange ?? 0,
      invested: holding.averageCost * holding.quantity,
      isStale,
      sector: instrument?.sector ?? null,
    };
  });
}

export async function summariseWallet(portfolio: PortfolioDocument): Promise<{
  summary: WalletSummary;
  holdings: ValuedHolding[];
}> {
  const holdings = await valueHoldings(portfolio);

  const holdingsValue = holdings.reduce((total, h) => total + h.marketValue, 0);
  const investedAmount = holdings.reduce((total, h) => total + h.invested, 0);
  const dayChange = holdings.reduce((total, h) => total + h.dayChange, 0);
  const unrealisedPnl = holdingsValue - investedAmount;

  const totalValue = portfolio.cashAvailable + portfolio.cashBlocked + holdingsValue;
  const overallReturn = totalValue - portfolio.initialCapital;

  // Day change is measured against yesterday's portfolio value, which is the
  // current value minus today's movement.
  const previousValue = totalValue - dayChange;

  const summary: WalletSummary = {
    market: portfolio.market,
    currency: portfolio.currency,
    cashAvailable: portfolio.cashAvailable,
    cashBlocked: portfolio.cashBlocked,
    initialCapital: portfolio.initialCapital,
    investedAmount,
    holdingsValue,
    totalValue,
    unrealisedPnl,
    realisedPnl: portfolio.realisedPnl,
    totalFeesPaid: portfolio.totalFeesPaid,
    dayChange,
    dayChangePercent:
      previousValue === 0 ? 0 : Number(percentChange(totalValue, previousValue).toFixed(2)),
    overallReturn,
    overallReturnPercent:
      portfolio.initialCapital === 0
        ? 0
        : Number(((overallReturn / portfolio.initialCapital) * 100).toFixed(2)),
    hasStalePrices: holdings.some((h) => h.isStale),
  };

  return { summary, holdings };
}

export async function getPortfolioOverview(
  userId: Types.ObjectId,
  market?: Market,
): Promise<PortfolioOverview> {
  const filter: Record<string, unknown> = { userId };
  if (market) filter.market = market;

  const portfolios = await Portfolio.find(filter).sort({ market: 1 });

  const wallets: WalletSummary[] = [];
  let holdingsCount = 0;

  for (const portfolio of portfolios) {
    const { summary, holdings } = await summariseWallet(portfolio);
    wallets.push(summary);
    holdingsCount += holdings.length;
  }

  const openOrdersCount = await Order.countDocuments({ userId, status: 'PENDING' });

  // A single headline figure, clearly marked indicative. The ledger itself
  // never converts between currencies - the wallets are fully segregated.
  const indicativeTotal = wallets.reduce(
    (total, wallet) =>
      total +
      (wallet.currency === 'USD' ? wallet.totalValue * INDICATIVE_USD_INR : wallet.totalValue),
    0,
  );

  return {
    wallets,
    holdingsCount,
    openOrdersCount,
    indicative: {
      currency: 'INR',
      totalValue: Math.round(indicativeTotal),
      rate: INDICATIVE_USD_INR,
      disclaimer:
        `Indicative only, converted at a fixed rate of 1 USD = ${INDICATIVE_USD_INR} INR. ` +
        'The INR and USD wallets are fully segregated and no conversion occurs in the ledger.',
    },
  };
}

export async function getHoldings(userId: Types.ObjectId, market?: Market): Promise<HoldingDto[]> {
  const filter: Record<string, unknown> = { userId };
  if (market) filter.market = market;

  const portfolios = await Portfolio.find(filter);
  const result: HoldingDto[] = [];

  for (const portfolio of portfolios) {
    const holdings = await valueHoldings(portfolio);
    result.push(...holdings.map((h) => h.dto));
  }

  return result.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
}

/** Asset allocation, grouped by sector and by individual holding. */
export async function getAllocation(
  userId: Types.ObjectId,
  market?: Market,
): Promise<{
  bySector: AllocationSlice[];
  byHolding: AllocationSlice[];
  byMarket: AllocationSlice[];
  cashVsInvested: AllocationSlice[];
}> {
  const filter: Record<string, unknown> = { userId };
  if (market) filter.market = market;

  const portfolios = await Portfolio.find(filter);

  const sectorTotals = new Map<string, number>();
  const holdingTotals = new Map<string, number>();
  const marketTotals = new Map<string, number>();
  let totalHoldings = 0;
  let totalCash = 0;

  for (const portfolio of portfolios) {
    const holdings = await valueHoldings(portfolio);
    // Normalise USD to the indicative rate so one pie chart is comparable.
    const scale = portfolio.currency === 'USD' ? INDICATIVE_USD_INR : 1;

    totalCash += (portfolio.cashAvailable + portfolio.cashBlocked) * scale;

    for (const holding of holdings) {
      const value = holding.marketValue * scale;
      totalHoldings += value;

      const sector = holding.sector ?? 'Unclassified';
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + value);
      holdingTotals.set(holding.dto.symbol, (holdingTotals.get(holding.dto.symbol) ?? 0) + value);
      marketTotals.set(portfolio.market, (marketTotals.get(portfolio.market) ?? 0) + value);
    }
  }

  const toSlices = (totals: Map<string, number>, denominator: number): AllocationSlice[] =>
    [...totals.entries()]
      .map(([label, value]) => ({
        label,
        value: Math.round(value),
        percent: denominator === 0 ? 0 : Number(((value / denominator) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);

  const grandTotal = totalHoldings + totalCash;

  return {
    bySector: toSlices(sectorTotals, totalHoldings),
    byHolding: toSlices(holdingTotals, totalHoldings),
    byMarket: toSlices(marketTotals, totalHoldings),
    cashVsInvested: [
      {
        label: 'Invested',
        value: Math.round(totalHoldings),
        percent: grandTotal === 0 ? 0 : Number(((totalHoldings / grandTotal) * 100).toFixed(2)),
      },
      {
        label: 'Cash',
        value: Math.round(totalCash),
        percent: grandTotal === 0 ? 0 : Number(((totalCash / grandTotal) * 100).toFixed(2)),
      },
    ],
  };
}

/**
 * Trading performance statistics.
 *
 * Only SELL transactions carry realised P&L, so a "closed trade" here means one
 * sale. Win rate is computed over those.
 */
export async function getTradeStatistics(
  userId: Types.ObjectId,
  market?: Market,
): Promise<TradeStatistics> {
  const filter: Record<string, unknown> = { userId };
  if (market) filter.market = market;

  const transactions = await Transaction.find(filter);

  const sells = transactions.filter((t) => t.type === 'SELL' && t.realisedPnl !== null);
  const wins = sells.filter((t) => (t.realisedPnl ?? 0) > 0);
  const losses = sells.filter((t) => (t.realisedPnl ?? 0) < 0);

  const grossProfit = wins.reduce((total, t) => total + (t.realisedPnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((total, t) => total + (t.realisedPnl ?? 0), 0));

  const sorted = [...sells].sort((a, b) => (b.realisedPnl ?? 0) - (a.realisedPnl ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return {
    totalTrades: transactions.length,
    buyTrades: transactions.filter((t) => t.type === 'BUY').length,
    sellTrades: sells.length,
    closedTrades: sells.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRatePercent:
      sells.length === 0 ? 0 : Number(((wins.length / sells.length) * 100).toFixed(2)),
    totalRealisedPnl: sells.reduce((total, t) => total + (t.realisedPnl ?? 0), 0),
    averageWin: wins.length === 0 ? 0 : Math.round(grossProfit / wins.length),
    averageLoss: losses.length === 0 ? 0 : Math.round(grossLoss / losses.length),
    // Undefined rather than Infinity when there are no losses yet.
    profitFactor: grossLoss === 0 ? null : Number((grossProfit / grossLoss).toFixed(2)),
    bestTrade: best?.symbol ? { symbol: best.symbol, pnl: best.realisedPnl ?? 0 } : null,
    worstTrade: worst?.symbol ? { symbol: worst.symbol, pnl: worst.realisedPnl ?? 0 } : null,
    totalFeesPaid: transactions.reduce((total, t) => total + t.fees.total, 0),
  };
}

export interface TransactionQuery {
  page: number;
  limit: number;
  market?: Market;
  type?: 'BUY' | 'SELL' | 'DEPOSIT';
  symbol?: string;
  from?: string;
  to?: string;
}

export async function getTransactions(
  userId: Types.ObjectId,
  query: TransactionQuery,
): Promise<{ records: TransactionRecord[]; total: number }> {
  const filter: Record<string, unknown> = { userId };
  if (query.market) filter.market = query.market;
  if (query.type) filter.type = query.type;
  if (query.symbol) filter.symbol = query.symbol;

  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = new Date(query.from);
    if (query.to) range.$lte = new Date(query.to);
    filter.createdAt = range;
  }

  const [docs, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Transaction.countDocuments(filter),
  ]);

  const records: TransactionRecord[] = docs.map((doc) => ({
    id: doc._id.toString(),
    orderId: doc.orderId?.toString() ?? null,
    type: doc.type,
    symbol: doc.symbol,
    exchange: doc.exchange,
    instrumentName: doc.instrumentName,
    currency: doc.currency,
    market: doc.market,
    quantity: doc.quantity,
    price: doc.price,
    grossAmount: doc.grossAmount,
    fees: doc.fees,
    netAmount: doc.netAmount,
    cashAfter: doc.cashAfter,
    realisedPnl: doc.realisedPnl,
    createdAt: doc.createdAt.toISOString(),
  }));

  return { records, total };
}
