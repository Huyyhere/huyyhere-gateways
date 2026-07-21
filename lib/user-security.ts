import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE_NAME, type Session } from "./discord-auth";

const rateLimit = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 120;
const WINDOW = 60_000;

function checkRateLimit(id: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(id);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(id, { count: 1, resetAt: now + WINDOW });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count++;
  return true;
}

export interface UserAuthResult {
  allowed: boolean;
  session?: Session;
  error?: NextResponse;
}

// Any signed-in Discord user passes. Use session.isOwner downstream to decide
// whether to also expose owner-only data.
export async function verifyUserAuth(req: NextRequest): Promise<UserAuthResult> {
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return { allowed: false, error: NextResponse.json({ error: "not signed in" }, { status: 401 }) };
  }
  if (!checkRateLimit(session.id)) {
    return {
      allowed: false,
      error: NextResponse.json({ error: "rate limit exceeded" }, { status: 429, headers: { "Retry-After": "60" } }),
    };
  }
  return { allowed: true, session };
}
