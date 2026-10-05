import type { PhoneOtpEventType } from "../../../../domain/entities/phone_otp_event.js";
import type { PhoneOtpEventRepository } from "../../../../domain/repositories/phone_otp_event_repository.js";
import { PhoneOtpEventModel } from "../models/phone_otp_event_model.js";

export class MongoosePhoneOtpEventRepository implements PhoneOtpEventRepository {
  async record(phone: string, type: PhoneOtpEventType): Promise<void> {
    await PhoneOtpEventModel.create({ phone, type });
  }

  countSince(
    phone: string,
    type: PhoneOtpEventType,
    since: Date,
  ): Promise<number> {
    return PhoneOtpEventModel.countDocuments({
      phone,
      type,
      createdAt: { $gte: since },
    });
  }
}
