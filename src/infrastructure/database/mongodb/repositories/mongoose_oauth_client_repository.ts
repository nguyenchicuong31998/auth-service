import type { Uuid } from "../../../../domain/entities/base_entity.js";
import type { OAuthClient } from "../../../../domain/entities/oauth_client.js";
import type {
  NewOAuthClient,
  OAuthClientChanges,
  OAuthClientFilter,
  OAuthClientPage,
  OAuthClientRepository,
} from "../../../../domain/repositories/oauth_client_repository.js";
import {
  OAuthClientModel,
  type OAuthClientDocument,
} from "../models/oauth_client_model.js";
import { toDomainError } from "../mongo_errors.js";

const NOT_DELETED = { deletedAt: null };

function toEntity(doc: OAuthClientDocument): OAuthClient {
  return {
    id: doc._id,
    ownerUserId: doc.ownerUserId,
    name: doc.name,
    clientId: doc.clientId,
    clientSecretHash: doc.clientSecretHash,
    status: doc.status,
    scopes: [...(doc.scopes ?? [])],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? null,
    deletedAt: doc.deletedAt ?? null,
  };
}

function compact<T extends object>(changes: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export class MongooseOAuthClientRepository implements OAuthClientRepository {
  async create(data: NewOAuthClient): Promise<OAuthClient> {
    try {
      const doc = await OAuthClientModel.create(data);
      return toEntity(doc.toObject());
    } catch (error) {
      throw toDomainError(error);
    }
  }

  async findById(id: Uuid): Promise<OAuthClient | null> {
    const doc = await OAuthClientModel.findOne({
      _id: id,
      ...NOT_DELETED,
    }).lean<OAuthClientDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByClientId(clientId: string): Promise<OAuthClient | null> {
    const doc = await OAuthClientModel.findOne({
      clientId,
      ...NOT_DELETED,
    }).lean<OAuthClientDocument>();
    return doc ? toEntity(doc) : null;
  }

  async list(
    filter: OAuthClientFilter,
    page: number,
    limit: number,
  ): Promise<OAuthClientPage> {
    const query = {
      ...NOT_DELETED,
      ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
      ...(filter.status ? { status: { $in: filter.status } } : {}),
    };
    const [docs, total] = await Promise.all([
      OAuthClientModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<OAuthClientDocument[]>(),
      OAuthClientModel.countDocuments(query),
    ]);
    return { items: docs.map(toEntity), total };
  }

  async update(
    id: Uuid,
    changes: OAuthClientChanges,
  ): Promise<OAuthClient | null> {
    const doc = await OAuthClientModel.findOneAndUpdate(
      { _id: id, ...NOT_DELETED },
      { $set: { ...compact(changes), updatedAt: new Date() } },
      { new: true, runValidators: true },
    ).lean<OAuthClientDocument>();
    return doc ? toEntity(doc) : null;
  }

  async softDelete(id: Uuid): Promise<boolean> {
    const now = new Date();
    const result = await OAuthClientModel.updateOne(
      { _id: id, ...NOT_DELETED },
      { $set: { deletedAt: now, status: "revoked", updatedAt: now } },
    );
    return result.modifiedCount === 1;
  }
}
