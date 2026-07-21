# HuyyHere Gateways v0.1.5

### 59 Tools (was 16)
+43 tools mới: text_extract, password_generate, jwt_decode, dns_lookup, ipv4_calc, cron_parse, word_frequency, diff_text, text_similarity, markdown_table, json_query, json_to_csv, color_palette, qr_code, checksum, image_info, punycode, mac_lookup, lorem, fibonacci, primes, isbn_validate, hmac_hash, number_convert, random_string, slug_generate, duration_format, timestamp_convert, timezone_convert...

### Anthropic / Claude Code Support
Endpoint mới `POST /v1/messages` — dùng được với Claude Code:
```
ANTHROPIC_BASE_URL=https://huyyhere-gateways.vercel.app
ANTHROPIC_API_KEY=your-key
```

### Security
- Auth + CORS + Rate limit (60 req/min) trên tất cả /v1/*
- Security headers (HSTS, X-Frame-Options...)
- Request ID tracking, structured logging
- 60s upstream timeout

### New Models (3)
`glm-4.7-flash`, `glm-4.5-flash`, `glm-4.6v-flash`

### Endpoints
`GET /v1/models` · `GET /v1/tools` · `GET /api/health`
`POST /v1/chat/completions` (OpenAI) · `POST /v1/messages` (Anthropic)
