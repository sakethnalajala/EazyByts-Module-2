import { Schema, model, type Document, type Model, type Types } from 'mongoose';

/**
 * Refresh tokens.
 *
 * Only a SHA-256 hash is stored: a database dump must not hand an attacker
 * usable sessions. Tokens rotate on every use and carry a `family` id, so if a
 * stolen token is replayed after rotation we can revoke the entire lineage
 * rather than just the one token.
 */
export interface RefreshTokenDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Hash of the token that superseded this one, for reuse forensics. */
  replacedByHash: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Mongo reaps expired documents automatically, so the collection cannot grow
// without bound as sessions accumulate.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken: Model<RefreshTokenDocument> = model<RefreshTokenDocument>(
  'RefreshToken',
  refreshTokenSchema,
);

export const VERIFICATION_TOKEN_TYPES = ['verify', 'reset'] as const;
export type VerificationTokenType = (typeof VERIFICATION_TOKEN_TYPES)[number];

/** Single-use tokens for email verification and password reset. */
export interface VerificationTokenDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: VerificationTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const verificationTokenSchema = new Schema<VerificationTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: VERIFICATION_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationTokenSchema.index({ userId: 1, type: 1 });

export const VerificationToken: Model<VerificationTokenDocument> = model<VerificationTokenDocument>(
  'VerificationToken',
  verificationTokenSchema,
);
