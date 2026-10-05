import { randomInt } from "node:crypto";
import { isOtpUsable } from "../../domain/entities/phone_verification_otp.js";
import type { SmsSender } from "../../domain/ports/sms_sender.js";
import type { PhoneVerificationOtpRepository } from "../../domain/repositories/phone_verification_otp_repository.js";
import { AppError } from "../errors/app_error.js";
import { hashToken, isSameHash } from "../shared/token_hash.js";

const OTP_LENGTH = 6;
const MAX_RESEND_COOLDOWN_MS = 60_000;

export interface PhoneOtpOptions {
  ttlMs: number;
  maxAttempts: number;
}

const invalidOtp = () => AppError.unauthorized("Invalid or expired OTP");

// Salted with the phone so equal codes never share a hash.
const hashOtp = (phone: string, code: string) => hashToken(`${phone}:${code}`);

const generateOtp = () =>
  randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");

function logFailure(action: string) {
  return (error: unknown) =>
    console.error(`${action} failed:`, (error as Error).message);
}

/** One-time codes sent by SMS; proving the code proves owning the phone. */
export class PhoneOtpService {
  constructor(
    private readonly otps: PhoneVerificationOtpRepository,
    private readonly sms: SmsSender,
    private readonly options: PhoneOtpOptions,
  ) {}

  /**
   * Sends a new code in the background. Works for unknown phones too, so
   * the response never reveals whether a phone is registered.
   */
  requestOtp(phone: string): void {
    this.send(phone).catch(logFailure("Sending phone OTP"));
  }

  /** Checks the code and uses it up; throws 401 when it is not valid. */
  async consumeCode(phone: string, code: string): Promise<void> {
    const now = new Date();
    const otp = await this.otps.findLatestByPhone(phone);
    if (!otp || !isOtpUsable(otp, now, this.options.maxAttempts)) {
      throw invalidOtp();
    }
    if (!isSameHash(hashOtp(phone, code), otp.codeHash)) {
      const attempts = await this.otps.recordFailedAttempt(otp.id, now);
      if (attempts >= this.options.maxAttempts) {
        throw AppError.unauthorized(
          "Too many wrong OTP attempts, request a new code",
        );
      }
      throw invalidOtp();
    }
    // Atomic: of two concurrent logins with the same code only one wins.
    if (!(await this.otps.consume(otp.id, now))) throw invalidOtp();
  }

  private async send(phone: string): Promise<void> {
    // A short-lived code must be resendable as soon as it expires.
    const cooldownMs = Math.min(MAX_RESEND_COOLDOWN_MS, this.options.ttlMs);
    const latest = await this.otps.findLatestByPhone(phone);
    if (latest && Date.now() - latest.createdAt.getTime() < cooldownMs) {
      return;
    }
    const now = new Date();
    await this.otps.consumeAllByPhone(phone, now);
    const code = generateOtp();
    await this.otps.create({
      phone,
      codeHash: hashOtp(phone, code),
      expiresAt: new Date(now.getTime() + this.options.ttlMs),
    });
    const seconds = Math.round(this.options.ttlMs / 1000);
    await this.sms.sendSms(
      phone,
      `Ma dang nhap MS cua ban la ${code}. Ma het han sau ${seconds} giay.`,
    );
  }
}
