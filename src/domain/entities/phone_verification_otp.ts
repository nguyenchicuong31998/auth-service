import type { Uuid } from "./base_entity.js";

export interface PhoneVerificationOtp {
  id: Uuid;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export function isOtpUsable(
  otp: PhoneVerificationOtp,
  now: Date,
  maxAttempts: number,
): boolean {
  return (
    otp.consumedAt === null && otp.expiresAt > now && otp.attempts < maxAttempts
  );
}
