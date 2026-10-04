import {
  createPrivateKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_PRIVATE_KEY_PATH = "keys/private.pem";

export function generatePrivateKey(): KeyObject {
  return generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
}

export function loadPrivateKey(path: string): KeyObject {
  if (!existsSync(path)) {
    throw new Error(
      `JWT private key not found at ${path}. Run "npm run keys:generate".`,
    );
  }
  return createPrivateKey(readFileSync(path));
}

export function writePrivateKeyFile(path: string, key: KeyObject): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, key.export({ type: "pkcs8", format: "pem" }), {
    mode: 0o600,
    flag: "wx",
  });
}
