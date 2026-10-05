import assert from "node:assert/strict";
import { randomUUID, type KeyObject } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DuplicateKeyError } from "../../src/domain/errors/duplicate_key_error.js";
import { UserServiceError } from "../../src/domain/errors/user_service_error.js";
import type {
  AuditEvent,
  AuditSink,
} from "../../src/domain/ports/audit_sink.js";
import type { NotificationSender } from "../../src/domain/ports/notification_sender.js";
import type { SmsSender } from "../../src/domain/ports/sms_sender.js";
import type {
  DirectoryUser,
  NewDirectoryUser,
  UserAccess,
  UserDirectory,
} from "../../src/domain/ports/user_directory.js";

export type Json = Record<string, any>;

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
}

export interface ApiOptions {
  body?: unknown;
  raw?: string;
  token?: string;
  headers?: Record<string, string>;
}

export type Api = (
  method: string,
  path: string,
  options?: ApiOptions,
) => Promise<ApiResponse>;

export const JWT_OPTIONS = {
  issuer: "auth-service",
  audience: "ms-api",
  accessTokenTtlSeconds: 900,
  clientTokenTtlSeconds: 600,
};

export const TEST_PASSWORD = "Password@123";

export const WEB_DEVICE = { deviceName: "Test browser", deviceType: "WEB" };

export class FakeUserDirectory implements UserDirectory {
  readonly users = new Map<string, DirectoryUser>();
  readonly permissions = new Map<string, string[]>();
  readonly logins: { id: string; provider: string }[] = [];
  readonly registeredFrom = new Map<string, string>();
  unavailable = false;

  add(data: Partial<DirectoryUser>): DirectoryUser {
    const user: DirectoryUser = {
      id: randomUUID(),
      fullName: "Test User",
      email: null,
      phone: null,
      status: "active",
      emailVerified: false,
      phoneVerified: false,
      ...data,
    };
    this.users.set(user.id, user);
    return user;
  }

  setStatus(id: string, status: string): void {
    this.users.set(id, { ...this.users.get(id)!, status });
  }

  async register(data: NewDirectoryUser): Promise<DirectoryUser> {
    this.guard();
    const users = [...this.users.values()];
    if (data.email && users.some((user) => user.email === data.email)) {
      throw new DuplicateKeyError("email");
    }
    const { registeredFrom, ...fields } = data;
    const user = this.add({ ...fields, status: "pending" });
    this.registeredFrom.set(user.id, registeredFrom);
    return user;
  }

  async findById(id: string): Promise<DirectoryUser | null> {
    this.guard();
    return this.users.get(id) ?? null;
  }

  grant(id: string, permissions: string[]): void {
    this.permissions.set(id, permissions);
  }

  async verifyEmail(id: string, email: string): Promise<DirectoryUser> {
    this.guard();
    const user = this.users.get(id);
    if (!user) throw new UserServiceError(404, "User not found");
    if (user.email !== email) {
      throw new UserServiceError(
        409,
        "Email does not match the user's current email",
      );
    }
    const verified: DirectoryUser = {
      ...user,
      emailVerified: true,
      status: user.status === "pending" ? "active" : user.status,
    };
    this.users.set(id, verified);
    return verified;
  }

  async verifyPhone(id: string, phone: string): Promise<DirectoryUser> {
    this.guard();
    const user = this.users.get(id);
    if (!user) throw new UserServiceError(404, "User not found");
    if (user.phone !== phone) {
      throw new UserServiceError(
        409,
        "Phone does not match the user's current phone",
      );
    }
    const verified: DirectoryUser = {
      ...user,
      phoneVerified: true,
      status: user.status === "pending" ? "active" : user.status,
    };
    this.users.set(id, verified);
    return verified;
  }

  async recordLogin(id: string, provider: string): Promise<void> {
    this.guard();
    this.logins.push({ id, provider });
  }

  async getAccess(id: string): Promise<UserAccess | null> {
    this.guard();
    const user = this.users.get(id);
    return user
      ? { status: user.status, permissions: this.permissions.get(id) ?? [] }
      : null;
  }

  async findByEmail(email: string): Promise<DirectoryUser | null> {
    this.guard();
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  private guard(): void {
    if (this.unavailable) {
      throw new UserServiceError(503, "User service is unavailable");
    }
  }
}

export class FakeNotifications implements NotificationSender {
  readonly sent: { templateKey: string; to: string; variables: Json }[] = [];
  failing = false;

  async sendEmail(
    templateKey: string,
    to: string,
    variables: Record<string, string>,
  ): Promise<void> {
    if (this.failing) throw new Error("notification-service is down");
    this.sent.push({ templateKey, to, variables });
  }

  async waitFor(count: number): Promise<void> {
    for (let i = 0; i < 50 && this.sent.length < count; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  tokenFrom(index = this.sent.length - 1): string {
    return new URL(this.sent[index].variables.verifyUrl).searchParams.get(
      "token",
    )!;
  }
}

export class FakeSms implements SmsSender {
  readonly sent: { to: string; message: string }[] = [];

  async sendSms(to: string, message: string): Promise<void> {
    this.sent.push({ to, message });
  }

  /** The 6-digit OTP of the latest SMS sent to `to`. */
  otpFor(to: string): string {
    const sms = [...this.sent].reverse().find((item) => item.to === to);
    const code = sms?.message.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`No OTP was sent to ${to}`);
    return code;
  }
}

export class CapturingAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];

  record(event: AuditEvent): void {
    this.events.push(event);
  }

  async next(predicate: (event: AuditEvent) => boolean): Promise<AuditEvent> {
    for (let i = 0; i < 50; i += 1) {
      const found = this.events.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected audit event was not recorded");
  }
}

export interface TestServer {
  baseUrl: string;
  api: Api;
  users: FakeUserDirectory;
  notifications: FakeNotifications;
  sms: FakeSms;
  audits: CapturingAuditSink;
  privateKey: KeyObject;
  mongoose: typeof import("mongoose").default;
  register(email: string, password?: string): Promise<Json>;
  login(email: string, options?: Json): Promise<Json>;
  startRateLimited(): Promise<{ api: Api; close(): Promise<void> }>;
  close(): Promise<void>;
}

export async function startTestServer(
  dbName: string,
  { rateLimit = false }: { rateLimit?: boolean } = {},
): Promise<TestServer> {
  assert.match(dbName, /_test/, "tests must use a *_test database");
  process.env.MONGODB_DB_NAME = dbName;

  const { connectMongo, disconnectMongo, isMongoConnected } =
    await import("../../src/infrastructure/database/mongodb/connection.js");
  const { createApp } = await import("../../src/presentation/app.js");
  const { createRoutes, createSeeder } = await import("../../src/container.js");
  const { BcryptPasswordHasher } =
    await import("../../src/infrastructure/security/bcrypt_password_hasher.js");
  const { JoseAccessTokenService } =
    await import("../../src/infrastructure/security/jose_access_token_service.js");
  const { generatePrivateKey } =
    await import("../../src/infrastructure/security/rsa_key_file.js");
  const mongoose = (await import("mongoose")).default;

  await connectMongo();
  assert.equal(mongoose.connection.db?.databaseName, dbName);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();

  const users = new FakeUserDirectory();
  const privateKey = generatePrivateKey();
  const passwordHasher = new BcryptPasswordHasher(4);
  const notifications = new FakeNotifications();
  const sms = new FakeSms();
  const audits = new CapturingAuditSink();
  const external = {
    userDirectory: users,
    passwordHasher,
    accessTokens: new JoseAccessTokenService(privateKey, JWT_OPTIONS),
    notifications,
    smsSender: sms,
    auditSink: audits,
  };

  async function listen(withRateLimit: boolean) {
    const routes = createRoutes(external, { rateLimit: withRateLimit });
    const server: Server = createApp(routes, isMongoConnected).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const api: Api = async (method, path, options = {}) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
      };
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body:
          options.raw ??
          (options.body === undefined
            ? undefined
            : JSON.stringify(options.body)),
      });
      const text = await res.text();
      return {
        status: res.status,
        body: text ? JSON.parse(text) : {},
        headers: res.headers,
      };
    };
    const close = () =>
      new Promise<void>((resolve) => server.close(() => resolve()));
    return { baseUrl, api, close };
  }

  const { baseUrl, api, close } = await listen(rateLimit);

  const seeder = createSeeder({ userDirectory: users, passwordHasher });

  return {
    baseUrl,
    api,
    users,
    notifications,
    sms,
    audits,
    privateKey,
    mongoose,
    async register(email, password = TEST_PASSWORD) {
      const user = users.add({ email });
      await seeder.run({ email, password });
      return user;
    },
    async login(email, options = {}) {
      const res = await api("POST", "/api/auth/login", {
        body: {
          email,
          password: TEST_PASSWORD,
          device: WEB_DEVICE,
          ...options,
        },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body;
    },
    startRateLimited: () => listen(true),
    async close() {
      await close();
      await mongoose.connection.dropDatabase();
      await disconnectMongo();
    },
  };
}
