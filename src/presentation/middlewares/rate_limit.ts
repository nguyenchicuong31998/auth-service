import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";

const MINUTE = 60_000;

export interface RateLimits {
  login: RequestHandler[];
  phoneOtp: RequestHandler;
  phoneLogin: RequestHandler;
  register: RequestHandler;
  publicAuth: RequestHandler;
  resendVerification: RequestHandler;
  oauthToken: RequestHandler;
}

const passThrough: RequestHandler = (_req, _res, next) => next();

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

const bodyField = (req: Request, field: string) => {
  const value = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof value === "string" ? value.trim().toLowerCase() : "";
};

export function createRateLimits(enabled: boolean): RateLimits {
  const limit = (options: Partial<Options>): RequestHandler =>
    enabled
      ? rateLimit({
          standardHeaders: "draft-8",
          legacyHeaders: false,
          message: { message: "Too many requests, please try again later" },
          ...options,
        })
      : passThrough;

  return {
    login: [
      limit({
        windowMs: 15 * MINUTE,
        limit: 30,
        skipSuccessfulRequests: true,
        keyGenerator: clientIp,
      }),
      limit({
        windowMs: 15 * MINUTE,
        limit: 5,
        skipSuccessfulRequests: true,
        keyGenerator: (req) => `${clientIp(req)}|${bodyField(req, "email")}`,
      }),
    ],
    phoneOtp: limit({ windowMs: 15 * MINUTE, limit: 5 }),
    phoneLogin: limit({
      windowMs: 15 * MINUTE,
      limit: 10,
      skipSuccessfulRequests: true,
      keyGenerator: clientIp,
    }),
    register: limit({ windowMs: 60 * MINUTE, limit: 10 }),
    publicAuth: limit({ windowMs: 15 * MINUTE, limit: 100 }),
    resendVerification: limit({ windowMs: 15 * MINUTE, limit: 5 }),
    oauthToken: limit({
      windowMs: 15 * MINUTE,
      limit: 10,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => `${clientIp(req)}|${bodyField(req, "client_id")}`,
    }),
  };
}
