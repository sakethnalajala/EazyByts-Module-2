import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { MARKETS, type Market } from '@smd/shared';

export interface NewsArticleDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  title: string;
  summary: string;
  url: string;
  source: string;
  imageUrl: string | null;
  symbols: string[];
  market: Market | null;
  publishedAt: Date;
  /** Which provider supplied it, or 'mock' for the simulated feed. */
  provider: string;
  isSimulated: boolean;
  createdAt: Date;
}

const newsArticleSchema = new Schema<NewsArticleDocument>(
  {
    title: { type: String, required: true, maxlength: 300 },
    summary: { type: String, default: '', maxlength: 1000 },
    // The natural dedupe key: syncing the same feed twice must not duplicate.
    url: { type: String, required: true, unique: true },
    source: { type: String, required: true },
    imageUrl: { type: String, default: null },
    symbols: { type: [String], default: [], index: true },
    market: { type: String, enum: [...MARKETS, null], default: null },
    publishedAt: { type: Date, required: true, index: true },
    provider: { type: String, required: true },
    isSimulated: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

newsArticleSchema.index({ publishedAt: -1 });
newsArticleSchema.index({ symbols: 1, publishedAt: -1 });

export const NewsArticleModel: Model<NewsArticleDocument> = model<NewsArticleDocument>(
  'NewsArticle',
  newsArticleSchema,
);
