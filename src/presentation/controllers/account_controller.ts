import type { Request, Response } from "express";
import type { AccountLinkService } from "../../application/services/account_link_service.js";
import {
  parseLinkEmailInput,
  parseLinkPhoneInput,
  parsePhoneOtpRequest,
} from "../../application/validators/auth_validator.js";
import { getAuth } from "../utils/request.js";

export class AccountController {
  constructor(private readonly links: AccountLinkService) {}

  identities = async (_req: Request, res: Response) => {
    res.json(await this.links.list(getAuth(res)));
  };

  requestPhoneOtp = async (req: Request, res: Response) => {
    const phone = parsePhoneOtpRequest(req.body);
    await this.links.requestPhoneOtp(getAuth(res), phone);
    res.status(202).end();
  };

  linkPhone = async (req: Request, res: Response) => {
    const { phone, code } = parseLinkPhoneInput(req.body);
    res.json(await this.links.linkPhone(getAuth(res), phone, code));
  };

  linkEmail = async (req: Request, res: Response) => {
    const { email, password } = parseLinkEmailInput(req.body);
    await this.links.requestEmailLink(getAuth(res), email, password);
    res.status(202).end();
  };
}
