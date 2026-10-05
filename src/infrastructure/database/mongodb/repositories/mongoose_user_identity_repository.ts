import type { Uuid } from "../../../../domain/entities/base_entity.js";
import type {
  AuthProvider,
  UserIdentity,
} from "../../../../domain/entities/user_identity.js";
import type {
  NewUserIdentity,
  UserIdentityRepository,
} from "../../../../domain/repositories/user_identity_repository.js";
import {
  UserIdentityModel,
  type UserIdentityDocument,
} from "../models/user_identity_model.js";
import { toDomainError } from "../mongo_errors.js";

function toEntity(doc: UserIdentityDocument): UserIdentity {
  return {
    id: doc._id,
    userId: doc.userId,
    provider: doc.provider,
    providerAccountId: doc.providerAccountId,
    password: doc.password ?? null,
    lastUsedAt: doc.lastUsedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? null,
  };
}

export class MongooseUserIdentityRepository implements UserIdentityRepository {
  async create(data: NewUserIdentity): Promise<UserIdentity> {
    try {
      const doc = await UserIdentityModel.create(data);
      return toEntity(doc.toObject());
    } catch (error) {
      throw toDomainError(error);
    }
  }

  async findByProviderAccount(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<UserIdentity | null> {
    const doc = await UserIdentityModel.findOne({
      provider,
      providerAccountId,
    }).lean<UserIdentityDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findAllByUser(
    userId: Uuid,
    provider: AuthProvider,
  ): Promise<UserIdentity[]> {
    const docs = await UserIdentityModel.find({ userId, provider })
      .sort({ createdAt: 1 })
      .lean<UserIdentityDocument[]>();
    return docs.map(toEntity);
  }

  async updatePassword(id: Uuid, password: string): Promise<void> {
    await UserIdentityModel.updateOne(
      { _id: id },
      { $set: { password, updatedAt: new Date() } },
    );
  }

  async markUsed(id: Uuid, at: Date): Promise<void> {
    await UserIdentityModel.updateOne(
      { _id: id },
      { $set: { lastUsedAt: at } },
    );
  }
}
