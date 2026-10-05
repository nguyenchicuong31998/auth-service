import type { Uuid } from "../entities/base_entity.js";
import type { EmailVerificationToken } from "../entities/email_verification_token.js";

export type NewEmailVerificationToken = Pick<
  EmailVerificationToken,
  "userId" | "tokenHash" | "expiresAt"
> &
  Partial<Pick<EmailVerificationToken, "email" | "passwordHash">>;

export interface EmailVerificationTokenRepository {
  create(data: NewEmailVerificationToken): Promise<EmailVerificationToken>;
  findByHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  findLatestByUser(userId: Uuid): Promise<EmailVerificationToken | null>;
  consume(id: Uuid, at: Date): Promise<boolean>;
  consumeAllByUser(userId: Uuid, at: Date): Promise<number>;
}
