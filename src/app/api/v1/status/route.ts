import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getStatus } from "@/lib/router";

export const runtime = "nodejs";

function checkAuth(req: NextRequest): boolean {
  if (!config.gatewayApiKey) return true;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === config.gatewayApiKey;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: { message: "invalid_api_key" } }, { status: 401 });
  }

  return NextResponse.json({
    displayModel: config.displayModelName,
    providerOrder: config.providerOrder,
    providers: getStatus(),
  });
}
