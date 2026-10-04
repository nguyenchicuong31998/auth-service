import type { Uuid } from "./base_entity.js";

export const OAUTH_CLIENT_STATUSES = ["active", "inactive", "revoked"] as const;
export type OAuthClientStatus = (typeof OAUTH_CLIENT_STATUSES)[number];

export interface OAuthClient {
  id: Uuid;
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
