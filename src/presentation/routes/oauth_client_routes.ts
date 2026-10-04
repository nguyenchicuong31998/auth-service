import { Router, type RequestHandler } from "express";
import type { OAuthClientController } from "../controllers/oauth_client_controller.js";
import type { Audit } from "../middlewares/audit.js";
import type { Authorize } from "../middlewares/authorize.js";

export function createOAuthClientRoutes(
  clients: OAuthClientController,
  authenticate: RequestHandler,
  authorize: Authorize,
  audit: Audit,
): Router {
  const before = { before: clients.current };
  return Router()
    .use(authenticate)
    .post(
      "/",
      authorize("oauth-client:create"),
      audit("oauth-client"),
      clients.create,
    )
    .get("/", authorize("oauth-client:read"), clients.list)
    .get("/:id", authorize("oauth-client:read"), clients.get)
    .patch(
      "/:id",
      authorize("oauth-client:update"),
      audit("oauth-client", before),
      clients.update,
    )
    .post(
      "/:id/secret",
      authorize("oauth-client:update"),
      audit("oauth-client", before),
      clients.rotateSecret,
    )
    .delete(
      "/:id",
      authorize("oauth-client:delete"),
      audit("oauth-client", before),
      clients.delete,
    );
}
