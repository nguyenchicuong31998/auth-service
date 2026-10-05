import type { Uuid } from "./base_entity.js";

export const PHONE_OTP_EVENT_TYPES = ["sent", "failed"] as const;
export type PhoneOtpEventType = (typeof PHONE_OTP_EVENT_TYPES)[number];

export interface PhoneOtpEvent {
  id: Uuid;
  phone: string;
  type: PhoneOtpEventType;
  createdAt: Date;
}
