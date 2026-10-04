import { Router, type RequestHandler } from "express";
import type { UserDeviceController } from "../controllers/user_device_controller.js";
import type { Audit } from "../middlewares/audit.js";

export function createUserDeviceRoutes(
  devices: UserDeviceController,
  authenticate: RequestHandler,
  audit: Audit,
): Router {
  return Router()
    .use(authenticate)
    .get("/", devices.list)
    .patch("/:id", audit("device"), devices.update);
}
