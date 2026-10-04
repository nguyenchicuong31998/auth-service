import type { Uuid } from "../../../../domain/entities/base_entity.js";
import type { EmailVerificationToken } from "../../../../domain/entities/email_verification_token.js";
import type {
  EmailVerificationTokenRepository,
  NewEmailVerificationToken,
} from "../../../../domain/repositories/email_verification_token_repository.js";
import {
  EmailVerificationTokenModel,
  type EmailVerificationTokenDocument,
} from "../models/email_verification_token_model.js";

function toEntity(doc: EmailVerificationTokenDocument): EmailVerificationToken {
  return {
    id: doc._id,
    userId: doc.userId,
    tokenHash: doc.tokenHash,
    expiresAt: doc.expiresAt,
    consumedAt: doc.consumedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? null,
  };
}

const consumption = (at: Date) => ({
  $set: { consumedAt: at, updatedAt: at },
});

export class MongooseEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  async create(
    data: NewEmailVerificationToken,
  ): Promise<EmailVerificationToken> {
    const doc = await EmailVerificationTokenModel.create(data);
    return toEntity(doc.toObject());
  }

  async findByHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    const doc = await EmailVerificationTokenModel.findOne({
      tokenHash,
    }).lean<EmailVerificationTokenDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findLatestByUser(userId: Uuid): Promise<EmailVerificationToken | null> {
    const doc = await EmailVerificationTokenModel.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean<EmailVerificationTokenDocument>();
    return doc ? toEntity(doc) : null;
  }

  async consume(id: Uuid, at: Date): Promise<boolean> {
    const result = await EmailVerificationTokenModel.updateOne(
      { _id: id, consumedAt: null },
      consumption(at),
    );
    return result.modifiedCount === 1;
  }

  async consumeAllByUser(userId: Uuid, at: Date): Promise<number> {
    const result = await EmailVerificationTokenModel.updateMany(
      { userId, consumedAt: null },
      consumption(at),
    );
    return result.modifiedCount;
  }
}
