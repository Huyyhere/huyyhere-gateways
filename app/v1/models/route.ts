import { NextResponse } from "next/server";
import { buildModelRoutes } from "@/lib/provider";

export async function GET() {
  const routes = buildModelRoutes();
  const data = Object.keys(routes).map((id) => ({
    id,
    object: "model" as const,
    created: 1700000000,
  }));
  return NextResponse.json({ object: "list", data });
}
