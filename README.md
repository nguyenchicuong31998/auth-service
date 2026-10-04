# auth-service

Xác thực cho hệ thống microservice: đăng ký, đăng nhập email/mật khẩu, JWT (RS256), refresh token,
session và thiết bị. Node.js 22 · TypeScript · Express 5 · MongoDB.

Kiến trúc: [ARCHITECTURE.md](ARCHITECTURE.md) · Sơ đồ dữ liệu: [docs/ERD.md](docs/ERD.md)

## Yêu cầu

- Node.js ≥ 22
- MongoDB (local hoặc Atlas)
- **user-service** đang chạy (mặc định `http://localhost:8080`)

## Cài đặt lần đầu

```bash
npm install
cp .env.example .env      # sửa MONGODB_URI, USER_SERVICE_URL, SUPER_ADMIN_*
npm run keys:generate     # tạo khoá ký JWT: keys/private.pem (không commit)
```

Seed mật khẩu cho super admin (**chỉ chạy một lần**, chạy lại vẫn an toàn). Thứ tự:

1. user-service: `npm run seed` → tạo user `SUPER_ADMIN_EMAIL`
2. user-service: `npm run dev` (auth-service cần gọi sang để tìm user)
3. auth-service: `npm run seed` → tạo đăng nhập email/mật khẩu với `SUPER_ADMIN_PASSWORD`

## Chạy

| Môi trường | Lệnh |
|---|---|
| Dev | `npm run dev` |
| Production | `npm run build` → `npm run keys:generate` + `npm run seed:prod` (lần đầu) → `npm start` |
| Test | `npm test` (không cần user-service: test dùng user-service giả) |

- API: `http://localhost:8081/api/auth`
- Swagger: `http://localhost:8081/docs`
- JWKS (public key cho service khác): `http://localhost:8081/.well-known/jwks.json`
- Health: `http://localhost:8081/health`

## Thử nhanh

```bash
curl -X POST http://localhost:8081/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"superadmin@gmail.com","password":"123456789","device":{"deviceName":"curl","deviceType":"WEB"}}'
```

## Kiểm tra code

| Lệnh | Việc làm |
|---|---|
| `npm run typecheck` | Kiểm tra kiểu TypeScript cho `src` và `tests` |
| `npm run lint` | ESLint, gồm luật chặn import sai tầng Clean Architecture |
| `npm run format` | Định dạng code bằng Prettier (`format:check` chỉ kiểm tra) |
| `npm run check` | Chạy tất cả: typecheck → lint → format:check → test. Chạy trước khi commit |
