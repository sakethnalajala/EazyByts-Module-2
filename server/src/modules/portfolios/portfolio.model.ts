import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { MARKETS, CURRENCIES, type Currency, type Market } from '@smd/shared';

/**
 * A wallet. One per user per market.
 *
 * The segregated-wallet decision lives here: a portfolio is bound to exactly
 * one market and one currency, and nothing in the schema can express a
 * cross-currency balance. Every amount is an INTEGER of minor units.
 */
export interface PortfolioDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  market: Market;
  currency: Currency;
  /** Spendable. Minor units. */
  cashAvailable: number;
  /** Reserved against open BUY orders. Minor units. */
  cashBlocked: number;
  initialCapital: number;
  /** Cumulative realised profit/loss across all closed positions. */
  realisedPnl: number;
  totalFeesPaid: number;
  createdAt: Date;
  updatedAt: Date;
}

const portfolioSchema = new Schema<PortfolioDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    market: { type: String, enum: MARKETS, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    cashAvailable: { type: Number, required: true, min: 0 },
    cashBlocked: { type: Number, default: 0, min: 0 },
    initialCapital: { type: Number, required: true, min: 0 },
    realisedPnl: { type: Number, default: 0 },
    totalFeesPaid: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// One wallet per user per market - enforced by the database, not by hope.
portfolioSchema.index({ userId: 1, market: 1 }, { unique: true });

export const Portfolio: Model<PortfolioDocument> = model<PortfolioDocument>(
  'Portfolio',
  portfolioSchema,
);

/** A position in a single instrument, inside one wallet. */
export interface HoldingDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  portfolioId: Types.ObjectId;
  userId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  /** Denormalised so order history survives an instrument rename. */
  symbol: string;
  exchange: string;
  instrumentName: string;
  quantity: number;
  /** Reserved against open SELL orders. */
  blockedQuantity: number;
  /** Weighted average cost per share, buy fees capitalised. Minor units. */
  averageCost: number;
  /** averageCost x quantity, kept in sync on every fill. Minor units. */
  investedAmount: number;
  realisedPnl: number;
  createdAt: Date;
  updatedAt: Date;
}

const holdingSchema = new Schema<HoldingDocument>(
  {
    portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument', required: true },
    symbol: { type: String, required: true, uppercase: true },
    exchange: { type: String, required: true },
    instrumentName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    blockedQuantity: { type: Number, default: 0, min: 0 },
    averageCost: { type: Number, required: true, min: 0 },
    investedAmount: { type: Number, required: true, min: 0 },
    realisedPnl: { type: Number, default: 0 },
  },
  { timestamps: true },
);

holdingSchema.index({ portfolioId: 1, instrumentId: 1 }, { unique: true });
holdingSchema.index({ userId: 1, symbol: 1 });

export const Holding: Model<HoldingDocument> = model<HoldingDocument>('Holding', holdingSchema);

/** End-of-day valuation, powering the portfolio value-history chart. */
export interface PortfolioSnapshotDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  portfolioId: Types.ObjectId;
  userId: Types.ObjectId;
  market: Market;
  /** Local date key, YYYY-MM-DD. */
  date: string;
  totalValue: number;
  cash: number;
  holdingsValue: number;
  invested: number;
  unrealisedPnl: number;
  realisedPnlCumulative: number;
  createdAt: Date;
}

const portfolioSnapshotSchema = new Schema<PortfolioSnapshotDocument>(
  {
    portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    market: { type: String, enum: MARKETS, required: true },
    date: { type: String, required: true },
    totalValue: { type: Number, required: true },
    cash: { type: Number, required: true },
    holdingsValue: { type: Number, required: true },
    invested: { type: Number, required: true },
    unrealisedPnl: { type: Number, required: true },
    realisedPnlCumulative: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

portfolioSnapshotSchema.index({ portfolioId: 1, date: 1 }, { unique: true });

export const PortfolioSnapshot: Model<PortfolioSnapshotDocument> = model<PortfolioSnapshotDocument>(
  'PortfolioSnapshot',
  portfolioSnapshotSchema,
);
