import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/discord-auth";

const dashboardPath = path.join(process.cwd(), "lib", "dashboard", "dashboard.html");

export async function GET(req: NextRequest) {
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const html = fs.readFileSync(dashboardPath, "utf8");
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}
