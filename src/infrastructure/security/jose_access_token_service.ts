import type { KeyObject } from "node:crypto";
import { jwtVerify } from "jose";
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedAccessToken,
  JsonWebKeySet,
} from "../../domain/ports/access_token_service.js";
import { JWT_ALGORITHM, JwtSigner, type JwtIdentity } from "./jwt_signer.js";

export interface JwtOptions extends JwtIdentity {
  accessTokenTtlSeconds: number;
}

export class JoseAccessTokenService implements AccessTokenService {
  private readonly signer: JwtSigner;

  constructor(
    privateKey: KeyObject,
    private readonly options: JwtOptions,
  ) {
    this.signer = new JwtSigner(privateKey, options);
  }

  async issue({
    userId,
    sessionId,
  }: AccessTokenClaims): Promise<IssuedAccessToken> {
    const ttl = this.options.accessTokenTtlSeconds;
    const token = await this.signer.sign(
      userId,
      { kind: "user", sid: sessionId },
      ttl,
    );
    return { token, expiresIn: ttl };
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.signer.publicKey, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: [JWT_ALGORITHM],
      });
      if (
        payload.kind !== "user" ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string"
      ) {
        return null;
      }
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }

  publicKeys(): JsonWebKeySet {
    return { keys: [this.signer.jwk] };
  }
}
