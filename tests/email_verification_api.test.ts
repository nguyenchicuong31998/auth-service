import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  startTestServer,
  TEST_PASSWORD,
  type Json,
  type TestServer,
} from "./helpers/test_server.js";

let server: TestServer;
let seq = 0;

const tokens = () =>
  server.mongoose.connection.collection("email_verification_tokens");

const post = (path: string, body: unknown) =>
  server.api("POST", path, { body });

async function registerUser(): Promise<{ email: string; user: Json }> {
  const email = `verify-${++seq}@example.com`;
  const before = server.notifications.sent.length;
  const res = await post("/api/auth/register", {
    fullName: `Verify ${seq}`,
    email,
    password: TEST_PASSWORD,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  await server.notifications.waitFor(before + 1);
  return { email, user: res.body };
}

before(async () => {
  server = await startTestServer("auth_service_verification_test");
});

after(async () => {
  await server?.close();
});

describe("registration email", () => {
  it("sends a verification link and stores only the token hash", async () => {
    const { email, user } = await registerUser();
    const mail = server.notifications.sent.at(-1)!;
    assert.equal(mail.templateKey, "email-verification");
    assert.equal(mail.to, email);
    assert.equal(mail.variables.name, user.fullName);
    assert.match(
      mail.variables.verifyUrl,
      /^http:\/\/localhost:3000\/verify-email\?token=/,
    );

    const raw = server.notifications.tokenFrom();
    assert.ok(raw.length >= 40);
    const stored = await tokens().findOne({ userId: user.id });
    assert.equal(
      stored?.tokenHash,
      createHash("sha256").update(raw).digest("hex"),
    );
    assert.ok(!JSON.stringify(stored).includes(raw));
    const ttl = stored!.expiresAt.getTime() - stored!.createdAt.getTime();
    assert.ok(Math.abs(ttl - 24 * 3600 * 1000) < 5000);
  });

  it("still registers the user when the email cannot be sent", async () => {
    server.notifications.failing = true;
    try {
      const res = await post("/api/auth/register", {
        fullName: "No Mail",
        email: "no-mail@example.com",
        password: TEST_PASSWORD,
      });
      assert.equal(res.status, 201);
    } finally {
      server.notifications.failing = false;
    }
  });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies once, activates the user and sends the welcome email", async () => {
    const { email, user } = await registerUser();
    const token = server.notifications.tokenFrom();
    const sentBefore = server.notifications.sent.length;

    const res = await post("/api/auth/verify-email", { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, user.id);
    assert.equal(res.body.emailVerified, true);
    assert.equal(res.body.status, "active");

    await server.notifications.waitFor(sentBefore + 1);
    const welcome = server.notifications.sent.at(-1)!;
    assert.equal(welcome.templateKey, "welcome");
    assert.equal(welcome.to, email);

    const reuse = await post("/api/auth/verify-email", { token });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.message, "Invalid or expired verification token");
  });

  it("keeps the token usable when user-service is down", async () => {
    await registerUser();
    const token = server.notifications.tokenFrom();
    server.users.unavailable = true;
    try {
      const down = await post("/api/auth/verify-email", { token });
      assert.equal(down.status, 503);
    } finally {
      server.users.unavailable = false;
    }
    const retry = await post("/api/auth/verify-email", { token });
    assert.equal(retry.status, 200);
  });

  it("rejects unknown and expired tokens with the same message", async () => {
    const { user } = await registerUser();
    const token = server.notifications.tokenFrom();
    await tokens().updateOne(
      { userId: user.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    for (const value of [token, "not-a-real-token"]) {
      const res = await post("/api/auth/verify-email", { token: value });
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Invalid or expired verification token");
    }
    assert.equal((await post("/api/auth/verify-email", {})).status, 400);
  });

  it("refuses when the email changed after the link was sent", async () => {
    const { user } = await registerUser();
    const token = server.notifications.tokenFrom();
    server.users.users.set(user.id, {
      ...server.users.users.get(user.id)!,
      email: "changed@example.com",
    });
    const res = await post("/api/auth/verify-email", { token });
    assert.equal(res.status, 409);
    assert.equal(
      res.body.message,
      "The email has changed since this link was sent",
    );
  });
});

describe("POST /api/auth/verify-email/resend", () => {
  const resend = (email: string) =>
    post("/api/auth/verify-email/resend", { email });

  it("always answers 202 and only mails unverified accounts", async () => {
    const sentBefore = server.notifications.sent.length;
    assert.equal((await resend("nobody@example.com")).status, 202);

    const { email } = await registerUser();
    await post("/api/auth/verify-email", {
      token: server.notifications.tokenFrom(),
    });
    const afterVerify = server.notifications.sent.length;
    assert.equal((await resend(email)).status, 202);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(server.notifications.sent.length, afterVerify);
    assert.ok(afterVerify >= sentBefore);
  });

  it("waits a minute between emails and invalidates the previous link", async () => {
    const { email, user } = await registerUser();
    const firstToken = server.notifications.tokenFrom();
    const count = server.notifications.sent.length;

    await resend(email);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(server.notifications.sent.length, count, "cooldown");

    await tokens().updateMany(
      { userId: user.id },
      { $set: { createdAt: new Date(Date.now() - 61_000) } },
    );
    await resend(email);
    await server.notifications.waitFor(count + 1);
    const secondToken = server.notifications.tokenFrom();
    assert.notEqual(secondToken, firstToken);

    const old = await post("/api/auth/verify-email", { token: firstToken });
    assert.equal(old.status, 400);
    const fresh = await post("/api/auth/verify-email", { token: secondToken });
    assert.equal(fresh.status, 200);
  });

  it("validates the email", async () => {
    assert.equal((await resend("bad")).status, 400);
  });
});

describe("login tracking", () => {
  it("records each successful login in user-service", async () => {
    const { email, user } = await registerUser();
    await server.login(email);
    assert.deepEqual(server.users.logins.at(-1), {
      id: user.id,
      provider: "manual",
    });
  });
});
