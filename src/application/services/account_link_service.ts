import type { Uuid } from "../../domain/entities/base_entity.js";
import { DuplicateKeyError } from "../../domain/errors/duplicate_key_error.js";
import { UserServiceError } from "../../domain/errors/user_service_error.js";
import type { AccessTokenClaims } from "../../domain/ports/access_token_service.js";
import type { PasswordHasher } from "../../domain/ports/password_hasher.js";
import type {
  DirectoryUser,
  UserDirectory,
} from "../../domain/ports/user_directory.js";
import type { UserIdentityRepository } from "../../domain/repositories/user_identity_repository.js";
import { AppError } from "../errors/app_error.js";
import {
  emailTakenError,
  type EmailVerificationService,
} from "./email_verification_service.js";
import type { PhoneOtpService } from "./phone_otp_service.js";

export interface LinkedIdentityDto {
  method: "email" | "phone";
  value: string;
  linkedAt: Date;
  lastUsedAt: Date | null;
}

const phoneTakenError = () =>
  AppError.conflict("This phone number is already used by another account");

export class AccountLinkService {
  constructor(
    private readonly identities: UserIdentityRepository,
    private readonly users: UserDirectory,
    private readonly passwords: PasswordHasher,
    private readonly phoneOtps: PhoneOtpService,
    private readonly verification: EmailVerificationService,
  ) {}

  async list(auth: AccessTokenClaims): Promise<LinkedIdentityDto[]> {
    const [emails, phones] = await Promise.all([
      this.identities.findAllByUser(auth.userId, "manual"),
      this.identities.findAllByUser(auth.userId, "phone_otp"),
    ]);
    return [
      ...emails.map((identity) => ({ ...identity, method: "email" as const })),
      ...phones.map((identity) => ({ ...identity, method: "phone" as const })),
    ].map(({ method, providerAccountId, createdAt, lastUsedAt }) => ({
      method,
      value: providerAccountId,
      linkedAt: createdAt,
      lastUsedAt,
    }));
  }

  async requestPhoneOtp(auth: AccessTokenClaims, phone: string): Promise<void> {
    await this.assertPhoneLinkable(auth.userId, phone);
    this.phoneOtps.requestOtp(phone);
  }

  async linkPhone(
    auth: AccessTokenClaims,
    phone: string,
    code: string,
  ): Promise<DirectoryUser> {
    const alreadyMine = await this.assertPhoneLinkable(auth.userId, phone);
    await this.phoneOtps.consumeCode(phone, code);
    const user = await this.markPhoneVerified(auth.userId, phone);
    if (alreadyMine) return user;
    try {
      await this.identities.create({
        userId: auth.userId,
        provider: "phone_otp",
        providerAccountId: phone,
        password: null,
      });
    } catch (error) {
      if (error instanceof DuplicateKeyError) throw phoneTakenError();
      throw error;
    }
    return user;
  }

  async requestEmailLink(
    auth: AccessTokenClaims,
    email: string,
    password: string,
  ): Promise<void> {
    if ((await this.identities.findAllByUser(auth.userId, "manual")).length) {
      throw AppError.conflict("This account already has an email");
    }
    if (await this.identities.findByProviderAccount("manual", email)) {
      throw emailTakenError();
    }
    const holder = await this.users.findByEmail(email);
    if (holder && holder.id !== auth.userId) throw emailTakenError();

    const user = await this.users.findById(auth.userId);
    if (!user) throw AppError.unauthorized("User no longer exists");
    if (user.email && user.email !== email) {
      throw AppError.conflict("This account already has a different email");
    }
    await this.verification
      .sendLinkVerification(user, email, await this.passwords.hash(password))
      .catch((error: Error) =>
        console.error("Sending link verification failed:", error.message),
      );
  }

  private async assertPhoneLinkable(
    userId: Uuid,
    phone: string,
  ): Promise<boolean> {
    const owner = await this.identities.findByProviderAccount(
      "phone_otp",
      phone,
    );
    if (owner && owner.userId !== userId) throw phoneTakenError();
    if (owner) return true;
    if ((await this.identities.findAllByUser(userId, "phone_otp")).length) {
      throw AppError.conflict("This account already has a phone number");
    }
    return false;
  }

  private async markPhoneVerified(
    userId: Uuid,
    phone: string,
  ): Promise<DirectoryUser> {
    try {
      return await this.users.verifyPhone(userId, phone);
    } catch (error) {
      if (error instanceof UserServiceError && error.status === 409) {
        throw AppError.conflict(
          "This account already has a different phone number",
        );
      }
      throw error;
    }
  }
}
