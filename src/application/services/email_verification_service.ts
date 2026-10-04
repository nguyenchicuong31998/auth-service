import { isVerificationTokenUsable } from "../../domain/entities/email_verification_token.js";
import { UserServiceError } from "../../domain/errors/user_service_error.js";
import type { NotificationSender } from "../../domain/ports/notification_sender.js";
import type {
  DirectoryUser,
  UserDirectory,
} from "../../domain/ports/user_directory.js";
import type { EmailVerificationTokenRepository } from "../../domain/repositories/email_verification_token_repository.js";
import type { UserIdentityRepository } from "../../domain/repositories/user_identity_repository.js";
import { AppError } from "../errors/app_error.js";
import { generateToken, hashToken } from "../shared/token_hash.js";

const RESEND_COOLDOWN_MS = 60_000;

export interface EmailVerificationOptions {
  ttlMs: number;
  verifyUrl: string;
}

const invalidToken = () =>
  AppError.badRequest("Invalid or expired verification token");

function logFailure(action: string) {
  return (error: unknown) =>
    console.error(`${action} failed:`, (error as Error).message);
}

export class EmailVerificationService {
  constructor(
    private readonly tokens: EmailVerificationTokenRepository,
    private readonly identities: UserIdentityRepository,
    private readonly users: UserDirectory,
    private readonly notifications: NotificationSender,
    private readonly options: EmailVerificationOptions,
  ) {}

  async sendVerification(user: DirectoryUser): Promise<void> {
    if (!user.email || user.emailVerified) return;
    const now = new Date();
    await this.tokens.consumeAllByUser(user.id, now);
    const rawToken = generateToken();
    await this.tokens.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now.getTime() + this.options.ttlMs),
    });
    const verifyUrl = new URL(this.options.verifyUrl);
    verifyUrl.searchParams.set("token", rawToken);
    await this.notifications.sendEmail("email-verification", user.email, {
      name: user.fullName,
      verifyUrl: verifyUrl.toString(),
    });
  }

  requestResend(email: string): void {
    this.resend(email).catch(logFailure("Resending verification email"));
  }

  async verify(rawToken: string): Promise<DirectoryUser> {
    const now = new Date();
    const token = await this.tokens.findByHash(hashToken(rawToken));
    if (!token || !isVerificationTokenUsable(token, now)) {
      throw invalidToken();
    }

    const identity = await this.identities.findByUser(token.userId, "manual");
    if (!identity) throw invalidToken();

    const user = await this.markVerified(
      token.userId,
      identity.providerAccountId,
    );
    const consumed = await this.tokens.consume(token.id, new Date());
    if (consumed && user.email) {
      this.notifications
        .sendEmail("welcome", user.email, { name: user.fullName })
        .catch(logFailure("Sending welcome email"));
    }
    return user;
  }

  private async resend(email: string): Promise<void> {
    const identity = await this.identities.findByProviderAccount(
      "manual",
      email,
    );
    if (!identity) return;
    const user = await this.users.findById(identity.userId);
    if (!user || user.emailVerified || user.email !== email) return;
    const latest = await this.tokens.findLatestByUser(user.id);
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      return;
    }
    await this.sendVerification(user);
  }

  private async markVerified(
    userId: string,
    email: string,
  ): Promise<DirectoryUser> {
    try {
      return await this.users.verifyEmail(userId, email);
    } catch (error) {
      if (error instanceof UserServiceError && error.status === 409) {
        throw AppError.conflict(
          "The email has changed since this link was sent",
        );
      }
      if (error instanceof UserServiceError && error.status === 404) {
        throw invalidToken();
      }
      throw error;
    }
  }
}
