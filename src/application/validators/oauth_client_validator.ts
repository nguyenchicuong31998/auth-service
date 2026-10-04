import type { Uuid } from "../../domain/entities/base_entity.js";
import {
  OAUTH_CLIENT_STATUSES,
  type OAuthClientStatus,
} from "../../domain/entities/oauth_client.js";
import type { OAuthClientChanges } from "../../domain/repositories/oauth_client_repository.js";
import { OAuthError } from "../errors/oauth_error.js";
import {
  assertHasChanges,
  badRequest,
  optional,
  parseEnum,
  parseString,
  parseUuid,
  requireFields,
  toObject,
  type Input,
} from "./common_validator.js";

const SCOPE_RE = /^[a-z][a-z0-9_-]{0,49}:[a-z][a-z0-9_-]{0,48}$/;
const MAX_SCOPES = 100;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface CreateOAuthClientInput {
  name: string;
  scopes: string[];
}

export interface OAuthClientListQuery {
  ownerUserId?: Uuid;
  status?: OAuthClientStatus[];
  page: number;
  limit: number;
}

export interface TokenRequest {
  clientId: string;
  clientSecret: string;
  scopes: string[] | null;
}

function isScope(value: unknown): value is string {
  return typeof value === "string" && SCOPE_RE.test(value);
}

export function parseScopes(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_SCOPES
  ) {
    throw badRequest(`scopes must be an array of 1 to ${MAX_SCOPES} items`);
  }
  const invalid = value.find((scope) => !isScope(scope));
  if (invalid !== undefined) {
    throw badRequest(
      `scopes must contain permission codes like "user:read" (got ${JSON.stringify(invalid)})`,
    );
  }
  return [...new Set(value as string[])].sort();
}

const parseName = (value: unknown) => parseString(value, "name", 255);

export function parseCreateOAuthClientInput(
  body: unknown,
): CreateOAuthClientInput {
  const input = toObject(body);
  requireFields(input, ["name", "scopes"]);
  return { name: parseName(input.name), scopes: parseScopes(input.scopes) };
}

export function parseUpdateOAuthClientInput(body: unknown): OAuthClientChanges {
  const input = toObject(body);
  return assertHasChanges({
    name: optional(input.name, parseName),
    status: optional(input.status, (value) =>
      parseEnum(value, "status", OAUTH_CLIENT_STATUSES),
    ),
    scopes: optional(input.scopes, parseScopes),
  });
}

function parsePositiveInt(
  value: unknown,
  field: string,
  fallback: number,
  max: number,
): number {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw badRequest(`${field} must be an integer between 1 and ${max}`);
  }
  return number;
}

export function parseListOAuthClientsQuery(query: Input): OAuthClientListQuery {
  const status =
    typeof query.status === "string" && query.status
      ? query.status
          .split(",")
          .map((value) => parseEnum(value, "status", OAUTH_CLIENT_STATUSES))
      : undefined;
  return {
    ownerUserId: optional(query.ownerUserId || undefined, (value) =>
      parseUuid(value, "ownerUserId"),
    ),
    status,
    page: parsePositiveInt(query.page, "page", 1, 1_000_000),
    limit: parsePositiveInt(query.limit, "limit", DEFAULT_LIMIT, MAX_LIMIT),
  };
}

function basicCredentials(
  header: string | undefined,
): { clientId: string; clientSecret: string } | null {
  const encoded = /^Basic\s+(\S+)$/i.exec(header ?? "")?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) throw OAuthError.invalidClient();
  try {
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    throw OAuthError.invalidClient();
  }
}

const bodyText = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 500
    ? value
    : undefined;

export function parseTokenRequest(
  body: unknown,
  authorization: string | undefined,
): TokenRequest {
  const input =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Input)
      : {};
  if (input.grant_type === undefined) {
    throw OAuthError.invalidRequest("grant_type is required");
  }
  if (input.grant_type !== "client_credentials") {
    throw OAuthError.unsupportedGrantType();
  }

  const basic = basicCredentials(authorization);
  const clientId = basic?.clientId ?? bodyText(input.client_id);
  const clientSecret = basic?.clientSecret ?? bodyText(input.client_secret);
  if (!clientId || !clientSecret) throw OAuthError.invalidClient();

  if (input.scope === undefined)
    return { clientId, clientSecret, scopes: null };
  const scopes =
    typeof input.scope === "string"
      ? input.scope.split(" ").filter(Boolean)
      : [];
  if (scopes.length === 0 || !scopes.every(isScope)) {
    throw OAuthError.invalidScope(
      "scope must be a space-separated list of permission codes",
    );
  }
  return { clientId, clientSecret, scopes: [...new Set(scopes)] };
}
