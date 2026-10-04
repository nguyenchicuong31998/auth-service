import assert from "node:assert/strict";
import { randomUUID, type KeyObject } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DuplicateKeyError } from "../../src/domain/errors/duplicate_key_error.js";
import { UserServiceError } from "../../src/domain/errors/user_service_error.js";
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
  unavailable = false;

  add(data: Partial<DirectoryUser> & { email: string }): DirectoryUser {
    const user: DirectoryUser = {
      id: randomUUID(),
      fullName: "Test User",
      status: "active",
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
    if ([...this.users.values()].some((user) => user.email === data.email)) {
      throw new DuplicateKeyError("email");
    }
    return this.add({ ...data, status: "pending" });
  }

  async findById(id: string): Promise<DirectoryUser | null> {
    this.guard();
    return this.users.get(id) ?? null;
  }

  grant(id: string, permissions: string[]): void {
    this.permissions.set(id, permissions);
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

export interface TestServer {
  baseUrl: string;
  api: Api;
  users: FakeUserDirectory;
  privateKey: KeyObject;
  mongoose: typeof import("mongoose").default;
  register(email: string, password?: string): Promise<Json>;
  login(email: string, options?: Json): Promise<Json>;
  close(): Promise<void>;
}

export async function startTestServer(dbName: string): Promise<TestServer> {
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
  const routes = createRoutes({
    userDirectory: users,
    passwordHasher,
    accessTokens: new JoseAccessTokenService(privateKey, JWT_OPTIONS),
  });

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
        (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
    const text = await res.text();
    return {
      status: res.status,
      body: text ? JSON.parse(text) : {},
      headers: res.headers,
    };
  };

  const seeder = createSeeder({ userDirectory: users, passwordHasher });

  return {
    baseUrl,
    api,
    users,
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
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await mongoose.connection.dropDatabase();
      await disconnectMongo();
    },
  };
}
