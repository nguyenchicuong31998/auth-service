import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../application/errors/app_error.js";
import { OAuthError } from "../../application/errors/oauth_error.js";
import { DuplicateKeyError } from "../../domain/errors/duplicate_key_error.js";
import { UserServiceError } from "../../domain/errors/user_service_error.js";

interface HttpError {
  status: number;
  type?: string;
  message: string;
}

function isClientHttpError(err: unknown): err is HttpError {
  const status = (err as HttpError | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  if (err instanceof DuplicateKeyError) {
    return AppError.conflict(`${capitalize(err.field)} already exists`);
  }
  if (err instanceof UserServiceError) {
    return err.status === 400
      ? AppError.badRequest(err.message)
      : new AppError(503, err.message);
  }
  if (isClientHttpError(err)) {
    if (err.type === "entity.parse.failed") {
      return AppError.badRequest("Invalid JSON body");
    }
    if (err.type === "entity.too.large") {
      return new AppError(413, "Request body is too large");
    }
    return new AppError(err.status, err.message);
  }
  return null;
}

export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(AppError.notFound("Not found"));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof OAuthError) {
    if (err.status === 401) {
      res.setHeader("WWW-Authenticate", 'Basic realm="oauth"');
    }
    res
      .status(err.status)
      .json({ error: err.error, error_description: err.description });
    return;
  }
  const appError = toAppError(err);
  if (!appError) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
    return;
  }
  if (appError.status === 401) res.setHeader("WWW-Authenticate", "Bearer");
  res.status(appError.status).json({ message: appError.message });
}
