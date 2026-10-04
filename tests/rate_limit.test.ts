import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  startTestServer,
  TEST_PASSWORD,
  WEB_DEVICE,
  type Api,
  type TestServer,
} from "./helpers/test_server.js";

let server: TestServer;
let limited: { api: Api; close(): Promise<void> };

const login = (email: string, password: string) =>
  limited.api("POST", "/api/auth/login", {
    body: { email, password, device: WEB_DEVICE },
  });

before(async () => {
  server = await startTestServer("auth_service_rate_limit_test");
  limited = await server.startRateLimited();
});

after(async () => {
  await limited?.close();
  await server?.close();
});

describe("rate limits", () => {
  it("blocks an email after 5 failed logins, without blocking other emails", async () => {
    await server.register("target@example.com");
    await server.register("other@example.com");

    for (let i = 0; i < 2; i += 1) {
      assert.equal(
        (await login("target@example.com", TEST_PASSWORD)).status,
        200,
      );
    }
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await login("target@example.com", "wrong")).status, 401);
    }
    const blocked = await login("target@example.com", TEST_PASSWORD);
    assert.equal(blocked.status, 429);
    assert.equal(
      blocked.body.message,
      "Too many requests, please try again later",
    );
    assert.ok(blocked.headers.get("ratelimit-policy"));
    assert.ok(blocked.headers.get("retry-after"));

    const sameIpOtherEmail = await login("other@example.com", TEST_PASSWORD);
    assert.equal(sameIpOtherEmail.status, 200);
  });

  it("limits resending verification emails", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await limited.api("POST", "/api/auth/verify-email/resend", {
        body: { email: "anyone@example.com" },
      });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429]);
  });

  it("limits failed client credential attempts", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await limited.api("POST", "/oauth/token", {
        body: {
          grant_type: "client_credentials",
          client_id: "cli_guess",
          client_secret: `guess-${i}`,
        },
      });
      statuses.push(res.status);
    }
    assert.equal(statuses.filter((s) => s === 401).length, 10);
    assert.equal(statuses.at(-1), 429);
  });

  it("sends security headers and no X-Powered-By", async () => {
    const res = await limited.api("GET", "/health");
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("strict-transport-security"));
  });
});
