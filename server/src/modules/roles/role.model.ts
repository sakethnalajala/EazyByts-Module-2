import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { ROLES, type Permission, type Role } from '@smd/shared';

/**
 * Roles as editable permission bundles.
 *
 * Routes declare a permission, never a role, so a Super Admin can re-bundle
 * permissions at runtime without a deploy. `permissionVersion` is stamped into
 * every access token; bumping it invalidates tokens issued under the old
 * bundle, which is what stops a demoted admin keeping their powers for the
 * remaining 15 minutes of their token's life.
 */
export interface RoleDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  name: Role;
  label: string;
  description: string;
  permissions: Permission[];
  /** System roles cannot be deleted, only re-bundled. */
  isSystem: boolean;
  permissionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<RoleDocument>(
  {
    name: { type: String, enum: ROLES, required: true, unique: true, index: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: true },
    permissionVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export const RoleModel: Model<RoleDocument> = model<RoleDocument>('Role', roleSchema);
