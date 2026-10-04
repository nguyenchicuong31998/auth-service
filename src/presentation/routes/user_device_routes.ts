import { Router, type RequestHandler } from "express";
import type { UserDeviceController } from "../controllers/user_device_controller.js";

export function createUserDeviceRoutes(
  devices: UserDeviceController,
  authenticate: RequestHandler,
): Router {
  return Router()
    .use(authenticate)
    .get("/", devices.list)
    .patch("/:id", devices.update);
}
