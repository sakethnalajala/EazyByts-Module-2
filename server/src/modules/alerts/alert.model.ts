import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  ALERT_CONDITIONS,
  ALERT_STATUSES,
  EXCHANGES,
  type AlertCondition,
  type AlertStatus,
  type Exchange,
} from '@smd/shared';

export interface AlertDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  symbol: string;
  exchange: Exchange;
  instrumentName: string;
  condition: AlertCondition;
  /** Minor units for PRICE_*, plain percent for PCT_CHANGE_*. */
  threshold: number;
  status: AlertStatus;
  /** Re-arms after firing instead of moving to TRIGGERED permanently. */
  repeat: boolean;
  note: string | null;
  triggeredAt: Date | null;
  triggeredPrice: number | null;
  lastCheckedAt: Date | null;
  /** Suppresses a repeating alert from firing on every evaluator pass. */
  cooldownUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<AlertDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument', required: true },
    symbol: { type: String, required: true, uppercase: true, index: true },
    exchange: { type: String, enum: EXCHANGES, required: true },
    instrumentName: { type: String, required: true },
    condition: { type: String, enum: ALERT_CONDITIONS, required: true },
    threshold: { type: Number, required: true },
    status: { type: String, enum: ALERT_STATUSES, default: 'ACTIVE', index: true },
    repeat: { type: Boolean, default: false },
    note: { type: String, default: null, maxlength: 200 },
    triggeredAt: { type: Date, default: null },
    triggeredPrice: { type: Number, default: null },
    lastCheckedAt: { type: Date, default: null },
    cooldownUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

// The evaluator's hot path: every ACTIVE alert, grouped by symbol so one quote
// fetch serves all alerts on that instrument.
alertSchema.index({ status: 1, symbol: 1 });
alertSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const Alert: Model<AlertDocument> = model<AlertDocument>('Alert', alertSchema);
