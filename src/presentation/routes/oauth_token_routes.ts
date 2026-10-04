import { Router } from "express";
import type { OAuthTokenController } from "../controllers/oauth_token_controller.js";
import type { RateLimits } from "../middlewares/rate_limit.js";

export function createOAuthTokenRoutes(
  tokens: OAuthTokenController,
  limits: RateLimits,
): Router {
  return Router().post("/token", limits.oauthToken, tokens.issue);
}
