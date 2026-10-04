import type { Request, Response } from "express";
import type { ClientContext } from "../../application/dtos/auth_dto.js";
import { parseUuid } from "../../application/validators/common_validator.js";
import type { Uuid } from "../../domain/entities/base_entity.js";
import type { AccessTokenClaims } from "../../domain/ports/access_token_service.js";

export function getClientContext(req: Request): ClientContext {
  return {
    ipAddress: req.ip?.slice(0, 50) ?? null,
    userAgent: req.header("user-agent")?.slice(0, 500) ?? null,
  };
}

export function getIdParam(req: Request): Uuid {
  return parseUuid(req.params.id, "id");
}

export function setAuth(res: Response, claims: AccessTokenClaims): void {
  res.locals.auth = claims;
}

export function getAuth(res: Response): AccessTokenClaims {
  return res.locals.auth as AccessTokenClaims;
}
