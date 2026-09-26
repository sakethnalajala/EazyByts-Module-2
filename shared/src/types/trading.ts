import type { Currency, Exchange, Market } from '../constants/markets.js';
import type { FeeBreakdown } from '../constants/fees.js';

export const ORDER_SIDES = ['BUY', 'SELL'] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

export const ORDER_TYPES = ['MARKET', 'LIMIT'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_VALIDITIES = ['DAY', 'GTC'] as const;
export type OrderValidity = (typeof ORDER_VALIDITIES)[number];

export const ORDER_STATUSES = ['PENDING', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** A status no longer subject to change. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'FILLED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
];

export interface Order {
  id: string;
  symbol: string;
  exchange: Exchange;
  instrumentName: string;
  currency: Currency;
  market: Market;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  validity: OrderValidity;
  quantity: number;
  filledQuantity: number;
  /** Null for market orders. Minor units. */
  limitPrice: number | null;
  /** Null until filled. Minor units. */
  averageFillPrice: number | null;
  /** Quantity x fill price, before fees. Minor units. */
  grossAmount: number | null;
  fees: FeeBreakdown | null;
  /** What actually moved in or out of the wallet. Minor units. */
  netAmount: number | null;
  rejectReason: string | null;
  placedAt: string;
  executedAt: string | null;
  expiresAt: string | null;
  /** True when the order was queued outside market hours. */
  queuedForNextOpen: boolean;
}

export interface Holding {
  id: string;
  symbol: string;
  exchange: Exchange;
  instrumentName: string;
  currency: Currency;
  quantity: number;
  /** Reserved against open SELL orders. */
  blockedQuantity: number;
  /** Weighted average cost per share, fees included. Minor units. */
  averageCost: number;
  /** averageCost x quantity. Minor units. */
  investedAmount: number;
  /** Null when no price is available; the UI must show a stale badge. */
  lastPrice: number | null;
  marketValue: number | null;
  unrealisedPnl: number | null;
  unrealisedPnlPercent: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  realisedPnl: number;
  /** True when lastPrice could not be refreshed from any provider. */
  isStale: boolean;
}

export interface WalletSummary {
  market: Market;
  currency: Currency;
  /** Spendable right now. Minor units. */
  cashAvailable: number;
  /** Reserved against open BUY orders. Minor units. */
  cashBlocked: number;
  initialCapital: number;
  investedAmount: number;
  holdingsValue: number;
  /** cash + blocked + holdings. Minor units. */
  totalValue: number;
  unrealisedPnl: number;
  realisedPnl: number;
  totalFeesPaid: number;
  dayChange: number;
  dayChangePercent: number;
  /** Against initial capital. */
  overallReturn: number;
  overallReturnPercent: number;
  /** True when any holding could not be priced. */
  hasStalePrices: boolean;
}

export interface PortfolioOverview {
  wallets: WalletSummary[];
  holdingsCount: number;
  openOrdersCount: number;
  /**
   * Indicative only. The INR and USD wallets are segregated with no FX in the
   * ledger; this figure exists purely so the dashboard can show one headline
   * number, and the UI labels it as indicative.
   */
  indicative: {
    currency: Currency;
    totalValue: number;
    rate: number;
    disclaimer: string;
  };
}

export interface TransactionRecord {
  id: string;
  orderId: string | null;
  type: 'BUY' | 'SELL' | 'DEPOSIT';
  symbol: string | null;
  exchange: Exchange | null;
  instrumentName: string | null;
  currency: Currency;
  market: Market;
  quantity: number | null;
  price: number | null;
  grossAmount: number;
  fees: FeeBreakdown;
  netAmount: number;
  /** Wallet balance immediately after this entry. Minor units. */
  cashAfter: number;
  realisedPnl: number | null;
  createdAt: string;
}

/** A point on the portfolio value history chart. */
export interface PortfolioSnapshotPoint {
  date: string;
  totalValue: number;
  cash: number;
  holdingsValue: number;
  invested: number;
  unrealisedPnl: number;
  realisedPnlCumulative: number;
}

export interface AllocationSlice {
  label: string;
  value: number;
  percent: number;
}

export interface TradeStatistics {
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  totalRealisedPnl: number;
  averageWin: number;
  averageLoss: number;
  /** Gross profit / gross loss. Null when there are no losses yet. */
  profitFactor: number | null;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  totalFeesPaid: number;
}

/** What the order form needs before the user confirms. */
export interface OrderPreview {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  estimatedPrice: number;
  grossAmount: number;
  fees: FeeBreakdown;
  netAmount: number;
  currency: Currency;
  cashAvailable: number;
  /** False when the wallet cannot fund it, or holdings are short. */
  canAfford: boolean;
  marketOpen: boolean;
  warnings: string[];
}
