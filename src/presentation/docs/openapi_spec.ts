import { DEVICE_TYPES } from "../../domain/entities/user_device.js";
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  nullableString,
  ref,
  uuidPathParam,
} from "./openapi_helpers.js";

const SAMPLE_USER_ID = "c1e8a9f0-e2cb-4ebd-8abb-dce760f3c689";
const SAMPLE_SESSION_ID = "8f4c2d1e-3b5a-4c6d-9e8f-0a1b2c3d4e5f";
const SAMPLE_DEVICE_ID = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";
const SAMPLE_ACCESS_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImtpZCI6IjNfR3VZIiwidHlwIjoiSldUIn0.eyJzaWQiOiI4ZjRjMmQxZSJ9.c2lnbmF0dXJl";
const SAMPLE_REFRESH_TOKEN = `${SAMPLE_SESSION_ID}.q1Zr3m9XQe4bW7yK0aPz2Lc5Vn8Ht6Js1Df4Gk7Ux0E`;

const sampleUser = {
  id: SAMPLE_USER_ID,
  fullName: "Super Admin",
  email: "superadmin@gmail.com",
  status: "active",
};

const sampleTokens = {
  tokenType: "Bearer",
  accessToken: SAMPLE_ACCESS_TOKEN,
  expiresIn: 900,
  refreshToken: SAMPLE_REFRESH_TOKEN,
  refreshTokenExpiresAt: "2026-11-03T06:00:00.000Z",
  sessionId: SAMPLE_SESSION_ID,
};

const sampleDevice = {
  id: SAMPLE_DEVICE_ID,
  userId: SAMPLE_USER_ID,
  deviceName: "Chrome on Windows",
  deviceType: "WEB",
  fcmToken: null,
  ipAddress: "203.113.10.25",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0",
  isActive: true,
  lastUsedAt: "2026-10-04T06:00:00.000Z",
  createdAt: "2026-10-04T06:00:00.000Z",
  updatedAt: null,
};

const sampleSession = {
  id: SAMPLE_SESSION_ID,
  device: {
    id: SAMPLE_DEVICE_ID,
    deviceName: "Chrome on Windows",
    deviceType: "WEB",
  },
  ipAddress: "203.113.10.25",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0",
  createdAt: "2026-10-04T06:00:00.000Z",
  lastUsedAt: null,
  expiredAt: "2026-11-03T06:00:00.000Z",
  current: true,
};

const deviceTypeSchema = { type: "string", enum: DEVICE_TYPES };

const tokenPairProperties = {
  tokenType: { type: "string", enum: ["Bearer"] },
  accessToken: {
    type: "string",
    description: "JWT RS256, gửi kèm header `Authorization: Bearer <token>`",
  },
  expiresIn: {
    type: "integer",
    description: "Số giây access token còn hiệu lực",
    example: 900,
  },
  refreshToken: {
    type: "string",
    description:
      "Dùng một lần. Mỗi lần gọi /refresh trả về refresh token mới; dùng lại token cũ sẽ thu hồi session.",
  },
  refreshTokenExpiresAt: { type: "string", format: "date-time" },
  sessionId: { type: "string", format: "uuid" },
};

const tokenPairRequired = Object.keys(tokenPairProperties);

const unauthorized = errorResponse("Thiếu, sai hoặc hết hạn access token", {
  missing: "Missing bearer token",
  invalid: "Invalid or expired access token",
  revoked: "Session is no longer active",
});

const userServiceUnavailable = errorResponse("Không gọi được user-service", {
  unavailable: "User service is unavailable",
});

const loginDevice = {
  deviceName: "Chrome on Windows",
  deviceType: "WEB",
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "auth-service API",
    version: "1.0.0",
    description: [
      "Đăng ký, đăng nhập, refresh token, đăng xuất, đổi mật khẩu, quản lý session & thiết bị.",
      "",
      "**Thử nhanh:** gọi `POST /api/auth/login` với ví dụ *superAdmin* → copy `accessToken` → bấm **Authorize** → dán token.",
      "",
      "Access token là JWT RS256 (mặc định 15 phút). Các service khác kiểm tra token bằng public key ở `GET /.well-known/jwks.json`.",
    ].join("\n"),
  },
  servers: [{ url: "/", description: "Server hiện tại" }],
  tags: [
    { name: "Auth", description: "Đăng ký, đăng nhập, token, mật khẩu" },
    { name: "Sessions", description: "Phiên đăng nhập của user hiện tại" },
    { name: "Devices", description: "Thiết bị đã đăng nhập của user hiện tại" },
    { name: "Keys", description: "Public key để kiểm tra JWT" },
    { name: "Health" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      Health: {
        type: "object",
        required: ["status", "service", "db"],
        properties: {
          status: { type: "string", enum: ["ok"] },
          service: { type: "string", enum: ["auth-service"] },
          db: { type: "string", enum: ["connected", "disconnected"] },
        },
      },
      User: {
        type: "object",
        description: "User lấy từ user-service",
        required: ["id", "fullName", "email", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          fullName: { type: "string" },
          email: nullableString({ format: "email" }),
          status: {
            type: "string",
            description: "active | inactive | blocked | banned | pending",
          },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["fullName", "email", "password"],
        properties: {
          fullName: { type: "string", maxLength: 255 },
          email: { type: "string", format: "email", maxLength: 255 },
          password: {
            type: "string",
            minLength: 8,
            description: "8 ký tự trở lên, tối đa 72 byte",
          },
        },
      },
      DeviceInput: {
        type: "object",
        required: ["deviceName", "deviceType"],
        properties: {
          id: nullableString({
            format: "uuid",
            description:
              "`deviceId` nhận được ở lần đăng nhập trước. Bỏ trống → tạo thiết bị mới",
          }),
          deviceName: { type: "string", maxLength: 255 },
          deviceType: deviceTypeSchema,
          fcmToken: nullableString({ maxLength: 500 }),
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password", "device"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
          device: ref("DeviceInput"),
        },
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string" } },
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string" },
          newPassword: { type: "string", minLength: 8 },
        },
      },
      TokenPair: {
        type: "object",
        required: tokenPairRequired,
        properties: tokenPairProperties,
      },
      LoginResult: {
        type: "object",
        required: [...tokenPairRequired, "deviceId", "user"],
        properties: {
          ...tokenPairProperties,
          deviceId: {
            type: "string",
            format: "uuid",
            description: "Lưu lại và gửi trong `device.id` ở lần đăng nhập sau",
          },
          user: ref("User"),
        },
      },
      Session: {
        type: "object",
        required: [
          "id",
          "device",
          "ipAddress",
          "userAgent",
          "createdAt",
          "lastUsedAt",
          "expiredAt",
          "current",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          device: {
            type: "object",
            nullable: true,
            required: ["id", "deviceName", "deviceType"],
            properties: {
              id: { type: "string", format: "uuid" },
              deviceName: { type: "string" },
              deviceType: deviceTypeSchema,
            },
          },
          ipAddress: nullableString(),
          userAgent: nullableString(),
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: nullableString({ format: "date-time" }),
          expiredAt: { type: "string", format: "date-time" },
          current: {
            type: "boolean",
            description: "`true` nếu là session của access token đang dùng",
          },
        },
      },
      UserDevice: {
        type: "object",
        required: Object.keys(sampleDevice),
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          deviceName: { type: "string" },
          deviceType: deviceTypeSchema,
          fcmToken: nullableString(),
          ipAddress: nullableString(),
          userAgent: nullableString(),
          isActive: { type: "boolean" },
          lastUsedAt: nullableString({ format: "date-time" }),
          createdAt: { type: "string", format: "date-time" },
          updatedAt: nullableString({ format: "date-time" }),
        },
      },
      UpdateDeviceRequest: {
        type: "object",
        minProperties: 1,
        properties: {
          deviceName: { type: "string", maxLength: 255 },
          isActive: {
            type: "boolean",
            description:
              "`false` → chặn thiết bị và thu hồi mọi session của nó",
          },
        },
      },
      Jwks: {
        type: "object",
        required: ["keys"],
        properties: {
          keys: {
            type: "array",
            items: {
              type: "object",
              required: ["kty", "n", "e", "kid", "alg", "use"],
              properties: {
                kty: { type: "string", enum: ["RSA"] },
                n: { type: "string" },
                e: { type: "string" },
                kid: { type: "string" },
                alg: { type: "string", enum: ["RS256"] },
                use: { type: "string", enum: ["sig"] },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Kiểm tra service còn sống",
        responses: {
          200: jsonResponse("OK", "Health", {
            status: "ok",
            service: "auth-service",
            db: "connected",
          }),
        },
      },
    },
    "/.well-known/jwks.json": {
      get: {
        tags: ["Keys"],
        summary: "Public key (JWKS) để kiểm tra access token",
        description:
          "Các service khác tải về (có cache 5 phút) để tự kiểm tra chữ ký JWT, không cần gọi auth-service ở mỗi request.",
        responses: {
          200: jsonResponse("JWKS", "Jwks", {
            keys: [
              {
                kty: "RSA",
                n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4...",
                e: "AQAB",
                kid: "3_GuYk1n2m3o4p5q6r7s8t9u0v1w2x3y4z5A6B7C8D9",
                alg: "RS256",
                use: "sig",
              },
            ],
          }),
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Đăng ký bằng email + mật khẩu",
        description:
          "Tạo user ở user-service (`registeredFrom = manual`, `status = pending`) và lưu mật khẩu (bcrypt) ở bảng `user_identities`. Không trả token: gọi `/login` sau khi đăng ký.",
        requestBody: jsonBody("RegisterRequest", {
          basic: {
            summary: "Đăng ký",
            value: {
              fullName: "Nguyen Van A",
              email: "nguyenvana@example.com",
              password: "Password@123",
            },
          },
        }),
        responses: {
          201: jsonResponse("Đã tạo user", "User", {
            id: "2e98e54c-aaf6-4e5b-a596-1d384a93487e",
            fullName: "Nguyen Van A",
            email: "nguyenvana@example.com",
            status: "pending",
          }),
          400: errorResponse("Dữ liệu không hợp lệ", {
            missing: "password is required",
            email: "email is invalid",
            shortPassword: "password must be at least 8 characters",
          }),
          409: errorResponse("Email đã được đăng ký", {
            duplicate: "Email already exists",
          }),
          503: userServiceUnavailable,
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Đăng nhập bằng email + mật khẩu",
        description: [
          "Trả access token + refresh token và tạo một session.",
          "",
          "- Lần đầu trên một thiết bị: bỏ trống `device.id` → tạo thiết bị mới, trả về `deviceId`.",
          "- Lần sau: gửi `device.id = deviceId` → dùng lại thiết bị; session cũ của thiết bị đó bị thu hồi (`replaced`).",
          "- User `pending` vẫn đăng nhập được; `inactive`/`blocked`/`banned` → 403.",
        ].join("\n"),
        requestBody: jsonBody("LoginRequest", {
          superAdmin: {
            summary: "Super admin (seed)",
            value: {
              email: "superadmin@gmail.com",
              password: "123456789",
              device: loginDevice,
            },
          },
          knownDevice: {
            summary: "Đăng nhập lại trên thiết bị cũ",
            value: {
              email: "superadmin@gmail.com",
              password: "123456789",
              device: { id: SAMPLE_DEVICE_ID, ...loginDevice },
            },
          },
          mobile: {
            summary: "Từ app Android, có FCM token",
            value: {
              email: "superadmin@gmail.com",
              password: "123456789",
              device: {
                deviceName: "Samsung Galaxy S24",
                deviceType: "ANDROID",
                fcmToken: "dGVzdC1mY20tdG9rZW4",
              },
            },
          },
        }),
        responses: {
          200: jsonResponse("Đăng nhập thành công", "LoginResult", {
            ...sampleTokens,
            deviceId: SAMPLE_DEVICE_ID,
            user: sampleUser,
          }),
          400: errorResponse("Dữ liệu không hợp lệ", {
            missing: "device is required",
            deviceType: "device.deviceType must be one of: WEB, IOS, ANDROID",
          }),
          401: errorResponse("Sai email hoặc mật khẩu", {
            invalid: "Invalid email or password",
          }),
          403: errorResponse("Tài khoản hoặc thiết bị bị chặn", {
            blocked: "Account is blocked",
            device: "Device is disabled",
          }),
          503: userServiceUnavailable,
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Đổi refresh token lấy cặp token mới",
        description:
          "Refresh token chỉ dùng được **một lần**. Nếu một refresh token cũ bị dùng lại (dấu hiệu bị đánh cắp), session bị thu hồi ngay (`refresh_token_reused`).",
        requestBody: jsonBody("RefreshRequest", {
          basic: {
            summary: "Refresh",
            value: { refreshToken: SAMPLE_REFRESH_TOKEN },
          },
        }),
        responses: {
          200: jsonResponse("Cặp token mới", "TokenPair", sampleTokens),
          400: errorResponse("Thiếu refreshToken", {
            missing: "refreshToken is required",
          }),
          401: errorResponse("Refresh token sai, hết hạn hoặc đã dùng", {
            invalid: "Invalid or expired refresh token",
          }),
          403: errorResponse("Tài khoản hoặc thiết bị bị chặn", {
            blocked: "Account is blocked",
            device: "Device is disabled",
          }),
          503: userServiceUnavailable,
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Đăng xuất phiên hiện tại",
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: "Đã thu hồi session hiện tại" },
          401: unauthorized,
        },
      },
    },
    "/api/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "Đăng xuất khỏi mọi thiết bị",
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: "Đã thu hồi mọi session của user" },
          401: unauthorized,
        },
      },
    },
    "/api/auth/password": {
      put: {
        tags: ["Auth"],
        summary: "Đổi mật khẩu",
        description:
          "Đổi xong, mọi session **khác** của user bị thu hồi (`password_changed`); session hiện tại vẫn dùng tiếp.",
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("ChangePasswordRequest", {
          basic: {
            summary: "Đổi mật khẩu",
            value: {
              currentPassword: "123456789",
              newPassword: "NewPassword@123",
            },
          },
        }),
        responses: {
          204: { description: "Đã đổi mật khẩu" },
          400: errorResponse(
            "Dữ liệu không hợp lệ hoặc sai mật khẩu hiện tại",
            {
              wrong: "Current password is incorrect",
              same: "newPassword must be different from currentPassword",
              short: "newPassword must be at least 8 characters",
            },
          ),
          401: unauthorized,
        },
      },
    },
    "/api/auth/sessions": {
      get: {
        tags: ["Sessions"],
        summary: "Các session đang hoạt động của user hiện tại",
        security: [{ bearerAuth: [] }],
        responses: {
          200: jsonResponse(
            "Danh sách session",
            "Session",
            [sampleSession],
            true,
          ),
          401: unauthorized,
        },
      },
    },
    "/api/auth/sessions/{id}": {
      delete: {
        tags: ["Sessions"],
        summary: "Thu hồi một session (đăng xuất từ xa)",
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam("id", "Session id")],
        responses: {
          204: { description: "Đã thu hồi" },
          400: errorResponse("id không phải UUID", {
            invalidId: "id must be a valid UUID",
          }),
          401: unauthorized,
          404: errorResponse("Không có session đang hoạt động với id này", {
            notFound: "Session not found",
          }),
        },
      },
    },
    "/api/auth/devices": {
      get: {
        tags: ["Devices"],
        summary: "Các thiết bị của user hiện tại",
        security: [{ bearerAuth: [] }],
        responses: {
          200: jsonResponse(
            "Danh sách thiết bị",
            "UserDevice",
            [sampleDevice],
            true,
          ),
          401: unauthorized,
        },
      },
    },
    "/api/auth/devices/{id}": {
      patch: {
        tags: ["Devices"],
        summary: "Đổi tên hoặc chặn / mở thiết bị",
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam("id", "Device id")],
        requestBody: jsonBody("UpdateDeviceRequest", {
          rename: {
            summary: "Đổi tên",
            value: { deviceName: "Laptop công ty" },
          },
          disable: {
            summary: "Chặn thiết bị (thu hồi mọi session của nó)",
            value: { isActive: false },
          },
        }),
        responses: {
          200: jsonResponse("Thiết bị sau khi cập nhật", "UserDevice", {
            ...sampleDevice,
            deviceName: "Laptop công ty",
            updatedAt: "2026-10-04T07:00:00.000Z",
          }),
          400: errorResponse("Dữ liệu không hợp lệ", {
            empty: "No updatable fields provided",
            isActive: "isActive must be a boolean",
            invalidId: "id must be a valid UUID",
          }),
          401: unauthorized,
          404: errorResponse("Không có thiết bị này", {
            notFound: "Device not found",
          }),
        },
      },
    },
  },
};

const payloadTooLarge = errorResponse("Body quá lớn (> 100KB)", {
  tooLarge: "Request body is too large",
});

const unsupportedMediaType = errorResponse(
  "Charset / encoding của body không hỗ trợ",
  { charset: 'unsupported charset "LATIN9"' },
);

type Operation = { requestBody?: unknown; responses: Record<string, unknown> };

for (const pathItem of Object.values(openApiSpec.paths)) {
  for (const operation of Object.values(pathItem) as Operation[]) {
    if (!operation?.requestBody) continue;
    operation.responses[413] ??= payloadTooLarge;
    operation.responses[415] ??= unsupportedMediaType;
  }
}
