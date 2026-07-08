import { pushLog } from "./logStore";

type Level = "info" | "warn" | "error" | "success";

const colors: Record<Level, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  success: "\x1b[32m",
};
const reset = "\x1b[0m";
const dim = "\x1b[2m";

function ts() {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

function line(level: Level, tag: string, message: string) {
  console.log(`${dim}${ts()}${reset} ${colors[level]}[${tag}]${reset} ${message}`);
  pushLog(level, tag, message);
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export const logger = {
  incoming(displayModel: string, stream: boolean) {
    line("info", "REQUEST", `model=${displayModel} stream=${stream}`);
  },
  attempt(provider: string, model: string, keyPreview: string) {
    line("info", "TRY", `${provider} → ${model} (key ${keyPreview})`);
  },
  success(provider: string, model: string, ms: number, usage: Usage) {
    line(
      "success",
      "OK",
      `${provider} → ${model} | ${ms}ms | tokens in:${usage.prompt_tokens} out:${usage.completion_tokens} total:${usage.total_tokens}`
    );
  },
  cooldown(provider: string, keyPreview: string, ms: number, reason: string) {
    line(
      "warn",
      "COOLDOWN",
      `${provider} key ${keyPreview} nghỉ ${Math.round(ms / 1000)}s (${reason})`
    );
  },
  fail(provider: string, reason: string) {
    line("error", "FAIL", `${provider} | ${reason}`);
  },
  exhausted(errors: string[]) {
    line("error", "EXHAUSTED", `tất cả provider đều fail: ${errors.join(" | ")}`);
  },
};
