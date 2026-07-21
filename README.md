# HuyyHere Gateways

OpenAI-compatible API gateway proxy đến nhiều AI providers.

## Models

| Model | Provider |
|-------|----------|
| `mimo-code-free` | BlackCat |
| `gpt-5.6-luna` | ZLKPro |
| `glm-5.2` | Venuses |
| `grok-4.5` | Venuses |

## Endpoints

```
GET  /v1/models            — Danh sách models
POST /v1/chat/completions  — Chat completions (OpenAI-compatible)
```

## Setup

```bash
npm install
npm run dev -- -p 8080
```

## Usage

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "model": "mimo-code-free",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Config

Cấu hình providers nằm trong file `.env` — API keys, base URLs, model IDs.

## Owner Panel

Truy cập `/owner` — đăng nhập bằng Discord (chỉ tài khoản có ID khớp `DISCORD_OWNER_ID` mới vào được). Không cần chạy server proxy riêng nữa, panel gọi thẳng `/api/owner/*` cùng domain.

Cần cấu hình trong `.env`:

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_OWNER_ID=...
DISCORD_REDIRECT_URI=https://your-domain/api/oauth2/callback
SESSION_SECRET=...   # random hex dài, dùng để ký session cookie
```

`DISCORD_REDIRECT_URI` phải khớp với redirect URI đã đăng ký trong Discord Developer Portal, và khác nhau giữa local (`http://localhost:3000/api/oauth2/callback`) và production (set riêng trong Vercel env, đừng dùng chung file `.env`).

## Provider API Keys

Toàn bộ API key nằm trong `.env` theo dạng `<PREFIX>_API_KEY_1`, `<PREFIX>_API_KEY_2`, ... (nhiều key = tự động rotate/retry khi 1 key bị rate-limit). Thêm/đổi key thì sửa `.env` rồi redeploy.
