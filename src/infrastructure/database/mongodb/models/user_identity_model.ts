import mongoose, { Schema } from "mongoose";
import type { Uuid } from "../../../../domain/entities/base_entity.js";
import {
  AUTH_PROVIDERS,
  type AuthProvider,
} from "../../../../domain/entities/user_identity.js";
import {
  nullableDate,
  nullableString,
  schemaOptions,
  uuidIdField,
  uuidRefField,
} from "./base_schema.js";

export interface UserIdentityDocument {
  _id: Uuid;
  userId: Uuid;
  provider: AuthProvider;
  providerAccountId: string;
  password: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

const userIdentitySchema = new Schema<UserIdentityDocument>(
  {
    _id: uuidIdField,
    userId: uuidRefField,
    provider: { type: String, enum: AUTH_PROVIDERS, required: true },
    providerAccountId: { type: String, required: true, maxlength: 255 },
    password: nullableString,
    lastUsedAt: nullableDate,
    updatedAt: nullableDate,
  },
  schemaOptions("user_identities"),
);

userIdentitySchema.index(
  { provider: 1, providerAccountId: 1 },
  { unique: true },
);
userIdentitySchema.index({ userId: 1, provider: 1 });

export const UserIdentityModel = mongoose.model<UserIdentityDocument>(
  "UserIdentity",
  userIdentitySchema,
);
