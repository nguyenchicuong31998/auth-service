import { randomInt } from "node:crypto";
import type { SmsSender } from "../../domain/ports/sms_sender.js";
import type { PhoneOtpEventRepository } from "../../domain/repositories/phone_otp_event_repository.js";
import type { PhoneVerificationOtpRepository } from "../../domain/repositories/phone_verification_otp_repository.js";
import { AppError } from "../errors/app_error.js";
import { hashToken, isSameHash } from "../shared/token_hash.js";

const OTP_LENGTH = 6;
const MAX_RESEND_COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface PhoneOtpOptions {
  ttlMs: number;
  maxAttempts: number;
  maxSendsPerHour: number;
  maxSendsPerDay: number;
  maxFailuresPerDay: number;
}

const invalidOtp = () => AppError.unauthorized("Invalid or expired OTP");

const hashOtp = (phone: string, code: string) => hashToken(`${phone}:${code}`);

const generateOtp = () =>
  randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");

function logFailure(action: string) {
  return (error: unknown) =>
    console.error(`${action} failed:`, (error as Error).message);
}

export class PhoneOtpService {
  constructor(
    private readonly otps: PhoneVerificationOtpRepository,
    private readonly events: PhoneOtpEventRepository,
    private readonly sms: SmsSender,
    private readonly options: PhoneOtpOptions,
  ) {}

  requestOtp(phone: string): void {
    this.send(phone).catch(logFailure("Sending phone OTP"));
  }

  async consumeCode(phone: string, code: string): Promise<void> {
    const now = new Date();
    const failures = await this.events.countSince(
      phone,
      "failed",
      new Date(now.getTime() - DAY_MS),
    );
    if (failures >= this.options.maxFailuresPerDay) {
      throw AppError.tooManyRequests(
        "Too many failed OTP attempts for this phone, try again later",
      );
    }

    const otp = await this.otps.reserveAttempt(
      phone,
      now,
      this.options.maxAttempts,
    );
    if (!otp) throw invalidOtp();

    if (!isSameHash(hashOtp(phone, code), otp.codeHash)) {
      await this.events.record(phone, "failed");
      if (otp.attempts >= this.options.maxAttempts) {
        throw AppError.unauthorized(
          "Too many wrong OTP attempts, request a new code",
        );
      }
      throw invalidOtp();
    }
    if (!(await this.otps.consume(otp.id, now))) throw invalidOtp();
  }

  private async send(phone: string): Promise<void> {
    const now = Date.now();
    const cooldownMs = Math.min(MAX_RESEND_COOLDOWN_MS, this.options.ttlMs);
    const latest = await this.otps.findLatestByPhone(phone);
    if (latest && now - latest.createdAt.getTime() < cooldownMs) return;

    const [lastHour, lastDay] = await Promise.all([
      this.events.countSince(phone, "sent", new Date(now - HOUR_MS)),
      this.events.countSince(phone, "sent", new Date(now - DAY_MS)),
    ]);
    if (
      lastHour >= this.options.maxSendsPerHour ||
      lastDay >= this.options.maxSendsPerDay
    ) {
      console.warn(`Phone OTP limit reached for ${maskPhone(phone)}`);
      return;
    }

    const at = new Date(now);
    await this.otps.consumeAllByPhone(phone, at);
    const code = generateOtp();
    await this.otps.create({
      phone,
      codeHash: hashOtp(phone, code),
      expiresAt: new Date(now + this.options.ttlMs),
    });
    await this.events.record(phone, "sent");
    const seconds = Math.round(this.options.ttlMs / 1000);
    await this.sms.sendSms(
      phone,
      `Ma dang nhap MS cua ban la ${code}. Ma het han sau ${seconds} giay.`,
    );
  }
}

const maskPhone = (phone: string) =>
  `${"*".repeat(phone.length - 3)}${phone.slice(-3)}`;
