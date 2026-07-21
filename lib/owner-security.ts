import { NextRequest, NextResponse } from "next/server";
import { getKey } from "./api-keys";
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from "./discord-auth";
import crypto from "crypto";

const OWNER_SECRET = process.env.OWNER_SECRET;
if (!OWNER_SECRET) throw new Error("OWNER_SECRET env var is required");
const OWNER_SECRET_BUF = Buffer.from(OWNER_SECRET);
const ALLOWED_IPS = (process.env.OWNER_ALLOWED_IPS || "").split(",").filter(Boolean);

export function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // still run a compare of equal length to avoid leaking length via early-return timing
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function isOwnerSecret(candidate: string): boolean {
  const buf = Buffer.from(candidate);
  if (buf.length !== OWNER_SECRET_BUF.length) {
    crypto.timingSafeEqual(OWNER_SECRET_BUF, OWNER_SECRET_BUF);
    return false;
  }
  return crypto.timingSafeEqual(buf, OWNER_SECRET_BUF);
}

// Rate limiting for owner endpoints
const ownerRateLimit = new Map<string, { count: number; resetAt: number }>();
const OWNER_RATE_LIMIT = 60;
const OWNER_RATE_WINDOW = 60_000;

function checkOwnerRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ownerRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    ownerRateLimit.set(ip, { count: 1, resetAt: now + OWNER_RATE_WINDOW });
    return true;
  }
  if (entry.count >= OWNER_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Input validation
export function sanitize(input: string, maxLen = 1000): string {
  return input.replace(/[<>"'`;]/g, "").slice(0, maxLen);
}

export function validateName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(name);
}

export function validateTokenLimit(limit: number): boolean {
  return Number.isFinite(limit) && limit >= 0 && limit <= 100_000_000;
}

// Request signing verification
export function verifySignature(req: NextRequest, secret: string): boolean {
  const signature = req.headers.get("x-signature");
  const timestamp = req.headers.get("x-timestamp");
  if (!signature || !timestamp) return false;

  const ts = parseInt(timestamp);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > 300_000) return false; // 5 min window

  const body = req.headers.get("x-body-hash") || "";
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex");
  return signature === expected;
}

// IP whitelist check
function isAllowedIP(ip: string): boolean {
  if (ALLOWED_IPS.length === 0) return true; // No whitelist = allow all
  return ALLOWED_IPS.includes(ip);
}

function getClientIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

// Main owner auth middleware
export interface OwnerAuthResult {
  allowed: boolean;
  error?: NextResponse;
  key?: string;
}

export async function verifyOwnerAuth(req: NextRequest): Promise<OwnerAuthResult> {
  const ip = getClientIP(req);

  // Rate limit
  if (!checkOwnerRateLimit(ip)) {
    return {
      allowed: false,
      error: NextResponse.json(
        { error: "rate limit exceeded", retry_after: 60 },
        { status: 429, headers: { "Retry-After": "60" } }
      ),
    };
  }

  // IP whitelist
  if (!isAllowedIP(ip)) {
    return {
      allowed: false,
      error: NextResponse.json(
        { error: "ip not allowed", ip },
        { status: 403 }
      ),
    };
  }

  // Discord-authenticated owner session (used by the /dashboard owner-only tabs)
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session && session.isOwner) {
    return { allowed: true, key: `discord:${session.id}` };
  }

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!auth) {
    return {
      allowed: false,
      error: NextResponse.json({ error: "missing authorization" }, { status: 401 }),
    };
  }

  // Owner secret
  if (isOwnerSecret(auth)) {
    return { allowed: true, key: auth };
  }

  // Dynamic API key with admin flag
  const apiKey = await getKey(auth);
  if (apiKey && (apiKey as any).admin) {
    return { allowed: true, key: auth };
  }

  return {
    allowed: false,
    error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  };
}

// Security headers for owner responses
export function secureHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  };
}
