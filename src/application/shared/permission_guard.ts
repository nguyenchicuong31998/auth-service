import type { Uuid } from "../../domain/entities/base_entity.js";
import type { UserDirectory } from "../../domain/ports/user_directory.js";
import { AppError } from "../errors/app_error.js";

export const ACCESS_ALLOWED_STATUSES = ["active", "pending"];

export class PermissionGuard {
  constructor(private readonly users: UserDirectory) {}

  async permissionsOf(userId: Uuid): Promise<string[]> {
    const access = await this.users.getAccess(userId);
    if (!access) throw AppError.unauthorized("User no longer exists");
    if (!ACCESS_ALLOWED_STATUSES.includes(access.status)) {
      throw AppError.forbidden(`Account is ${access.status}`);
    }
    return access.permissions;
  }

  async authorize(userId: Uuid, permission: string): Promise<void> {
    if (!(await this.permissionsOf(userId)).includes(permission)) {
      throw AppError.forbidden(`Missing permission: ${permission}`);
    }
  }

  async assertCanGrant(userId: Uuid, scopes: string[]): Promise<void> {
    const owned = new Set(await this.permissionsOf(userId));
    const missing = scopes.filter((scope) => !owned.has(scope));
    if (missing.length > 0) {
      throw AppError.forbidden(
        `Cannot grant scopes you do not have: ${missing.join(", ")}`,
      );
    }
  }
}
