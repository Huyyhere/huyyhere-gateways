import { NextRequest, NextResponse } from "next/server";
import { globalLimiter, getKeyLimiter } from "@/lib/rate-limiter";

const OWNER_SECRET_ENV = process.env.OWNER_SECRET;
if (!OWNER_SECRET_ENV) throw new Error("OWNER_SECRET env var is required");
const OWNER_SECRET: string = OWNER_SECRET_ENV;

// Edge runtime has no access to Node's crypto.timingSafeEqual, so we do a
// manual constant-time comparison here instead of `===`.
function timingSafeEqualStr(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 32);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
};

function isPreflight(req: NextRequest) {
  return req.method === "OPTIONS";
}

function isPublicRoute(pathname: string) {
  return pathname === "/" || pathname.startsWith("/api/metrics") || pathname.startsWith("/api/owner") || ["/api/health", "/api/models", "/v1/models", "/v1/tools", "/v1/analytics"].includes(pathname);
}

function needsAuth(pathname: string) {
  return pathname.startsWith("/v1/") || pathname.startsWith("/api/chat");
}

function getClientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPreflight(req)) {
    return NextResponse.json(null, { status: 204, headers: CORS_HEADERS });
  }

  const res = NextResponse.next();

  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);

  if (!needsAuth(pathname)) return res;
  if (isPublicRoute(pathname)) return res;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "missing api key", type: "authentication_error" },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  // Owner secret = admin bypass (skip rate limit)
  if (timingSafeEqualStr(token, OWNER_SECRET)) return res;

  if (pathname === "/v1/tools" || pathname === "/v1/models" || pathname === "/v1/analytics") return res;

  const clientKey = getClientKey(req);
  const globalResult = globalLimiter.check(clientKey);
  if (!globalResult.allowed) {
    return NextResponse.json(
      { error: "rate limit exceeded", type: "rate_limit_error", retry_after: globalResult.retryAfter },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Retry-After": String(globalResult.retryAfter),
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": String(globalResult.remaining),
          "X-RateLimit-Reset": String(Math.ceil(globalResult.resetAt / 1000)),
        },
      }
    );
  }

  const keyLimiter = getKeyLimiter(token);
  const keyResult = keyLimiter.check(token);
  if (!keyResult.allowed) {
    return NextResponse.json(
      { error: "api key rate limit exceeded", type: "rate_limit_error", retry_after: keyResult.retryAfter },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Retry-After": String(keyResult.retryAfter),
          "X-RateLimit-Limit": "120",
          "X-RateLimit-Remaining": String(keyResult.remaining),
          "X-RateLimit-Reset": String(Math.ceil(keyResult.resetAt / 1000)),
        },
      }
    );
  }

  res.headers.set("X-RateLimit-Remaining", String(globalResult.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(globalResult.resetAt / 1000)));

  return res;
}

export const config = {
  matcher: ["/v1/:path*", "/api/chat/:path*"],
};
