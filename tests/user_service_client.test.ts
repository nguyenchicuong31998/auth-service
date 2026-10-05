import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createLocalJWKSet, jwtVerify } from "jose";
import { DuplicateKeyError } from "../src/domain/errors/duplicate_key_error.js";
import { UserServiceError } from "../src/domain/errors/user_service_error.js";
import { UserServiceClient } from "../src/infrastructure/http/user_service_client.js";
import { JwtSigner } from "../src/infrastructure/security/jwt_signer.js";
import { generatePrivateKey } from "../src/infrastructure/security/rsa_key_file.js";
import { ServiceTokenProvider } from "../src/infrastructure/security/service_token_provider.js";
import { JWT_OPTIONS } from "./helpers/test_server.js";

const USER = {
  id: "2e98e54c-aaf6-4e5b-a596-1d384a93487e",
  fullName: "Nguyen Van A",
  email: "a@example.com",
  status: "pending",
  phone: null,
};

const privateKey = generatePrivateKey();
const jwks = { keys: [new JwtSigner(privateKey, JWT_OPTIONS).jwk] };
const requests: IncomingMessage[] = [];
let reply: (req: IncomingMessage) => [number, unknown] = () => [200, USER];
let server: Server;
let client: UserServiceClient;

before(async () => {
  server = createServer((req, res) => {
    requests.push(req);
    const [status, body] = reply(req);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  client = new UserServiceClient(
    `http://127.0.0.1:${port}`,
    new ServiceTokenProvider(privateKey, {
      ...JWT_OPTIONS,
      serviceName: "auth-service",
      scopes: ["user:create", "user:read"],
    }),
  );
});

after(() => {
  server.close();
});

describe("UserServiceClient", () => {
  it("authenticates with a short-lived, cached service token", async () => {
    requests.length = 0;
    await client.findById(USER.id);
    await client.findById(USER.id);

    const tokens = requests.map((req) =>
      req.headers.authorization?.replace(/^Bearer /, ""),
    );
    assert.equal(tokens[0], tokens[1], "token is cached");

    const { payload } = await jwtVerify(tokens[0]!, createLocalJWKSet(jwks), {
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience,
    });
    assert.equal(payload.kind, "service");
    assert.equal(payload.sub, "auth-service");
    assert.equal(payload.scope, "user:create user:read");
    assert.equal(payload.exp! - payload.iat!, 300);
  });

  it("maps user-service responses", async () => {
    reply = () => [200, USER];
    assert.deepEqual(await client.findById(USER.id), {
      id: USER.id,
      fullName: USER.fullName,
      email: USER.email,
      phone: null,
      status: USER.status,
      emailVerified: false,
      phoneVerified: false,
    });

    reply = () => [404, { message: "User not found" }];
    assert.equal(await client.findById(USER.id), null);

    reply = () => [200, { items: [] }];
    assert.equal(await client.findByEmail("x@example.com"), null);
    assert.match(requests.at(-1)!.url!, /email=x%40example.com&limit=1/);

    reply = () => [409, { message: "Email already exists" }];
    await assert.rejects(
      client.register({
        fullName: "A",
        email: "a@example.com",
        phone: null,
        registeredFrom: "manual",
      }),
      DuplicateKeyError,
    );

    reply = () => [403, { message: "Missing permission: user:create" }];
    await assert.rejects(
      client.register({
        fullName: "A",
        email: "a@example.com",
        phone: null,
        registeredFrom: "manual",
      }),
      (error) => error instanceof UserServiceError && error.status === 503,
    );
  });

  it("reports 503 when user-service cannot be reached", async () => {
    const offline = new UserServiceClient(
      "http://127.0.0.1:1",
      new ServiceTokenProvider(privateKey, {
        ...JWT_OPTIONS,
        serviceName: "auth-service",
        scopes: [],
      }),
    );
    await assert.rejects(
      offline.findById(USER.id),
      (error) => error instanceof UserServiceError && error.status === 503,
    );
  });
});
