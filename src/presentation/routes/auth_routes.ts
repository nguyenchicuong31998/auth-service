import { Router, type RequestHandler } from "express";
import type { AuthController } from "../controllers/auth_controller.js";

export function createAuthRoutes(
  auth: AuthController,
  authenticate: RequestHandler,
): Router {
  return Router()
    .post("/register", auth.register)
    .post("/login", auth.login)
    .post("/refresh", auth.refresh)
    .post("/logout", authenticate, auth.logout)
    .post("/logout-all", authenticate, auth.logoutAll)
    .put("/password", authenticate, auth.changePassword);
}
