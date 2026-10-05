import { Router, type RequestHandler } from "express";
import type { AccountController } from "../controllers/account_controller.js";
import type { Audit } from "../middlewares/audit.js";
import type { RateLimits } from "../middlewares/rate_limit.js";

export function createAccountRoutes(
  account: AccountController,
  authenticate: RequestHandler,
  limits: RateLimits,
  audit: Audit,
): Router {
  return Router()
    .get("/identities", authenticate, account.identities)
    .post("/phone/otp", limits.phoneOtp, authenticate, account.requestPhoneOtp)
    .post(
      "/phone",
      limits.phoneLogin,
      authenticate,
      audit("auth-link-phone"),
      account.linkPhone,
    )
    .post(
      "/email",
      limits.resendVerification,
      authenticate,
      audit("auth-link-email", { captureResponse: false }),
      account.linkEmail,
    );
}
