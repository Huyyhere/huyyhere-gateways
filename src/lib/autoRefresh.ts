import { fetchAndCheckClaudeKeys, KeyInfo } from "./keyFetcher";
import { ProviderName } from "./config";
import { KeyPool } from "./keyPool";
import { pushLog } from "./logStore";
import { discoverAndAddNewModels } from "./modelUpdater";
import { saveProviderKeys } from "./keyStore";

const INTERVAL_MS = 15 * 60 * 1000;

const globalForRefresh = globalThis as unknown as {
  __aiGatewayRefreshStarted?: boolean;
  __aiGatewayPools?: Record<ProviderName, KeyPool>;
};

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  console.log(`\x1b[2m${ts}\x1b[0m \x1b[36m[${tag}]\x1b[0m ${msg}`);
  pushLog("info", tag, msg);
}

export async function updateClaudeKeys(keys: KeyInfo[]): Promise<string[]> {
  const validKeys = keys.filter((k) => k.valid).map((k) => k.key);
  if (validKeys.length === 0) return [];

  const pool = globalForRefresh.__aiGatewayPools?.claude;
  if (pool) pool.reset(validKeys);
  await saveProviderKeys("claude", validKeys);
  log("autorefresh", `Claude: ${validKeys.length} keys đã lưu vào MongoDB`);

  return validKeys;
}

async function doRefresh() {
  log("autorefresh", "Bắt đầu refresh keys Claude...");
  const keys = await fetchAndCheckClaudeKeys();
  const valid = await updateClaudeKeys(keys);
  log("autorefresh", `Done keys: ${valid.length}/${keys.length}`);

  log("autorefresh", "Đang dò tìm model mới...");
  const newModels = await discoverAndAddNewModels();
  const added = newModels.filter((m) => m.added);
  if (added.length > 0) {
    log("autorefresh", `✅ Đã thêm ${added.length} model mới: ${added.map((m) => m.model).join(", ")}`);
  } else {
    log("autorefresh", "Không có model mới");
  }
}

export function startAutoRefresh() {
  if (globalForRefresh.__aiGatewayRefreshStarted) return;
  globalForRefresh.__aiGatewayRefreshStarted = true;

  log("autorefresh", `Khởi động auto-refresh mỗi ${INTERVAL_MS / 60000} phút`);
  doRefresh();

  setInterval(() => {
    doRefresh();
  }, INTERVAL_MS);
}
