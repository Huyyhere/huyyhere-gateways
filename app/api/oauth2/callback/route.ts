import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForUser,
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  STATE_COOKIE_NAME,
} from "@/lib/discord-auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE_NAME)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }

  try {
    const user = await exchangeCodeForUser(code);

    const res = NextResponse.redirect(new URL("/dashboard", req.url));
    res.cookies.delete(STATE_COOKIE_NAME);
    res.cookies.set(SESSION_COOKIE_NAME, createSessionCookieValue(user.id, user.username, user.email), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
