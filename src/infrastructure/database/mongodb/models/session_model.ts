import mongoose, { Schema } from "mongoose";
import type { Uuid } from "../../../../domain/entities/base_entity.js";
import {
  SESSION_REVOKE_REASONS,
  type SessionRevokeReason,
} from "../../../../domain/entities/session.js";
import {
  nullableDate,
  nullableString,
  schemaOptions,
  uuidIdField,
  uuidRefField,
} from "./base_schema.js";

export interface SessionDocument {
  _id: Uuid;
  userId: Uuid;
  deviceId: Uuid;
  refreshTokenHash: string;
  expiredAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  revokedReason: SessionRevokeReason | null;
  createdAt: Date;
}

const sessionSchema = new Schema<SessionDocument>(
  {
    _id: uuidIdField,
    userId: uuidRefField,
    deviceId: uuidRefField,
    refreshTokenHash: { type: String, required: true },
    expiredAt: { type: Date, required: true },
    lastUsedAt: nullableDate,
    revokedAt: nullableDate,
    ipAddress: { ...nullableString, maxlength: 50 },
    userAgent: nullableString,
    revokedReason: {
      type: String,
      enum: [...SESSION_REVOKE_REASONS, null],
      default: null,
    },
  },
  schemaOptions("sessions"),
);

sessionSchema.index({ userId: 1, revokedAt: 1, expiredAt: 1 });
sessionSchema.index({ deviceId: 1, revokedAt: 1 });

export const SessionModel = mongoose.model<SessionDocument>(
  "Session",
  sessionSchema,
);
