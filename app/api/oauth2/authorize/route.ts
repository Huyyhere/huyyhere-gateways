import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl, generateState, STATE_COOKIE_NAME } from "@/lib/discord-auth";

export async function GET(req: NextRequest) {
  const state = generateState();
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/oauth2/callback`;
  const res = NextResponse.redirect(buildAuthorizeUrl(state, redirectUri));
  res.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
