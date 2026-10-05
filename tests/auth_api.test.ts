import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { SignJWT } from "jose";
import {
  JWT_OPTIONS,
  startTestServer,
  TEST_PASSWORD,
  WEB_DEVICE,
  type Json,
  type TestServer,
} from "./helpers/test_server.js";

let server: TestServer;
let emailSeq = 0;

const nextEmail = () => `user${++emailSeq}@example.com`;

async function signedIn(options: Json = {}) {
  const email = nextEmail();
  const user = await server.register(email);
  return { user, email, tokens: await server.login(email, options) };
}

const get = (path: string, token?: string) =>
  server.api("GET", path, { token });

const post = (path: string, body?: unknown, token?: string) =>
  server.api("POST", path, { body, token });

const sessionsCollection = () =>
  server.mongoose.connection.collection("sessions");

before(async () => {
  server = await startTestServer("auth_service_api_test");
});

after(async () => {
  await server?.close();
});

describe("POST /api/auth/register", () => {
  it("creates the user in user-service and a hashed password login", async () => {
    const email = nextEmail();
    const res = await post("/api/auth/register", {
      fullName: "  Nguyen Van A  ",
      email: email.toUpperCase(),
      password: TEST_PASSWORD,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.email, email);
    assert.equal(res.body.fullName, "Nguyen Van A");
    assert.equal(res.body.status, "pending");

    const identity = await server.mongoose.connection
      .collection("user_identities")
      .findOne({ providerAccountId: email });
    assert.equal(identity?.provider, "manual");
    assert.equal(identity?.userId, res.body.id);
    assert.match(identity?.password, /^\$2[aby]\$/);
    assert.notEqual(identity?.password, TEST_PASSWORD);

    const login = await post("/api/auth/login", {
      email,
      password: TEST_PASSWORD,
      device: WEB_DEVICE,
    });
    assert.equal(login.status, 200, "pending users can log in");
  });

  it("rejects an email that is already registered", async () => {
    const email = nextEmail();
    const body = { fullName: "A", email, password: TEST_PASSWORD };
    assert.equal((await post("/api/auth/register", body)).status, 201);
    const again = await post("/api/auth/register", body);
    assert.equal(again.status, 409);
    assert.equal(again.body.message, "Email already exists");
  });

  it("returns 409 when user-service already has the email", async () => {
    const email = nextEmail();
    server.users.add({ email });
    const res = await post("/api/auth/register", {
      fullName: "A",
      email,
      password: TEST_PASSWORD,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, "Email already exists");
  });

  it("validates the body", async () => {
    const cases: [unknown, string][] = [
      [{ email: "a@b.co", password: TEST_PASSWORD }, "fullName is required"],
      [
        { fullName: "A", email: "bad", password: TEST_PASSWORD },
        "email is invalid",
      ],
      [
        { fullName: "A", email: "a@b.co", password: "short" },
        "password must be at least 8 characters",
      ],
      [
        { fullName: "A", email: "a@b.co", password: "é".repeat(37) },
        "password must be at most 72 bytes",
      ],
      [[], "Request body must be a JSON object"],
    ];
    for (const [body, message] of cases) {
      const res = await post("/api/auth/register", body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, message);
    }
  });

  it("returns 503 when user-service is down", async () => {
    server.users.unavailable = true;
    try {
      const res = await post("/api/auth/register", {
        fullName: "A",
        email: nextEmail(),
        password: TEST_PASSWORD,
      });
      assert.equal(res.status, 503);
      assert.equal(res.body.message, "User service is unavailable");
    } finally {
      server.users.unavailable = false;
    }
  });
});

describe("POST /api/auth/login", () => {
  it("returns tokens, the device and the user", async () => {
    const { user, tokens } = await signedIn();
    assert.equal(tokens.tokenType, "Bearer");
    assert.equal(tokens.expiresIn, 900);
    assert.deepEqual(tokens.user, user);
    assert.match(tokens.refreshToken, new RegExp(`^${tokens.sessionId}\\.`));

    const session = await sessionsCollection().findOne({
      _id: tokens.sessionId as never,
    });
    assert.equal(session?.userId, user.id);
    assert.equal(session?.deviceId, tokens.deviceId);
    assert.notEqual(session?.refreshTokenHash, tokens.refreshToken);
    assert.ok(session?.ipAddress);
    assert.equal(session?.revokedAt, null);
  });

  it("does not reveal whether the email exists", async () => {
    const { email } = await signedIn();
    const wrongPassword = await post("/api/auth/login", {
      email,
      password: "wrong-password",
      device: WEB_DEVICE,
    });
    const unknownEmail = await post("/api/auth/login", {
      email: "nobody@example.com",
      password: "wrong-password",
      device: WEB_DEVICE,
    });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(unknownEmail.body, wrongPassword.body);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.headers.get("www-authenticate"), "Bearer");
  });

  it("rejects users that are not active or pending", async () => {
    const email = nextEmail();
    const user = await server.register(email);
    for (const status of ["blocked", "banned", "inactive"]) {
      server.users.setStatus(user.id, status);
      const res = await post("/api/auth/login", {
        email,
        password: TEST_PASSWORD,
        device: WEB_DEVICE,
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.message, `Account is ${status}`);
    }
  });

  it("reuses a known device and replaces its previous session", async () => {
    const { email, tokens: first } = await signedIn();
    const second = await server.login(email, {
      device: { ...WEB_DEVICE, id: first.deviceId, deviceName: "Renamed" },
    });
    assert.equal(second.deviceId, first.deviceId);
    assert.notEqual(second.sessionId, first.sessionId);

    const old = await sessionsCollection().findOne({
      _id: first.sessionId as never,
    });
    assert.equal(old?.revokedReason, "replaced");
    assert.equal(
      (await get("/api/auth/sessions", first.accessToken)).status,
      401,
    );

    const devices = await get("/api/auth/devices", second.accessToken);
    assert.equal(devices.body.length, 1);
    assert.equal(devices.body[0].deviceName, "Renamed");
  });

  it("creates a new device for an unknown or foreign device id", async () => {
    const { tokens: other } = await signedIn();
    const { email } = await signedIn();
    const res = await server.login(email, {
      device: { ...WEB_DEVICE, id: other.deviceId },
    });
    assert.notEqual(res.deviceId, other.deviceId);
    const unknown = await server.login(email, {
      device: { ...WEB_DEVICE, id: randomUUID() },
    });
    assert.notEqual(unknown.deviceId, res.deviceId);
  });

  it("keeps sessions on different devices", async () => {
    const { email, tokens: web } = await signedIn();
    const phone = await server.login(email, {
      device: { deviceName: "Pixel", deviceType: "ANDROID", fcmToken: "fcm-1" },
    });
    const sessions = await get("/api/auth/sessions", phone.accessToken);
    assert.equal(sessions.body.length, 2);
    assert.deepEqual(
      sessions.body.map((s: Json) => [s.id, s.current]).sort(),
      [
        [phone.sessionId, true],
        [web.sessionId, false],
      ].sort(),
    );
  });

  it("validates the body", async () => {
    const cases: [unknown, string][] = [
      [{ password: "x", device: WEB_DEVICE }, "email is required"],
      [{ email: "a@b.co", password: "x" }, "device is required"],
      [
        { email: "a@b.co", password: "x", device: "web" },
        "device must be a JSON object",
      ],
      [
        {
          email: "a@b.co",
          password: "x",
          device: { deviceName: "A", deviceType: "MAC" },
        },
        "device.deviceType must be one of: WEB, IOS, ANDROID",
      ],
      [
        {
          email: "a@b.co",
          password: "x",
          device: { ...WEB_DEVICE, id: "nope" },
        },
        "device.id must be a valid UUID",
      ],
      [
        { email: "a@b.co", password: "", device: WEB_DEVICE },
        "password must be a non-empty string",
      ],
    ];
    for (const [body, message] of cases) {
      const res = await post("/api/auth/login", body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, message);
    }
  });
});

describe("POST /api/auth/refresh", () => {
  it("rotates the refresh token and keeps the session", async () => {
    const { tokens } = await signedIn();
    const res = await post("/api/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.sessionId, tokens.sessionId);
    assert.notEqual(res.body.refreshToken, tokens.refreshToken);
    assert.equal(res.body.refreshTokenExpiresAt, tokens.refreshTokenExpiresAt);
    assert.equal(
      (await get("/api/auth/sessions", res.body.accessToken)).status,
      200,
    );
  });

  it("revokes the session when an old refresh token is reused", async () => {
    const { tokens } = await signedIn();
    const rotated = await post("/api/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    const reused = await post("/api/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    assert.equal(reused.status, 401);

    const session = await sessionsCollection().findOne({
      _id: tokens.sessionId as never,
    });
    assert.equal(session?.revokedReason, "refresh_token_reused");
    const latest = await post("/api/auth/refresh", {
      refreshToken: rotated.body.refreshToken,
    });
    assert.equal(latest.status, 401);
  });

  it("rejects malformed, unknown and expired refresh tokens", async () => {
    const { tokens } = await signedIn();
    for (const refreshToken of [
      "garbage",
      `${randomUUID()}.secret`,
      `${tokens.sessionId}.a.b`,
    ]) {
      const res = await post("/api/auth/refresh", { refreshToken });
      assert.equal(res.status, 401, refreshToken);
      assert.equal(res.body.message, "Invalid or expired refresh token");
    }
    await sessionsCollection().updateOne(
      { _id: tokens.sessionId as never },
      { $set: { expiredAt: new Date(Date.now() - 1000) } },
    );
    const expired = await post("/api/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    assert.equal(expired.status, 401);
  });

  it("revokes the session when the account was blocked", async () => {
    const { user, tokens } = await signedIn();
    server.users.setStatus(user.id, "blocked");
    const res = await post("/api/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Account is blocked");
    const session = await sessionsCollection().findOne({
      _id: tokens.sessionId as never,
    });
    assert.equal(session?.revokedReason, "account_disabled");
  });

  it("allows only one of two concurrent refreshes", async () => {
    const { tokens } = await signedIn();
    const results = await Promise.all([
      post("/api/auth/refresh", { refreshToken: tokens.refreshToken }),
      post("/api/auth/refresh", { refreshToken: tokens.refreshToken }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  });
});

describe("access token", () => {
  it("is a valid RS256 JWT verifiable with the published JWKS", async () => {
    const { createLocalJWKSet, jwtVerify } = await import("jose");
    const { user, tokens } = await signedIn();
    const jwks = await get("/.well-known/jwks.json");
    assert.equal(jwks.status, 200);
    assert.equal(jwks.headers.get("cache-control"), "public, max-age=300");
    assert.equal(
      JSON.stringify(jwks.body).includes('"d"'),
      false,
      "no private key parts",
    );

    const { payload, protectedHeader } = await jwtVerify(
      tokens.accessToken,
      createLocalJWKSet(jwks.body),
      { issuer: JWT_OPTIONS.issuer, audience: JWT_OPTIONS.audience },
    );
    assert.equal(protectedHeader.alg, "RS256");
    assert.equal(protectedHeader.kid, jwks.body.keys[0].kid);
    assert.equal(payload.sub, user.id);
    assert.equal(payload.sid, tokens.sessionId);
    assert.equal(payload.exp! - payload.iat!, 900);
  });

  it("rejects missing, malformed, forged, expired and wrong-audience tokens", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { user, tokens } = await signedIn();
    const sign = (key = server.privateKey, overrides: Json = {}) =>
      new SignJWT({
        kind: overrides.kind ?? "user",
        sid: tokens.sessionId,
      })
        .setProtectedHeader({ alg: "RS256" })
        .setSubject(user.id)
        .setIssuer(overrides.issuer ?? JWT_OPTIONS.issuer)
        .setAudience(overrides.audience ?? JWT_OPTIONS.audience)
        .setIssuedAt(overrides.iat ?? Math.floor(Date.now() / 1000))
        .setExpirationTime(overrides.exp ?? "5m")
        .sign(key);

    assert.equal((await get("/api/auth/sessions", await sign())).status, 200);

    const missing = await get("/api/auth/sessions");
    assert.equal(missing.status, 401);
    assert.equal(missing.body.message, "Missing bearer token");

    const forgedKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    }).privateKey;
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      "not-a-jwt",
      await sign(forgedKey),
      await sign(undefined, { audience: "other-api" }),
      await sign(undefined, { issuer: "evil" }),
      await sign(undefined, { iat: now - 120, exp: now - 60 }),
      await sign(undefined, { kind: "service" }),
      await sign(undefined, { kind: "admin" }),
    ];
    for (const token of bad) {
      const res = await get("/api/auth/sessions", token);
      assert.equal(res.status, 401);
      assert.equal(res.body.message, "Invalid or expired access token");
    }

    const basic = await server.api("GET", "/api/auth/sessions", {
      headers: { Authorization: `Basic ${tokens.accessToken}` },
    });
    assert.equal(basic.status, 401);
  });
});

describe("logout", () => {
  it("revokes only the current session", async () => {
    const { email, tokens: web } = await signedIn();
    const phone = await server.login(email, {
      device: { deviceName: "iPhone", deviceType: "IOS" },
    });
    assert.equal(
      (await post("/api/auth/logout", undefined, web.accessToken)).status,
      204,
    );
    assert.equal(
      (await get("/api/auth/sessions", web.accessToken)).status,
      401,
    );
    assert.equal(
      (await post("/api/auth/refresh", { refreshToken: web.refreshToken }))
        .status,
      401,
    );
    assert.equal(
      (await get("/api/auth/sessions", phone.accessToken)).status,
      200,
    );

    const session = await sessionsCollection().findOne({
      _id: web.sessionId as never,
    });
    assert.equal(session?.revokedReason, "logout");
    assert.ok(session?.revokedAt);
  });

  it("logout-all revokes every session of the user only", async () => {
    const { email, tokens: web } = await signedIn();
    const phone = await server.login(email, {
      device: { deviceName: "iPhone", deviceType: "IOS" },
    });
    const { tokens: stranger } = await signedIn();

    assert.equal(
      (await post("/api/auth/logout-all", undefined, web.accessToken)).status,
      204,
    );
    assert.equal(
      (await get("/api/auth/sessions", web.accessToken)).status,
      401,
    );
    assert.equal(
      (await get("/api/auth/sessions", phone.accessToken)).status,
      401,
    );
    assert.equal(
      (await get("/api/auth/sessions", stranger.accessToken)).status,
      200,
    );
  });
});

describe("PUT /api/auth/password", () => {
  it("changes the password and revokes the other sessions", async () => {
    const { email, tokens: web } = await signedIn();
    const phone = await server.login(email, {
      device: { deviceName: "iPhone", deviceType: "IOS" },
    });
    const newPassword = "NewPassword@456";
    const res = await server.api("PUT", "/api/auth/password", {
      token: web.accessToken,
      body: { currentPassword: TEST_PASSWORD, newPassword },
    });
    assert.equal(res.status, 204);

    assert.equal(
      (await get("/api/auth/sessions", web.accessToken)).status,
      200,
    );
    assert.equal(
      (await get("/api/auth/sessions", phone.accessToken)).status,
      401,
    );
    const old = await post("/api/auth/login", {
      email,
      password: TEST_PASSWORD,
      device: WEB_DEVICE,
    });
    assert.equal(old.status, 401);
    const fresh = await post("/api/auth/login", {
      email,
      password: newPassword,
      device: WEB_DEVICE,
    });
    assert.equal(fresh.status, 200);
  });

  it("rejects a wrong current password and an unchanged password", async () => {
    const { tokens } = await signedIn();
    const cases: [Json, string][] = [
      [
        { currentPassword: "wrong-password", newPassword: "Another@123" },
        "Current password is incorrect",
      ],
      [
        { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD },
        "newPassword must be different from currentPassword",
      ],
      [
        { currentPassword: TEST_PASSWORD, newPassword: "short" },
        "newPassword must be at least 8 characters",
      ],
      [{ currentPassword: TEST_PASSWORD }, "newPassword is required"],
    ];
    for (const [body, message] of cases) {
      const res = await server.api("PUT", "/api/auth/password", {
        token: tokens.accessToken,
        body,
      });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, message);
    }
  });
});

describe("sessions", () => {
  it("revokes another session of the same user", async () => {
    const { email, tokens: web } = await signedIn();
    const phone = await server.login(email, {
      device: { deviceName: "iPhone", deviceType: "IOS" },
    });
    const res = await server.api(
      "DELETE",
      `/api/auth/sessions/${phone.sessionId}`,
      {
        token: web.accessToken,
      },
    );
    assert.equal(res.status, 204);
    assert.equal(
      (await get("/api/auth/sessions", phone.accessToken)).status,
      401,
    );
    const again = await server.api(
      "DELETE",
      `/api/auth/sessions/${phone.sessionId}`,
      {
        token: web.accessToken,
      },
    );
    assert.equal(again.status, 404);
  });

  it("cannot see or revoke sessions of another user", async () => {
    const { tokens: mine } = await signedIn();
    const { tokens: theirs } = await signedIn();
    const list = await get("/api/auth/sessions", mine.accessToken);
    assert.deepEqual(
      list.body.map((s: Json) => s.id),
      [mine.sessionId],
    );

    const res = await server.api(
      "DELETE",
      `/api/auth/sessions/${theirs.sessionId}`,
      {
        token: mine.accessToken,
      },
    );
    assert.equal(res.status, 404);
    assert.equal(
      (await get("/api/auth/sessions", theirs.accessToken)).status,
      200,
    );

    const invalid = await server.api("DELETE", "/api/auth/sessions/abc", {
      token: mine.accessToken,
    });
    assert.equal(invalid.status, 400);
  });
});

describe("devices", () => {
  it("renames a device", async () => {
    const { tokens } = await signedIn();
    const res = await server.api(
      "PATCH",
      `/api/auth/devices/${tokens.deviceId}`,
      {
        token: tokens.accessToken,
        body: { deviceName: "  Work laptop " },
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.deviceName, "Work laptop");
    assert.ok(res.body.updatedAt);
  });

  it("disabling a device revokes its sessions and blocks it", async () => {
    const { email, tokens: web } = await signedIn();
    const phone = await server.login(email, {
      device: { deviceName: "iPhone", deviceType: "IOS" },
    });
    const res = await server.api(
      "PATCH",
      `/api/auth/devices/${phone.deviceId}`,
      {
        token: web.accessToken,
        body: { isActive: false },
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.isActive, false);
    assert.equal(
      (await get("/api/auth/sessions", phone.accessToken)).status,
      401,
    );

    const relogin = await post("/api/auth/login", {
      email,
      password: TEST_PASSWORD,
      device: { deviceName: "iPhone", deviceType: "IOS", id: phone.deviceId },
    });
    assert.equal(relogin.status, 403);
    assert.equal(relogin.body.message, "Device is disabled");

    await server.api("PATCH", `/api/auth/devices/${phone.deviceId}`, {
      token: web.accessToken,
      body: { isActive: true },
    });
    const allowed = await post("/api/auth/login", {
      email,
      password: TEST_PASSWORD,
      device: { deviceName: "iPhone", deviceType: "IOS", id: phone.deviceId },
    });
    assert.equal(allowed.status, 200);
  });

  it("validates input and hides devices of other users", async () => {
    const { tokens: mine } = await signedIn();
    const { tokens: theirs } = await signedIn();
    const patch = (id: string, body: unknown) =>
      server.api("PATCH", `/api/auth/devices/${id}`, {
        token: mine.accessToken,
        body,
      });

    assert.equal(
      (await patch(theirs.deviceId, { deviceName: "x" })).status,
      404,
    );
    assert.equal(
      (await patch(mine.deviceId, {})).body.message,
      "No updatable fields provided",
    );
    assert.equal(
      (await patch(mine.deviceId, { isActive: "no" })).body.message,
      "isActive must be a boolean",
    );
    assert.equal((await patch("abc", { deviceName: "x" })).status, 400);

    const list = await get("/api/auth/devices", mine.accessToken);
    assert.deepEqual(
      list.body.map((d: Json) => d.id),
      [mine.deviceId],
    );
  });
});

describe("app", () => {
  it("handles invalid JSON, large bodies, unknown routes and health", async () => {
    const invalid = await server.api("POST", "/api/auth/login", {
      raw: "{bad",
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.message, "Invalid JSON body");

    const large = await post("/api/auth/register", {
      fullName: "x".repeat(200_000),
    });
    assert.equal(large.status, 413);

    assert.equal((await get("/api/nothing")).status, 404);
    assert.deepEqual((await get("/health")).body, {
      status: "ok",
      service: "auth-service",
      db: "connected",
    });
  });
});
