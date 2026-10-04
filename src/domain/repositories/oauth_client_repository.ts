import type { Uuid } from "../entities/base_entity.js";
import type {
  OAuthClient,
  OAuthClientStatus,
} from "../entities/oauth_client.js";

export type NewOAuthClient = Pick<
  OAuthClient,
  "ownerUserId" | "name" | "clientId" | "clientSecretHash" | "scopes"
>;

export type OAuthClientChanges = Partial<
  Pick<OAuthClient, "name" | "status" | "scopes" | "clientSecretHash">
>;

export interface OAuthClientFilter {
  ownerUserId?: Uuid;
  status?: OAuthClientStatus[];
}

export interface OAuthClientPage {
  items: OAuthClient[];
  total: number;
}

export interface OAuthClientRepository {
  create(data: NewOAuthClient): Promise<OAuthClient>;
  findById(id: Uuid): Promise<OAuthClient | null>;
  findByClientId(clientId: string): Promise<OAuthClient | null>;
  list(
    filter: OAuthClientFilter,
    page: number,
    limit: number,
  ): Promise<OAuthClientPage>;
  update(id: Uuid, changes: OAuthClientChanges): Promise<OAuthClient | null>;
  softDelete(id: Uuid): Promise<boolean>;
}
