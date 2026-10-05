import type { Uuid } from "../entities/base_entity.js";
import type { PhoneVerificationOtp } from "../entities/phone_verification_otp.js";

export type NewPhoneVerificationOtp = Pick<
  PhoneVerificationOtp,
  "phone" | "codeHash" | "expiresAt"
>;

export interface PhoneVerificationOtpRepository {
  create(data: NewPhoneVerificationOtp): Promise<PhoneVerificationOtp>;
  findLatestByPhone(phone: string): Promise<PhoneVerificationOtp | null>;
  reserveAttempt(
    phone: string,
    now: Date,
    maxAttempts: number,
  ): Promise<PhoneVerificationOtp | null>;
  consume(id: Uuid, at: Date): Promise<boolean>;
  consumeAllByPhone(phone: string, at: Date): Promise<number>;
}
