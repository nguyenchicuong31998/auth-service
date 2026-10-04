import type { UserDeviceChanges } from "../../domain/repositories/user_device_repository.js";
import {
  assertHasChanges,
  optional,
  parseBoolean,
  parseString,
  toObject,
} from "./common_validator.js";

export function parseUpdateDeviceInput(body: unknown): UserDeviceChanges {
  const input = toObject(body);
  return assertHasChanges({
    deviceName: optional(input.deviceName, (value) =>
      parseString(value, "deviceName", 255),
    ),
    isActive: optional(input.isActive, (value) =>
      parseBoolean(value, "isActive"),
    ),
  });
}
