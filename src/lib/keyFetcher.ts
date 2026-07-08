import { fetchWithTimeout } from "./fetchWithTimeout";
import { pushLog } from "./logStore";

function logInfo(tag: string, msg: string) {
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  console.log(`\x1b[2m${ts}\x1b[0m \x1b[36m[${tag}]\x1b[0m ${msg}`);
  pushLog("info", tag, msg);
}

function logFail(tag: string, msg: string) {
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  console.log(`\x1b[2m${ts}\x1b[0m \x1b[31m[${tag}]\x1b[0m ${msg}`);
  pushLog("error", tag, msg);
}

const RAW_URL = "https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md";
const BASE_URL = "https://aiapiv2.pekpik.com/v1/chat/completions";

export interface KeyInfo {
  key: string;
  model: string;
  budget: string;
  rateLimit: string;
  expires: string;
  valid: boolean;
  error?: string;
}

export interface ModelSection {
  name: string;
  keys: KeyInfo[];
  updatedAt: string;
}

function isExpired(expires: string): boolean {
  if (expires === "unknown") return false;
  const exp = new Date(expires + "T23:59:59Z");
  return exp.getTime() < Date.now();
}

async function testKey(key: string, model: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      BASE_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ok" }],
          max_tokens: 1,
          stream: false,
        }),
      },
      15000
    );

    if (res.ok) return { valid: true };
    if (res.status === 429) return { valid: true, error: "rate_limited" };
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      return { valid: false, error: body.slice(0, 200) };
    }

    return { valid: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

function parseTableRows(sectionBody: string): { key: string; model: string; expires: string; budget: string; rateLimit: string }[] {
  const rows = sectionBody.trim().split("\n").filter((l) => l.includes("|") && l.includes("sk-"));
  const results: { key: string; model: string; expires: string; budget: string; rateLimit: string }[] = [];

  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 7) continue;

    const keyMatch = cells[0].match(/`(sk-\w+)`/);
    if (!keyMatch) continue;

    const expiresMatch = cells[5].match(/(\d{4}-\d{2}-\d{2})/);

    results.push({
      key: keyMatch[1],
      model: cells[1],
      budget: cells[3].replace(/[🆕$\s]/g, ""),
      rateLimit: cells[4].replace(/[🆕\s]/g, ""),
      expires: expiresMatch ? expiresMatch[1] : "unknown",
    });
  }

  return results;
}

export function parseAllModels(md: string): ModelSection[] {
  const sections: ModelSection[] = [];
  const sectionRegex = /### ([^\n]+?) `([^`]+)`\n+\|.*?\n\|.*?\n((?:\|.*?\n)*?)(?=\n###|\n---|\n$)/g;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(md)) !== null) {
    const name = match[1].trim();
    const updatedAt = match[2].trim();
    const body = match[3];

    const rows = parseTableRows(body);
    if (rows.length === 0) continue;

    const keys: KeyInfo[] = rows.map((r) => ({
      ...r,
      valid: false,
    }));

    sections.push({ name, keys, updatedAt });
  }

  return sections;
}

export function parseClaudeKeys(md: string): KeyInfo[] {
  const sections = parseAllModels(md);
  const claude = sections.find((s) => s.name.toLowerCase().includes("claude opus"));
  return claude ? claude.keys : [];
}

export async function fetchAndCheckClaudeKeys(): Promise<KeyInfo[]> {
  logInfo("keyfetcher", "Đang fetch keys từ GitHub...");

  let md: string;
  try {
    const res = await fetchWithTimeout(RAW_URL, {}, 20000);
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    md = await res.text();
  } catch (err) {
    logFail("keyfetcher", `Không fetch được README: ${(err as Error).message}`);
    return [];
  }

  const keys = parseClaudeKeys(md);
  logInfo("keyfetcher", `Tìm thấy ${keys.length} keys Claude Opus 4.7`);

  return await testKeys(keys);
}

export async function fetchAllModels(): Promise<ModelSection[]> {
  logInfo("keyfetcher", "Đang fetch tất cả models từ GitHub...");

  let md: string;
  try {
    const res = await fetchWithTimeout(RAW_URL, {}, 20000);
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    md = await res.text();
  } catch (err) {
    logFail("keyfetcher", `Không fetch được README: ${(err as Error).message}`);
    return [];
  }

  return parseAllModels(md);
}

export async function testKeys(keys: KeyInfo[]): Promise<KeyInfo[]> {
  const results: KeyInfo[] = [];
  for (const k of keys) {
    if (isExpired(k.expires)) {
      k.valid = false;
      k.error = "expired";
      results.push(k);
      continue;
    }

    const { valid, error } = await testKey(k.key, k.model);
    k.valid = valid;
    if (error) k.error = error;
    results.push(k);

    logInfo("keyfetcher", `${k.key.slice(0, 8)}... ${valid ? "✅" : "❌"} ${error || ""}`);
  }

  const validKeys = results.filter((k) => k.valid);
  logInfo("keyfetcher", `${validKeys.length}/${results.length} keys còn sống`);

  return results;
}
