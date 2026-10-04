import { createHash, createPublicKey, type KeyObject } from "node:crypto";
import { SignJWT, type JWTPayload } from "jose";
import { v4 as uuidv4 } from "uuid";

export const JWT_ALGORITHM = "RS256";

export interface JwtIdentity {
  issuer: string;
  audience: string;
}

export class JwtSigner {
  readonly publicKey: KeyObject;
  readonly jwk: Record<string, unknown>;
  private readonly keyId: string;

  constructor(
    private readonly privateKey: KeyObject,
    readonly identity: JwtIdentity,
  ) {
    this.publicKey = createPublicKey(privateKey);
    const { kty, n, e } = this.publicKey.export({ format: "jwk" });
    this.keyId = createHash("sha256")
      .update(JSON.stringify({ e, kty, n }))
      .digest("base64url");
    this.jwk = { kty, n, e, kid: this.keyId, alg: JWT_ALGORITHM, use: "sig" };
  }

  sign(
    subject: string,
    claims: JWTPayload,
    ttlSeconds: number,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: JWT_ALGORITHM, kid: this.keyId, typ: "JWT" })
      .setSubject(subject)
      .setIssuer(this.identity.issuer)
      .setAudience(this.identity.audience)
      .setJti(uuidv4())
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.privateKey);
  }
}
