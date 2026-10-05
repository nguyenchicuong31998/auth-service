import type { PhoneOtpEventType } from "../entities/phone_otp_event.js";

export interface PhoneOtpEventRepository {
  record(phone: string, type: PhoneOtpEventType): Promise<void>;
  countSince(
    phone: string,
    type: PhoneOtpEventType,
    since: Date,
  ): Promise<number>;
}
