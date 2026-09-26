import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  CURRENCIES,
  EXCHANGES,
  MARKETS,
  type Currency,
  type Exchange,
  type Market,
} from '@smd/shared';

/** A tradable symbol in the curated universe. */
export interface InstrumentDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  /** Mongoose's string virtual for _id. */
  id: string;
  symbol: string;
  exchange: Exchange;
  market: Market;
  currency: Currency;
  name: string;
  sector: string | null;
  industry: string | null;
  /**
   * Ticker as the upstream provider spells it: Yahoo needs RELIANCE.NS for NSE
   * and RELIANCE.BO for BSE, while US symbols pass through unchanged.
   */
  providerSymbol: string;
  isActive: boolean;
  /** Seeded baseline used by the deterministic mock feed. Minor units. */
  referencePrice: number;
  createdAt: Date;
  updatedAt: Date;
}

const instrumentSchema = new Schema<InstrumentDocument>(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    exchange: { type: String, enum: EXCHANGES, required: true },
    market: { type: String, enum: MARKETS, required: true, index: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sector: { type: String, default: null },
    industry: { type: String, default: null },
    providerSymbol: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    referencePrice: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

instrumentSchema.index({ symbol: 1, exchange: 1 }, { unique: true });
// Powers search. Weighted so an exact-ish symbol match outranks a name match.
instrumentSchema.index({ symbol: 'text', name: 'text' }, { weights: { symbol: 10, name: 3 } });

export const Instrument: Model<InstrumentDocument> = model<InstrumentDocument>(
  'Instrument',
  instrumentSchema,
);

/**
 * Last known quote per instrument.
 *
 * This is a durable fallback, not the hot cache - Redis (or its in-process
 * stand-in) serves live reads. It exists so a holding can still be valued when
 * every upstream provider is down, with the UI flagging the price as stale.
 */
export interface QuoteCacheDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  instrumentId: Types.ObjectId;
  symbol: string;
  exchange: Exchange;
  ltp: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  source: string;
  isSimulated: boolean;
  asOf: Date;
  updatedAt: Date;
}

const quoteCacheSchema = new Schema<QuoteCacheDocument>(
  {
    instrumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Instrument',
      required: true,
      unique: true,
      index: true,
    },
    symbol: { type: String, required: true, uppercase: true },
    exchange: { type: String, enum: EXCHANGES, required: true },
    ltp: { type: Number, required: true },
    previousClose: { type: Number, required: true },
    open: { type: Number, default: 0 },
    dayHigh: { type: Number, default: 0 },
    dayLow: { type: Number, default: 0 },
    volume: { type: Number, default: 0 },
    source: { type: String, required: true },
    isSimulated: { type: Boolean, default: false },
    asOf: { type: Date, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const QuoteCache: Model<QuoteCacheDocument> = model<QuoteCacheDocument>(
  'QuoteCache',
  quoteCacheSchema,
);
