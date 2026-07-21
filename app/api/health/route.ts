import { NextResponse } from "next/server";
import { listTools } from "@/lib/tools/registry";
import "@/lib/tools/builtins";
import { MODEL_IDS } from "@/lib/models";

export async function GET() {
  const tools = listTools();
  return NextResponse.json({
    status: "ok",
    version: "0.1.8",
    models: MODEL_IDS.length,
    tools: tools.length,
  });
}
