import type { Request, Response } from "express";
import type { UserDeviceService } from "../../application/services/user_device_service.js";
import { parseUpdateDeviceInput } from "../../application/validators/user_device_validator.js";
import { getAuth, getIdParam } from "../utils/request.js";

export class UserDeviceController {
  constructor(private readonly devices: UserDeviceService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.devices.list(getAuth(res)));
  };

  update = async (req: Request, res: Response) => {
    const id = getIdParam(req);
    const changes = parseUpdateDeviceInput(req.body);
    res.json(await this.devices.update(getAuth(res), id, changes));
  };
}
