import { Router, type RequestHandler } from "express";
import type { AuthController } from "../controllers/auth_controller.js";
import type { RateLimits } from "../middlewares/rate_limit.js";

export function createAuthRoutes(
  auth: AuthController,
  authenticate: RequestHandler,
  limits: RateLimits,
): Router {
  return Router()
    .post("/register", limits.register, auth.register)
    .post("/login", limits.login, auth.login)
    .post("/refresh", limits.publicAuth, auth.refresh)
    .post("/verify-email", limits.publicAuth, auth.verifyEmail)
    .post(
      "/verify-email/resend",
      limits.resendVerification,
      auth.resendVerification,
    )
    .post("/logout", authenticate, auth.logout)
    .post("/logout-all", authenticate, auth.logoutAll)
    .put("/password", authenticate, auth.changePassword);
}
