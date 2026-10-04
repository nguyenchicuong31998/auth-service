import type { Uuid } from "../../domain/entities/base_entity.js";
import type { OAuthClient } from "../../domain/entities/oauth_client.js";
import type { AccessTokenClaims } from "../../domain/ports/access_token_service.js";
import type {
  OAuthClientChanges,
  OAuthClientRepository,
} from "../../domain/repositories/oauth_client_repository.js";
import {
  toOAuthClientDto,
  type OAuthClientDto,
  type OAuthClientPageDto,
  type OAuthClientWithSecretDto,
} from "../dtos/oauth_client_dto.js";
import { AppError } from "../errors/app_error.js";
import type { PermissionGuard } from "../shared/permission_guard.js";
import { generateToken, hashToken } from "../shared/token_hash.js";
import type {
  CreateOAuthClientInput,
  OAuthClientListQuery,
} from "../validators/oauth_client_validator.js";

const CLIENT_ID_PREFIX = "cli_";

const clientNotFound = () => AppError.notFound("OAuth client not found");

export class OAuthClientService {
  constructor(
    private readonly clients: OAuthClientRepository,
    private readonly permissions: PermissionGuard,
  ) {}

  async create(
    ownerUserId: Uuid,
    input: CreateOAuthClientInput,
  ): Promise<OAuthClientWithSecretDto> {
    await this.permissions.assertCanGrant(ownerUserId, input.scopes);
    const clientSecret = generateToken();
    const client = await this.clients.create({
      ownerUserId,
      name: input.name,
      clientId: CLIENT_ID_PREFIX + generateToken(18),
      clientSecretHash: hashToken(clientSecret),
      scopes: input.scopes,
    });
    return { ...toOAuthClientDto(client), clientSecret };
  }

  async list(query: OAuthClientListQuery): Promise<OAuthClientPageDto> {
    const { page, limit, ...filter } = query;
    const { items, total } = await this.clients.list(filter, page, limit);
    return {
      items: items.map(toOAuthClientDto),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async get(id: Uuid): Promise<OAuthClientDto> {
    return toOAuthClientDto(await this.findOrFail(id));
  }

  async update(
    auth: AccessTokenClaims,
    id: Uuid,
    changes: OAuthClientChanges,
  ): Promise<OAuthClientDto> {
    await this.findChangeable(id);
    if (changes.scopes) {
      await this.permissions.assertCanGrant(auth.userId, changes.scopes);
    }
    const updated = await this.clients.update(id, changes);
    if (!updated) throw clientNotFound();
    return toOAuthClientDto(updated);
  }

  async rotateSecret(id: Uuid): Promise<OAuthClientWithSecretDto> {
    await this.findChangeable(id);
    const clientSecret = generateToken();
    const updated = await this.clients.update(id, {
      clientSecretHash: hashToken(clientSecret),
    });
    if (!updated) throw clientNotFound();
    return { ...toOAuthClientDto(updated), clientSecret };
  }

  async delete(id: Uuid): Promise<void> {
    if (!(await this.clients.softDelete(id))) throw clientNotFound();
  }

  private async findOrFail(id: Uuid): Promise<OAuthClient> {
    const client = await this.clients.findById(id);
    if (!client) throw clientNotFound();
    return client;
  }

  private async findChangeable(id: Uuid): Promise<OAuthClient> {
    const client = await this.findOrFail(id);
    if (client.status === "revoked") {
      throw AppError.conflict("A revoked OAuth client cannot be changed");
    }
    return client;
  }
}
