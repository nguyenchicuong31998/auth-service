import type { Request, Response } from "express";
import type { OAuthClientService } from "../../application/services/oauth_client_service.js";
import {
  parseCreateOAuthClientInput,
  parseListOAuthClientsQuery,
  parseUpdateOAuthClientInput,
} from "../../application/validators/oauth_client_validator.js";
import { getAuth, getIdParam } from "../utils/request.js";

export class OAuthClientController {
  constructor(private readonly clients: OAuthClientService) {}

  current = (req: Request) => this.clients.get(getIdParam(req));

  create = async (req: Request, res: Response) => {
    const input = parseCreateOAuthClientInput(req.body);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(await this.clients.create(getAuth(res).userId, input));
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.clients.list(parseListOAuthClientsQuery(req.query)));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.clients.get(getIdParam(req)));
  };

  update = async (req: Request, res: Response) => {
    const changes = parseUpdateOAuthClientInput(req.body);
    res.json(await this.clients.update(getAuth(res), getIdParam(req), changes));
  };

  rotateSecret = async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await this.clients.rotateSecret(getAuth(res), getIdParam(req)));
  };

  delete = async (req: Request, res: Response) => {
    await this.clients.delete(getAuth(res), getIdParam(req));
    res.status(204).end();
  };
}
