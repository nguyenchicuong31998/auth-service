import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import {
  FakeNotifications,
  FakeUserDirectory,
  JWT_OPTIONS,
  startTestServer,
  TEST_PASSWORD,
  WEB_DEVICE,
  type Api,
  type Json,
  type TestServer,
} from "./helpers/test_server.js";

const Ajv = AjvModule.default;
const addFormats = addFormatsModule.default;

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
type Method = (typeof METHODS)[number];
type Schema = Record<string, any>;

let server: TestServer;
let spec: Json;
let ajv: InstanceType<typeof Ajv>;
const covered = new Set<string>();

function strict(schema: Schema): Schema {
  if (!schema || typeof schema !== "object") return schema;
  const copy: Schema = { ...schema };
  if (copy.properties) {
    copy.properties = Object.fromEntries(
      Object.entries(copy.properties).map(([key, value]) => [
        key,
        strict(value as Schema),
      ]),
    );
    copy.additionalProperties ??= false;
  }
  if (copy.items) copy.items = strict(copy.items);
  return copy;
}

function validate(schema: Schema, data: unknown, label: string): void {
  const check = ajv.compile(strict(schema));
  assert.ok(
    check(data),
    `${label}: ${ajv.errorsText(check.errors)}\n${JSON.stringify(data).slice(0, 300)}`,
  );
}

async function call(
  method: Method,
  template: string,
  expected: number,
  options: {
    id?: string;
    api?: Api;
    query?: string;
    body?: unknown;
    raw?: string;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Json> {
  const path =
    template.replace("{id}", options.id ?? "") +
    (options.query ? `?${options.query}` : "");
  const res = await (options.api ?? server.api)(
    method.toUpperCase(),
    path,
    options,
  );
  const label = `${method.toUpperCase()} ${template} -> ${res.status}`;
  assert.equal(res.status, expected, `${label} ${JSON.stringify(res.body)}`);

  const operation = spec.paths[template]?.[method];
  assert.ok(operation, `${method.toUpperCase()} ${template} is not documented`);
  const response = operation.responses[String(res.status)];
  assert.ok(response, `${label} is not documented`);
  const schema = response.content?.["application/json"]?.schema;
  if (schema) validate(schema, res.body, label);
  else assert.deepEqual(res.body, {}, `${label} must have no body`);

  covered.add(`${method} ${template} ${res.status}`);
  return res.body;
}

async function loginAs(email: string, device: Json = WEB_DEVICE) {
  return call("post", "/api/auth/login", 200, {
    body: { email, password: TEST_PASSWORD, device },
  });
}

before(async () => {
  server = await startTestServer("auth_service_contract_test");
  const { openApiSpec } =
    await import("../src/presentation/docs/openapi_spec.js");
  spec = (await SwaggerParser.dereference(
    structuredClone(openApiSpec) as never,
  )) as Json;
  ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
});

after(async () => {
  await server?.close();
});

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3 document", async () => {
    const { openApiSpec } =
      await import("../src/presentation/docs/openapi_spec.js");
    await SwaggerParser.validate(structuredClone(openApiSpec) as never);
  });

  it("documents exactly the routes Express serves", async () => {
    const { createRoutes } = await import("../src/container.js");
    const { BcryptPasswordHasher } =
      await import("../src/infrastructure/security/bcrypt_password_hasher.js");
    const { JoseAccessTokenService } =
      await import("../src/infrastructure/security/jose_access_token_service.js");
    const routes = createRoutes({
      userDirectory: new FakeUserDirectory(),
      passwordHasher: new BcryptPasswordHasher(4),
      accessTokens: new JoseAccessTokenService(server.privateKey, JWT_OPTIONS),
      notifications: new FakeNotifications(),
    });

    const served = new Set<string>(["get /health"]);
    for (const { path, router } of routes) {
      for (const layer of (router as unknown as { stack: Json[] }).stack) {
        if (!layer.route) continue;
        const routePath = layer.route.path === "/" ? "" : layer.route.path;
        const template = `${path}${routePath}`.replace(/:(\w+)/g, "{$1}");
        for (const method of Object.keys(layer.route.methods)) {
          served.add(`${method} ${template}`);
        }
      }
    }

    const documented = new Set<string>();
    for (const [path, item] of Object.entries(spec.paths as Json)) {
      for (const method of METHODS) {
        if (item[method]) documented.add(`${method} ${path}`);
      }
    }

    assert.deepEqual(
      [...served].filter((r) => !documented.has(r)),
      [],
      "served but not documented",
    );
    assert.deepEqual(
      [...documented].filter((r) => !served.has(r)),
      [],
      "documented but not served",
    );
  });

  it("has examples that match their schemas", () => {
    for (const [path, item] of Object.entries(spec.paths as Json)) {
      for (const method of METHODS) {
        const operation = item[method];
        if (!operation) continue;
        const body = operation.requestBody?.content?.["application/json"];
        for (const [name, example] of Object.entries(
          (body?.examples ?? {}) as Json,
        )) {
          validate(
            body.schema,
            example.value,
            `${method} ${path} request ${name}`,
          );
        }
        for (const [status, response] of Object.entries(
          operation.responses as Json,
        )) {
          const content = response.content?.["application/json"];
          if (!content) continue;
          if (content.example !== undefined) {
            validate(
              content.schema,
              content.example,
              `${method} ${path} ${status}`,
            );
          }
          for (const [name, example] of Object.entries(
            (content.examples ?? {}) as Json,
          )) {
            validate(
              content.schema,
              example.value,
              `${method} ${path} ${status} ${name}`,
            );
          }
        }
      }
    }
  });
});

describe("every documented response is real", () => {
  it("health and keys", async () => {
    await call("get", "/health", 200);
    await call("get", "/.well-known/jwks.json", 200);
  });

  it("register", async () => {
    const body = {
      fullName: "Contract",
      email: "contract@example.com",
      password: TEST_PASSWORD,
    };
    await call("post", "/api/auth/register", 201, { body });
    await call("post", "/api/auth/register", 409, { body });
    await call("post", "/api/auth/register", 400, {
      body: { ...body, password: "short" },
    });
    server.users.unavailable = true;
    try {
      await call("post", "/api/auth/register", 503, {
        body: { ...body, email: "down@example.com" },
      });
    } finally {
      server.users.unavailable = false;
    }
  });

  it("login, refresh, password, logout", async () => {
    const user = await server.register("flow@example.com");
    const tokens = await loginAs("flow@example.com");
    await call("post", "/api/auth/login", 400, {
      body: { email: "flow@example.com" },
    });
    await call("post", "/api/auth/login", 401, {
      body: {
        email: "flow@example.com",
        password: "wrong-password",
        device: WEB_DEVICE,
      },
    });

    const rotated = await call("post", "/api/auth/refresh", 200, {
      body: { refreshToken: tokens.refreshToken },
    });
    await call("post", "/api/auth/refresh", 400, { body: {} });
    await call("post", "/api/auth/refresh", 401, {
      body: { refreshToken: "garbage" },
    });

    server.users.unavailable = true;
    try {
      await call("post", "/api/auth/refresh", 503, {
        body: { refreshToken: rotated.refreshToken },
      });
      await call("post", "/api/auth/login", 503, {
        body: {
          email: "flow@example.com",
          password: TEST_PASSWORD,
          device: WEB_DEVICE,
        },
      });
    } finally {
      server.users.unavailable = false;
    }

    await call("put", "/api/auth/password", 400, {
      token: rotated.accessToken,
      body: { currentPassword: "wrong-password", newPassword: "Another@123" },
    });
    await call("put", "/api/auth/password", 401, {
      body: { currentPassword: TEST_PASSWORD, newPassword: "Another@123" },
    });
    await call("put", "/api/auth/password", 204, {
      token: rotated.accessToken,
      body: {
        currentPassword: TEST_PASSWORD,
        newPassword: TEST_PASSWORD + "!",
      },
    });

    await call("post", "/api/auth/logout", 204, { token: rotated.accessToken });
    await call("post", "/api/auth/logout", 401, { token: rotated.accessToken });

    server.users.setStatus(user.id, "blocked");
    await call("post", "/api/auth/login", 403, {
      body: {
        email: "flow@example.com",
        password: TEST_PASSWORD + "!",
        device: WEB_DEVICE,
      },
    });
  });

  it("refresh is refused for a blocked account", async () => {
    const user = await server.register("blocked@example.com");
    const tokens = await loginAs("blocked@example.com");
    server.users.setStatus(user.id, "blocked");
    await call("post", "/api/auth/refresh", 403, {
      body: { refreshToken: tokens.refreshToken },
    });
  });

  it("logout-all, sessions and devices", async () => {
    await server.register("owner@example.com");
    const web = await loginAs("owner@example.com");
    const phone = await loginAs("owner@example.com", {
      deviceName: "Pixel",
      deviceType: "ANDROID",
    });

    await call("get", "/api/auth/sessions", 200, { token: web.accessToken });
    await call("get", "/api/auth/sessions", 401);
    await call("delete", "/api/auth/sessions/{id}", 400, {
      id: "abc",
      token: web.accessToken,
    });
    await call("delete", "/api/auth/sessions/{id}", 404, {
      id: randomUUID(),
      token: web.accessToken,
    });
    await call("delete", "/api/auth/sessions/{id}", 401, {
      id: phone.sessionId,
    });
    await call("delete", "/api/auth/sessions/{id}", 204, {
      id: phone.sessionId,
      token: web.accessToken,
    });

    await call("get", "/api/auth/devices", 200, { token: web.accessToken });
    await call("get", "/api/auth/devices", 401);
    await call("patch", "/api/auth/devices/{id}", 200, {
      id: web.deviceId,
      token: web.accessToken,
      body: { deviceName: "Laptop" },
    });
    await call("patch", "/api/auth/devices/{id}", 400, {
      id: web.deviceId,
      token: web.accessToken,
      body: {},
    });
    await call("patch", "/api/auth/devices/{id}", 404, {
      id: randomUUID(),
      token: web.accessToken,
      body: { deviceName: "x" },
    });
    await call("patch", "/api/auth/devices/{id}", 401, {
      id: web.deviceId,
      body: { deviceName: "x" },
    });

    await call("post", "/api/auth/logout-all", 204, { token: web.accessToken });
    await call("post", "/api/auth/logout-all", 401, { token: web.accessToken });

    const again = await loginAs("owner@example.com", {
      ...WEB_DEVICE,
      id: web.deviceId,
    });
    await call("patch", "/api/auth/devices/{id}", 200, {
      id: again.deviceId,
      token: again.accessToken,
      body: { isActive: false },
    });
    await call("post", "/api/auth/login", 403, {
      body: {
        email: "owner@example.com",
        password: TEST_PASSWORD,
        device: { ...WEB_DEVICE, id: again.deviceId },
      },
    });
  });

  it("oauth clients and the token endpoint", async () => {
    const admin = await server.register("oauth-admin@example.com");
    server.users.grant(admin.id, [
      "oauth-client:create",
      "oauth-client:read",
      "oauth-client:update",
      "oauth-client:delete",
      "user:read",
    ]);
    const token = (await loginAs("oauth-admin@example.com")).accessToken;
    await server.register("no-perm@example.com");
    const noPerm = (await loginAs("no-perm@example.com")).accessToken;
    const missing = randomUUID();
    const whileDown = async (fn: () => Promise<unknown>) => {
      server.users.unavailable = true;
      try {
        await fn();
      } finally {
        server.users.unavailable = false;
      }
    };

    const list = "/api/oauth-clients";
    const one = "/api/oauth-clients/{id}";
    const secret = "/api/oauth-clients/{id}/secret";
    const body = { name: "contract-client", scopes: ["user:read"] };

    const client = await call("post", list, 201, { token, body });
    await call("post", list, 400, { token, body: { name: "x" } });
    await call("post", list, 401, { body });
    await call("post", list, 403, {
      token,
      body: { name: "x", scopes: ["user:delete"] },
    });
    await whileDown(() => call("post", list, 503, { token, body }));

    await call("get", list, 200, { token });
    await call("get", list, 400, { token, query: "status=bad" });
    await call("get", list, 401);
    await call("get", list, 403, { token: noPerm });
    await whileDown(() => call("get", list, 503, { token }));

    await call("get", one, 200, { id: client.id, token });
    await call("get", one, 400, { id: "abc", token });
    await call("get", one, 401, { id: client.id });
    await call("get", one, 403, { id: client.id, token: noPerm });
    await call("get", one, 404, { id: missing, token });
    await whileDown(() => call("get", one, 503, { id: client.id, token }));

    const tokenBody = {
      grant_type: "client_credentials",
      client_id: client.clientId,
      client_secret: client.clientSecret,
    };
    await call("post", "/oauth/token", 200, { body: tokenBody });
    await call("post", "/oauth/token", 400, { body: {} });
    await call("post", "/oauth/token", 401, {
      body: { ...tokenBody, client_secret: "wrong" },
    });
    await whileDown(() =>
      call("post", "/oauth/token", 503, { body: tokenBody }),
    );

    await call("patch", one, 200, {
      id: client.id,
      token,
      body: { name: "renamed" },
    });
    await call("patch", one, 400, { id: client.id, token, body: {} });
    await call("patch", one, 401, { id: client.id, body: { name: "x" } });
    await call("patch", one, 403, {
      id: client.id,
      token: noPerm,
      body: { name: "x" },
    });
    await call("patch", one, 404, { id: missing, token, body: { name: "x" } });
    await whileDown(() =>
      call("patch", one, 503, { id: client.id, token, body: { name: "x" } }),
    );

    await call("post", secret, 200, { id: client.id, token });
    await call("post", secret, 400, { id: "abc", token });
    await call("post", secret, 401, { id: client.id });
    await call("post", secret, 403, { id: client.id, token: noPerm });
    await call("post", secret, 404, { id: missing, token });
    await whileDown(() => call("post", secret, 503, { id: client.id, token }));

    await call("patch", one, 200, {
      id: client.id,
      token,
      body: { status: "revoked" },
    });
    await call("patch", one, 409, {
      id: client.id,
      token,
      body: { status: "active" },
    });
    await call("post", secret, 409, { id: client.id, token });

    await call("delete", one, 400, { id: "abc", token });
    await call("delete", one, 401, { id: client.id });
    await call("delete", one, 403, { id: client.id, token: noPerm });
    await whileDown(() => call("delete", one, 503, { id: client.id, token }));
    await call("delete", one, 204, { id: client.id, token });
    await call("delete", one, 404, { id: client.id, token });
  });

  it("email verification", async () => {
    const before = server.notifications.sent.length;
    await call("post", "/api/auth/register", 201, {
      body: {
        fullName: "Verify Contract",
        email: "verify-contract@example.com",
        password: TEST_PASSWORD,
      },
    });
    await server.notifications.waitFor(before + 1);
    const token = server.notifications.tokenFrom();

    const verify = "/api/auth/verify-email";
    await call("post", verify, 400, { body: {} });
    server.users.unavailable = true;
    try {
      await call("post", verify, 503, { body: { token } });
    } finally {
      server.users.unavailable = false;
    }

    await call("post", "/api/auth/register", 201, {
      body: {
        fullName: "Changed Contract",
        email: "changed-contract@example.com",
        password: TEST_PASSWORD,
      },
    });
    await server.notifications.waitFor(before + 2);
    const changedToken = server.notifications.tokenFrom();
    const changed = [...server.users.users.values()].find(
      (user) => user.email === "changed-contract@example.com",
    )!;
    server.users.users.set(changed.id, {
      ...changed,
      email: "new@example.com",
    });
    await call("post", verify, 409, { body: { token: changedToken } });

    const resend = "/api/auth/verify-email/resend";
    await call("post", resend, 202, {
      body: { email: "verify-contract@example.com" },
    });
    await call("post", resend, 400, { body: { email: "bad" } });

    const issued = server.notifications.sent.length;
    await call("post", resend, 202, {
      body: { email: "verify-contract@example.com" },
    });
    assert.equal(server.notifications.sent.length, issued);
    const fresh = server.notifications.sent
      .filter((mail) => mail.to === "verify-contract@example.com")
      .map((mail) =>
        new URL(mail.variables.verifyUrl).searchParams.get("token")!,
      )
      .at(-1)!;
    await call("post", verify, 200, { body: { token: fresh } });
  });

  it("429 on every rate-limited endpoint", async () => {
    const limited = await server.startRateLimited();
    const hammer = async (
      path: string,
      body: Json,
      attempts: number,
    ): Promise<void> => {
      for (let i = 0; i < attempts; i += 1) {
        await limited.api("POST", path, { body });
      }
      await call("post", path, 429, { api: limited.api, body });
    };
    try {
      await hammer(
        "/api/auth/login",
        { email: "nobody@example.com", password: "x", device: WEB_DEVICE },
        5,
      );
      await hammer("/api/auth/register", { email: "bad" }, 10);
      await hammer("/api/auth/refresh", { refreshToken: "x" }, 100);
      await hammer("/api/auth/verify-email", { token: "x" }, 0);
      await hammer(
        "/api/auth/verify-email/resend",
        { email: "nobody@example.com" },
        5,
      );
      await hammer(
        "/oauth/token",
        {
          grant_type: "client_credentials",
          client_id: "cli_x",
          client_secret: "x",
        },
        10,
      );
    } finally {
      await limited.close();
    }
  });

  it("413 and 415 on every endpoint with a body", async () => {
    await server.register("body@example.com");
    const { accessToken, deviceId } = await loginAs("body@example.com");
    for (const [path, item] of Object.entries(spec.paths as Json)) {
      for (const method of METHODS) {
        if (!item[method]?.requestBody) continue;
        const options = { id: deviceId, token: accessToken };
        await call(method, path, 413, {
          ...options,
          body: { x: "x".repeat(200_000) },
        });
        await call(method, path, 415, {
          ...options,
          raw: "{}",
          headers: { "Content-Type": "application/json; charset=latin9" },
        });
      }
    }
  });

  it("covers every documented operation and status", () => {
    const missing: string[] = [];
    for (const [path, item] of Object.entries(spec.paths as Json)) {
      for (const method of METHODS) {
        for (const status of Object.keys(item[method]?.responses ?? {})) {
          const key = `${method} ${path} ${status}`;
          if (!covered.has(key)) missing.push(key);
        }
      }
    }
    assert.deepEqual(missing, []);
  });
});
