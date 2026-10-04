import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import {
  FakeUserDirectory,
  JWT_OPTIONS,
  startTestServer,
  TEST_PASSWORD,
  WEB_DEVICE,
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
    body?: unknown;
    raw?: string;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Json> {
  const path = template.replace("{id}", options.id ?? "");
  const res = await server.api(method.toUpperCase(), path, options);
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
