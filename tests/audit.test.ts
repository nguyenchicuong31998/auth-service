import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  startTestServer,
  TEST_PASSWORD,
  WEB_DEVICE,
  type TestServer,
} from "./helpers/test_server.js";

let server: TestServer;

before(async () => {
  server = await startTestServer("auth_service_audit_test");
});

after(async () => {
  await server?.close();
});

const auditText = () => JSON.stringify(server.audits.events);

describe("auth audit events", () => {
  it("records register and login without passwords or tokens", async () => {
    const register = await server.api("POST", "/api/auth/register", {
      body: {
        fullName: "Audit Me",
        email: "audit-me@example.com",
        password: TEST_PASSWORD,
      },
    });
    const userId = register.body.id as string;
    const login = await server.api("POST", "/api/auth/login", {
      body: {
        email: "audit-me@example.com",
        password: TEST_PASSWORD,
        device: WEB_DEVICE,
      },
    });
    assert.equal(login.status, 200);

    const registered = await server.audits.next(
      (e) => e.resource === "auth-register",
    );
    assert.equal(registered.userId, null);
    assert.equal(registered.resourceId, userId);
    assert.equal(registered.newValue?.email, "audit-me@example.com");

    const loggedIn = await server.audits.next(
      (e) => e.resource === "auth-login",
    );
    assert.equal(loggedIn.userId, null);
    assert.equal(loggedIn.resourceId, userId);
    assert.equal(loggedIn.newValue, null);

    const text = auditText();
    assert.ok(!text.includes(TEST_PASSWORD));
    assert.ok(!text.includes(login.body.accessToken));
    assert.ok(!text.includes(login.body.refreshToken));
  });

  it("records logout and password changes with the acting user", async () => {
    const user = await server.register("audit-actor@example.com");
    const tokens = await server.login("audit-actor@example.com");
    await server.api("PUT", "/api/auth/password", {
      token: tokens.accessToken,
      body: { currentPassword: TEST_PASSWORD, newPassword: "Changed@12345" },
    });
    await server.api("POST", "/api/auth/logout", { token: tokens.accessToken });

    const password = await server.audits.next(
      (e) => e.resource === "auth-password" && e.userId === user.id,
    );
    assert.equal(password.action, "PUT");
    assert.equal(password.newValue, null);
    const logout = await server.audits.next(
      (e) => e.resource === "auth-logout" && e.userId === user.id,
    );
    assert.equal(logout.action, "POST");
    assert.ok(!auditText().includes("Changed@12345"));
  });

  it("hides OAuth client secrets", async () => {
    const admin = await server.register("audit-oauth@example.com");
    server.users.grant(admin.id, [
      "oauth-client:create",
      "oauth-client:update",
      "user:read",
    ]);
    const { accessToken } = await server.login("audit-oauth@example.com");
    const created = await server.api("POST", "/api/oauth-clients", {
      token: accessToken,
      body: { name: "audited", scopes: ["user:read"] },
    });
    const rotated = await server.api(
      "POST",
      `/api/oauth-clients/${created.body.id}/secret`,
      { token: accessToken },
    );

    const create = await server.audits.next(
      (e) =>
        e.resource === "oauth-client" &&
        e.action === "POST" &&
        e.resourceId === created.body.id &&
        e.oldValue === null,
    );
    assert.equal(create.userId, admin.id);
    assert.equal(create.newValue?.clientSecret, "[REDACTED]");
    const rotate = await server.audits.next(
      (e) => e.resource === "oauth-client" && e.oldValue !== null,
    );
    assert.equal(rotate.oldValue?.name, "audited");

    const text = auditText();
    assert.ok(!text.includes(created.body.clientSecret));
    assert.ok(!text.includes(rotated.body.clientSecret));
  });

  it("does not audit refresh, resend or failed attempts", async () => {
    await server.register("audit-quiet@example.com");
    const tokens = await server.login("audit-quiet@example.com");
    const before = server.audits.events.length;

    await server.api("POST", "/api/auth/refresh", {
      body: { refreshToken: tokens.refreshToken },
    });
    await server.api("POST", "/api/auth/verify-email/resend", {
      body: { email: "audit-quiet@example.com" },
    });
    await server.api("POST", "/api/auth/login", {
      body: {
        email: "audit-quiet@example.com",
        password: "wrong-password",
        device: WEB_DEVICE,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(server.audits.events.length, before);
  });
});
