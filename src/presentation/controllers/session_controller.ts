import type { Request, Response } from "express";
import type { SessionService } from "../../application/services/session_service.js";
import { getAuth, getIdParam } from "../utils/request.js";

export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.sessions.list(getAuth(res)));
  };

  revoke = async (req: Request, res: Response) => {
    await this.sessions.revoke(getAuth(res), getIdParam(req));
    res.status(204).end();
  };
}
