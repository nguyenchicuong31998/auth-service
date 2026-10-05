import type { Uuid } from "../../../../domain/entities/base_entity.js";
import type { PhoneVerificationOtp } from "../../../../domain/entities/phone_verification_otp.js";
import type {
  NewPhoneVerificationOtp,
  PhoneVerificationOtpRepository,
} from "../../../../domain/repositories/phone_verification_otp_repository.js";
import {
  PhoneVerificationOtpModel,
  type PhoneVerificationOtpDocument,
} from "../models/phone_verification_otp_model.js";

function toEntity(doc: PhoneVerificationOtpDocument): PhoneVerificationOtp {
  return {
    id: doc._id,
    phone: doc.phone,
    codeHash: doc.codeHash,
    expiresAt: doc.expiresAt,
    attempts: doc.attempts ?? 0,
    consumedAt: doc.consumedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? null,
  };
}

const consumption = (at: Date) => ({
  $set: { consumedAt: at, updatedAt: at },
});

export class MongoosePhoneVerificationOtpRepository implements PhoneVerificationOtpRepository {
  async create(data: NewPhoneVerificationOtp): Promise<PhoneVerificationOtp> {
    const doc = await PhoneVerificationOtpModel.create(data);
    return toEntity(doc.toObject());
  }

  async findLatestByPhone(phone: string): Promise<PhoneVerificationOtp | null> {
    const doc = await PhoneVerificationOtpModel.findOne({ phone })
      .sort({ createdAt: -1 })
      .lean<PhoneVerificationOtpDocument>();
    return doc ? toEntity(doc) : null;
  }

  async reserveAttempt(
    phone: string,
    now: Date,
    maxAttempts: number,
  ): Promise<PhoneVerificationOtp | null> {
    const doc = await PhoneVerificationOtpModel.findOneAndUpdate(
      {
        phone,
        consumedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: maxAttempts },
      },
      { $inc: { attempts: 1 }, $set: { updatedAt: now } },
      { new: true, sort: { createdAt: -1 } },
    ).lean<PhoneVerificationOtpDocument>();
    return doc ? toEntity(doc) : null;
  }

  async consume(id: Uuid, at: Date): Promise<boolean> {
    const result = await PhoneVerificationOtpModel.updateOne(
      { _id: id, consumedAt: null },
      consumption(at),
    );
    return result.modifiedCount === 1;
  }

  async consumeAllByPhone(phone: string, at: Date): Promise<number> {
    const result = await PhoneVerificationOtpModel.updateMany(
      { phone, consumedAt: null },
      consumption(at),
    );
    return result.modifiedCount;
  }
}
