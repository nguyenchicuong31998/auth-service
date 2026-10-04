import mongoose, { Schema } from "mongoose";
import type { Uuid } from "../../../../domain/entities/base_entity.js";
import {
  OAUTH_CLIENT_STATUSES,
  type OAuthClientStatus,
} from "../../../../domain/entities/oauth_client.js";
import {
  nullableDate,
  schemaOptions,
  uuidIdField,
  uuidRefField,
} from "./base_schema.js";

export interface OAuthClientDocument {
  _id: Uuid;
  ownerUserId: Uuid;
  name: string;
  clientId: string;
  clientSecretHash: string;
  status: OAuthClientStatus;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

const oauthClientSchema = new Schema<OAuthClientDocument>(
  {
    _id: uuidIdField,
    ownerUserId: uuidRefField,
    name: { type: String, required: true, maxlength: 255 },
    clientId: { type: String, required: true, maxlength: 64 },
    clientSecretHash: { type: String, required: true, maxlength: 255 },
    status: { type: String, enum: OAUTH_CLIENT_STATUSES, default: "active" },
    scopes: { type: [String], default: [] },
    updatedAt: nullableDate,
    deletedAt: nullableDate,
  },
  schemaOptions("oauth_clients"),
);

oauthClientSchema.index({ clientId: 1 }, { unique: true });
oauthClientSchema.index({ ownerUserId: 1, deletedAt: 1 });
oauthClientSchema.index({ deletedAt: 1, createdAt: -1 });

export const OAuthClientModel = mongoose.model<OAuthClientDocument>(
  "OAuthClient",
  oauthClientSchema,
);
