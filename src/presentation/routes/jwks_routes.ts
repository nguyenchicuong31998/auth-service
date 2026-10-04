import { Router } from "express";
import type { JwksController } from "../controllers/jwks_controller.js";

export function createJwksRoutes(jwks: JwksController): Router {
  return Router().get("/jwks.json", jwks.get);
}
