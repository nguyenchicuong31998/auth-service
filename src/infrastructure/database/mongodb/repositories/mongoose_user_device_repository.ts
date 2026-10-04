import type { Uuid } from "../../../../domain/entities/base_entity.js";
import type { UserDevice } from "../../../../domain/entities/user_device.js";
import type {
  DeviceUsage,
  NewUserDevice,
  UserDeviceChanges,
  UserDeviceRepository,
} from "../../../../domain/repositories/user_device_repository.js";
import {
  UserDeviceModel,
  type UserDeviceDocument,
} from "../models/user_device_model.js";

function toEntity(doc: UserDeviceDocument): UserDevice {
  return {
    id: doc._id,
    userId: doc.userId,
    deviceName: doc.deviceName,
    deviceType: doc.deviceType,
    fcmToken: doc.fcmToken ?? null,
    ipAddress: doc.ipAddress ?? null,
    userAgent: doc.userAgent ?? null,
    isActive: doc.isActive,
    lastUsedAt: doc.lastUsedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? null,
  };
}

function compact<T extends object>(changes: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export class MongooseUserDeviceRepository implements UserDeviceRepository {
  async create(data: NewUserDevice): Promise<UserDevice> {
    const doc = await UserDeviceModel.create({
      ...data,
      lastUsedAt: new Date(),
    });
    return toEntity(doc.toObject());
  }

  async findById(id: Uuid): Promise<UserDevice | null> {
    const doc = await UserDeviceModel.findById(id).lean<UserDeviceDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByUser(userId: Uuid): Promise<UserDevice[]> {
    const docs = await UserDeviceModel.find({ userId })
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .lean<UserDeviceDocument[]>();
    return docs.map(toEntity);
  }

  async recordUsage(
    id: Uuid,
    usage: DeviceUsage,
    at: Date,
  ): Promise<UserDevice | null> {
    const doc = await UserDeviceModel.findByIdAndUpdate(
      id,
      { $set: { ...usage, lastUsedAt: at, updatedAt: at } },
      { new: true },
    ).lean<UserDeviceDocument>();
    return doc ? toEntity(doc) : null;
  }

  async update(
    id: Uuid,
    changes: UserDeviceChanges,
  ): Promise<UserDevice | null> {
    const doc = await UserDeviceModel.findByIdAndUpdate(
      id,
      { $set: { ...compact(changes), updatedAt: new Date() } },
      { new: true, runValidators: true },
    ).lean<UserDeviceDocument>();
    return doc ? toEntity(doc) : null;
  }
}
