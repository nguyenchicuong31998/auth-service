import type { KeyObject } from "node:crypto";
import { JwtSigner, type JwtIdentity } from "./jwt_signer.js";

const TTL_SECONDS = 300;
const RENEW_BEFORE_MS = 30_000;

export interface ServiceTokenOptions extends JwtIdentity {
  serviceName: string;
  scopes: string[];
}

export class ServiceTokenProvider {
  private readonly signer: JwtSigner;
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    privateKey: KeyObject,
    private readonly options: ServiceTokenOptions,
  ) {
    this.signer = new JwtSigner(privateKey, options);
  }

  async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - RENEW_BEFORE_MS > Date.now()) {
      return this.cached.token;
    }
    const token = await this.signer.sign(
      this.options.serviceName,
      { kind: "service", scope: this.options.scopes.join(" ") },
      TTL_SECONDS,
    );
    this.cached = { token, expiresAt: Date.now() + TTL_SECONDS * 1000 };
    return token;
  }
}
