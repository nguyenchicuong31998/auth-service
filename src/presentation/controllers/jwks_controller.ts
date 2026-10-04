import type { Request, Response } from "express";
import type { AccessTokenService } from "../../domain/ports/access_token_service.js";

export class JwksController {
  constructor(private readonly accessTokens: AccessTokenService) {}

  get = (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(this.accessTokens.publicKeys());
  };
}
