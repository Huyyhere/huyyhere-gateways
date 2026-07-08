import { modelMap } from "./config";
import { ModelSection, testKeys, fetchAllModels } from "./keyFetcher";
import { pushLog } from "./logStore";

const knownModels = new Set<string>();

const GOOD_MODELS = new Set([
  "claude-opus-4-7",
  "deepseek-v4-pro",
  "gemini-2.5-flash",
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.5-mini",
  "gpt-5.5-nano",
  "smart-chat",

  "x-ai/grok-4.3",
  "x-ai/grok-4.20-beta",
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
]);

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  console.log(`\x1b[2m${ts}\x1b[0m \x1b[36m[${tag}]\x1b[0m ${msg}`);
  pushLog("info", tag, msg);
}

export interface NewModelInfo {
  name: string;
  model: string;
  added: boolean;
}

function stripPrefix(model: string): string {
  const prefixes = ["openai/", "deepseek/", "google/", "x-ai/", "moonshotai/"];
  for (const p of prefixes) {
    if (model.startsWith(p)) return model.slice(p.length);
  }
  return model;
}

export async function discoverAndAddNewModels(): Promise<NewModelInfo[]> {
  const sections = await fetchAllModels();
  const added: NewModelInfo[] = [];

  for (const section of sections) {
    if (section.keys.length === 0) continue;

    const primaryKey = section.keys[0];
    const rawModel = primaryKey.model;
    const modelName = stripPrefix(rawModel);

    if (modelMap[modelName] || modelMap[rawModel]) {
      knownModels.add(rawModel);
      continue;
    }

    if (knownModels.has(rawModel)) continue;
    knownModels.add(rawModel);

    if (!GOOD_MODELS.has(rawModel) && !GOOD_MODELS.has(modelName)) continue;

    if (primaryKey.expires !== "unknown" && new Date(primaryKey.expires + "T23:59:59Z").getTime() < Date.now()) {
      continue;
    }

    log("modelupdater", `Phát hiện model: ${modelName} (${section.name}), đang test...`);

    const tested = await testKeys([primaryKey]);
    if (tested.length > 0 && tested[0].valid) {
      modelMap[modelName] = "claude";
      if (modelName !== rawModel) {
        modelMap[rawModel] = "claude";
      }
      added.push({ name: section.name, model: modelName, added: true });
      log("modelupdater", `✅ Đã thêm: ${modelName}`);
    } else {
      added.push({ name: section.name, model: modelName, added: false });
      log("modelupdater", `❌ ${modelName} không hoạt động, bỏ qua`);
    }
  }

  log("modelupdater", `Thêm ${added.filter((a) => a.added).length} models mới`);
  return added;
}
