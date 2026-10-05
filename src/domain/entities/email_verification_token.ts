import type { Uuid } from "./base_entity.js";

export interface EmailVerificationToken {
  id: Uuid;
  userId: Uuid;
  tokenHash: string;
  email: string | null;
  passwordHash: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export function isVerificationTokenUsable(
  token: EmailVerificationToken,
  now: Date,
): boolean {
  return token.consumedAt === null && token.expiresAt > now;
}
