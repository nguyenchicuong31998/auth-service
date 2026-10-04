import type { Uuid } from "../../domain/entities/base_entity.js";
import type { UserDevice } from "../../domain/entities/user_device.js";
import type { DirectoryUser } from "../../domain/ports/user_directory.js";

export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface TokenPairDto {
  tokenType: "Bearer";
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: Uuid;
}

export interface LoginResultDto extends TokenPairDto {
  deviceId: Uuid;
  user: DirectoryUser;
}

export interface SessionDto {
  id: Uuid;
  device: Pick<UserDevice, "id" | "deviceName" | "deviceType"> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiredAt: Date;
  current: boolean;
}
