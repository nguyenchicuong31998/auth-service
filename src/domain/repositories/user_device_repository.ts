import type { Uuid } from "../entities/base_entity.js";
import type { UserDevice } from "../entities/user_device.js";

export type DeviceUsage = Pick<
  UserDevice,
  "deviceName" | "deviceType" | "fcmToken" | "ipAddress" | "userAgent"
>;

export type NewUserDevice = DeviceUsage & Pick<UserDevice, "userId">;

export type UserDeviceChanges = Partial<
  Pick<UserDevice, "deviceName" | "isActive">
>;

export interface UserDeviceRepository {
  create(data: NewUserDevice): Promise<UserDevice>;
  findById(id: Uuid): Promise<UserDevice | null>;
  findByUser(userId: Uuid): Promise<UserDevice[]>;
  recordUsage(
    id: Uuid,
    usage: DeviceUsage,
    at: Date,
  ): Promise<UserDevice | null>;
  update(id: Uuid, changes: UserDeviceChanges): Promise<UserDevice | null>;
}
