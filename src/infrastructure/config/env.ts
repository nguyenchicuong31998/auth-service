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

function url(name: string, fallback: string): string {
  const value = optional(name) ?? fallback;
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function trustProxy(): boolean | number | string {
  const value = optional("TRUST_PROXY");
  if (!value || value === "false") return false;
  if (value === "true") return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const SMS_PROVIDERS = ["console"] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

function smsProvider(): SmsProvider | null {
  const value =
    optional("SMS_PROVIDER") ??
    (process.env.NODE_ENV === "production" ? null : "console");
  if (value !== null && !SMS_PROVIDERS.includes(value as SmsProvider)) {
    throw new Error(`SMS_PROVIDER must be one of: ${SMS_PROVIDERS.join(", ")}`);
  }
  return value as SmsProvider | null;
}

export const env = {
  port: positiveInt("PORT", 8081),
  mongodbUri: required("MONGODB_URI"),
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "auth_service",
  dnsServers: list("DNS_SERVERS"),
  userServiceUrl: optional("USER_SERVICE_URL") ?? "http://localhost:8080",
  auditServiceUrl: optional("AUDIT_SERVICE_URL"),
  notificationServiceUrl:
    optional("NOTIFICATION_SERVICE_URL") ?? "http://localhost:8082",
  verifyEmailUrl: url("VERIFY_EMAIL_URL", "http://localhost:3000/verify-email"),
  emailVerificationTtlHours: positiveInt("EMAIL_VERIFICATION_TTL_HOURS", 24),
  phoneOtp: {
    ttlSeconds: positiveInt("PHONE_OTP_TTL_SECONDS", 30),
    maxAttempts: positiveInt("PHONE_OTP_MAX_ATTEMPTS", 5),
    maxSendsPerHour: positiveInt("PHONE_OTP_MAX_SENDS_PER_HOUR", 5),
    maxSendsPerDay: positiveInt("PHONE_OTP_MAX_SENDS_PER_DAY", 10),
    maxFailuresPerDay: positiveInt("PHONE_OTP_MAX_FAILURES_PER_DAY", 20),
  },
  sms: {
    provider: smsProvider(),
    production: process.env.NODE_ENV === "production",
  },
  http: {
    corsOrigins: list("CORS_ORIGINS"),
    trustProxy: trustProxy(),
    logRequests: process.env.LOG_REQUESTS !== "false",
    rateLimit: process.env.RATE_LIMIT_ENABLED !== "false",
  },
  jwt: {
    privateKeyPath:
      optional("JWT_PRIVATE_KEY_PATH") ?? DEFAULT_PRIVATE_KEY_PATH,
    issuer: optional("JWT_ISSUER") ?? "auth-service",
    audience: optional("JWT_AUDIENCE") ?? "ms-api",
    accessTokenTtlSeconds: positiveInt("ACCESS_TOKEN_TTL_SECONDS", 900),
    clientTokenTtlSeconds: positiveInt("CLIENT_TOKEN_TTL_SECONDS", 600),
  },
  refreshTokenTtlDays: positiveInt("REFRESH_TOKEN_TTL_DAYS", 30),
  bcryptRounds: positiveInt("BCRYPT_ROUNDS", 12),
  superAdmin: {
    email: optional("SUPER_ADMIN_EMAIL")?.toLowerCase() ?? null,
    password: optional("SUPER_ADMIN_PASSWORD"),
  },
};
