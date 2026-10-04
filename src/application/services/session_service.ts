import type { Uuid } from "../../domain/entities/base_entity.js";
import { isSessionActive } from "../../domain/entities/session.js";
import type { AccessTokenClaims } from "../../domain/ports/access_token_service.js";
import type { SessionRepository } from "../../domain/repositories/session_repository.js";
import type { UserDeviceRepository } from "../../domain/repositories/user_device_repository.js";
import type { SessionDto } from "../dtos/auth_dto.js";
import { AppError } from "../errors/app_error.js";

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly devices: UserDeviceRepository,
  ) {}

  async list(auth: AccessTokenClaims): Promise<SessionDto[]> {
    const [sessions, devices] = await Promise.all([
      this.sessions.findActiveByUser(auth.userId, new Date()),
      this.devices.findByUser(auth.userId),
    ]);
    const deviceById = new Map(devices.map((device) => [device.id, device]));
    return sessions.map((session) => {
      const device = deviceById.get(session.deviceId);
      return {
        id: session.id,
        device: device
          ? {
              id: device.id,
              deviceName: device.deviceName,
              deviceType: device.deviceType,
            }
          : null,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiredAt: session.expiredAt,
        current: session.id === auth.sessionId,
      };
    });
  }

  async revoke(auth: AccessTokenClaims, id: Uuid): Promise<void> {
    const now = new Date();
    const session = await this.sessions.findById(id);
    if (
      !session ||
      session.userId !== auth.userId ||
      !isSessionActive(session, now)
    ) {
      throw AppError.notFound("Session not found");
    }
    await this.sessions.revoke(id, { reason: "revoked_by_user", at: now });
  }
}
