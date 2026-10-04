import { Router, type RequestHandler } from "express";
import type { SessionController } from "../controllers/session_controller.js";

export function createSessionRoutes(
  sessions: SessionController,
  authenticate: RequestHandler,
): Router {
  return Router()
    .use(authenticate)
    .get("/", sessions.list)
    .delete("/:id", sessions.revoke);
}
