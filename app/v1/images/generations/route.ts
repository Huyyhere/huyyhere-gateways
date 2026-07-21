import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { recordUsage } from "@/lib/api-keys";
import { generateImage } from "@/lib/stability";

// Images aren't priced in tokens upstream, so we charge a flat token-equivalent
// per generated image against the caller's quota to keep the free tier sane.
const IMAGE_TOKEN_COST = 5000;

// SDXL-1024 only accepts specific width/height pairs (multiples of 64, capped
// total pixel budget). Anything else gets clamped to the closest supported size.
const ALLOWED_SIZES = new Set([
  "1024x1024", "1152x896", "896x1152", "1216x832",
  "832x1216", "1344x768", "768x1344", "1536x640", "640x1536",
]);

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) return auth.error!;

  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt || "").slice(0, 2000);
  const n = Math.min(Math.max(parseInt(body.n) || 1, 1), 4);
  const sizeInput = String(body.size || "1024x1024");
  const size = ALLOWED_SIZES.has(sizeInput) ? sizeInput : "1024x1024";
  const [width, height] = size.split("x").map((v) => parseInt(v));
  const responseFormat = body.response_format === "url" ? "url" : "b64_json";

  if (!prompt) {
    return NextResponse.json(
      { error: { message: "prompt is required", type: "invalid_request_error" } },
      { status: 400 }
    );
  }
  if (responseFormat === "url") {
    return NextResponse.json(
      { error: { message: "response_format 'url' is not supported, use 'b64_json'", type: "invalid_request_error" } },
      { status: 400 }
    );
  }

  try {
    const images = await generateImage(prompt, { width, height, n });
    if (auth.key) {
      recordUsage(auth.key, 0, IMAGE_TOKEN_COST * images.length).catch(() => {});
    }
    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      data: images.map((img) => ({ b64_json: img.base64 })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : String(e), type: "server_error" } },
      { status: 502 }
    );
  }
}
