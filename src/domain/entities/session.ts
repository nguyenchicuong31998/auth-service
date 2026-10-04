import type { Uuid } from "./base_entity.js";

export const SESSION_REVOKE_REASONS = [
  "logout",
  "logout_all",
  "revoked_by_user",
  "replaced",
  "password_changed",
  "device_disabled",
  "account_disabled",
  "refresh_token_reused",
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

export interface Session {
  id: Uuid;
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

export function isSessionActive(session: Session, now: Date): boolean {
  return session.revokedAt === null && session.expiredAt > now;
}
