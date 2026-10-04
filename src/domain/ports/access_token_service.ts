import type { Uuid } from "../entities/base_entity.js";

export interface AccessTokenClaims {
  userId: Uuid;
  sessionId: Uuid;
}

export interface IssuedAccessToken {
  token: string;
  expiresIn: number;
}

export interface JsonWebKeySet {
  keys: Record<string, unknown>[];
}

export interface AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
  verify(token: string): Promise<AccessTokenClaims | null>;
  publicKeys(): JsonWebKeySet;
}
