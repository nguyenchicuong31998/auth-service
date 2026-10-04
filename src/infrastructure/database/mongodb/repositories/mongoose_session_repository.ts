import type { Uuid } from "../../../../domain/entities/base_entity.js";
import type { Session } from "../../../../domain/entities/session.js";
import type {
  NewSession,
  RevokeOptions,
  SessionRepository,
} from "../../../../domain/repositories/session_repository.js";
import { SessionModel, type SessionDocument } from "../models/session_model.js";

function toEntity(doc: SessionDocument): Session {
  return {
    id: doc._id,
    userId: doc.userId,
    deviceId: doc.deviceId,
    refreshTokenHash: doc.refreshTokenHash,
    expiredAt: doc.expiredAt,
    lastUsedAt: doc.lastUsedAt ?? null,
    revokedAt: doc.revokedAt ?? null,
    ipAddress: doc.ipAddress ?? null,
    userAgent: doc.userAgent ?? null,
    revokedReason: doc.revokedReason ?? null,
    createdAt: doc.createdAt,
  };
}

const revocation = ({ reason, at }: RevokeOptions) => ({
  $set: { revokedAt: at, revokedReason: reason },
});

export class MongooseSessionRepository implements SessionRepository {
  async create(data: NewSession): Promise<Session> {
    const doc = await SessionModel.create(data);
    return toEntity(doc.toObject());
  }

  async findById(id: Uuid): Promise<Session | null> {
    const doc = await SessionModel.findById(id).lean<SessionDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findActiveByUser(userId: Uuid, now: Date): Promise<Session[]> {
    const docs = await SessionModel.find({
      userId,
      revokedAt: null,
      expiredAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean<SessionDocument[]>();
    return docs.map(toEntity);
  }

  async rotate(
    id: Uuid,
    currentHash: string,
    nextHash: string,
    at: Date,
  ): Promise<boolean> {
    const result = await SessionModel.updateOne(
      { _id: id, refreshTokenHash: currentHash, revokedAt: null },
      { $set: { refreshTokenHash: nextHash, lastUsedAt: at } },
    );
    return result.modifiedCount === 1;
  }

  async revoke(id: Uuid, options: RevokeOptions): Promise<boolean> {
    const result = await SessionModel.updateOne(
      { _id: id, revokedAt: null },
      revocation(options),
    );
    return result.modifiedCount === 1;
  }

  async revokeByUser(
    userId: Uuid,
    options: RevokeOptions & { exceptId?: Uuid },
  ): Promise<number> {
    const result = await SessionModel.updateMany(
      {
        userId,
        revokedAt: null,
        ...(options.exceptId ? { _id: { $ne: options.exceptId } } : {}),
      },
      revocation(options),
    );
    return result.modifiedCount;
  }

  async revokeByDevice(
    deviceId: Uuid,
    options: RevokeOptions,
  ): Promise<number> {
    const result = await SessionModel.updateMany(
      { deviceId, revokedAt: null },
      revocation(options),
    );
    return result.modifiedCount;
  }
}
