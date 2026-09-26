import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { ROLES, type Role } from '@smd/shared';

/**
 * Audit trail for privileged actions.
 *
 * Every admin and super-admin mutation writes one of these. Records are
 * append-only: nothing in the codebase updates or deletes them, which is the
 * point of an audit log.
 */
export interface AuditLogDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  actorId: Types.ObjectId | null;
  actorEmail: string | null;
  actorRole: Role | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorEmail: { type: String, default: null },
    actorRole: { type: String, enum: [...ROLES, null], default: null },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    summary: { type: String, required: true, maxlength: 400 },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog: Model<AuditLogDocument> = model<AuditLogDocument>(
  'AuditLog',
  auditLogSchema,
);

/**
 * Runtime platform configuration. A singleton document, addressed by a fixed
 * key so it cannot accidentally fork into multiple rows.
 */
export interface SystemConfigDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  key: 'global';
  tradingEnabled: boolean;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  /** Minor units. */
  initialCapitalInr: number;
  initialCapitalUsd: number;
  featureFlags: Record<string, boolean>;
  updatedById: Types.ObjectId | null;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const systemConfigSchema = new Schema<SystemConfigDocument>(
  {
    key: { type: String, default: 'global', unique: true, immutable: true },
    tradingEnabled: { type: Boolean, default: true },
    registrationEnabled: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: '' },
    initialCapitalInr: { type: Number, default: 100_000_000 },
    initialCapitalUsd: { type: Number, default: 1_000_000 },
    featureFlags: { type: Schema.Types.Mixed, default: {} },
    updatedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByEmail: { type: String, default: null },
  },
  { timestamps: true },
);

export const SystemConfig: Model<SystemConfigDocument> = model<SystemConfigDocument>(
  'SystemConfig',
  systemConfigSchema,
);
