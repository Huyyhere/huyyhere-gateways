import { NextResponse } from "next/server";
import { modelMap } from "@/lib/config";

export async function GET() {
  const data = Object.keys(modelMap).map((id) => ({
    id,
    object: "model",
  }));

  return NextResponse.json({ object: "list", data });
}
