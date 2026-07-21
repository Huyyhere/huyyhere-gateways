import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL("/login", req.url);
  url.search = req.nextUrl.search;
  return NextResponse.redirect(url);
}
