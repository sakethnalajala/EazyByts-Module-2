import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '@smd/shared';

export interface WidgetPreferenceDoc {
  id: string;
  visible: boolean;
  order: number;
}

export interface UserDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  /** Mongoose's string virtual for _id; declared so callers can read it. */
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  isDemo: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  /** Consecutive failures since the last success; reset on a good login. */
  failedLoginCount: number;
  lockedUntil: Date | null;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    defaultMarket: 'IN' | 'US';
    widgets: WidgetPreferenceDoc[];
    emailNotifications: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  isLocked(): boolean;
}

const widgetPreferenceSchema = new Schema<WidgetPreferenceDoc>(
  {
    id: { type: String, required: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    // `select: false` so a stray `User.find()` can never serialise the hash
    // into an API response by accident.
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    role: { type: String, enum: ROLES, default: 'trader', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'pending', index: true },
    isDemo: { type: Boolean, default: false, index: true },
    emailVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      defaultMarket: { type: String, enum: ['IN', 'US'], default: 'IN' },
      widgets: { type: [widgetPreferenceSchema], default: [] },
      emailNotifications: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.virtual('fullName').get(function (this: UserDocument): string {
  return `${this.firstName} ${this.lastName}`.trim();
});

userSchema.methods.isLocked = function (this: UserDocument): boolean {
  return this.lockedUntil !== null && this.lockedUntil.getTime() > Date.now();
};

// Supports the admin user list, which filters by role and status and sorts by
// signup date.
userSchema.index({ role: 1, status: 1, createdAt: -1 });

export const User: Model<UserDocument> = model<UserDocument>('User', userSchema);
