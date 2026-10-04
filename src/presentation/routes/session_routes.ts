import { Router, type RequestHandler } from "express";
import type { SessionController } from "../controllers/session_controller.js";
import type { Audit } from "../middlewares/audit.js";

export function createSessionRoutes(
  sessions: SessionController,
  authenticate: RequestHandler,
  audit: Audit,
): Router {
  return Router()
    .use(authenticate)
    .get("/", sessions.list)
    .delete("/:id", audit("session"), sessions.revoke);
}
