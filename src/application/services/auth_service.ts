import { validate as isUuid } from "uuid";
import type { Uuid } from "../../domain/entities/base_entity.js";
import {
  isSessionActive,
  type Session,
} from "../../domain/entities/session.js";
import type { UserDevice } from "../../domain/entities/user_device.js";
import type {
  AuthProvider,
  UserIdentity,
} from "../../domain/entities/user_identity.js";
import { UserServiceError } from "../../domain/errors/user_service_error.js";
import { DuplicateKeyError } from "../../domain/errors/duplicate_key_error.js";
import type {
  AccessTokenClaims,
  AccessTokenService,
} from "../../domain/ports/access_token_service.js";
import type { PasswordHasher } from "../../domain/ports/password_hasher.js";
import type {
  DirectoryUser,
  UserDirectory,
} from "../../domain/ports/user_directory.js";
import type { SessionRepository } from "../../domain/repositories/session_repository.js";
import type { UserDeviceRepository } from "../../domain/repositories/user_device_repository.js";
import type { UserIdentityRepository } from "../../domain/repositories/user_identity_repository.js";
import type {
  ClientContext,
  LoginResultDto,
  TokenPairDto,
} from "../dtos/auth_dto.js";
import { AppError } from "../errors/app_error.js";
import { generateToken, hashToken, isSameHash } from "../shared/token_hash.js";
import type { EmailVerificationService } from "./email_verification_service.js";
import type { PhoneOtpService } from "./phone_otp_service.js";
import type {
  ChangePasswordInput,
  DeviceInput,
  LoginInput,
  PhoneLoginInput,
  RegisterInput,
} from "../validators/auth_validator.js";

const LOGIN_ALLOWED_STATUSES = ["active", "pending"];
const DUMMY_PASSWORD = "dummy-password-for-timing";

const invalidCredentials = () =>
  AppError.unauthorized("Invalid email or password");
const invalidRefreshToken = () =>
  AppError.unauthorized("Invalid or expired refresh token");

function canLogin(user: DirectoryUser): boolean {
  return LOGIN_ALLOWED_STATUSES.includes(user.status);
}

function parseRefreshToken(
  token: string,
): { sessionId: Uuid; secret: string } | null {
  const [sessionId, secret, ...rest] = token.split(".");
  if (rest.length > 0 || !secret || !isUuid(sessionId)) return null;
  return { sessionId: sessionId.toLowerCase(), secret };
}

export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly identities: UserIdentityRepository,
    private readonly devices: UserDeviceRepository,
    private readonly sessions: SessionRepository,
    private readonly users: UserDirectory,
    private readonly passwords: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokenTtlMs: number,
    private readonly verification: EmailVerificationService,
    private readonly phoneOtps: PhoneOtpService,
  ) {}

  async register(input: RegisterInput): Promise<DirectoryUser> {
    if (await this.identities.findByProviderAccount("manual", input.email)) {
      throw AppError.conflict("Email already exists");
    }
    const password = await this.passwords.hash(input.password);
    const user = await this.users.register({
      fullName: input.fullName,
      email: input.email,
      phone: null,
      registeredFrom: "manual",
    });
    try {
      await this.identities.create({
        userId: user.id,
        provider: "manual",
        providerAccountId: input.email,
        password,
      });
    } catch (error) {
      if (error instanceof DuplicateKeyError) {
        throw AppError.conflict("Email already exists");
      }
      throw error;
    }
    await this.verification
      .sendVerification(user)
      .catch((error: Error) =>
        console.error("Sending verification email failed:", error.message),
      );
    return user;
  }

  async login(
    input: LoginInput,
    client: ClientContext,
  ): Promise<LoginResultDto> {
    const identity = await this.identities.findByProviderAccount(
      "manual",
      input.email,
    );
    const valid = identity?.password
      ? await this.passwords.verify(input.password, identity.password)
      : await this.rejectWithDummyHash(input.password);
    if (!identity || !valid) throw invalidCredentials();

    const user = await this.users.findById(identity.userId);
    if (!user) throw invalidCredentials();
    return this.signIn(user, identity, input.device, client);
  }

  /**
   * Passwordless login: a valid OTP proves the caller owns the phone. An
   * unknown phone gets an account on the spot (sign-up and login in one).
   */
  async phoneLogin(
    input: PhoneLoginInput,
    client: ClientContext,
  ): Promise<LoginResultDto & { isNewUser: boolean }> {
    await this.phoneOtps.consumeCode(input.phone, input.code);

    let identity = await this.identities.findByProviderAccount(
      "phone_otp",
      input.phone,
    );
    const isNewUser = !identity;
    identity ??= await this.createPhoneAccount(input);

    let user = await this.users.findById(identity.userId);
    if (!user) throw AppError.unauthorized("User no longer exists");
    if (!user.phoneVerified) {
      user = await this.markPhoneVerified(user.id, input.phone);
    }
    return {
      ...(await this.signIn(user, identity, input.device, client)),
      isNewUser,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPairDto> {
    const now = new Date();
    const parsed = parseRefreshToken(refreshToken);
    const session = parsed && (await this.sessions.findById(parsed.sessionId));
    if (!parsed || !session || !isSessionActive(session, now)) {
      throw invalidRefreshToken();
    }
    if (!isSameHash(hashToken(parsed.secret), session.refreshTokenHash)) {
      await this.sessions.revoke(session.id, {
        reason: "refresh_token_reused",
        at: now,
      });
      throw invalidRefreshToken();
    }
    await this.assertSessionAllowed(session, now);

    const secret = generateToken();
    const rotated = await this.sessions.rotate(
      session.id,
      session.refreshTokenHash,
      hashToken(secret),
      now,
    );
    if (!rotated) throw invalidRefreshToken();
    return this.issueTokens(session, secret);
  }

  async authenticate(accessToken: string): Promise<AccessTokenClaims> {
    const claims = await this.accessTokens.verify(accessToken);
    if (!claims) {
      throw AppError.unauthorized("Invalid or expired access token");
    }
    const session = await this.sessions.findById(claims.sessionId);
    if (
      !session ||
      session.userId !== claims.userId ||
      !isSessionActive(session, new Date())
    ) {
      throw AppError.unauthorized("Session is no longer active");
    }
    return claims;
  }

  async logout(auth: AccessTokenClaims): Promise<void> {
    await this.sessions.revoke(auth.sessionId, {
      reason: "logout",
      at: new Date(),
    });
  }

  async logoutAll(auth: AccessTokenClaims): Promise<void> {
    await this.sessions.revokeByUser(auth.userId, {
      reason: "logout_all",
      at: new Date(),
    });
  }

  async changePassword(
    auth: AccessTokenClaims,
    input: ChangePasswordInput,
  ): Promise<void> {
    if (input.currentPassword === input.newPassword) {
      throw AppError.badRequest(
        "newPassword must be different from currentPassword",
      );
    }
    const identities = (
      await this.identities.findAllByUser(auth.userId, "manual")
    ).filter((identity) => identity.password);
    if (identities.length === 0) {
      throw AppError.badRequest(
        "Password login is not enabled for this account",
      );
    }
    if (
      !(await this.passwords.verify(
        input.currentPassword,
        identities[0].password!,
      ))
    ) {
      throw AppError.badRequest("Current password is incorrect");
    }
    const hash = await this.passwords.hash(input.newPassword);
    // Email and phone logins share one password, so change it on both.
    for (const identity of identities) {
      await this.identities.updatePassword(identity.id, hash);
    }
    await this.sessions.revokeByUser(auth.userId, {
      reason: "password_changed",
      at: new Date(),
      exceptId: auth.sessionId,
    });
  }

  private async signIn(
    user: DirectoryUser,
    identity: UserIdentity,
    deviceInput: DeviceInput,
    client: ClientContext,
  ): Promise<LoginResultDto> {
    if (!canLogin(user)) throw AppError.forbidden(`Account is ${user.status}`);

    const now = new Date();
    const device = await this.resolveDevice(user.id, deviceInput, client, now);
    await this.sessions.revokeByDevice(device.id, {
      reason: "replaced",
      at: now,
    });
    const tokens = await this.startSession(user.id, device.id, client, now);
    await this.identities.markUsed(identity.id, now);
    await this.users
      .recordLogin(user.id, identity.provider as AuthProvider)
      .catch((error: Error) =>
        console.error("Recording login failed:", error.message),
      );
    return { ...tokens, deviceId: device.id, user };
  }

  private async createPhoneAccount(
    input: PhoneLoginInput,
  ): Promise<UserIdentity> {
    const user = await this.users.register({
      fullName: input.fullName ?? input.phone,
      email: null,
      phone: input.phone,
      registeredFrom: "phone_otp",
    });
    try {
      return await this.identities.create({
        userId: user.id,
        provider: "phone_otp",
        providerAccountId: input.phone,
        password: null,
      });
    } catch (error) {
      if (!(error instanceof DuplicateKeyError)) throw error;
      // A concurrent login created the account first: use that one.
      const existing = await this.identities.findByProviderAccount(
        "phone_otp",
        input.phone,
      );
      if (!existing) throw error;
      return existing;
    }
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
          "This phone number no longer belongs to the account",
        );
      }
      throw error;
    }
  }

  private async rejectWithDummyHash(password: string): Promise<false> {
    this.dummyHash ??= this.passwords.hash(DUMMY_PASSWORD);
    await this.passwords.verify(password, await this.dummyHash);
    return false;
  }

  private async resolveDevice(
    userId: Uuid,
    input: DeviceInput,
    client: ClientContext,
    now: Date,
  ): Promise<UserDevice> {
    const usage = {
      deviceName: input.deviceName,
      deviceType: input.deviceType,
      fcmToken: input.fcmToken,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    };
    const existing = input.id ? await this.devices.findById(input.id) : null;
    if (!existing || existing.userId !== userId) {
      return this.devices.create({ userId, ...usage });
    }
    if (!existing.isActive) throw AppError.forbidden("Device is disabled");
    return (
      (await this.devices.recordUsage(existing.id, usage, now)) ?? existing
    );
  }

  private async assertSessionAllowed(
    session: Session,
    now: Date,
  ): Promise<void> {
    const device = await this.devices.findById(session.deviceId);
    if (!device?.isActive) {
      await this.sessions.revoke(session.id, {
        reason: "device_disabled",
        at: now,
      });
      throw AppError.forbidden("Device is disabled");
    }
    const user = await this.users.findById(session.userId);
    if (!user || !canLogin(user)) {
      await this.sessions.revoke(session.id, {
        reason: "account_disabled",
        at: now,
      });
      throw user
        ? AppError.forbidden(`Account is ${user.status}`)
        : invalidRefreshToken();
    }
  }

  private async startSession(
    userId: Uuid,
    deviceId: Uuid,
    client: ClientContext,
    now: Date,
  ): Promise<TokenPairDto> {
    const secret = generateToken();
    const session = await this.sessions.create({
      userId,
      deviceId,
      refreshTokenHash: hashToken(secret),
      expiredAt: new Date(now.getTime() + this.refreshTokenTtlMs),
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    });
    return this.issueTokens(session, secret);
  }

  private async issueTokens(
    session: Session,
    secret: string,
  ): Promise<TokenPairDto> {
    const access = await this.accessTokens.issue({
      userId: session.userId,
      sessionId: session.id,
    });
    return {
      tokenType: "Bearer",
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: `${session.id}.${secret}`,
      refreshTokenExpiresAt: session.expiredAt,
      sessionId: session.id,
    };
  }
}
