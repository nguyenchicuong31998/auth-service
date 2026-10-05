import mongoose, { Schema } from "mongoose";
import type { Uuid } from "../../../../domain/entities/base_entity.js";
import { nullableDate, schemaOptions, uuidIdField } from "./base_schema.js";

export interface PhoneVerificationOtpDocument {
  _id: Uuid;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

const phoneVerificationOtpSchema = new Schema<PhoneVerificationOtpDocument>(
  {
    _id: uuidIdField,
    phone: { type: String, required: true, maxlength: 20 },
    codeHash: { type: String, required: true, maxlength: 255 },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    consumedAt: nullableDate,
    updatedAt: nullableDate,
  },
  schemaOptions("phone_verification_otps"),
);

phoneVerificationOtpSchema.index({ phone: 1, createdAt: -1 });
phoneVerificationOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PhoneVerificationOtpModel =
  mongoose.model<PhoneVerificationOtpDocument>(
    "PhoneVerificationOtp",
    phoneVerificationOtpSchema,
  );
