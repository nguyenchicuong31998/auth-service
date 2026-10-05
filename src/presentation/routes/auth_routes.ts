import { Router, type RequestHandler } from "express";
import type { AuthController } from "../controllers/auth_controller.js";
import type { Audit } from "../middlewares/audit.js";
import type { RateLimits } from "../middlewares/rate_limit.js";

export function createAuthRoutes(
  auth: AuthController,
  authenticate: RequestHandler,
  limits: RateLimits,
  audit: Audit,
): Router {
  const withoutBody = { captureResponse: false };
  return Router()
    .post("/register", limits.register, audit("auth-register"), auth.register)
    .post(
      "/login",
      ...limits.login,
      audit("auth-login", {
        captureResponse: false,
        resourceId: (_req, body) =>
          (body as { user?: { id?: string } } | undefined)?.user?.id ?? null,
      }),
      auth.login,
    )
    .post("/refresh", limits.publicAuth, auth.refresh)
    .post(
      "/verify-email",
      limits.publicAuth,
      audit("auth-verify-email"),
      auth.verifyEmail,
    )
    .post(
      "/verify-email/resend",
      limits.resendVerification,
      auth.resendVerification,
    )
    .post("/phone/otp", limits.phoneOtp, auth.requestPhoneOtp)
    .post(
      "/phone/login",
      limits.phoneLogin,
      audit("auth-phone-login", {
        captureResponse: false,
        resourceId: (_req, body) =>
          (body as { user?: { id?: string } } | undefined)?.user?.id ?? null,
      }),
      auth.phoneLogin,
    )
    .post(
      "/logout",
      authenticate,
      audit("auth-logout", withoutBody),
      auth.logout,
    )
    .post(
      "/logout-all",
      authenticate,
      audit("auth-logout-all", withoutBody),
      auth.logoutAll,
    )
    .put(
      "/password",
      authenticate,
      audit("auth-password", withoutBody),
      auth.changePassword,
    );
}
