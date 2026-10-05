import { oauthPaths, oauthSchemas, oauthTags } from "./oauth_docs.js";
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
  phone: null,
  status: "active",
  emailVerified: true,
  phoneVerified: false,
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
      "**Hai cách đăng nhập:**",
      "- **Email + mật khẩu:** `POST /api/auth/register` → (xác minh email) → `POST /api/auth/login`.",
      "- **Số điện thoại + OTP (không mật khẩu):** `POST /api/auth/phone/otp` → lấy mã trong console auth-service → `POST /api/auth/phone/login`. Số chưa có tài khoản được tạo tự động.",
      "",
      "**Thử nhanh:** gọi `POST /api/auth/login` với ví dụ *superAdmin* → copy `accessToken` → bấm **Authorize** → dán token.",
      "",
      "Access token là JWT RS256 (mặc định 15 phút). Các service khác kiểm tra token bằng public key ở `GET /.well-known/jwks.json`.",
    ].join("\n"),
  },
  servers: [{ url: "/", description: "Server hiện tại" }],
  tags: [
    {
      name: "Auth",
      description:
        "Đăng ký/đăng nhập email + mật khẩu, đăng nhập số điện thoại bằng OTP, token, mật khẩu",
    },
    {
      name: "Account",
      description:
        "Liên kết cách đăng nhập: thêm số điện thoại (OTP) hoặc email + mật khẩu vào tài khoản đang đăng nhập",
    },
    { name: "Sessions", description: "Phiên đăng nhập của user hiện tại" },
    { name: "Devices", description: "Thiết bị đã đăng nhập của user hiện tại" },
    { name: "Keys", description: "Public key để kiểm tra JWT" },
    ...oauthTags,
    { name: "Health" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ...oauthSchemas,
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
        required: [
          "id",
          "fullName",
          "email",
          "phone",
          "status",
          "emailVerified",
          "phoneVerified",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          fullName: { type: "string" },
          email: nullableString({ format: "email" }),
          phone: nullableString({ maxLength: 20 }),
          status: {
            type: "string",
            description: "active | inactive | blocked | banned | pending",
          },
          emailVerified: { type: "boolean" },
          phoneVerified: { type: "boolean" },
        },
      },
      RegisterRequest: {
        type: "object",
        description:
          "Đăng ký bằng **email + mật khẩu**. Số điện thoại không đăng ký ở đây: dùng `POST /api/auth/phone/otp` → `POST /api/auth/phone/login` (tự tạo tài khoản).",
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
        description:
          "Đăng nhập bằng **email + mật khẩu**. Số điện thoại đăng nhập bằng OTP: `POST /api/auth/phone/login`.",
        required: ["email", "password", "device"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
          device: ref("DeviceInput"),
        },
      },
      PhoneOtpRequest: {
        type: "object",
        required: ["phone"],
        properties: {
          phone: {
            type: "string",
            maxLength: 20,
            description:
              "8–15 chữ số, có thể có `+` ở đầu; khoảng trắng, `.`, `-` được bỏ đi",
          },
        },
      },
      LinkPhoneRequest: {
        type: "object",
        required: ["phone", "code"],
        properties: {
          phone: { type: "string", maxLength: 20 },
          code: { type: "string", pattern: "^[0-9]{6}$" },
        },
      },
      LinkEmailRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", maxLength: 255 },
          password: {
            type: "string",
            minLength: 8,
            description: "Mật khẩu để đăng nhập bằng email sau này",
          },
        },
      },
      LinkedIdentity: {
        type: "object",
        required: ["method", "value", "linkedAt", "lastUsedAt"],
        properties: {
          method: { type: "string", enum: ["email", "phone"] },
          value: { type: "string" },
          linkedAt: { type: "string", format: "date-time" },
          lastUsedAt: nullableString({ format: "date-time" }),
        },
      },
      PhoneLoginRequest: {
        type: "object",
        required: ["phone", "code", "device"],
        properties: {
          phone: { type: "string", maxLength: 20 },
          code: {
            type: "string",
            pattern: "^[0-9]{6}$",
            description:
              "Mã OTP 6 số nhận qua SMS (môi trường dev: in ra console của auth-service)",
          },
          fullName: nullableString({
            maxLength: 255,
            description:
              "Chỉ dùng khi số chưa có tài khoản (tạo mới). Bỏ trống → dùng số điện thoại làm tên",
          }),
          device: ref("DeviceInput"),
        },
      },
      VerifyEmailRequest: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string" } },
      },
      ResendVerificationRequest: {
        type: "object",
        required: ["email"],
        properties: { email: { type: "string", format: "email" } },
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
      PhoneLoginResult: {
        type: "object",
        required: [...tokenPairRequired, "deviceId", "user", "isNewUser"],
        properties: {
          ...tokenPairProperties,
          deviceId: {
            type: "string",
            format: "uuid",
            description: "Lưu lại và gửi trong `device.id` ở lần đăng nhập sau",
          },
          user: ref("User"),
          isNewUser: {
            type: "boolean",
            description:
              "`true` khi số này vừa được tạo tài khoản → frontend có thể mời user cập nhật hồ sơ",
          },
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
    ...oauthPaths,
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
        description: [
          "Tạo user ở user-service (`registeredFrom = manual`, `status = pending`) và lưu mật khẩu (bcrypt) ở bảng `user_identities`. Không trả token: gọi `/login` sau khi đăng ký.",
          "",
          "- Gửi email xác minh (link). Xác minh xong user `pending` → `active`. User `pending` vẫn đăng nhập được.",
          "- **Số điện thoại không đăng ký ở đây** và không có mật khẩu: dùng `POST /api/auth/phone/otp` → `POST /api/auth/phone/login`, tài khoản được tạo tự động.",
        ].join("\n"),
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
            phone: null,
            status: "pending",
            emailVerified: false,
            phoneVerified: false,
          }),
          400: errorResponse("Dữ liệu không hợp lệ", {
            missing: "email is required",
            email: "email is invalid",
            shortPassword: "password must be at least 8 characters",
            unknown: "Unknown field: phone",
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
          "- Chỉ dành cho tài khoản email. Số điện thoại đăng nhập bằng OTP: `POST /api/auth/phone/login`.",
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
            noEmail: "email is required",
            unknown: "Unknown field: phone",
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
    "/api/auth/phone/otp": {
      post: {
        tags: ["Auth"],
        summary: "Bước 1 – Xin mã OTP đăng nhập bằng số điện thoại",
        description: [
          "Gửi mã OTP 6 số tới số điện thoại. **Môi trường hiện tại chưa nối SMS: mã được in ra console của auth-service**, dạng:",
          "",
          "```",
          "[SMS -> 0901234567] Ma dang nhap MS cua ban la 482913. Ma het han sau 30 giay.",
          "```",
          "",
          "- Luôn trả **202** (kể cả số chưa có tài khoản) – không lộ số nào đã đăng ký. Gửi chạy nền.",
          "- Mã hết hạn sau `PHONE_OTP_TTL_SECONDS` (mặc định **30 giây**), dùng một lần. MongoDB **tự xoá** mã hết hạn (TTL index trên `expiresAt`).",
          "- Mỗi số chỉ nhận mã mới khi mã trước đã hết hạn; mã cũ mất hiệu lực khi có mã mới.",
          "- Mỗi số tối đa `PHONE_OTP_MAX_SENDS_PER_HOUR` (5) mã / giờ và `PHONE_OTP_MAX_SENDS_PER_DAY` (10) mã / ngày, tính trên mọi IP. Vượt giới hạn vẫn trả 202 nhưng **không gửi** (chống spam SMS).",
          "- Tiếp theo: gọi `POST /api/auth/phone/login` với mã nhận được.",
        ].join("\n"),
        requestBody: jsonBody("PhoneOtpRequest", {
          basic: { summary: "Xin mã", value: { phone: "0901234567" } },
          formatted: {
            summary: "Số có khoảng trắng / gạch (tự chuẩn hoá)",
            value: { phone: "0901 234-567" },
          },
        }),
        responses: {
          202: { description: "Đã nhận yêu cầu, mã được gửi (in ra console)" },
          400: errorResponse("Số điện thoại không hợp lệ", {
            missing: "phone is required",
            invalid: "phone is invalid",
          }),
        },
      },
    },
    "/api/auth/phone/login": {
      post: {
        tags: ["Auth"],
        summary: "Bước 2 – Nhập OTP để đăng nhập (không cần mật khẩu)",
        description: [
          "Mã đúng → **đăng nhập luôn**, trả access token + refresh token như `/login`.",
          "",
          "- Số **chưa có tài khoản** → tự tạo user (`registeredFrom = phone_otp`), `isNewUser = true`. `fullName` lấy từ body, bỏ trống thì dùng số điện thoại.",
          "- Số **đã có tài khoản** → đăng nhập vào tài khoản đó, `isNewUser = false` (`fullName` bị bỏ qua).",
          "- Đăng nhập thành công = đã chứng minh sở hữu số → `phoneVerified = true`, user `pending` → `active`.",
          "- Sai mã `PHONE_OTP_MAX_ATTEMPTS` lần (mặc định 5) → mã bị khoá, phải xin mã mới. Giới hạn đúng **kể cả khi gửi nhiều lần đoán song song**.",
          "- Một số sai quá `PHONE_OTP_MAX_FAILURES_PER_DAY` lần (mặc định 20) trong 24 giờ, tính trên mọi mã và mọi IP → **429**, tạm khoá đăng nhập OTP của số đó.",
          "- Tài khoản số điện thoại **không có mật khẩu**: không dùng được `/login` hay `PUT /password`.",
          "- Tài khoản **có role hoặc quyền** (nhân viên, admin) **không được đăng nhập bằng OTP** → 403, phải dùng email + mật khẩu (chiếm được SIM không có nghĩa là chiếm được quyền quản trị).",
        ].join("\n"),
        requestBody: jsonBody("PhoneLoginRequest", {
          newUser: {
            summary: "Số mới – tạo tài khoản và đăng nhập",
            value: {
              phone: "0901234567",
              code: "482913",
              fullName: "Tran Thi B",
              device: loginDevice,
            },
          },
          existingUser: {
            summary: "Số đã có tài khoản",
            value: {
              phone: "0901234567",
              code: "482913",
              device: { id: SAMPLE_DEVICE_ID, ...loginDevice },
            },
          },
        }),
        responses: {
          200: jsonResponse("Đăng nhập thành công", "PhoneLoginResult", {
            ...sampleTokens,
            deviceId: SAMPLE_DEVICE_ID,
            user: {
              ...sampleUser,
              fullName: "Tran Thi B",
              email: null,
              phone: "0901234567",
              emailVerified: false,
              phoneVerified: true,
            },
            isNewUser: true,
          }),
          400: errorResponse("Dữ liệu không hợp lệ", {
            missing: "code is required",
            format: "code must be 6 digits",
            phone: "phone is invalid",
            device: "device is required",
          }),
          401: errorResponse("Mã OTP sai, hết hạn hoặc đã dùng", {
            invalid: "Invalid or expired OTP",
            tooMany: "Too many wrong OTP attempts, request a new code",
          }),
          403: errorResponse(
            "Tài khoản bị chặn, thiết bị bị chặn hoặc tài khoản có quyền quản trị",
            {
              blocked: "Account is blocked",
              device: "Device is disabled",
              privileged:
                "Accounts with roles or permissions must sign in with email and password",
            },
          ),
          409: errorResponse("Số không còn thuộc tài khoản", {
            moved: "This phone number no longer belongs to the account",
          }),
          503: userServiceUnavailable,
        },
      },
    },
    "/api/auth/verify-email": {
      post: {
        tags: ["Auth"],
        summary: "Xác minh email bằng token trong email",
        description:
          "Frontend lấy `token` từ link (`VERIFY_EMAIL_URL?token=...`) rồi gọi API này. Token dùng một lần, hết hạn sau `EMAIL_VERIFICATION_TTL_HOURS` (mặc định 24h). Dùng cho cả hai loại link: **đăng ký** (user `pending` → `active`, gửi email `welcome`) và **thêm email** (`POST /api/auth/me/email`: gắn email + mật khẩu vào tài khoản).",
        requestBody: jsonBody("VerifyEmailRequest", {
          basic: {
            summary: "Token từ link",
            value: { token: "q1Zr3m9XQe4bW7yK0aPz2Lc5Vn8Ht6Js1Df4Gk7Ux0E" },
          },
        }),
        responses: {
          200: jsonResponse("Đã xác minh", "User", {
            ...sampleUser,
            fullName: "Nguyen Van A",
            email: "nguyenvana@example.com",
          }),
          400: errorResponse("Token sai, đã dùng hoặc hết hạn", {
            invalid: "Invalid or expired verification token",
            missing: "token is required",
          }),
          409: errorResponse(
            "Email đã đổi, hoặc email (khi thêm vào tài khoản) đã thuộc tài khoản khác",
            {
              changed: "The email has changed since this link was sent",
              taken: "This email is already used by another account",
              different: "This account already has a different email",
            },
          ),
          503: userServiceUnavailable,
        },
      },
    },
    "/api/auth/verify-email/resend": {
      post: {
        tags: ["Auth"],
        summary: "Gửi lại email xác minh",
        description:
          "Luôn trả 202 (kể cả email không tồn tại hoặc đã xác minh) để không lộ email nào đã đăng ký. Mỗi email tối đa 1 lần / phút; link cũ hết hiệu lực khi gửi link mới.",
        requestBody: jsonBody("ResendVerificationRequest", {
          basic: {
            summary: "Gửi lại",
            value: { email: "nguyenvana@example.com" },
          },
        }),
        responses: {
          202: { description: "Đã nhận yêu cầu" },
          400: errorResponse("Email không hợp lệ", {
            invalid: "email is invalid",
          }),
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
    "/api/auth/me/identities": {
      get: {
        tags: ["Account"],
        summary: "Các cách đăng nhập đã liên kết",
        description:
          "Liệt kê email (`method = email`, đăng nhập bằng mật khẩu) và số điện thoại (`method = phone`, đăng nhập bằng OTP) đang gắn với tài khoản. Dùng cho trang cá nhân: hiện nút **Thêm số điện thoại** / **Thêm email** khi còn thiếu.",
        security: [{ bearerAuth: [] }],
        responses: {
          200: jsonResponse(
            "Danh sách cách đăng nhập",
            "LinkedIdentity",
            [
              {
                method: "email",
                value: "nguyenvana@example.com",
                linkedAt: "2026-10-04T04:24:11.671Z",
                lastUsedAt: "2026-10-05T01:00:00.000Z",
              },
              {
                method: "phone",
                value: "0901234567",
                linkedAt: "2026-10-05T02:00:00.000Z",
                lastUsedAt: null,
              },
            ],
            true,
          ),
          401: unauthorized,
        },
      },
    },
    "/api/auth/me/phone/otp": {
      post: {
        tags: ["Account"],
        summary: "Thêm số điện thoại – Bước 1: gửi OTP tới số mới",
        description: [
          "Gửi OTP tới số muốn gắn vào tài khoản đang đăng nhập (dev: in ra console). Mã có cùng quy tắc với đăng nhập OTP: 30 giây, sai 5 lần thì khoá, giới hạn theo số.",
          "",
          "- Số đã thuộc tài khoản khác → 409 (không tự gộp tài khoản).",
          "- Tài khoản đã có số khác → 409 (số đã gắn không đổi được).",
          "- Tiếp theo: `POST /api/auth/me/phone`.",
        ].join("\n"),
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("PhoneOtpRequest", {
          basic: { summary: "Gửi mã", value: { phone: "0901234567" } },
        }),
        responses: {
          202: { description: "Đã gửi mã (in ra console)" },
          400: errorResponse("Số điện thoại không hợp lệ", {
            invalid: "phone is invalid",
            unknown: "Unknown field: email",
          }),
          401: unauthorized,
          409: errorResponse("Không thể gắn số này", {
            taken: "This phone number is already used by another account",
            hasPhone: "This account already has a phone number",
          }),
        },
      },
    },
    "/api/auth/me/phone": {
      post: {
        tags: ["Account"],
        summary: "Thêm số điện thoại – Bước 2: nhập OTP để gắn số",
        description: [
          "Mã đúng → số được gắn vào tài khoản đang đăng nhập và đánh dấu đã xác minh. Từ giờ đăng nhập bằng OTP với số này sẽ vào **đúng tài khoản này** (không tạo tài khoản mới).",
          "",
          "- Tài khoản có role/quyền vẫn gắn được số, nhưng **không đăng nhập bằng OTP** được (403 ở `/phone/login`).",
          "- Gọi lại với số đã gắn của chính mình: 200, không đổi gì.",
        ].join("\n"),
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("LinkPhoneRequest", {
          basic: {
            summary: "Nhập mã",
            value: { phone: "0901234567", code: "482913" },
          },
        }),
        responses: {
          200: jsonResponse("User sau khi gắn số", "User", {
            ...sampleUser,
            phone: "0901234567",
            phoneVerified: true,
          }),
          400: errorResponse("Dữ liệu không hợp lệ", {
            format: "code must be 6 digits",
            missing: "code is required",
          }),
          401: errorResponse("Thiếu token, hoặc OTP sai / hết hạn", {
            missingToken: "Missing bearer token",
            invalidOtp: "Invalid or expired OTP",
            tooMany: "Too many wrong OTP attempts, request a new code",
          }),
          409: errorResponse("Không thể gắn số này", {
            taken: "This phone number is already used by another account",
            hasPhone: "This account already has a phone number",
            different: "This account already has a different phone number",
          }),
          503: userServiceUnavailable,
        },
      },
    },
    "/api/auth/me/email": {
      post: {
        tags: ["Account"],
        summary: "Thêm email + mật khẩu cho tài khoản số điện thoại",
        description: [
          "Gửi link xác minh tới email mới. Email **chỉ được gắn vào tài khoản sau khi bấm link** (`POST /api/auth/verify-email`) – tránh việc ai đó gắn email của người khác vào tài khoản của mình. Mật khẩu được băm (bcrypt) và lưu tạm cùng link; sau khi xác minh, đăng nhập được bằng email + mật khẩu.",
          "",
          "- Email đã thuộc tài khoản khác → 409.",
          "- Tài khoản đã có email → 409 (email đã gắn không đổi được).",
          "- Gửi lại: gọi lại API này; link cũ mất hiệu lực.",
        ].join("\n"),
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("LinkEmailRequest", {
          basic: {
            summary: "Thêm email",
            value: { email: "tranthib@example.com", password: "Password@123" },
          },
        }),
        responses: {
          202: { description: "Đã gửi link xác minh tới email mới" },
          400: errorResponse("Dữ liệu không hợp lệ", {
            email: "email is invalid",
            shortPassword: "password must be at least 8 characters",
          }),
          401: unauthorized,
          409: errorResponse("Không thể gắn email này", {
            taken: "This email is already used by another account",
            hasEmail: "This account already has an email",
            different: "This account already has a different email",
          }),
          503: userServiceUnavailable,
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

const RATE_LIMITED: Record<string, string> = {
  "post /api/auth/login":
    "5 lần sai / 15 phút cho mỗi IP + email; 30 lần sai / 15 phút cho mỗi IP",
  "post /api/auth/register": "10 lần / giờ cho mỗi IP",
  "post /api/auth/refresh":
    "100 lần / 15 phút cho mỗi IP (chung với verify-email)",
  "post /api/auth/verify-email":
    "100 lần / 15 phút cho mỗi IP (chung với refresh)",
  "post /api/auth/verify-email/resend": "5 lần / 15 phút cho mỗi IP",
  "post /api/auth/phone/otp":
    "5 lần / 15 phút cho mỗi IP; mỗi số tối đa 5 mã / giờ và 10 mã / ngày (vượt thì vẫn trả 202 nhưng không gửi)",
  "post /api/auth/me/phone/otp": "chung giới hạn với /api/auth/phone/otp",
  "post /api/auth/me/phone": "chung giới hạn với /api/auth/phone/login",
  "post /api/auth/me/email":
    "chung giới hạn với /api/auth/verify-email/resend (5 lần / 15 phút cho mỗi IP)",
  "post /api/auth/phone/login":
    "10 lần sai / 15 phút cho mỗi IP; mỗi số tối đa 20 lần sai / ngày",
  "post /oauth/token": "10 lần sai / 15 phút cho mỗi IP + client_id",
};

const tooManyRequests = (rule: string) =>
  errorResponse(
    `Quá nhiều request (${rule}). Xem header RateLimit / Retry-After`,
    {
      limited: "Too many requests, please try again later",
    },
  );

type Operation = { requestBody?: unknown; responses: Record<string, unknown> };

for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
  for (const [method, operation] of Object.entries(pathItem) as [
    string,
    Operation,
  ][]) {
    if (operation.requestBody) {
      operation.responses[413] ??= payloadTooLarge;
      operation.responses[415] ??= unsupportedMediaType;
    }
    const rule = RATE_LIMITED[`${method} ${path}`];
    if (rule) operation.responses[429] ??= tooManyRequests(rule);
  }
}
