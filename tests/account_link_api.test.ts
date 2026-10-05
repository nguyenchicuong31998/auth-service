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
let seq = 0;

const nextEmail = () => `link${++seq}@example.com`;
const nextPhone = () => `0913${String(++seq).padStart(6, "0")}`;

const post = (path: string, body?: unknown, token?: string | null) =>
  server.api("POST", path, { body, token: token ?? undefined });

async function waitForOtp(phone: string, count = 1): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    if (server.sms.sent.filter((sms) => sms.to === phone).length >= count) {
      return server.sms.otpFor(phone);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No OTP #${count} was sent to ${phone}`);
}

async function emailAccount() {
  const email = nextEmail();
  const user = await server.register(email);
  const tokens = await server.login(email);
  return { email, user, token: tokens.accessToken as string };
}

async function phoneAccount() {
  const phone = nextPhone();
  await post("/api/auth/phone/otp", { phone });
  const res = await post("/api/auth/phone/login", {
    phone,
    code: await waitForOtp(phone),
    device: WEB_DEVICE,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { phone, user: res.body.user, token: res.body.accessToken as string };
}

async function linkPhone(token: string, phone: string, count = 1) {
  const otp = await post("/api/auth/me/phone/otp", { phone }, token);
  assert.equal(otp.status, 202, JSON.stringify(otp.body));
  return post(
    "/api/auth/me/phone",
    { phone, code: await waitForOtp(phone, count) },
    token,
  );
}

const identities = async (token: string) =>
  (await server.api("GET", "/api/auth/me/identities", { token }))
    .body as Json[];

before(async () => {
  server = await startTestServer("auth_service_link_test");
});

after(async () => {
  await server?.close();
});

describe("GET /api/auth/me/identities", () => {
  it("lists the sign-in methods of the current account", async () => {
    const { email, token } = await emailAccount();
    const list = await identities(token);
    assert.equal(list.length, 1);
    assert.equal(list[0].method, "email");
    assert.equal(list[0].value, email);
    assert.ok(list[0].linkedAt);

    const res = await server.api("GET", "/api/auth/me/identities", {
      token: undefined,
    });
    assert.equal(res.status, 401);
  });
});

describe("adding a phone to an email account", () => {
  it("links the phone so OTP login lands in the same account", async () => {
    const { user, token } = await emailAccount();
    const phone = nextPhone();
    const linked = await linkPhone(token, phone);
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    assert.equal(linked.body.id, user.id);
    assert.equal(linked.body.phone, phone);
    assert.equal(linked.body.phoneVerified, true);

    const methods = (await identities(token)).map((item) => item.method);
    assert.deepEqual(methods.sort(), ["email", "phone"]);

    await server.mongoose.connection
      .collection("phone_verification_otps")
      .updateMany(
        { phone },
        { $set: { createdAt: new Date(Date.now() - 31_000) } },
      );
    await post("/api/auth/phone/otp", { phone });
    const login = await post("/api/auth/phone/login", {
      phone,
      code: await waitForOtp(phone, 2),
      device: WEB_DEVICE,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.isNewUser, false);
    assert.equal(login.body.user.id, user.id, "same account, not a new one");
  });

  it("is idempotent for the account's own phone", async () => {
    const { token } = await emailAccount();
    const phone = nextPhone();
    assert.equal((await linkPhone(token, phone)).status, 200);
    await server.mongoose.connection
      .collection("phone_verification_otps")
      .updateMany(
        { phone },
        { $set: { createdAt: new Date(Date.now() - 31_000) } },
      );
    const again = await linkPhone(token, phone, 2);
    assert.equal(again.status, 200);
    assert.equal((await identities(token)).length, 2);
  });

  it("refuses a phone that belongs to another account", async () => {
    const { phone: taken } = await phoneAccount();
    const { token } = await emailAccount();
    const otp = await post("/api/auth/me/phone/otp", { phone: taken }, token);
    assert.equal(otp.status, 409);
    assert.equal(
      otp.body.message,
      "This phone number is already used by another account",
    );
    const link = await post(
      "/api/auth/me/phone",
      { phone: taken, code: "123456" },
      token,
    );
    assert.equal(link.status, 409);
  });

  it("refuses a second, different phone", async () => {
    const { token } = await emailAccount();
    assert.equal((await linkPhone(token, nextPhone())).status, 200);
    const res = await post(
      "/api/auth/me/phone/otp",
      { phone: nextPhone() },
      token,
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.message, "This account already has a phone number");
  });

  it("needs the right code", async () => {
    const { token } = await emailAccount();
    const phone = nextPhone();
    await post("/api/auth/me/phone/otp", { phone }, token);
    const code = await waitForOtp(phone);
    const wrong = code === "000000" ? "111111" : "000000";
    const res = await post("/api/auth/me/phone", { phone, code: wrong }, token);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid or expired OTP");
    assert.equal((await identities(token)).length, 1, "nothing was linked");
  });

  it("still keeps privileged accounts off OTP login after linking", async () => {
    const { user, token } = await emailAccount();
    server.users.grant(user.id, ["user:read"]);
    const phone = nextPhone();
    assert.equal((await linkPhone(token, phone)).status, 200);
    await server.mongoose.connection
      .collection("phone_verification_otps")
      .updateMany(
        { phone },
        { $set: { createdAt: new Date(Date.now() - 31_000) } },
      );
    await post("/api/auth/phone/otp", { phone });
    const login = await post("/api/auth/phone/login", {
      phone,
      code: await waitForOtp(phone, 2),
      device: WEB_DEVICE,
    });
    assert.equal(login.status, 403);
  });
});

describe("adding an email + password to a phone account", () => {
  it("links the email only after the link in the email is clicked", async () => {
    const { user, token } = await phoneAccount();
    const email = nextEmail();
    const before = server.notifications.sent.length;
    const res = await post(
      "/api/auth/me/email",
      { email, password: "LinkedPass@1" },
      token,
    );
    assert.equal(res.status, 202, JSON.stringify(res.body));
    await server.notifications.waitFor(before + 1);
    assert.equal(server.notifications.sent.at(-1)?.to, email);

    const early = await post("/api/auth/login", {
      email,
      password: "LinkedPass@1",
      device: WEB_DEVICE,
    });
    assert.equal(early.status, 401, "not usable before verification");

    const verified = await post("/api/auth/verify-email", {
      token: server.notifications.tokenFrom(),
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.id, user.id);
    assert.equal(verified.body.email, email);
    assert.equal(verified.body.emailVerified, true);

    const login = await post("/api/auth/login", {
      email,
      password: "LinkedPass@1",
      device: WEB_DEVICE,
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, user.id, "same account");

    const stored = await server.mongoose.connection
      .collection("email_verification_tokens")
      .findOne({ userId: user.id });
    assert.equal(stored?.passwordHash, null, "the pending hash is cleared");

    const methods = (await identities(token)).map((item) => item.method);
    assert.deepEqual(methods.sort(), ["email", "phone"]);
  });

  it("refuses emails used by another account and a second email", async () => {
    const { email: takenIdentity } = await emailAccount();
    const directoryOnly = nextEmail();
    server.users.add({ email: directoryOnly });
    const { token } = await phoneAccount();

    for (const email of [takenIdentity, directoryOnly]) {
      const res = await post(
        "/api/auth/me/email",
        { email, password: "LinkedPass@1" },
        token,
      );
      assert.equal(res.status, 409, email);
      assert.equal(
        res.body.message,
        "This email is already used by another account",
      );
    }

    const { token: emailToken } = await emailAccount();
    const second = await post(
      "/api/auth/me/email",
      { email: nextEmail(), password: "LinkedPass@1" },
      emailToken,
    );
    assert.equal(second.status, 409);
    assert.equal(second.body.message, "This account already has an email");
  });

  it("refuses the link if the email was taken before it was clicked", async () => {
    const { token } = await phoneAccount();
    const email = nextEmail();
    const before = server.notifications.sent.length;
    await post(
      "/api/auth/me/email",
      { email, password: "LinkedPass@1" },
      token,
    );
    await server.notifications.waitFor(before + 1);
    const link = server.notifications.tokenFrom();

    await post("/api/auth/register", {
      fullName: "Faster",
      email,
      password: TEST_PASSWORD,
    });
    const res = await post("/api/auth/verify-email", { token: link });
    assert.equal(res.status, 409);
    assert.equal(
      res.body.message,
      "This email is already used by another account",
    );
  });
});

describe("validation and authentication", () => {
  it("needs a token and only accepts known fields", async () => {
    for (const [path, body] of [
      ["/api/auth/me/phone/otp", { phone: "0901234567" }],
      ["/api/auth/me/phone", { phone: "0901234567", code: "123456" }],
      ["/api/auth/me/email", { email: "a@b.co", password: TEST_PASSWORD }],
    ] as const) {
      const res = await post(path, body, null);
      assert.equal(res.status, 401, path);
    }

    const { token } = await emailAccount();
    const cases: [string, Json, string][] = [
      [
        "/api/auth/me/phone/otp",
        { phone: "0901234567", x: 1 },
        "Unknown field: x",
      ],
      [
        "/api/auth/me/phone",
        { phone: "0901234567", code: "12" },
        "code must be 6 digits",
      ],
      [
        "/api/auth/me/email",
        { email: "a@b.co", password: "short" },
        "password must be at least 8 characters",
      ],
      ["/api/auth/me/email", { email: "a@b.co" }, "password is required"],
    ];
    for (const [path, body, message] of cases) {
      const res = await post(path, body, token);
      assert.equal(res.status, 400, path);
      assert.equal(res.body.message, message);
    }
  });
});
