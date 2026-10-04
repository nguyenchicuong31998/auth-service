import { Router, type RequestHandler } from "express";
import type { OAuthClientController } from "../controllers/oauth_client_controller.js";
import type { Authorize } from "../middlewares/authorize.js";

export function createOAuthClientRoutes(
  clients: OAuthClientController,
  authenticate: RequestHandler,
  authorize: Authorize,
): Router {
  return Router()
    .use(authenticate)
    .post("/", authorize("oauth-client:create"), clients.create)
    .get("/", authorize("oauth-client:read"), clients.list)
    .get("/:id", authorize("oauth-client:read"), clients.get)
    .patch("/:id", authorize("oauth-client:update"), clients.update)
    .post("/:id/secret", authorize("oauth-client:update"), clients.rotateSecret)
    .delete("/:id", authorize("oauth-client:delete"), clients.delete);
}
