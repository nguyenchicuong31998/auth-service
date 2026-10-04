import type { Request, Response } from "express";
import type { AuthService } from "../../application/services/auth_service.js";
import type { EmailVerificationService } from "../../application/services/email_verification_service.js";
import {
  parseChangePasswordInput,
  parseLoginInput,
  parseRefreshTokenInput,
  parseRegisterInput,
  parseResendVerificationInput,
  parseVerifyEmailInput,
} from "../../application/validators/auth_validator.js";
import { getAuth, getClientContext } from "../utils/request.js";

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: EmailVerificationService,
  ) {}

  register = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.auth.register(parseRegisterInput(req.body)));
  };

  login = async (req: Request, res: Response) => {
    const input = parseLoginInput(req.body);
    res.json(await this.auth.login(input, getClientContext(req)));
  };

  refresh = async (req: Request, res: Response) => {
    res.json(await this.auth.refresh(parseRefreshTokenInput(req.body)));
  };

  verifyEmail = async (req: Request, res: Response) => {
    res.json(await this.verification.verify(parseVerifyEmailInput(req.body)));
  };

  resendVerification = async (req: Request, res: Response) => {
    this.verification.requestResend(parseResendVerificationInput(req.body));
    res.status(202).end();
  };

  logout = async (_req: Request, res: Response) => {
    await this.auth.logout(getAuth(res));
    res.status(204).end();
  };

  logoutAll = async (_req: Request, res: Response) => {
    await this.auth.logoutAll(getAuth(res));
    res.status(204).end();
  };

  changePassword = async (req: Request, res: Response) => {
    const input = parseChangePasswordInput(req.body);
    await this.auth.changePassword(getAuth(res), input);
    res.status(204).end();
  };
}
