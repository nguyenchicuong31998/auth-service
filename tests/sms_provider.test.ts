import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { generatePrivateKey } from "../src/infrastructure/security/rsa_key_file.js";

const dir = mkdtempSync(join(tmpdir(), "auth-sms-"));
const keyPath = join(dir, "private.pem");
writeFileSync(
  keyPath,
  generatePrivateKey().export({ type: "pkcs8", format: "pem" }),
);

after(() => rmSync(dir, { recursive: true, force: true }));

function buildRoutes(env: Record<string, string | undefined>) {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      'import("./src/container.ts").then((m) => { m.createRoutes(); console.log("BUILT"); })',
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        MONGODB_URI: "mongodb://127.0.0.1:1",
        JWT_PRIVATE_KEY_PATH: keyPath,
        ...env,
      },
    },
  );
  return {
    built: result.stdout.includes("BUILT"),
    output: result.stdout + result.stderr,
  };
}

describe("SMS provider", () => {
  it("prints codes to the console by default outside production", () => {
    const { built, output } = buildRoutes({ NODE_ENV: "development" });
    assert.ok(built, output);
    assert.doesNotMatch(output, /WARNING/);
  });

  it("refuses to start in production without an SMS provider", () => {
    const { built, output } = buildRoutes({ NODE_ENV: "production" });
    assert.equal(built, false);
    assert.match(output, /No SMS provider configured/);
  });

  it("allows the console in production only when chosen explicitly, with a warning", () => {
    const { built, output } = buildRoutes({
      NODE_ENV: "production",
      SMS_PROVIDER: "console",
    });
    assert.ok(built, output);
    assert.match(output, /WARNING: SMS_PROVIDER=console in production/);
  });

  it("rejects unknown providers", () => {
    const { built, output } = buildRoutes({ SMS_PROVIDER: "twilio" });
    assert.equal(built, false);
    assert.match(output, /SMS_PROVIDER must be one of: console/);
  });
});
