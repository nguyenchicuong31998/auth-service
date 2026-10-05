import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  startTestServer,
  TEST_PASSWORD,
  WEB_DEVICE,
  type Json,
  type TestServer,
} from "./helpers/test_server.js";

let server: TestServer;
let phoneSeq = 0;

const nextPhone = () => `0912${String(++phoneSeq).padStart(6, "0")}`;

const post = (path: string, body?: unknown, token?: string) =>
  server.api("POST", path, { body, token });

const otpsCollection = () =>
  server.mongoose.connection.collection("phone_verification_otps");

const identitiesCollection = () =>
  server.mongoose.connection.collection("user_identities");

/** Waits for the background SMS and returns its code. */
async function waitForOtp(phone: string, count = 1): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    if (server.sms.sent.filter((sms) => sms.to === phone).length >= count) {
      return server.sms.otpFor(phone);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No OTP #${count} was sent to ${phone}`);
}

async function requestOtp(phone: string, count = 1): Promise<string> {
  const res = await post("/api/auth/phone/otp", { phone });
  assert.equal(res.status, 202);
  return waitForOtp(phone, count);
}

const phoneLogin = (body: Json) =>
  post("/api/auth/phone/login", { device: WEB_DEVICE, ...body });

async function signedInByPhone(phone = nextPhone(), extra: Json = {}) {
  const code = await requestOtp(phone);
  const res = await phoneLogin({ phone, code, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { phone, body: res.body };
}

before(async () => {
  server = await startTestServer("auth_service_phone_test");
});

after(async () => {
  await server?.close();
});

describe("POST /api/auth/phone/otp", () => {
  it("sends a 6-digit code that lives 30 seconds and stores only its hash", async () => {
    const phone = nextPhone();
    const code = await requestOtp(phone);
    assert.match(code, /^\d{6}$/);

    const otp = await otpsCollection().findOne({ phone });
    assert.ok(otp);
    assert.equal(otp.attempts, 0);
    assert.equal(otp.consumedAt, null);
    assert.notEqual(otp.codeHash, code);
    const ttlMs = otp.expiresAt.getTime() - otp.createdAt.getTime();
    assert.ok(Math.abs(ttlMs - 30_000) < 1000, "OTP lives 30 seconds");
  });

  it("lets MongoDB delete expired codes through a TTL index", async () => {
    const indexes = await otpsCollection().indexes();
    const ttl = indexes.find((index) => index.key.expiresAt === 1);
    assert.equal(ttl?.expireAfterSeconds, 0);
  });

  it("normalizes the phone number", async () => {
    const res = await post("/api/auth/phone/otp", { phone: "0912 345-678" });
    assert.equal(res.status, 202);
    assert.match(await waitForOtp("0912345678"), /^\d{6}$/);
  });

  it("sends at most one code until the previous one expires", async () => {
    const phone = nextPhone();
    const first = await requestOtp(phone);

    await post("/api/auth/phone/otp", { phone });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      server.sms.sent.filter((sms) => sms.to === phone).length,
      1,
      "still within the 30 s cooldown",
    );

    await otpsCollection().updateMany(
      { phone },
      { $set: { createdAt: new Date(Date.now() - 31_000) } },
    );
    const second = await requestOtp(phone, 2);
    const latest = await otpsCollection()
      .find({ phone })
      .sort({ createdAt: -1 })
      .toArray();
    assert.equal(latest.length, 2);
    assert.ok(latest[1].consumedAt, "the previous code is invalidated");

    if (first !== second) {
      const old = await phoneLogin({ phone, code: first });
      assert.equal(old.status, 401);
    }
    const ok = await phoneLogin({ phone, code: second });
    assert.equal(ok.status, 200);
  });

  it("validates the phone", async () => {
    for (const [body, message] of [
      [{}, "phone is required"],
      [{ phone: "abc" }, "phone is invalid"],
      [{ phone: "1234567" }, "phone is invalid"],
    ] as const) {
      const res = await post("/api/auth/phone/otp", body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, message);
    }
  });
});

describe("POST /api/auth/phone/login", () => {
  it("creates an account for a new phone and signs in immediately", async () => {
    const phone = nextPhone();
    const { body } = await signedInByPhone(phone, { fullName: "Tran Thi B" });

    assert.equal(body.isNewUser, true);
    assert.equal(body.tokenType, "Bearer");
    assert.ok(body.accessToken);
    assert.ok(body.refreshToken);
    assert.equal(body.user.phone, phone);
    assert.equal(body.user.email, null);
    assert.equal(body.user.fullName, "Tran Thi B");
    assert.equal(body.user.phoneVerified, true);
    assert.equal(body.user.status, "active");
    assert.equal(server.users.registeredFrom.get(body.user.id), "phone_otp");

    const identity = await identitiesCollection().findOne({
      providerAccountId: phone,
    });
    assert.equal(identity?.provider, "phone_otp");
    assert.equal(identity?.password, null, "no password for phone accounts");
    assert.deepEqual(server.users.logins.at(-1), {
      id: body.user.id,
      provider: "phone_otp",
    });

    const sessions = await server.api("GET", "/api/auth/sessions", {
      token: body.accessToken,
    });
    assert.equal(sessions.status, 200, "the access token works");
  });

  it("signs an existing phone account back in without creating another", async () => {
    const { phone, body: first } = await signedInByPhone();
    await otpsCollection().updateMany(
      { phone },
      { $set: { createdAt: new Date(Date.now() - 31_000) } },
    );
    const code = await requestOtp(phone, 2);
    const res = await phoneLogin({
      phone,
      code,
      fullName: "Ignored For Existing Users",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const second = res.body;
    assert.equal(second.isNewUser, false);
    assert.equal(second.user.id, first.user.id);
    assert.equal(second.user.fullName, first.user.fullName);
    assert.equal(
      await identitiesCollection().countDocuments({ providerAccountId: phone }),
      1,
    );
  });

  it("uses the phone as the name when none is given", async () => {
    const { phone, body } = await signedInByPhone();
    assert.equal(body.user.fullName, phone);
  });

  it("accepts each code only once", async () => {
    const phone = nextPhone();
    const code = await requestOtp(phone);
    assert.equal((await phoneLogin({ phone, code })).status, 200);
    const again = await phoneLogin({ phone, code });
    assert.equal(again.status, 401);
    assert.equal(again.body.message, "Invalid or expired OTP");
  });

  it("allows only one of two concurrent logins with the same code", async () => {
    const phone = nextPhone();
    const code = await requestOtp(phone);
    const results = await Promise.all([
      phoneLogin({ phone, code }),
      phoneLogin({ phone, code }),
    ]);
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 401]);
  });

  it("locks the code after five wrong attempts", async () => {
    const phone = nextPhone();
    const code = await requestOtp(phone);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 4; i += 1) {
      const res = await phoneLogin({ phone, code: wrong });
      assert.equal(res.status, 401);
      assert.equal(res.body.message, "Invalid or expired OTP");
    }
    const fifth = await phoneLogin({ phone, code: wrong });
    assert.equal(
      fifth.body.message,
      "Too many wrong OTP attempts, request a new code",
    );
    const right = await phoneLogin({ phone, code });
    assert.equal(right.status, 401, "the locked code no longer works");
  });

  it("rejects an expired code, a code for another phone and no code at all", async () => {
    const phone = nextPhone();
    const code = await requestOtp(phone);
    const other = await phoneLogin({ phone: nextPhone(), code });
    assert.equal(other.status, 401, "codes are bound to their phone");

    await otpsCollection().updateMany(
      { phone },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const expired = await phoneLogin({ phone, code });
    assert.equal(expired.status, 401);
    assert.equal(expired.body.message, "Invalid or expired OTP");
  });

  it("refuses blocked accounts even with a valid code", async () => {
    const { phone, body } = await signedInByPhone();
    server.users.setStatus(body.user.id, "blocked");
    const code = await (async () => {
      await otpsCollection().updateMany(
        { phone },
        { $set: { createdAt: new Date(Date.now() - 31_000) } },
      );
      return requestOtp(phone, 2);
    })();
    const res = await phoneLogin({ phone, code });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Account is blocked");
  });

  it("returns 503 when user-service is down", async () => {
    const phone = nextPhone();
    const code = await requestOtp(phone);
    server.users.unavailable = true;
    try {
      const res = await phoneLogin({ phone, code });
      assert.equal(res.status, 503);
    } finally {
      server.users.unavailable = false;
    }
  });

  it("validates the body", async () => {
    const cases: [Json, string][] = [
      [{ code: "123456" }, "phone is required"],
      [{ phone: "0901234567" }, "code is required"],
      [{ phone: "0901234567", code: "12ab56" }, "code must be 6 digits"],
      [{ phone: "abc", code: "123456" }, "phone is invalid"],
      [
        { phone: "0901234567", code: "123456", fullName: 5 },
        "fullName must be a string",
      ],
    ];
    for (const [body, message] of cases) {
      const res = await phoneLogin(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, message);
    }
    const noDevice = await post("/api/auth/phone/login", {
      phone: "0901234567",
      code: "123456",
    });
    assert.equal(noDevice.status, 400);
    assert.equal(noDevice.body.message, "device is required");
  });
});

describe("phone accounts and passwords", () => {
  it("cannot log in with a password or change one", async () => {
    const { phone, body } = await signedInByPhone();
    const withPassword = await post("/api/auth/login", {
      phone,
      password: TEST_PASSWORD,
      device: WEB_DEVICE,
    });
    assert.equal(withPassword.status, 400);
    assert.equal(withPassword.body.message, "email is required");

    const change = await server.api("PUT", "/api/auth/password", {
      token: body.accessToken,
      body: { currentPassword: "whatever-1", newPassword: "NewPassword@1" },
    });
    assert.equal(change.status, 400);
    assert.equal(
      change.body.message,
      "Password login is not enabled for this account",
    );
  });

  it("register only takes an email and a password", async () => {
    const res = await post("/api/auth/register", {
      fullName: "No Email",
      phone: "0901234567",
      password: TEST_PASSWORD,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "email is required");
  });
});
