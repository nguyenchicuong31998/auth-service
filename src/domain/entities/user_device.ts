import type { Uuid } from "./base_entity.js";

export const DEVICE_TYPES = ["WEB", "IOS", "ANDROID"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface UserDevice {
  id: Uuid;
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
