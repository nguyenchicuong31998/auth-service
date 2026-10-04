import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { PermissionGuard } from "../../application/shared/permission_guard.js";
import { getAuth } from "../utils/request.js";

export type Authorize = (permission: string) => RequestHandler;

export function createAuthorize(permissions: PermissionGuard): Authorize {
  return (permission) =>
    async (_req: Request, res: Response, next: NextFunction) => {
      await permissions.authorize(getAuth(res).userId, permission);
      next();
    };
}
