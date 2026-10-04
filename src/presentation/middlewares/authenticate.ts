import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../application/errors/app_error.js";
import type { AuthService } from "../../application/services/auth_service.js";
import { setAuth } from "../utils/request.js";

const BEARER_RE = /^Bearer\s+(\S+)$/i;

export function createAuthenticate(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = BEARER_RE.exec(req.header("authorization") ?? "")?.[1];
    if (!token) throw AppError.unauthorized("Missing bearer token");
    setAuth(res, await authService.authenticate(token));
    next();
  };
}
