import type { Uuid } from "../entities/base_entity.js";
import type { Session, SessionRevokeReason } from "../entities/session.js";

export type NewSession = Pick<
  Session,
  | "userId"
  | "deviceId"
  | "refreshTokenHash"
  | "expiredAt"
  | "ipAddress"
  | "userAgent"
>;

export interface RevokeOptions {
  reason: SessionRevokeReason;
  at: Date;
}

export interface SessionRepository {
  create(data: NewSession): Promise<Session>;
  findById(id: Uuid): Promise<Session | null>;
  findActiveByUser(userId: Uuid, now: Date): Promise<Session[]>;
  rotate(
    id: Uuid,
    currentHash: string,
    nextHash: string,
    at: Date,
  ): Promise<boolean>;
  revoke(id: Uuid, options: RevokeOptions): Promise<boolean>;
  revokeByUser(
    userId: Uuid,
    options: RevokeOptions & { exceptId?: Uuid },
  ): Promise<number>;
  revokeByDevice(deviceId: Uuid, options: RevokeOptions): Promise<number>;
}
