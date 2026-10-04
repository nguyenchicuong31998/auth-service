import type { Uuid } from "../../domain/entities/base_entity.js";
import type { UserDevice } from "../../domain/entities/user_device.js";
import type { AccessTokenClaims } from "../../domain/ports/access_token_service.js";
import type { SessionRepository } from "../../domain/repositories/session_repository.js";
import type {
  UserDeviceChanges,
  UserDeviceRepository,
} from "../../domain/repositories/user_device_repository.js";
import { AppError } from "../errors/app_error.js";

const deviceNotFound = () => AppError.notFound("Device not found");

export class UserDeviceService {
  constructor(
    private readonly devices: UserDeviceRepository,
    private readonly sessions: SessionRepository,
  ) {}

  list(auth: AccessTokenClaims): Promise<UserDevice[]> {
    return this.devices.findByUser(auth.userId);
  }

  async update(
    auth: AccessTokenClaims,
    id: Uuid,
    changes: UserDeviceChanges,
  ): Promise<UserDevice> {
    const device = await this.devices.findById(id);
    if (!device || device.userId !== auth.userId) throw deviceNotFound();

    const updated = await this.devices.update(id, changes);
    if (!updated) throw deviceNotFound();
    if (changes.isActive === false) {
      await this.sessions.revokeByDevice(id, {
        reason: "device_disabled",
        at: new Date(),
      });
    }
    return updated;
  }
}
