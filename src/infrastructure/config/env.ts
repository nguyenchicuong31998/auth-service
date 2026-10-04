import { DEFAULT_PRIVATE_KEY_PATH } from "../security/rsa_key_file.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export const env = {
  port: positiveInt("PORT", 8081),
  mongodbUri: required("MONGODB_URI"),
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "auth_service",
  dnsServers: list("DNS_SERVERS"),
  userServiceUrl: optional("USER_SERVICE_URL") ?? "http://localhost:8080",
  jwt: {
    privateKeyPath:
      optional("JWT_PRIVATE_KEY_PATH") ?? DEFAULT_PRIVATE_KEY_PATH,
    issuer: optional("JWT_ISSUER") ?? "auth-service",
    audience: optional("JWT_AUDIENCE") ?? "ms-api",
    accessTokenTtlSeconds: positiveInt("ACCESS_TOKEN_TTL_SECONDS", 900),
  },
  refreshTokenTtlDays: positiveInt("REFRESH_TOKEN_TTL_DAYS", 30),
  bcryptRounds: positiveInt("BCRYPT_ROUNDS", 12),
  superAdmin: {
    email: optional("SUPER_ADMIN_EMAIL")?.toLowerCase() ?? null,
    password: optional("SUPER_ADMIN_PASSWORD"),
  },
};
