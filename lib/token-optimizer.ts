const TOKEN_RATIO = 3.5;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | { type: "image_file"; image_file: { file_id: string } };

export type MessageContent = string | ContentPart[];

export function getMessageText(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export function hasImageContent(content: MessageContent): boolean {
  if (typeof content === "string") return false;
  return content.some((p) => p.type === "image_url" || p.type === "image_file");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_RATIO);
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { input: number; output: number }
): number {
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

const FREE = { input: 0, output: 0 };

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "mimo-code-free":    FREE,
  "kimi-k2.7-code":    FREE,
  "minimax-m3":        FREE,
  "kimi-k2.6":         FREE,
  "deepseek-v4-pro":   FREE,
  "glm-5.2":           FREE,
  "grok-4.5":          FREE,
  "glm-4.7-flash":     FREE,
  "glm-4.5-flash":     FREE,
};

const MODEL_RANK: Record<string, number> = {
  "kimi-k2.7-code":    95,
  "deepseek-v4-pro":   94,
  "minimax-m3":        90,
  "kimi-k2.6":         88,
  "mimo-code-free":    80,
  "glm-5.2":           72,
  "grok-4.5":          71,
  "glm-4.7-flash":     70,
  "glm-4.5-flash":     65,
};

type TaskType = "greeting" | "simple_qa" | "coding" | "analysis" | "creative" | "multimodal";

function detectTaskType(messages: { role: string; content: MessageContent }[]): TaskType {
  const last = getMessageText(messages[messages.length - 1]?.content || "");
  const totalChars = messages.reduce((sum, m) => sum + getMessageText(m.content).length, 0);
  const hasImage = messages.some((m) => hasImageContent(m.content) || getMessageText(m.content).includes("http"));

  if (/^(hi|hello|hey|chào|xin chào|thanks|ok|yes|no)\b/i.test(last) && last.length < 100) {
    return "greeting";
  }

  if (hasImage || /\b(image|photo|picture|anh|hình)\b/i.test(last)) {
    return "multimodal";
  }

  const codeSignals = [
    /\b(code|function|class|import|export|const|let|var|return|async|await)\b/i,
    /\b(debug|fix|error|bug|refactor|implement)\b/i,
    /\b(python|javascript|typescript|rust|go|java|c\+\+)\b/i,
    /```[\s\S]*```/,
    /\b(api|endpoint|route|middleware)\b/i,
  ];

  const analysisSignals = [
    /\b(analyze|analysis|explain|compare|evaluate|reason|think)\b/i,
    /\b(why|how|what|trade.?off|pros?.cons|advantage|disadvantage)\b/i,
    /\b(architecture|system design|pattern|strategy)\b/i,
  ];

  const creativeSignals = [
    /\b(write|create|generate|compose|draft|story|essay)\b/i,
    /\b(blog|article|content|copy|marketing)\b/i,
  ];

  const isCode = codeSignals.some((r) => r.test(last));
  const isAnalysis = analysisSignals.some((r) => r.test(last)) || totalChars > 3000;
  const isCreative = creativeSignals.some((r) => r.test(last));

  if (isCode) return "coding";
  if (isAnalysis) return "analysis";
  if (isCreative) return "creative";
  return "simple_qa";
}

const CODING   = ["kimi-k2.7-code", "deepseek-v4-pro", "kimi-k2.6", "minimax-m3", "mimo-code-free"];
const FAST     = ["glm-4.7-flash", "glm-4.5-flash", "kimi-k2.7-code", "mimo-code-free"];
const VISION   = ["minimax-m3", "kimi-k2.6"];
const ANALYSIS = ["deepseek-v4-pro", "minimax-m3", "kimi-k2.6", "kimi-k2.7-code"];
const CREATIVE = ["minimax-m3", "kimi-k2.6", "glm-4.7-flash"];

function selectByTaskType(taskType: TaskType): string[] {
  const map: Record<TaskType, string[]> = {
    greeting:   FAST,
    simple_qa:  FAST,
    coding:     CODING,
    analysis:   ANALYSIS,
    creative:   CREATIVE,
    multimodal: VISION,
  };
  return map[taskType] || FAST;
}

const modelHealth = new Map<string, { ok: boolean; lastCheck: number }>();
const HEALTH_CHECK_INTERVAL = 60_000;

export function markModelDown(model: string) {
  modelHealth.set(model, { ok: false, lastCheck: Date.now() });
}

export function markModelUp(model: string) {
  modelHealth.set(model, { ok: true, lastCheck: Date.now() });
}

function isModelHealthy(model: string): boolean {
  const health = modelHealth.get(model);
  if (!health) return true;
  if (Date.now() - health.lastCheck > HEALTH_CHECK_INTERVAL) return true;
  return health.ok;
}

export function selectModel(
  requestedModel: string,
  messages: { role: string; content: MessageContent }[],
  preferCheap = false
): { model: string; reason: string; estimatedTokens: number; estimatedCost: number } {
  const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(getMessageText(m.content)), 0);
  const taskType = detectTaskType(messages);

  let candidates = selectByTaskType(taskType);
  candidates = candidates.filter(isModelHealthy);

  if (candidates.length === 0) {
    candidates = ["glm-4.7-flash", "mimo-code-free"];
  }

  const selected = candidates[0];
  const pricing = MODEL_PRICING[selected] || FREE;

  return {
    model: selected,
    reason: `${taskType} → ${selected}`,
    estimatedTokens: inputTokens,
    estimatedCost: estimateCost(inputTokens, inputTokens * 2, pricing),
  };
}

export function getCostTable() {
  return Object.entries(MODEL_PRICING).map(([model, pricing]) => ({
    model,
    rank: MODEL_RANK[model],
    input: `$${pricing.input}`,
    output: `$${pricing.output}`,
  }));
}

const FILLER_PATTERNS = [
  /\b(please|kindly|just|simply|basically|actually|really|very|definitely|certainly|absolutely)\b/gi,
  /\b(I would like you to|I want you to|can you|could you|would you)\b/gi,
  /\b(in order to|for the purpose of|with regard to|in terms of|as far as)\b/gi,
  /\b(it is important to note that|it should be noted that|please note that)\b/gi,
  /\b(thank you in advance|thanks in advance|TIA)\b/gi,
  /\b(hi|hello|hey|dear)\s+[A-Z][a-z]+[,.]?\s*/gi,
];

const REDUNDANT_PATTERNS = [
  /\b(make sure to|ensure that|be sure to|don't forget to)\b/gi,
  /\b(I need you to|you need to|you should|you must)\b/gi,
  /\b(this is a|here is a|below is a|following is a)\b/gi,
  /\b(as a|in the role of|acting as|pretend you are)\b/gi,
];

function stripFiller(text: string): string {
  let result = text;
  for (const pattern of FILLER_PATTERNS) result = result.replace(pattern, "");
  for (const pattern of REDUNDANT_PATTERNS) result = result.replace(pattern, "");
  return result.replace(/\s{2,}/g, " ").replace(/^\s+|\s+$/g, "").replace(/\n{3,}/g, "\n\n");
}

export function optimizeMessages(
  messages: { role: string; content: MessageContent }[],
  maxTokens = 8000
): { messages: { role: string; content: MessageContent }[]; tokensSaved: number } {
  let totalSaved = 0;

  const optimized = messages.map((m) => {
    if (m.role === "user") {
      const text = getMessageText(m.content);
      const before = estimateTokens(text);
      if (typeof m.content === "string") {
        const opt = stripFiller(m.content);
        const after = estimateTokens(opt);
        totalSaved += before - after;
        return { ...m, content: opt };
      }
      return m;
    }
    return m;
  });

  let totalTokens = optimized.reduce((sum, m) => sum + estimateTokens(getMessageText(m.content)), 0);

  if (totalTokens > maxTokens) {
    const systemMsgs = optimized.filter((m) => m.role === "system");
    const otherMsgs = optimized.filter((m) => m.role !== "system");

    const systemTokens = systemMsgs.reduce((sum, m) => sum + estimateTokens(getMessageText(m.content)), 0);
    const budget = maxTokens - systemTokens;

    if (budget > 0 && otherMsgs.length > 2) {
      const kept: typeof otherMsgs = [];
      let used = 0;

      for (let i = otherMsgs.length - 1; i >= 0; i--) {
        const tokens = estimateTokens(getMessageText(otherMsgs[i].content));
        if (used + tokens <= budget) {
          kept.unshift(otherMsgs[i]);
          used += tokens;
        }
      }

      const removed = otherMsgs.length - kept.length;
      totalSaved += removed;
      return { messages: [...systemMsgs, ...kept], tokensSaved: totalSaved };
    }
  }

  return { messages: optimized, tokensSaved: totalSaved };
}

export function deduplicateMessages(
  messages: { role: string; content: MessageContent }[]
): { messages: { role: string; content: MessageContent }[]; removed: number } {
  const seen = new Set<string>();
  const result: { role: string; content: MessageContent }[] = [];
  let removed = 0;

  for (const m of messages) {
    let hash = 0;
    const contentStr = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const str = m.role + ":" + contentStr;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    const key = String(hash);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(m);
    } else {
      removed++;
    }
  }

  return { messages: result, removed };
}
