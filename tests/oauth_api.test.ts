import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createLocalJWKSet, jwtVerify } from "jose";
import {
  JWT_OPTIONS,
  startTestServer,
  type Json,
  type TestServer,
} from "./helpers/test_server.js";

const ALL = [
  "oauth-client:create",
  "oauth-client:read",
  "oauth-client:update",
  "oauth-client:delete",
];

let server: TestServer;
let emailSeq = 0;

async function adminWith(extra: string[]) {
  const email = `oauth-admin-${++emailSeq}@example.com`;
  const user = await server.register(email);
  server.users.grant(user.id, [...ALL, ...extra]);
  const { accessToken } = await server.login(email);
  return { user, token: accessToken as string };
}

async function createClient(token: string, scopes: string[], name = "svc") {
  const res = await server.api("POST", "/api/oauth-clients", {
    token,
    body: { name, scopes },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const requestToken = (body: Json, headers?: Record<string, string>) =>
  server.api("POST", "/oauth/token", { body, headers });

const credentials = (client: Json, extra: Json = {}) => ({
  grant_type: "client_credentials",
  client_id: client.clientId,
  client_secret: client.clientSecret,
  ...extra,
});

before(async () => {
  server = await startTestServer("auth_service_oauth_test");
});

after(async () => {
  await server?.close();
});

describe("OAuth client secrets", () => {
  it("returns the secret once and stores only its SHA-256 hash", async () => {
    const { token } = await adminWith(["user:read"]);
    const client = await createClient(token, ["user:read"]);
    assert.match(client.clientId, /^cli_/);
    assert.ok(client.clientSecret.length >= 40);
    assert.equal(client.clientSecretHash, undefined);

    const raw = await server.mongoose.connection
      .collection("oauth_clients")
      .findOne({ clientId: client.clientId });
    assert.match(raw?.clientSecretHash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(raw).includes(client.clientSecret));

    const read = await server.api("GET", `/api/oauth-clients/${client.id}`, {
      token,
    });
    const listed = await server.api("GET", "/api/oauth-clients", { token });
    for (const body of [read.body, ...listed.body.items]) {
      assert.equal(body.clientSecret, undefined);
      assert.equal(body.clientSecretHash, undefined);
    }
  });

  it("invalidates the old secret when rotating", async () => {
    const { token } = await adminWith(["user:read"]);
    const client = await createClient(token, ["user:read"]);
    const rotated = await server.api(
      "POST",
      `/api/oauth-clients/${client.id}/secret`,
      { token },
    );
    assert.equal(rotated.headers.get("cache-control"), "no-store");
    assert.notEqual(rotated.body.clientSecret, client.clientSecret);
    assert.equal((await requestToken(credentials(client))).status, 401);
    assert.equal((await requestToken(credentials(rotated.body))).status, 200);
  });
});

describe("POST /oauth/token", () => {
  it("issues a short-lived service JWT verifiable with the JWKS", async () => {
    const { token } = await adminWith(["user:read", "user:create"]);
    const client = await createClient(token, ["user:create", "user:read"]);
    const res = await requestToken(credentials(client));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.body.token_type, "Bearer");
    assert.equal(res.body.expires_in, 600);
    assert.equal(res.body.scope, "user:create user:read");

    const jwks = await server.api("GET", "/.well-known/jwks.json");
    const { payload } = await jwtVerify(
      res.body.access_token,
      createLocalJWKSet(jwks.body),
      { issuer: JWT_OPTIONS.issuer, audience: JWT_OPTIONS.audience },
    );
    assert.equal(payload.kind, "service");
    assert.equal(payload.sub, client.clientId);
    assert.equal(payload.scope, "user:create user:read");
  });

  it("accepts HTTP Basic credentials and form-encoded bodies", async () => {
    const { token } = await adminWith(["user:read"]);
    const client = await createClient(token, ["user:read"]);
    const basic = Buffer.from(
      `${client.clientId}:${client.clientSecret}`,
    ).toString("base64");
    const res = await fetch(`${server.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: "grant_type=client_credentials&scope=user%3Aread",
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).scope, "user:read");
  });

  it("follows RFC 6749 error responses", async () => {
    const { token } = await adminWith(["user:read"]);
    const client = await createClient(token, ["user:read"]);
    const cases: [Json, number, string][] = [
      [{}, 400, "invalid_request"],
      [{ grant_type: "password" }, 400, "unsupported_grant_type"],
      [{ grant_type: "client_credentials" }, 401, "invalid_client"],
      [credentials(client, { client_secret: "wrong" }), 401, "invalid_client"],
      [
        credentials(client, { client_id: "cli_unknown" }),
        401,
        "invalid_client",
      ],
      [credentials(client, { scope: "user:delete" }), 400, "invalid_scope"],
      [credentials(client, { scope: "not a scope" }), 400, "invalid_scope"],
    ];
    for (const [body, status, error] of cases) {
      const res = await requestToken(body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.body.error, error);
      assert.ok(res.body.error_description);
    }
    const bad = await requestToken({ grant_type: "client_credentials" });
    assert.equal(bad.headers.get("www-authenticate"), 'Basic realm="oauth"');

    const malformed = await requestToken(
      { grant_type: "client_credentials" },
      { Authorization: "Basic %%%" },
    );
    assert.equal(malformed.status, 401);
  });

  it("is not accepted as a user token by auth-service", async () => {
    const { token } = await adminWith(["user:read"]);
    const client = await createClient(token, ["user:read"]);
    const { body } = await requestToken(credentials(client));
    const res = await server.api("GET", "/api/auth/sessions", {
      token: body.access_token,
    });
    assert.equal(res.status, 401);
  });
});

describe("privilege escalation", () => {
  it("cannot grant scopes the creator does not have", async () => {
    const { token } = await adminWith(["user:read"]);
    const res = await server.api("POST", "/api/oauth-clients", {
      token,
      body: { name: "evil", scopes: ["user:read", "user:delete"] },
    });
    assert.equal(res.status, 403);
    assert.equal(
      res.body.message,
      "Cannot grant scopes you do not have: user:delete",
    );

    const empty = await server.api("POST", "/api/oauth-clients", {
      token,
      body: { name: "empty", scopes: [] },
    });
    assert.equal(empty.status, 400);

    const client = await createClient(token, ["user:read"]);
    const update = await server.api(
      "PATCH",
      `/api/oauth-clients/${client.id}`,
      { token, body: { scopes: ["role:update"] } },
    );
    assert.equal(update.status, 403);
  });

  it("limits tokens to what the owner can still do", async () => {
    const { user, token } = await adminWith(["user:read", "user:create"]);
    const client = await createClient(token, ["user:create", "user:read"]);

    server.users.grant(user.id, [...ALL, "user:read"]);
    const reduced = await requestToken(credentials(client));
    assert.equal(reduced.body.scope, "user:read");
    const denied = await requestToken(
      credentials(client, { scope: "user:create" }),
    );
    assert.equal(denied.body.error, "invalid_scope");

    server.users.grant(user.id, ALL);
    const none = await requestToken(credentials(client));
    assert.equal(none.body.error, "invalid_scope");

    server.users.grant(user.id, [...ALL, "user:read"]);
    server.users.setStatus(user.id, "blocked");
    const blocked = await requestToken(credentials(client));
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.error, "invalid_client");
  });
});

describe("client lifecycle", () => {
  it("inactive clients are refused until reactivated; revoked is final", async () => {
    const { token } = await adminWith(["user:read"]);
    const client = await createClient(token, ["user:read"]);
    const patch = (body: Json) =>
      server.api("PATCH", `/api/oauth-clients/${client.id}`, { token, body });

    await patch({ status: "inactive" });
    assert.equal((await requestToken(credentials(client))).status, 401);
    await patch({ status: "active" });
    assert.equal((await requestToken(credentials(client))).status, 200);

    await patch({ status: "revoked" });
    assert.equal((await requestToken(credentials(client))).status, 401);
    const reactivate = await patch({ status: "active" });
    assert.equal(reactivate.status, 409);
  });

  it("deleted clients disappear and cannot get tokens", async () => {
    const { token } = await adminWith(["user:read"]);
    const client = await createClient(token, ["user:read"]);
    const del = await server.api("DELETE", `/api/oauth-clients/${client.id}`, {
      token,
    });
    assert.equal(del.status, 204);
    assert.equal((await requestToken(credentials(client))).status, 401);
    const read = await server.api("GET", `/api/oauth-clients/${client.id}`, {
      token,
    });
    assert.equal(read.status, 404);
  });

  it("requires the oauth-client permissions", async () => {
    const email = `plain-${++emailSeq}@example.com`;
    await server.register(email);
    const { accessToken } = await server.login(email);
    const res = await server.api("GET", "/api/oauth-clients", {
      token: accessToken,
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Missing permission: oauth-client:read");
  });
});
