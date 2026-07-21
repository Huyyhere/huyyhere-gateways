import { NextResponse } from "next/server";
import { listTools } from "@/lib/tools/registry";
import "@/lib/tools/builtins";
import { buildModelRoutes } from "@/lib/provider";

export async function GET() {
  const tools = listTools();
  const routes = buildModelRoutes();
  return NextResponse.json({
    status: "ok",
    version: "0.1.8",
    models: Object.keys(routes).length,
    tools: tools.length,
  });
}
