import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '@smd/shared';

export interface NotificationDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 140 },
    body: { type: String, required: true, maxlength: 500 },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
// Notifications are ephemeral; 90 days keeps the collection bounded on Atlas M0.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification: Model<NotificationDocument> = model<NotificationDocument>(
  'Notification',
  notificationSchema,
);
