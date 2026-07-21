import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { getRecentLogs } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
  const model = url.searchParams.get("model") || undefined;

  const logs = getRecentLogs(limit, model);
  return Response.json({ logs, count: logs.length }, { headers: secureHeaders() });
}
