import { Router } from "express";
import type { OAuthTokenController } from "../controllers/oauth_token_controller.js";

export function createOAuthTokenRoutes(tokens: OAuthTokenController): Router {
  return Router().post("/token", tokens.issue);
}
