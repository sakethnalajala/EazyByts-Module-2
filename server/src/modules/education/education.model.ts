import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  EDUCATION_CATEGORIES,
  EDUCATION_LEVELS,
  type EducationCategory,
  type EducationLevel,
} from '@smd/shared';

export interface EducationResourceDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  summary: string;
  category: EducationCategory;
  level: EducationLevel;
  /** Markdown body, rendered client-side. */
  content: string;
  readMinutes: number;
  status: 'draft' | 'published';
  tags: string[];
  authorId: Types.ObjectId | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const educationSchema = new Schema<EducationResourceDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    summary: { type: String, required: true, maxlength: 400 },
    category: { type: String, enum: EDUCATION_CATEGORIES, required: true, index: true },
    level: { type: String, enum: EDUCATION_LEVELS, required: true, index: true },
    content: { type: String, required: true },
    readMinutes: { type: Number, default: 3, min: 1 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    tags: { type: [String], default: [] },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, default: null },
  },
  { timestamps: true },
);

educationSchema.index({ title: 'text', summary: 'text', tags: 'text' });
educationSchema.index({ status: 1, category: 1, level: 1 });

export const EducationResourceModel: Model<EducationResourceDocument> =
  model<EducationResourceDocument>('EducationResource', educationSchema);
