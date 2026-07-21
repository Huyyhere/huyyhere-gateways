import { getKeyPool } from "./models";
import { selectKeys, markKeyFailed } from "./provider";

const STABILITY_BASE = process.env.STABILITY_BASE_URL || "https://api.stability.ai";
const ENGINE = process.env.STABILITY_ENGINE || "stable-diffusion-xl-1024-v1-0";

export interface StabilityImage {
  base64: string;
  seed: number;
}

export async function generateImage(
  prompt: string,
  opts: { width?: number; height?: number; n?: number } = {}
): Promise<StabilityImage[]> {
  const keys = selectKeys(getKeyPool("STABILITY"));
  if (keys.length === 0) throw new Error("no Stability AI keys configured");

  let lastError = "";
  for (const key of keys) {
    try {
      const res = await fetch(`${STABILITY_BASE}/v1/generation/${ENGINE}/text-to-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt }],
          width: opts.width || 1024,
          height: opts.height || 1024,
          samples: opts.n || 1,
          steps: 30,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) {
        const data = (await res.json()) as { artifacts: { base64: string; seed: number }[] };
        return data.artifacts.map((a) => ({ base64: a.base64, seed: a.seed }));
      }

      const text = await res.text();
      lastError = `${res.status}: ${text.slice(0, 200)}`;
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        markKeyFailed(key);
        continue;
      }
      throw new Error(lastError);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`All Stability AI keys failed. Last: ${lastError}`);
}
