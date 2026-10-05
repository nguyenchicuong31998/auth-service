import mongoose, { Schema } from "mongoose";
import type { Uuid } from "../../../../domain/entities/base_entity.js";
import {
  PHONE_OTP_EVENT_TYPES,
  type PhoneOtpEventType,
} from "../../../../domain/entities/phone_otp_event.js";
import { schemaOptions, uuidIdField } from "./base_schema.js";

export interface PhoneOtpEventDocument {
  _id: Uuid;
  phone: string;
  type: PhoneOtpEventType;
  createdAt: Date;
}

export const PHONE_OTP_EVENT_RETENTION_SECONDS = 24 * 60 * 60;

const phoneOtpEventSchema = new Schema<PhoneOtpEventDocument>(
  {
    _id: uuidIdField,
    phone: { type: String, required: true, maxlength: 20 },
    type: { type: String, enum: PHONE_OTP_EVENT_TYPES, required: true },
  },
  schemaOptions("phone_otp_events"),
);

phoneOtpEventSchema.index({ phone: 1, type: 1, createdAt: -1 });
phoneOtpEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: PHONE_OTP_EVENT_RETENTION_SECONDS },
);

export const PhoneOtpEventModel = mongoose.model<PhoneOtpEventDocument>(
  "PhoneOtpEvent",
  phoneOtpEventSchema,
);
