import { validate as isUuid } from "uuid";
import type { Uuid } from "../../domain/entities/base_entity.js";
import { AppError } from "../errors/app_error.js";

export type Input = Record<string, unknown>;

export const badRequest = AppError.badRequest;

export function toObject(value: unknown, field = "Request body"): Input {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(`${field} must be a JSON object`);
  }
  return value as Input;
}

export function allowOnly(input: Input, fields: string[]): void {
  const unknown = Object.keys(input).filter((key) => !fields.includes(key));
  if (unknown.length > 0) {
    throw badRequest(`Unknown field: ${unknown.join(", ")}`);
  }
}

export function requireFields(input: Input, fields: string[]): void {
  for (const field of fields) {
    if (input[field] === undefined) throw badRequest(`${field} is required`);
  }
}

export function assertHasChanges<T extends object>(changes: T): T {
  if (Object.values(changes).every((value) => value === undefined)) {
    throw badRequest("No updatable fields provided");
  }
  return changes;
}

export function optional<T>(
  value: unknown,
  parse: (value: unknown) => T,
): T | undefined {
  return value === undefined ? undefined : parse(value);
}

export function nullable<T>(
  value: unknown,
  parse: (value: unknown) => T,
): T | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parse(value);
}

export function parseString(
  value: unknown,
  field: string,
  max: number,
): string {
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const text = value.trim();
  if (!text) throw badRequest(`${field} must not be empty`);
  if (text.length > max) {
    throw badRequest(`${field} must be at most ${max} characters`);
  }
  return text;
}

export function parseEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function parseUuid(value: unknown, field: string): Uuid {
  if (typeof value !== "string" || !isUuid(value)) {
    throw badRequest(`${field} must be a valid UUID`);
  }
  return value.toLowerCase();
}

export function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw badRequest(`${field} must be a boolean`);
  }
  return value;
}
