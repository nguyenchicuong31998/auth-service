import type { KeyObject } from "node:crypto";
import { SuperAdminSeeder } from "./application/seeders/super_admin_seeder.js";
import { AuthService } from "./application/services/auth_service.js";
import { SessionService } from "./application/services/session_service.js";
import { UserDeviceService } from "./application/services/user_device_service.js";
import type { AccessTokenService } from "./domain/ports/access_token_service.js";
import type { PasswordHasher } from "./domain/ports/password_hasher.js";
import type { UserDirectory } from "./domain/ports/user_directory.js";
import { env } from "./infrastructure/config/env.js";
import { MongooseSessionRepository } from "./infrastructure/database/mongodb/repositories/mongoose_session_repository.js";
import { MongooseUserDeviceRepository } from "./infrastructure/database/mongodb/repositories/mongoose_user_device_repository.js";
import { MongooseUserIdentityRepository } from "./infrastructure/database/mongodb/repositories/mongoose_user_identity_repository.js";
import { UserServiceClient } from "./infrastructure/http/user_service_client.js";
import { BcryptPasswordHasher } from "./infrastructure/security/bcrypt_password_hasher.js";
import { JoseAccessTokenService } from "./infrastructure/security/jose_access_token_service.js";
import { loadPrivateKey } from "./infrastructure/security/rsa_key_file.js";
import { ServiceTokenProvider } from "./infrastructure/security/service_token_provider.js";
import type { ApiRoute } from "./presentation/app.js";
import { AuthController } from "./presentation/controllers/auth_controller.js";
import { JwksController } from "./presentation/controllers/jwks_controller.js";
import { SessionController } from "./presentation/controllers/session_controller.js";
import { UserDeviceController } from "./presentation/controllers/user_device_controller.js";
import { createAuthenticate } from "./presentation/middlewares/authenticate.js";
import { createAuthRoutes } from "./presentation/routes/auth_routes.js";
import { createJwksRoutes } from "./presentation/routes/jwks_routes.js";
import { createSessionRoutes } from "./presentation/routes/session_routes.js";
import { createUserDeviceRoutes } from "./presentation/routes/user_device_routes.js";
import { OAuthClientService } from "./application/services/oauth_client_service.js";
import { OAuthTokenService } from "./application/services/oauth_token_service.js";
import { PermissionGuard } from "./application/shared/permission_guard.js";
import { MongooseOAuthClientRepository } from "./infrastructure/database/mongodb/repositories/mongoose_oauth_client_repository.js";
import { OAuthClientController } from "./presentation/controllers/oauth_client_controller.js";
import { OAuthTokenController } from "./presentation/controllers/oauth_token_controller.js";
import { createAuthorize } from "./presentation/middlewares/authorize.js";
import { createOAuthClientRoutes } from "./presentation/routes/oauth_client_routes.js";
import { createOAuthTokenRoutes } from "./presentation/routes/oauth_token_routes.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExternalServices {
  userDirectory: UserDirectory;
  passwordHasher: PasswordHasher;
  accessTokens: AccessTokenService;
}

const SERVICE_NAME = "auth-service";
const USER_SERVICE_SCOPES = ["user:create", "user:read"];

const loadSigningKey = () => loadPrivateKey(env.jwt.privateKeyPath);

const createUserDirectory = (signingKey: KeyObject) =>
  new UserServiceClient(
    env.userServiceUrl,
    new ServiceTokenProvider(signingKey, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      serviceName: SERVICE_NAME,
      scopes: USER_SERVICE_SCOPES,
    }),
  );

const createPasswordHasher = () => new BcryptPasswordHasher(env.bcryptRounds);

function createExternalServices(): ExternalServices {
  const signingKey = loadSigningKey();
  return {
    userDirectory: createUserDirectory(signingKey),
    passwordHasher: createPasswordHasher(),
    accessTokens: new JoseAccessTokenService(signingKey, env.jwt),
  };
}

function createRepositories() {
  return {
    identities: new MongooseUserIdentityRepository(),
    devices: new MongooseUserDeviceRepository(),
    sessions: new MongooseSessionRepository(),
    oauthClients: new MongooseOAuthClientRepository(),
  };
}

export function createRoutes(
  external: ExternalServices = createExternalServices(),
): ApiRoute[] {
  const { identities, devices, sessions, oauthClients } = createRepositories();
  const { userDirectory, passwordHasher, accessTokens } = external;

  const authService = new AuthService(
    identities,
    devices,
    sessions,
    userDirectory,
    passwordHasher,
    accessTokens,
    env.refreshTokenTtlDays * DAY_MS,
  );
  const sessionService = new SessionService(sessions, devices);
  const userDeviceService = new UserDeviceService(devices, sessions);
  const authenticate = createAuthenticate(authService);
  const permissionGuard = new PermissionGuard(userDirectory);
  const authorize = createAuthorize(permissionGuard);
  const oauthClientService = new OAuthClientService(
    oauthClients,
    permissionGuard,
  );
  const oauthTokenService = new OAuthTokenService(
    oauthClients,
    userDirectory,
    accessTokens,
  );

  return [
    {
      path: "/api/auth",
      router: createAuthRoutes(new AuthController(authService), authenticate),
    },
    {
      path: "/api/auth/sessions",
      router: createSessionRoutes(
        new SessionController(sessionService),
        authenticate,
      ),
    },
    {
      path: "/api/auth/devices",
      router: createUserDeviceRoutes(
        new UserDeviceController(userDeviceService),
        authenticate,
      ),
    },
    {
      path: "/api/oauth-clients",
      router: createOAuthClientRoutes(
        new OAuthClientController(oauthClientService),
        authenticate,
        authorize,
      ),
    },
    {
      path: "/oauth",
      router: createOAuthTokenRoutes(
        new OAuthTokenController(oauthTokenService),
      ),
    },
    {
      path: "/.well-known",
      router: createJwksRoutes(new JwksController(accessTokens)),
    },
  ];
}

export function createSeeder(
  external: Pick<ExternalServices, "userDirectory" | "passwordHasher"> = {
    userDirectory: createUserDirectory(loadSigningKey()),
    passwordHasher: createPasswordHasher(),
  },
): SuperAdminSeeder {
  const { identities } = createRepositories();
  return new SuperAdminSeeder(
    identities,
    external.userDirectory,
    external.passwordHasher,
  );
}

export function createOAuthClientAdmin(
  userDirectory: UserDirectory = createUserDirectory(loadSigningKey()),
): { clients: OAuthClientService; users: UserDirectory } {
  const { oauthClients } = createRepositories();
  return {
    clients: new OAuthClientService(
      oauthClients,
      new PermissionGuard(userDirectory),
    ),
    users: userDirectory,
  };
}
