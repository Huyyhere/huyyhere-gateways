import { NextRequest } from "next/server";
import { verifyOwnerAuth } from "@/lib/owner-security";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  return Response.json({
    status: "ok",
    version: "0.1.0",
    uptime: process.uptime().toFixed(0) + "s",
    node: process.version,
    memory: process.memoryUsage(),
  });
}
