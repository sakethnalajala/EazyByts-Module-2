import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  CURRENCIES,
  EXCHANGES,
  MARKETS,
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  ORDER_VALIDITIES,
  type Currency,
  type Exchange,
  type FeeBreakdown,
  type Market,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type OrderValidity,
} from '@smd/shared';

const feeBreakdownSchema = new Schema<FeeBreakdown>(
  {
    brokerage: { type: Number, default: 0 },
    stt: { type: Number, default: 0 },
    exchange: { type: Number, default: 0 },
    sebi: { type: Number, default: 0 },
    stamp: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    secFee: { type: Number, default: 0 },
    taf: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

export interface OrderDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  portfolioId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  symbol: string;
  exchange: Exchange;
  instrumentName: string;
  market: Market;
  currency: Currency;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  validity: OrderValidity;
  quantity: number;
  filledQuantity: number;
  limitPrice: number | null;
  averageFillPrice: number | null;
  grossAmount: number | null;
  fees: FeeBreakdown | null;
  netAmount: number | null;
  /** Cash (BUY) or shares (SELL) reserved while the order is open. */
  reservedCash: number;
  reservedQuantity: number;
  rejectReason: string | null;
  queuedForNextOpen: boolean;
  /**
   * Client-supplied key. A unique index on (userId, idempotencyKey) is what
   * actually prevents a double-submitted order from becoming two positions -
   * checking first and inserting after would still race.
   */
  idempotencyKey: string | null;
  placedAt: Date;
  executedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<OrderDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument', required: true },
    symbol: { type: String, required: true, uppercase: true, index: true },
    exchange: { type: String, enum: EXCHANGES, required: true },
    instrumentName: { type: String, required: true },
    market: { type: String, enum: MARKETS, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    side: { type: String, enum: ORDER_SIDES, required: true },
    type: { type: String, enum: ORDER_TYPES, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING', index: true },
    validity: { type: String, enum: ORDER_VALIDITIES, default: 'DAY' },
    quantity: { type: Number, required: true, min: 1 },
    filledQuantity: { type: Number, default: 0, min: 0 },
    limitPrice: { type: Number, default: null },
    averageFillPrice: { type: Number, default: null },
    grossAmount: { type: Number, default: null },
    fees: { type: feeBreakdownSchema, default: null },
    netAmount: { type: Number, default: null },
    reservedCash: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    rejectReason: { type: String, default: null },
    queuedForNextOpen: { type: Boolean, default: false },
    idempotencyKey: { type: String, default: null },
    placedAt: { type: Date, default: () => new Date(), index: true },
    executedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Sparse so the many orders without a key do not collide on null.
orderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
orderSchema.index({ userId: 1, status: 1, placedAt: -1 });
// The matcher's hot path: every open order, oldest first.
orderSchema.index({ status: 1, type: 1, market: 1 });

export const Order: Model<OrderDocument> = model<OrderDocument>('Order', orderSchema);

/** Immutable ledger entry. Written inside the same transaction as the fill. */
export interface TransactionDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  portfolioId: Types.ObjectId;
  orderId: Types.ObjectId | null;
  instrumentId: Types.ObjectId | null;
  type: 'BUY' | 'SELL' | 'DEPOSIT';
  symbol: string | null;
  exchange: Exchange | null;
  instrumentName: string | null;
  market: Market;
  currency: Currency;
  quantity: number | null;
  price: number | null;
  grossAmount: number;
  fees: FeeBreakdown;
  netAmount: number;
  cashAfter: number;
  realisedPnl: number | null;
  createdAt: Date;
}

const transactionSchema = new Schema<TransactionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    portfolioId: { type: Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument', default: null },
    type: { type: String, enum: ['BUY', 'SELL', 'DEPOSIT'], required: true },
    symbol: { type: String, default: null, uppercase: true },
    exchange: { type: String, enum: [...EXCHANGES, null], default: null },
    instrumentName: { type: String, default: null },
    market: { type: String, enum: MARKETS, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    quantity: { type: Number, default: null },
    price: { type: Number, default: null },
    grossAmount: { type: Number, required: true },
    fees: { type: feeBreakdownSchema, required: true },
    netAmount: { type: Number, required: true },
    cashAfter: { type: Number, required: true },
    realisedPnl: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ portfolioId: 1, createdAt: -1 });

export const Transaction: Model<TransactionDocument> = model<TransactionDocument>(
  'Transaction',
  transactionSchema,
);
