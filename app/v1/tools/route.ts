import { NextResponse } from "next/server";
import { listTools } from "@/lib/tools/registry";
import "@/lib/tools/builtins";

export async function GET() {
  return NextResponse.json({ object: "list", data: listTools() });
}
