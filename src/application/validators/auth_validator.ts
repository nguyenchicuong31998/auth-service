import type { Uuid } from "../../domain/entities/base_entity.js";
import {
  DEVICE_TYPES,
  type DeviceType,
} from "../../domain/entities/user_device.js";
import {
  badRequest,
  nullable,
  parseEnum,
  parseString,
  parseUuid,
  requireFields,
  toObject,
} from "./common_validator.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export interface DeviceInput {
  id: Uuid | null;
  deviceName: string;
  deviceType: DeviceType;
  fcmToken: string | null;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  device: DeviceInput;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function parseEmail(value: unknown): string {
  const email = parseString(value, "email", 255).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest("email is invalid");
  return email;
}

function parsePassword(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} must be a non-empty string`);
  }
  if (Buffer.byteLength(value) > PASSWORD_MAX_BYTES) {
    throw badRequest(`${field} must be at most ${PASSWORD_MAX_BYTES} bytes`);
  }
  return value;
}

export function parseNewPassword(value: unknown, field: string): string {
  const password = parsePassword(value, field);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(
      `${field} must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  return password;
}

function parseDevice(value: unknown): DeviceInput {
  const input = toObject(value, "device");
  requireFields(input, ["deviceName", "deviceType"]);
  return {
    id: nullable(input.id, (id) => parseUuid(id, "device.id")) ?? null,
    deviceName: parseString(input.deviceName, "device.deviceName", 255),
    deviceType: parseEnum(input.deviceType, "device.deviceType", DEVICE_TYPES),
    fcmToken:
      nullable(input.fcmToken, (token) =>
        parseString(token, "device.fcmToken", 500),
      ) ?? null,
  };
}

export function parseRegisterInput(body: unknown): RegisterInput {
  const input = toObject(body);
  requireFields(input, ["fullName", "email", "password"]);
  return {
    fullName: parseString(input.fullName, "fullName", 255),
    email: parseEmail(input.email),
    password: parseNewPassword(input.password, "password"),
  };
}

export function parseLoginInput(body: unknown): LoginInput {
  const input = toObject(body);
  requireFields(input, ["email", "password", "device"]);
  return {
    email: parseEmail(input.email),
    password: parsePassword(input.password, "password"),
    device: parseDevice(input.device),
  };
}

export function parseRefreshTokenInput(body: unknown): string {
  const input = toObject(body);
  requireFields(input, ["refreshToken"]);
  return parseString(input.refreshToken, "refreshToken", 500);
}

export function parseChangePasswordInput(body: unknown): ChangePasswordInput {
  const input = toObject(body);
  requireFields(input, ["currentPassword", "newPassword"]);
  return {
    currentPassword: parsePassword(input.currentPassword, "currentPassword"),
    newPassword: parseNewPassword(input.newPassword, "newPassword"),
  };
}

export function parseVerifyEmailInput(body: unknown): string {
  const input = toObject(body);
  requireFields(input, ["token"]);
  return parseString(input.token, "token", 200);
}

export function parseResendVerificationInput(body: unknown): string {
  const input = toObject(body);
  requireFields(input, ["email"]);
  return parseEmail(input.email);
}
