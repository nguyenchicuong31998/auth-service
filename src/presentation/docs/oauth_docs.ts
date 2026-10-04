import { OAUTH_CLIENT_STATUSES } from "../../domain/entities/oauth_client.js";
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  nullableString,
  ref,
  uuidPathParam,
} from "./openapi_helpers.js";

const SAMPLE_CLIENT = {
  id: "0b6f7d1e-5a4c-4b3d-9e2f-1a2b3c4d5e6f",
  ownerUserId: "c1e8a9f0-e2cb-4ebd-8abb-dce760f3c689",
  name: "notification-service",
  clientId: "cli_q7Xb2kLm9PzR4tWv8yNc",
  status: "active",
  scopes: ["user:read"],
  createdAt: "2026-10-04T06:00:00.000Z",
  updatedAt: null,
  deletedAt: null,
};

const SAMPLE_SECRET = "s3cr3t-Shown-Only-Once_4Fq9Lw2Zx7Vb1Nm6Kp0Jh8Gd";

const bearer = [{ bearerAuth: [] }];

const unauthorized = errorResponse("Thiếu, sai hoặc hết hạn access token", {
  missing: "Missing bearer token",
  invalid: "Invalid or expired access token",
});

const forbidden = (permission: string, extra: Record<string, string> = {}) =>
  errorResponse("Thiếu quyền hoặc tài khoản bị chặn", {
    missingPermission: `Missing permission: ${permission}`,
    blocked: "Account is blocked",
    ...extra,
  });

const cannotGrant = {
  cannotGrant: "Cannot grant scopes you do not have: user:delete",
};

const unavailable = errorResponse("Không gọi được user-service", {
  unavailable: "User service is unavailable",
});

const invalidId = errorResponse("id không phải UUID", {
  invalidId: "id must be a valid UUID",
});

const notFound = errorResponse("Không có client này (hoặc đã xoá)", {
  notFound: "OAuth client not found",
});

const revoked = errorResponse("Client đã bị thu hồi", {
  revoked: "A revoked OAuth client cannot be changed",
});

const oauthError = (
  description: string,
  examples: Record<string, [string, string]>,
) => ({
  description,
  content: {
    "application/json": {
      schema: ref("OAuthError"),
      examples: Object.fromEntries(
        Object.entries(examples).map(([name, [error, error_description]]) => [
          name,
          { value: { error, error_description } },
        ]),
      ),
    },
  },
});

const clientProperties = {
  id: { type: "string", format: "uuid" },
  ownerUserId: {
    type: "string",
    format: "uuid",
    description:
      "User tạo client (scope bị giới hạn theo quyền hiện tại của user này)",
  },
  name: { type: "string" },
  clientId: { type: "string", description: "Công khai" },
  status: { type: "string", enum: OAUTH_CLIENT_STATUSES },
  scopes: { type: "array", items: { type: "string" } },
  createdAt: { type: "string", format: "date-time" },
  updatedAt: nullableString({ format: "date-time" }),
  deletedAt: nullableString({ format: "date-time" }),
};

const tokenRequestSchema = {
  type: "object",
  required: ["grant_type"],
  properties: {
    grant_type: { type: "string", enum: ["client_credentials"] },
    client_id: {
      type: "string",
      description: "Bỏ trống nếu gửi qua header `Authorization: Basic`",
    },
    client_secret: { type: "string" },
    scope: {
      type: "string",
      description:
        "Tuỳ chọn, cách nhau bởi dấu cách. Bỏ trống = mọi scope của client",
    },
  },
};

const tokenRequestExample = {
  grant_type: "client_credentials",
  client_id: SAMPLE_CLIENT.clientId,
  client_secret: SAMPLE_SECRET,
  scope: "user:read",
};

export const oauthTags = [
  {
    name: "OAuth clients",
    description:
      "Credential server-to-server (OAuth2 client credentials) cho service / hệ thống bên ngoài",
  },
  {
    name: "OAuth",
    description: "Đổi client_id + client_secret lấy access token",
  },
];

export const oauthSchemas = {
  OAuthClient: {
    type: "object",
    required: Object.keys(clientProperties),
    properties: clientProperties,
  },
  OAuthClientWithSecret: {
    type: "object",
    required: [...Object.keys(clientProperties), "clientSecret"],
    properties: {
      ...clientProperties,
      clientSecret: {
        type: "string",
        description:
          "**Chỉ trả về đúng một lần** – lưu ngay, không lấy lại được",
      },
    },
  },
  OAuthClientPage: {
    type: "object",
    required: ["items", "page", "limit", "total", "totalPages"],
    properties: {
      items: { type: "array", items: ref("OAuthClient") },
      page: { type: "integer" },
      limit: { type: "integer" },
      total: { type: "integer" },
      totalPages: { type: "integer" },
    },
  },
  CreateOAuthClientRequest: {
    type: "object",
    required: ["name", "scopes"],
    properties: {
      name: { type: "string", maxLength: 255 },
      scopes: {
        type: "array",
        items: {
          type: "string",
          pattern: "^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$",
        },
        description:
          "Permission code; chỉ được gán những quyền mà chính bạn đang có",
      },
    },
  },
  UpdateOAuthClientRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", maxLength: 255 },
      status: {
        type: "string",
        enum: OAUTH_CLIENT_STATUSES,
        description: "`revoked` là vĩnh viễn",
      },
      scopes: { type: "array", items: { type: "string" } },
    },
  },
  TokenRequest: tokenRequestSchema,
  TokenResponse: {
    type: "object",
    required: ["access_token", "token_type", "expires_in", "scope"],
    properties: {
      access_token: { type: "string" },
      token_type: { type: "string", enum: ["Bearer"] },
      expires_in: { type: "integer", example: 600 },
      scope: { type: "string", example: "user:read" },
    },
  },
  OAuthError: {
    type: "object",
    required: ["error", "error_description"],
    properties: {
      error: {
        type: "string",
        enum: [
          "invalid_request",
          "invalid_client",
          "invalid_scope",
          "unsupported_grant_type",
        ],
      },
      error_description: { type: "string" },
    },
  },
};

const idParam = [uuidPathParam("id", "OAuth client id")];

export const oauthPaths = {
  "/api/oauth-clients": {
    post: {
      tags: ["OAuth clients"],
      summary: "Tạo client (trả secret một lần)",
      description:
        "**Quyền cần có:** `oauth-client:create`. Chủ client = người gọi.",
      security: bearer,
      requestBody: jsonBody("CreateOAuthClientRequest", {
        basic: {
          summary: "Client cho notification-service",
          value: { name: "notification-service", scopes: ["user:read"] },
        },
      }),
      responses: {
        201: jsonResponse(
          "Đã tạo – lưu clientSecret ngay",
          "OAuthClientWithSecret",
          {
            ...SAMPLE_CLIENT,
            clientSecret: SAMPLE_SECRET,
          },
        ),
        400: errorResponse("Dữ liệu không hợp lệ", {
          missing: "scopes is required",
          scope:
            'scopes must contain permission codes like "user:read" (got "admin")',
        }),
        401: unauthorized,
        403: forbidden("oauth-client:create", cannotGrant),
        503: unavailable,
      },
    },
    get: {
      tags: ["OAuth clients"],
      summary: "Danh sách client",
      description:
        "**Quyền cần có:** `oauth-client:read`. Không bao giờ trả secret.",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          schema: { type: "string" },
          description:
            "active, inactive, revoked – nhiều giá trị cách bởi dấu phẩy",
        },
        {
          name: "ownerUserId",
          in: "query",
          schema: { type: "string", format: "uuid" },
        },
        { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        200: jsonResponse("Danh sách", "OAuthClientPage", {
          items: [SAMPLE_CLIENT],
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        }),
        400: errorResponse("Query không hợp lệ", {
          status: "status must be one of: active, inactive, revoked",
        }),
        401: unauthorized,
        403: forbidden("oauth-client:read"),
        503: unavailable,
      },
    },
  },
  "/api/oauth-clients/{id}": {
    get: {
      tags: ["OAuth clients"],
      summary: "Xem client",
      description: "**Quyền cần có:** `oauth-client:read`",
      security: bearer,
      parameters: idParam,
      responses: {
        200: jsonResponse("Client", "OAuthClient", SAMPLE_CLIENT),
        400: invalidId,
        401: unauthorized,
        403: forbidden("oauth-client:read"),
        404: notFound,
        503: unavailable,
      },
    },
    patch: {
      tags: ["OAuth clients"],
      summary: "Đổi tên, trạng thái hoặc scope",
      description:
        "**Quyền cần có:** `oauth-client:update`. Token đã cấp vẫn dùng được tới khi hết hạn (tối đa `CLIENT_TOKEN_TTL_SECONDS`).",
      security: bearer,
      parameters: idParam,
      requestBody: jsonBody("UpdateOAuthClientRequest", {
        disable: { summary: "Tạm khoá", value: { status: "inactive" } },
        revoke: { summary: "Thu hồi vĩnh viễn", value: { status: "revoked" } },
      }),
      responses: {
        200: jsonResponse("Client sau khi sửa", "OAuthClient", {
          ...SAMPLE_CLIENT,
          status: "inactive",
          updatedAt: "2026-10-04T07:00:00.000Z",
        }),
        400: errorResponse("Dữ liệu không hợp lệ", {
          empty: "No updatable fields provided",
          invalidId: "id must be a valid UUID",
        }),
        401: unauthorized,
        403: forbidden("oauth-client:update", cannotGrant),
        404: notFound,
        409: revoked,
        503: unavailable,
      },
    },
    delete: {
      tags: ["OAuth clients"],
      summary: "Xoá client (soft delete, đồng thời revoked)",
      description: "**Quyền cần có:** `oauth-client:delete`",
      security: bearer,
      parameters: idParam,
      responses: {
        204: { description: "Đã xoá" },
        400: invalidId,
        401: unauthorized,
        403: forbidden("oauth-client:delete"),
        404: notFound,
        503: unavailable,
      },
    },
  },
  "/api/oauth-clients/{id}/secret": {
    post: {
      tags: ["OAuth clients"],
      summary: "Đổi secret (secret cũ hết hiệu lực ngay)",
      description: "**Quyền cần có:** `oauth-client:update`",
      security: bearer,
      parameters: idParam,
      responses: {
        200: jsonResponse("Secret mới – lưu ngay", "OAuthClientWithSecret", {
          ...SAMPLE_CLIENT,
          clientSecret: SAMPLE_SECRET,
          updatedAt: "2026-10-04T07:00:00.000Z",
        }),
        400: invalidId,
        401: unauthorized,
        403: forbidden("oauth-client:update"),
        404: notFound,
        409: revoked,
        503: unavailable,
      },
    },
  },
  "/oauth/token": {
    post: {
      tags: ["OAuth"],
      summary: "Lấy access token (client_credentials, RFC 6749 §4.4)",
      description: [
        "Gửi `client_id`/`client_secret` trong body **hoặc** header `Authorization: Basic base64(client_id:client_secret)`.",
        'Token: JWT RS256, `kind: "service"`, `sub` = clientId, `scope` = giao của scope client và quyền hiện tại của chủ client.',
        "Lỗi theo chuẩn OAuth2: `{ error, error_description }`.",
      ].join("\n\n"),
      requestBody: {
        required: true,
        content: {
          "application/x-www-form-urlencoded": {
            schema: ref("TokenRequest"),
            example: tokenRequestExample,
          },
          "application/json": {
            schema: ref("TokenRequest"),
            examples: {
              basic: {
                summary: "Client credentials",
                value: tokenRequestExample,
              },
            },
          },
        },
      },
      responses: {
        200: jsonResponse("Access token", "TokenResponse", {
          access_token: "eyJhbGciOiJSUzI1NiJ9.eyJraW5kIjoic2VydmljZSJ9.c2ln",
          token_type: "Bearer",
          expires_in: 600,
          scope: "user:read",
        }),
        400: oauthError("Request sai", {
          missing: ["invalid_request", "grant_type is required"],
          grant: [
            "unsupported_grant_type",
            "Only grant_type=client_credentials is supported",
          ],
          scope: [
            "invalid_scope",
            "Scopes not allowed for this client: user:delete",
          ],
        }),
        401: oauthError(
          "Sai client_id / secret, client bị khoá / thu hồi / xoá",
          {
            invalid: ["invalid_client", "Client authentication failed"],
          },
        ),
        503: unavailable,
      },
    },
  },
};
