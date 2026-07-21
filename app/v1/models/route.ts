import { NextResponse } from "next/server";
import { MODEL_LIST } from "@/lib/models";

export async function GET() {
  return NextResponse.json({ object: "list", data: MODEL_LIST });
}
