import { NextRequest, NextResponse } from "next/server";
import { getKey } from "./api-keys";
import crypto from "crypto";

const OWNER_SECRET = process.env.OWNER_SECRET;
if (!OWNER_SECRET) throw new Error("OWNER_SECRET env var is required");
const OWNER_SECRET_BUF = Buffer.from(OWNER_SECRET);
const ALLOWED_IPS = (process.env.OWNER_ALLOWED_IPS || "").split(",").filter(Boolean);

export function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
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

export function sanitize(input: string, maxLen = 1000): string {
  return input.replace(/[<>"'`;]/g, "").slice(0, maxLen);
}

export function validateName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(name);
}

export function validateTokenLimit(limit: number): boolean {
  return Number.isFinite(limit) && limit >= 0 && limit <= 100_000_000;
}

function isAllowedIP(ip: string): boolean {
  if (ALLOWED_IPS.length === 0) return true;
  return ALLOWED_IPS.includes(ip);
}

function getClientIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

export interface OwnerAuthResult {
  allowed: boolean;
  error?: NextResponse;
  key?: string;
}

export async function verifyOwnerAuth(req: NextRequest): Promise<OwnerAuthResult> {
  const ip = getClientIP(req);

  if (!checkOwnerRateLimit(ip)) {
    return {
      allowed: false,
      error: NextResponse.json(
        { error: "rate limit exceeded", retry_after: 60 },
        { status: 429, headers: { "Retry-After": "60" } }
      ),
    };
  }

  if (!isAllowedIP(ip)) {
    return {
      allowed: false,
      error: NextResponse.json({ error: "ip not allowed", ip }, { status: 403 }),
    };
  }

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!auth) {
    return {
      allowed: false,
      error: NextResponse.json({ error: "missing authorization" }, { status: 401 }),
    };
  }

  if (isOwnerSecret(auth)) {
    return { allowed: true, key: auth };
  }

  const apiKey = await getKey(auth);
  if (apiKey && (apiKey as any).admin) {
    return { allowed: true, key: auth };
  }

  return {
    allowed: false,
    error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  };
}

export function secureHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  };
}
