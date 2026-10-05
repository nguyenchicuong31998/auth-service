import type { Uuid } from "../entities/base_entity.js";
import type { PhoneVerificationOtp } from "../entities/phone_verification_otp.js";

export type NewPhoneVerificationOtp = Pick<
  PhoneVerificationOtp,
  "phone" | "codeHash" | "expiresAt"
>;

export interface PhoneVerificationOtpRepository {
  create(data: NewPhoneVerificationOtp): Promise<PhoneVerificationOtp>;
  findLatestByPhone(phone: string): Promise<PhoneVerificationOtp | null>;
  /** Counts one wrong code; returns the new attempt count. */
  recordFailedAttempt(id: Uuid, at: Date): Promise<number>;
  /** Marks the OTP used; false when it was already used (single use). */
  consume(id: Uuid, at: Date): Promise<boolean>;
  consumeAllByPhone(phone: string, at: Date): Promise<number>;
}
