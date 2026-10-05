import mongoose, { Schema } from "mongoose";
import type { Uuid } from "../../../../domain/entities/base_entity.js";
import {
  nullableDate,
  schemaOptions,
  uuidIdField,
  uuidRefField,
} from "./base_schema.js";

export interface EmailVerificationTokenDocument {
  _id: Uuid;
  userId: Uuid;
  tokenHash: string;
  email: string | null;
  passwordHash: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

const emailVerificationTokenSchema = new Schema<EmailVerificationTokenDocument>(
  {
    _id: uuidIdField,
    userId: uuidRefField,
    tokenHash: { type: String, required: true, maxlength: 255 },
    email: { type: String, default: null, maxlength: 255 },
    passwordHash: { type: String, default: null, maxlength: 255 },
    expiresAt: { type: Date, required: true },
    consumedAt: nullableDate,
    updatedAt: nullableDate,
  },
  schemaOptions("email_verification_tokens"),
);

emailVerificationTokenSchema.index({ tokenHash: 1 }, { unique: true });
emailVerificationTokenSchema.index({ userId: 1, createdAt: -1 });

export const EmailVerificationTokenModel =
  mongoose.model<EmailVerificationTokenDocument>(
    "EmailVerificationToken",
    emailVerificationTokenSchema,
  );
