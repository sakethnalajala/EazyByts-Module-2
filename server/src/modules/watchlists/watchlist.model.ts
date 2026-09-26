import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { EXCHANGES, type Exchange } from '@smd/shared';

export interface WatchlistItemDoc {
  instrumentId: Types.ObjectId;
  symbol: string;
  exchange: Exchange;
  note: string | null;
  addedAt: Date;
}

export interface WatchlistDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  isDefault: boolean;
  items: WatchlistItemDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const watchlistItemSchema = new Schema<WatchlistItemDoc>(
  {
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument', required: true },
    symbol: { type: String, required: true, uppercase: true },
    exchange: { type: String, enum: EXCHANGES, required: true },
    note: { type: String, default: null, maxlength: 200 },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const watchlistSchema = new Schema<WatchlistDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    isDefault: { type: Boolean, default: false },
    // Embedded rather than a separate collection: a watchlist is always read
    // whole, is bounded in size, and this avoids a join on every dashboard load.
    items: { type: [watchlistItemSchema], default: [] },
  },
  { timestamps: true },
);

watchlistSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Watchlist: Model<WatchlistDocument> = model<WatchlistDocument>(
  'Watchlist',
  watchlistSchema,
);
