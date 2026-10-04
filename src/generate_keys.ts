import { existsSync } from "node:fs";
import {
  DEFAULT_PRIVATE_KEY_PATH,
  generatePrivateKey,
  writePrivateKeyFile,
} from "./infrastructure/security/rsa_key_file.js";

const path =
  process.env.JWT_PRIVATE_KEY_PATH?.trim() || DEFAULT_PRIVATE_KEY_PATH;

if (existsSync(path)) {
  console.log(`JWT private key already exists: ${path} (not overwritten)`);
} else {
  writePrivateKeyFile(path, generatePrivateKey());
  console.log(`JWT private key created: ${path}`);
}
