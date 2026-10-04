import mongoose, { Schema } from "mongoose";
import type { Uuid } from "../../../../domain/entities/base_entity.js";
import {
  DEVICE_TYPES,
  type DeviceType,
} from "../../../../domain/entities/user_device.js";
import {
  nullableDate,
  nullableString,
  schemaOptions,
  uuidIdField,
  uuidRefField,
} from "./base_schema.js";

export interface UserDeviceDocument {
  _id: Uuid;
  userId: Uuid;
  deviceName: string;
  deviceType: DeviceType;
  fcmToken: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

const userDeviceSchema = new Schema<UserDeviceDocument>(
  {
    _id: uuidIdField,
    userId: uuidRefField,
    deviceName: { type: String, required: true, maxlength: 255 },
    deviceType: { type: String, enum: DEVICE_TYPES, required: true },
    fcmToken: { ...nullableString, maxlength: 500 },
    ipAddress: { ...nullableString, maxlength: 50 },
    userAgent: { ...nullableString, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    lastUsedAt: nullableDate,
    updatedAt: nullableDate,
  },
  schemaOptions("user_devices"),
);

userDeviceSchema.index({ userId: 1, lastUsedAt: -1 });

export const UserDeviceModel = mongoose.model<UserDeviceDocument>(
  "UserDevice",
  userDeviceSchema,
);
