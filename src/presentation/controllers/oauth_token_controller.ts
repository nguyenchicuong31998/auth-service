import type { Request, Response } from "express";
import type { OAuthTokenService } from "../../application/services/oauth_token_service.js";
import { parseTokenRequest } from "../../application/validators/oauth_client_validator.js";

export class OAuthTokenController {
  constructor(private readonly tokens: OAuthTokenService) {}

  issue = async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    const request = parseTokenRequest(req.body, req.header("authorization"));
    res.json(await this.tokens.issue(request));
  };
}
