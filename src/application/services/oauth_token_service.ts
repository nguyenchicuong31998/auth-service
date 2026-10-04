import type { AccessTokenService } from "../../domain/ports/access_token_service.js";
import type { UserDirectory } from "../../domain/ports/user_directory.js";
import type { OAuthClientRepository } from "../../domain/repositories/oauth_client_repository.js";
import type { ClientTokenDto } from "../dtos/oauth_client_dto.js";
import { OAuthError } from "../errors/oauth_error.js";
import { ACCESS_ALLOWED_STATUSES } from "../shared/permission_guard.js";
import { hashToken, isSameHash } from "../shared/token_hash.js";
import type { TokenRequest } from "../validators/oauth_client_validator.js";

export class OAuthTokenService {
  constructor(
    private readonly clients: OAuthClientRepository,
    private readonly users: UserDirectory,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async issue(request: TokenRequest): Promise<ClientTokenDto> {
    const client = await this.clients.findByClientId(request.clientId);
    const secretMatches =
      client !== null &&
      isSameHash(hashToken(request.clientSecret), client.clientSecretHash);
    if (!client || !secretMatches || client.status !== "active") {
      throw OAuthError.invalidClient();
    }

    const owner = await this.users.getAccess(client.ownerUserId);
    if (!owner || !ACCESS_ALLOWED_STATUSES.includes(owner.status)) {
      throw OAuthError.invalidClient();
    }
    const allowed = client.scopes.filter((scope) =>
      owner.permissions.includes(scope),
    );
    const scopes = request.scopes ?? allowed;
    const denied = scopes.filter((scope) => !allowed.includes(scope));
    if (denied.length > 0) {
      throw OAuthError.invalidScope(
        `Scopes not allowed for this client: ${denied.join(", ")}`,
      );
    }
    if (scopes.length === 0) {
      throw OAuthError.invalidScope("This client has no usable scopes");
    }

    const token = await this.accessTokens.issueClientToken(
      client.clientId,
      scopes,
    );
    return {
      access_token: token.token,
      token_type: "Bearer",
      expires_in: token.expiresIn,
      scope: scopes.join(" "),
    };
  }
}
