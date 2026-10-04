import type { OAuthClient } from "../../domain/entities/oauth_client.js";

export type OAuthClientDto = Omit<OAuthClient, "clientSecretHash">;

export interface OAuthClientWithSecretDto extends OAuthClientDto {
  clientSecret: string;
}

export interface OAuthClientPageDto {
  items: OAuthClientDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ClientTokenDto {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export function toOAuthClientDto(client: OAuthClient): OAuthClientDto {
  const { clientSecretHash: _hash, ...dto } = client;
  return dto;
}
