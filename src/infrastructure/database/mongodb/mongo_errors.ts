import { DuplicateKeyError } from "../../../domain/errors/duplicate_key_error.js";

const DUPLICATE_KEY_CODE = 11000;

interface MongoError {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

export function toDomainError(error: unknown): unknown {
  if ((error as MongoError | null)?.code !== DUPLICATE_KEY_CODE) return error;
  const fields = Object.keys((error as MongoError).keyPattern ?? {});
  return new DuplicateKeyError(fields.at(-1) ?? "value");
}
