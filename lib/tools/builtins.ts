import { registerTool } from "./registry";

function isPrivateIP(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;
    if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]") return true;
    if (/^127\./.test(hostname)) return true;
    if (/^10\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^169\.254\./.test(hostname)) return true;
    if (hostname === "metadata.google.internal" || hostname.endsWith(".internal")) return true;
    return false;
  } catch {
    return true;
  }
}

function safeMathEval(expr: string): number {
  let pos = 0;
  const s = expr.replace(/\s+/g, "");

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < s.length && (s[pos] === "+" || s[pos] === "-")) {
      const op = s[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < s.length && (s[pos] === "*" || s[pos] === "/" || s[pos] === "%")) {
      const op = s[pos++];
      const right = parseFactor();
      if (op === "*") left *= right;
      else if (op === "/") left /= right;
      else left %= right;
    }
    return left;
  }

  function parseFactor(): number {
    if (pos >= s.length) throw new Error("unexpected end");
    if (s[pos] === "(") {
      pos++;
      const val = parseExpr();
      if (pos < s.length && s[pos] === ")") pos++;
      return val;
    }
    if (s[pos] === "-") { pos++; return -parseFactor(); }
    if (s[pos] === "+") { pos++; return parseFactor(); }
    let numStr = "";
    while (pos < s.length && (s[pos] >= "0" && s[pos] <= "9" || s[pos] === ".")) {
      numStr += s[pos++];
    }
    if (!numStr) throw new Error("expected number");
    return parseFloat(numStr);
  }

  const result = parseExpr();
  if (pos !== s.length) throw new Error("unexpected character at " + pos);
  return result;
}

registerTool({
  name: "web_search",
  description: "Search the web for information",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  async execute(args) {
    const query = args.query as string;
    try {
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
      );
      const data = await res.json();
      const results = (data.RelatedTopics || [])
        .slice(0, 5)
        .map((t: { Text?: string; FirstURL?: string }) =>
          `${t.Text || ""}${t.FirstURL ? ` — ${t.FirstURL}` : ""}`
        )
        .filter(Boolean);
      return results.length ? results.join("\n") : `No results for "${query}"`;
    } catch {
      return `Search failed for "${query}"`;
    }
  },
});

registerTool({
  name: "get_datetime",
  description: "Get current date and time",
  parameters: {
    type: "object",
    properties: {
      timezone: { type: "string", description: "Timezone (default: UTC)" },
    },
  },
  async execute(args) {
    const tz = (args.timezone as string) || "UTC";
    return new Date().toLocaleString("en-US", { timeZone: tz });
  },
});

registerTool({
  name: "fetch_url",
  description: "Fetch content from a URL",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
    },
    required: ["url"],
  },
  async execute(args) {
    const url = args.url as string;
    if (isPrivateIP(url)) return "Error: fetching private/internal URLs is not allowed";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "HuyyHere-Gateway/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      return text.slice(0, 3000);
    } catch {
      return `Failed to fetch "${url}"`;
    }
  },
});

registerTool({
  name: "eval_math",
  description: "Evaluate a math expression",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Math expression to evaluate" },
    },
    required: ["expression"],
  },
  async execute(args) {
    const expr = args.expression as string;
    try {
      const result = safeMathEval(expr);
      return `${expr} = ${result}`;
    } catch {
      return `Invalid math expression: "${expr}"`;
    }
  },
});

registerTool({
  name: "generate_uuid",
  description: "Generate a UUID v4",
  parameters: { type: "object", properties: {} },
  async execute() {
    return crypto.randomUUID();
  },
});

registerTool({
  name: "github",
  description: "GitHub API - search repos, get issues, fetch user info",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["search_repos", "get_issue", "get_user", "search_code"], description: "GitHub action" },
      query: { type: "string", description: "Search query or repo/user name" },
      repo: { type: "string", description: "Repository (owner/repo)" },
      issue_number: { type: "number", description: "Issue number" },
    },
    required: ["action"],
  },
  async execute(args) {
    const action = args.action as string;
    const headers = { Accept: "application/vnd.github.v3+json", "User-Agent": "HuyyHere-Gateway/1.0" };
    try {
      if (action === "search_repos") {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(args.query as string)}&per_page=5`, { headers });
        const data = await res.json();
        return (data.items || []).map((r: Record<string, unknown>) => `${r.full_name} — ${r.description || "No description"} (${r.stargazers_count}⭐)`).join("\n") || "No results";
      }
      if (action === "get_user") {
        const res = await fetch(`https://api.github.com/users/${args.query}`, { headers });
        const data = await res.json();
        return `${data.login}: ${data.bio || "No bio"} | ${data.public_repos} repos | ${data.followers} followers`;
      }
      if (action === "get_issue" && args.repo) {
        const res = await fetch(`https://api.github.com/repos/${args.repo}/issues/${args.issue_number}`, { headers });
        const data = await res.json();
        return `#${data.number} ${data.title}\n${data.body?.slice(0, 500) || "No body"}`;
      }
      if (action === "search_code") {
        const res = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(args.query as string)}&per_page=5`, { headers });
        const data = await res.json();
        return (data.items || []).map((c: Record<string, unknown>) => {
          const repo = c.repository as Record<string, unknown> | undefined;
          return `${repo?.full_name || "unknown"}/${c.name}`;
        }).join("\n") || "No results";
      }
      return "Invalid action";
    } catch {
      return "GitHub API request failed";
    }
  },
});

registerTool({
  name: "hash_text",
  description: "Generate hash (SHA-256, SHA-512)",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to hash" },
      algorithm: { type: "string", enum: ["SHA-256", "SHA-512"], description: "Hash algorithm" },
    },
    required: ["text"],
  },
  async execute(args) {
    const text = args.text as string;
    const algo = (args.algorithm as string) || "SHA-256";
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest(algo, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  },
});

registerTool({
  name: "base64_transform",
  description: "Encode or decode Base64",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to encode/decode" },
      action: { type: "string", enum: ["encode", "decode"], description: "encode or decode" },
    },
    required: ["text", "action"],
  },
  async execute(args) {
    const text = args.text as string;
    const action = args.action as string;
    if (action === "encode") return btoa(text);
    if (action === "decode") return atob(text);
    return "Invalid action";
  },
});

registerTool({
  name: "json_format",
  description: "Format, validate, or minify JSON",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "JSON string" },
      action: { type: "string", enum: ["format", "minify", "validate"], description: "Action" },
    },
    required: ["text", "action"],
  },
  async execute(args) {
    const text = args.text as string;
    const action = args.action as string;
    try {
      const parsed = JSON.parse(text);
      if (action === "format") return JSON.stringify(parsed, null, 2);
      if (action === "minify") return JSON.stringify(parsed);
      if (action === "validate") return "Valid JSON";
    } catch (e) {
      return `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`;
    }
    return "Invalid action";
  },
});

registerTool({
  name: "text_transform",
  description: "Transform text case and format",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to transform" },
      action: { type: "string", enum: ["uppercase", "lowercase", "capitalize", "snake_case", "camelCase", "kebab-case", "reverse"], description: "Transform action" },
    },
    required: ["text", "action"],
  },
  async execute(args) {
    const text = args.text as string;
    const action = args.action as string;
    if (action === "uppercase") return text.toUpperCase();
    if (action === "lowercase") return text.toLowerCase();
    if (action === "capitalize") return text.replace(/\b\w/g, (c) => c.toUpperCase());
    if (action === "snake_case") return text.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    if (action === "camelCase") return text.replace(/[_-\s]+(.)?/g, (_, c) => c?.toUpperCase() || "");
    if (action === "kebab-case") return text.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
    if (action === "reverse") return text.split("").reverse().join("");
    return "Invalid action";
  },
});

registerTool({
  name: "regex_test",
  description: "Test regex pattern against text",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern" },
      text: { type: "string", description: "Text to test" },
      flags: { type: "string", description: "Regex flags (default: g)" },
    },
    required: ["pattern", "text"],
  },
  async execute(args) {
    const pattern = args.pattern as string;
    const text = args.text as string;
    const flags = (args.flags as string) || "g";
    try {
      const regex = new RegExp(pattern, flags);
      const matches = text.match(regex);
      if (!matches) return "No matches";
      return `Found ${matches.length} match(es): ${matches.join(", ")}`;
    } catch (e) {
      return `Invalid regex: ${e instanceof Error ? e.message : "error"}`;
    }
  },
});

registerTool({
  name: "markdown_to_html",
  description: "Convert markdown to HTML",
  parameters: {
    type: "object",
    properties: {
      markdown: { type: "string", description: "Markdown text" },
    },
    required: ["markdown"],
  },
  async execute(args) {
    const md = args.markdown as string;
    let html = md
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code class=\"$1\">$2</code></pre>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^\- (.*$)/gim, "<li>$1</li>")
      .replace(/\n/g, "<br>");
    return html;
  },
});

registerTool({
  name: "color_convert",
  description: "Convert between color formats (hex, rgb, hsl)",
  parameters: {
    type: "object",
    properties: {
      color: { type: "string", description: "Color value (hex, rgb, or hsl)" },
      to: { type: "string", enum: ["hex", "rgb", "hsl"], description: "Target format" },
    },
    required: ["color", "to"],
  },
  async execute(args) {
    const color = args.color as string;
    const to = args.to as string;
    try {
      const canvas = { r: 0, g: 0, b: 0 };
      if (color.startsWith("#")) {
        const hex = color.slice(1);
        canvas.r = parseInt(hex.slice(0, 2), 16);
        canvas.g = parseInt(hex.slice(2, 4), 16);
        canvas.b = parseInt(hex.slice(4, 6), 16);
      } else if (color.startsWith("rgb")) {
        const m = color.match(/(\d+)/g);
        if (m) { canvas.r = +m[0]; canvas.g = +m[1]; canvas.b = +m[2]; }
      }
      if (to === "hex") return `#${canvas.r.toString(16).padStart(2, "0")}${canvas.g.toString(16).padStart(2, "0")}${canvas.b.toString(16).padStart(2, "0")}`;
      if (to === "rgb") return `rgb(${canvas.r}, ${canvas.g}, ${canvas.b})`;
      if (to === "hsl") {
        const r = canvas.r / 255, g = canvas.g / 255, b = canvas.b / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b - r) / d + 2) / 6;
          else h = ((r - g) / d + 4) / 6;
        }
        return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
      }
    } catch {}
    return "Invalid color format";
  },
});

registerTool({
  name: "git_info",
  description: "Get git repository info from GitHub",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "Repository (owner/repo)" },
      action: { type: "string", enum: ["info", "commits", "contributors", "languages"], description: "Action" },
    },
    required: ["repo", "action"],
  },
  async execute(args) {
    const repo = args.repo as string;
    const action = args.action as string;
    const headers = { Accept: "application/vnd.github.v3+json", "User-Agent": "HuyyHere-Gateway/1.0" };
    try {
      if (action === "info") {
        const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const d = await res.json();
        return `${d.full_name}\n${d.description || "No description"}\n⭐ ${d.stargazers_count} | 🍴 ${d.forks_count} | Issues: ${d.open_issues_count}\nLanguage: ${d.language || "N/A"}\nLicense: ${d.license?.name || "N/A"}`;
      }
      if (action === "commits") {
        const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=5`, { headers });
        const d = await res.json();
        return (d || []).map((c: Record<string, unknown>) => {
          const commit = c.commit as Record<string, unknown>;
          const author = commit.author as Record<string, unknown>;
          return `${(c.sha as string)?.slice(0, 7)} — ${commit.message} (${author?.name})`;
        }).join("\n") || "No commits";
      }
      if (action === "contributors") {
        const res = await fetch(`https://api.github.com/repos/${repo}/contributors?per_page=10`, { headers });
        const d = await res.json();
        return (d || []).map((c: Record<string, unknown>) => `${c.login}: ${c.contributions} contributions`).join("\n") || "No contributors";
      }
      if (action === "languages") {
        const res = await fetch(`https://api.github.com/repos/${repo}/languages`, { headers });
        const d = await res.json();
        return Object.entries(d as Record<string, number>).map(([k, v]) => `${k}: ${(v / 1024).toFixed(1)}KB`).join("\n");
      }
    } catch {
      return "GitHub API request failed";
    }
    return "Invalid action";
  },
});

registerTool({
  name: "browser_scrape",
  description: "Scrape webpage content and extract text",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to scrape" },
    },
    required: ["url"],
  },
  async execute(args) {
    const url = args.url as string;
    if (isPrivateIP(url)) return "Error: scraping private/internal URLs is not allowed";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HuyyHere-Gateway/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return text.slice(0, 5000);
    } catch {
      return `Failed to scrape "${url}"`;
    }
  },
});

registerTool({
  name: "api_test",
  description: "Test API endpoint and return response",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "API URL" },
      method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method" },
      body: { type: "string", description: "Request body (JSON string)" },
      headers: { type: "string", description: "Headers (JSON string)" },
    },
    required: ["url", "method"],
  },
  async execute(args) {
    const url = args.url as string;
    if (isPrivateIP(url)) return "Error: testing private/internal URLs is not allowed";
    const method = args.method as string;
    try {
      const options: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      };
      if (args.body) options.body = args.body as string;
      if (args.headers) {
        const h = JSON.parse(args.headers as string);
        options.headers = { ...options.headers as Record<string, string>, ...h };
      }
      const res = await fetch(url, options);
      const text = await res.text();
      return `Status: ${res.status}\n${text.slice(0, 3000)}`;
    } catch (e) {
      return `API test failed: ${e instanceof Error ? e.message : "error"}`;
    }
  },
});

registerTool({
  name: "text_stats",
  description: "Count words, characters, lines, and estimate reading time",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to analyze" },
    },
    required: ["text"],
  },
  async execute(args) {
    const text = args.text as string;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, "").length;
    const lines = text.split("\n").length;
    const sentences = text.split(/[.!?]+/).filter(Boolean).length;
    const paragraphs = text.split(/\n\s*\n/).filter(Boolean).length;
    const readMin = Math.ceil(words / 200);
    return `Words: ${words}\nCharacters: ${chars} (no spaces: ${charsNoSpace})\nLines: ${lines}\nSentences: ${sentences}\nParagraphs: ${paragraphs}\nReading time: ~${readMin} min`;
  },
});

registerTool({
  name: "url_encode",
  description: "URL encode or decode a string",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to encode or decode" },
      action: { type: "string", enum: ["encode", "decode", "encode_component", "decode_component"], description: "encode/decode full URL or component" },
    },
    required: ["text", "action"],
  },
  async execute(args) {
    const text = args.text as string;
    const action = args.action as string;
    if (action === "encode") return encodeURI(text);
    if (action === "decode") return decodeURI(text);
    if (action === "encode_component") return encodeURIComponent(text);
    if (action === "decode_component") return decodeURIComponent(text);
    return "Invalid action";
  },
});

registerTool({
  name: "hmac_hash",
  description: "Generate HMAC hash with a secret key (SHA-256, SHA-512)",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to sign" },
      secret: { type: "string", description: "Secret key" },
      algorithm: { type: "string", enum: ["SHA-256", "SHA-512"], description: "Hash algorithm" },
    },
    required: ["text", "secret"],
  },
  async execute(args) {
    const text = args.text as string;
    const secret = args.secret as string;
    const algo = (args.algorithm as string) || "SHA-256";
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: algo }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },
});

registerTool({
  name: "timestamp_convert",
  description: "Convert between Unix timestamps and human-readable dates",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "Unix timestamp (seconds or ms) or date string (ISO 8601)" },
      timezone: { type: "string", description: "Timezone for output (default: UTC)" },
    },
    required: ["value"],
  },
  async execute(args) {
    const value = args.value as string;
    const tz = (args.timezone as string) || "UTC";
    const num = Number(value);
    if (!isNaN(num) && num > 0) {
      const ms = num > 1e12 ? num : num * 1000;
      const d = new Date(ms);
      return `ISO: ${d.toISOString()}\nUTC: ${d.toLocaleString("en-US", { timeZone: "UTC" })}\nLocal: ${d.toLocaleString("en-US", { timeZone: tz })}\nUnix (s): ${Math.floor(ms / 1000)}\nUnix (ms): ${ms}`;
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return `Invalid date/timestamp: "${value}"`;
    return `ISO: ${d.toISOString()}\nUnix (s): ${Math.floor(d.getTime() / 1000)}\nUnix (ms): ${d.getTime()}\nUTC: ${d.toLocaleString("en-US", { timeZone: "UTC" })}\nLocal: ${d.toLocaleString("en-US", { timeZone: tz })}`;
  },
});

registerTool({
  name: "csv_to_json",
  description: "Parse CSV text into JSON array",
  parameters: {
    type: "object",
    properties: {
      csv: { type: "string", description: "CSV text" },
      delimiter: { type: "string", description: "Delimiter (default: comma)" },
    },
    required: ["csv"],
  },
  async execute(args) {
    const csv = args.csv as string;
    const delim = (args.delimiter as string) || ",";
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return "Need at least a header row and one data row";
    const headers = lines[0].split(delim).map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(delim).map((v) => v.trim().replace(/^["']|["']$/g, ""));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = vals[i] || ""));
      return obj;
    });
    return JSON.stringify(rows, null, 2);
  },
});

registerTool({
  name: "random_string",
  description: "Generate random string, number, or UUID batch",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["alphanumeric", "numeric", "alpha", "hex", "uuid"], description: "Type of random string" },
      length: { type: "number", description: "Length of string (default: 16, not for uuid)" },
      count: { type: "number", description: "Number to generate (default: 1, max: 50)" },
    },
  },
  async execute(args) {
    const type = (args.type as string) || "alphanumeric";
    const length = Math.min(Math.max(Number(args.length) || 16, 1), 10000);
    const count = Math.min(Math.max(Number(args.count) || 1, 1), 50);
    const chars = {
      alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      numeric: "0123456789",
      alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      hex: "0123456789abcdef",
    } as Record<string, string>;
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      if (type === "uuid") { results.push(crypto.randomUUID()); continue; }
      const set = chars[type] || chars.alphanumeric;
      let s = "";
      const arr = new Uint32Array(length);
      crypto.getRandomValues(arr);
      for (let j = 0; j < length; j++) s += set[arr[j] % set.length];
      results.push(s);
    }
    return results.join("\n");
  },
});

registerTool({
  name: "text_extract",
  description: "Extract emails, phone numbers, URLs, IPs, or hashtags from text",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to extract from" },
      type: { type: "string", enum: ["emails", "phones", "urls", "ips", "hashtags", "all"], description: "What to extract" },
    },
    required: ["text", "type"],
  },
  async execute(args) {
    const text = args.text as string;
    const type = args.type as string;
    const patterns: Record<string, RegExp> = {
      emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      phones: /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
      urls: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g,
      ips: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      hashtags: /#[a-zA-Z_]\w*/g,
    };
    const extract = (key: string) => {
      const matches = text.match(patterns[key]);
      return matches ? [...new Set(matches)] : [];
    };
    if (type === "all") {
      const results: string[] = [];
      for (const key of Object.keys(patterns)) {
        const found = extract(key);
        if (found.length) results.push(`${key}: ${found.join(", ")}`);
      }
      return results.length ? results.join("\n") : "Nothing found";
    }
    const found = extract(type);
    return found.length ? `${found.length} found:\n${found.join("\n")}` : `No ${type} found`;
  },
});

registerTool({
  name: "password_generate",
  description: "Generate a secure random password",
  parameters: {
    type: "object",
    properties: {
      length: { type: "number", description: "Password length (default: 20, min: 4, max: 128)" },
      uppercase: { type: "boolean", description: "Include uppercase letters (default: true)" },
      lowercase: { type: "boolean", description: "Include lowercase letters (default: true)" },
      numbers: { type: "boolean", description: "Include numbers (default: true)" },
      symbols: { type: "boolean", description: "Include symbols (default: true)" },
      count: { type: "number", description: "Number of passwords (default: 1, max: 10)" },
    },
  },
  async execute(args) {
    const length = Math.min(Math.max(Number(args.length) || 20, 4), 128);
    const count = Math.min(Math.max(Number(args.count) || 1, 1), 10);
    let charset = "";
    if (args.uppercase !== false) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (args.lowercase !== false) charset += "abcdefghijklmnopqrstuvwxyz";
    if (args.numbers !== false) charset += "0123456789";
    if (args.symbols !== false) charset += "!@#$%^&*()_+-=[]{}|;:,.<>?";
    if (!charset) charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const passwords: string[] = [];
    for (let i = 0; i < count; i++) {
      const arr = new Uint32Array(length);
      crypto.getRandomValues(arr);
      passwords.push(Array.from(arr, (v) => charset[v % charset.length]).join(""));
    }
    return passwords.join("\n");
  },
});

registerTool({
  name: "ip_info",
  description: "Look up geolocation and ISP info for an IP address",
  parameters: {
    type: "object",
    properties: {
      ip: { type: "string", description: "IP address (leave empty for own IP)" },
    },
  },
  async execute(args) {
    const ip = (args.ip as string) || "";
    const url = ip ? `https://ipinfo.io/${ip}/json` : "https://ipinfo.io/json";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const d = await res.json();
      if (d.error) return `Error: ${d.error}`;
      return `IP: ${d.ip}\nCity: ${d.city}\nRegion: ${d.region}\nCountry: ${d.country}\nLocation: ${d.loc}\nOrg: ${d.org}\nTimezone: ${d.timezone}`;
    } catch {
      return "IP lookup failed";
    }
  },
});

registerTool({
  name: "dns_lookup",
  description: "DNS record lookup for a domain",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", description: "Domain name to look up" },
      type: { type: "string", enum: ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "ALL"], description: "DNS record type" },
    },
    required: ["domain"],
  },
  async execute(args) {
    const domain = args.domain as string;
    const type = (args.type as string) || "A";
    const types = type === "ALL" ? ["A", "AAAA", "MX", "TXT", "NS", "CNAME"] : [type];
    const results: string[] = [];
    for (const t of types) {
      try {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${t}`, { signal: AbortSignal.timeout(5000) });
        const d = await res.json();
        const answers = (d.Answer || []).map((a: Record<string, unknown>) => `  ${a.data}`);
        if (answers.length) results.push(`${t}:\n${answers.join("\n")}`);
      } catch {}
    }
    return results.length ? results.join("\n\n") : `No DNS records found for "${domain}"`;
  },
});

registerTool({
  name: "html_extract",
  description: "Extract text or attributes from HTML using simple selectors",
  parameters: {
    type: "object",
    properties: {
      html: { type: "string", description: "HTML content" },
      selector: { type: "string", description: "Tag name to extract (e.g., 'a', 'img', 'h1', 'p')" },
      attribute: { type: "string", description: "Attribute to extract (e.g., 'href', 'src', 'alt'). Empty for text content." },
      limit: { type: "number", description: "Max results (default: 20)" },
    },
    required: ["html", "selector"],
  },
  async execute(args) {
    const html = args.html as string;
    const tag = (args.selector as string).toLowerCase();
    const attr = args.attribute as string | undefined;
    const limit = Math.min(Number(args.limit) || 20, 100);
    const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    const openRegex = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
    const items: string[] = [];
    let match;
    if (attr) {
      while ((match = openRegex.exec(html)) && items.length < limit) {
        const tagContent = match[1];
        const attrMatch = tagContent.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i"));
        if (attrMatch) items.push(attrMatch[1]);
      }
    } else {
      while ((match = regex.exec(html)) && items.length < limit) {
        items.push(match[1].replace(/<[^>]+>/g, "").trim());
      }
    }
    return items.length ? `${items.length} found:\n${items.join("\n")}` : `No <${tag}> elements found`;
  },
});

registerTool({
  name: "diff_text",
  description: "Show line-by-line differences between two texts",
  parameters: {
    type: "object",
    properties: {
      text1: { type: "string", description: "Original text" },
      text2: { type: "string", description: "Modified text" },
    },
    required: ["text1", "text2"],
  },
  async execute(args) {
    const a = (args.text1 as string).split("\n");
    const b = (args.text2 as string).split("\n");
    const maxLen = Math.max(a.length, b.length);
    const diff: string[] = [];
    let adds = 0, removes = 0, unchanged = 0;
    for (let i = 0; i < maxLen; i++) {
      const lineA = a[i];
      const lineB = b[i];
      if (lineA === undefined) { diff.push(`+ ${lineB}`); adds++; }
      else if (lineB === undefined) { diff.push(`- ${lineA}`); removes++; }
      else if (lineA !== lineB) { diff.push(`- ${lineA}`); diff.push(`+ ${lineB}`); adds++; removes++; }
      else { diff.push(`  ${lineA}`); unchanged++; }
    }
    return `Changes: +${adds}/-${removes}/${unchanged} unchanged\n\n${diff.join("\n")}`;
  },
});

registerTool({
  name: "lorem",
  description: "Generate Lorem Ipsum placeholder text",
  parameters: {
    type: "object",
    properties: {
      paragraphs: { type: "number", description: "Number of paragraphs (default: 3, max: 20)" },
      words_per_paragraph: { type: "number", description: "Approx words per paragraph (default: 50)" },
    },
  },
  async execute(args) {
    const paragraphs = Math.min(Math.max(Number(args.paragraphs) || 3, 1), 20);
    const wpp = Math.min(Math.max(Number(args.words_per_paragraph) || 50, 10), 200);
    const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(" ");
    const result: string[] = [];
    for (let p = 0; p < paragraphs; p++) {
      const sentenceWords: string[] = [];
      let count = 0;
      while (count < wpp) {
        const len = 5 + Math.floor(Math.random() * 15);
        const sentence: string[] = [];
        for (let w = 0; w < len && count < wpp; w++) {
          sentence.push(words[Math.floor(Math.random() * words.length)]);
          count++;
        }
        sentence[0] = sentence[0][0].toUpperCase() + sentence[0].slice(1);
        sentenceWords.push(sentence.join(" ") + ".");
      }
      result.push(sentenceWords.join(" "));
    }
    return result.join("\n\n");
  },
});

registerTool({
  name: "jwt_decode",
  description: "Decode a JWT token (header and payload, no signature verification)",
  parameters: {
    type: "object",
    properties: {
      token: { type: "string", description: "JWT token string" },
    },
    required: ["token"],
  },
  async execute(args) {
    const token = args.token as string;
    try {
      const parts = token.split(".");
      if (parts.length < 2) return "Invalid JWT: needs at least 2 parts";
      const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      const result: string[] = [`Header: ${JSON.stringify(header, null, 2)}`, `Payload: ${JSON.stringify(payload, null, 2)}`];
      if (payload.exp) result.push(`Expires: ${new Date(payload.exp * 1000).toISOString()}`);
      if (payload.iat) result.push(`Issued: ${new Date(payload.iat * 1000).toISOString()}`);
      if (payload.nbf) result.push(`Not before: ${new Date(payload.nbf * 1000).toISOString()}`);
      return result.join("\n");
    } catch {
      return "Failed to decode JWT token";
    }
  },
});

registerTool({
  name: "cron_parse",
  description: "Parse a cron expression into human-readable format",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Cron expression (e.g., '0 9 * * 1-5')" },
    },
    required: ["expression"],
  },
  async execute(args) {
    const expr = (args.expression as string).trim();
    const parts = expr.split(/\s+/);
    if (parts.length < 5) return "Invalid cron: needs at least 5 fields (min hour dom month dow)";
    const [min, hour, dom, month, dow] = parts;
    const desc: string[] = [];
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    if (min !== "*" && hour !== "*") desc.push(`At ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`);
    else if (min !== "*") desc.push(`At minute ${min}`);
    else if (hour !== "*") desc.push(`At hour ${hour}`);
    if (dom !== "*") desc.push(`on day ${dom} of the month`);
    if (month !== "*") desc.push(`in ${monthNames[+month] || month}`);
    if (dow !== "*") {
      if (dow.includes("-")) {
        const [a, b] = dow.split("-");
        desc.push(`from ${dayNames[+a] || a} to ${dayNames[+b] || b}`);
      } else {
        desc.push(`on ${dayNames[+dow] || dow}`);
      }
    }
    return desc.length ? desc.join(" ") : "Runs continuously";
  },
});

registerTool({
  name: "text_find_replace",
  description: "Find and replace text with optional regex support",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Source text" },
      find: { type: "string", description: "Text or regex pattern to find" },
      replace: { type: "string", description: "Replacement text (use $1, $2 for regex groups)" },
      regex: { type: "boolean", description: "Use regex mode (default: false)" },
      case_insensitive: { type: "boolean", description: "Case insensitive (default: false)" },
    },
    required: ["text", "find", "replace"],
  },
  async execute(args) {
    const text = args.text as string;
    const find = args.find as string;
    const replace = args.replace as string;
    if (args.regex) {
      const flags = args.case_insensitive ? "gi" : "g";
      const regex = new RegExp(find, flags);
      const result = text.replace(regex, replace);
      const count = (text.match(regex) || []).length;
      return `Replaced ${count} occurrence(s):\n${result}`;
    }
    const flags = args.case_insensitive ? "gi" : "g";
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, flags);
    const result = text.replace(regex, replace);
    const count = (text.match(regex) || []).length;
    return `Replaced ${count} occurrence(s):\n${result}`;
  },
});

registerTool({
  name: "qr_code",
  description: "Generate a QR code as SVG string from text",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text or URL to encode" },
      size: { type: "number", description: "Size in pixels (default: 200)" },
    },
    required: ["text"],
  },
  async execute(args) {
    const text = args.text as string;
    const size = Math.min(Math.max(Number(args.size) || 200, 50), 1000);
    try {
      const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=svg`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return "QR code generation failed";
      const svg = await res.text();
      return svg;
    } catch {
      return "QR code API unreachable";
    }
  },
});

registerTool({
  name: "checksum",
  description: "Compute MD5/SHA checksum of content from a URL",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch and checksum" },
      algorithm: { type: "string", enum: ["SHA-1", "SHA-256", "SHA-384", "SHA-512"], description: "Hash algorithm (default: SHA-256)" },
    },
    required: ["url"],
  },
  async execute(args) {
    const url = args.url as string;
    if (isPrivateIP(url)) return "Error: checksum of private/internal URLs is not allowed";
    const algo = (args.algorithm as string) || "SHA-256";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const buffer = await res.arrayBuffer();
      const hash = await crypto.subtle.digest(algo, buffer);
      const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return `Algorithm: ${algo}\nSize: ${buffer.byteLength} bytes\nHash: ${hex}`;
    } catch {
      return `Failed to checksum "${url}"`;
    }
  },
});

registerTool({
  name: "image_info",
  description: "Get image metadata (dimensions, format) from a URL",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Image URL" },
    },
    required: ["url"],
  },
  async execute(args) {
    const url = args.url as string;
    if (isPrivateIP(url)) return "Error: fetching private/internal image URLs is not allowed";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const contentType = res.headers.get("content-type") || "";
      const contentLength = res.headers.get("content-length") || "unknown";
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let format = "unknown";
      let width = 0, height = 0;
      if (bytes[0] === 0x89 && bytes[1] === 0x50) {
        format = "PNG";
        if (bytes.length > 24) {
          width = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]);
          height = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]);
        }
      } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
        format = "JPEG";
        let i = 2;
        while (i < bytes.length - 1) {
          if (bytes[i] === 0xFF) {
            const marker = bytes[i + 1];
            if ((marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
              height = (bytes[i + 5] << 8) | bytes[i + 6];
              width = (bytes[i + 7] << 8) | bytes[i + 8];
              break;
            }
            const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
            i += 2 + segLen;
          } else { i++; }
        }
      } else if (bytes[0] === 0x47 && bytes[1] === 0x49) {
        format = "GIF";
        if (bytes.length > 6) { width = bytes[6] | (bytes[7] << 8); height = bytes[8] | (bytes[9] << 8); }
      } else if (bytes[0] === 0x52 && bytes[1] === 0x49) {
        format = "WEBP";
      }
      const sizeKB = (buffer.byteLength / 1024).toFixed(1);
      const lines = [`Format: ${format}`, `Content-Type: ${contentType}`, `Size: ${sizeKB} KB`];
      if (width && height) lines.push(`Dimensions: ${width}x${height}`);
      return lines.join("\n");
    } catch {
      return `Failed to get image info from "${url}"`;
    }
  },
});

registerTool({
  name: "timezone_convert",
  description: "Convert a time between timezones",
  parameters: {
    type: "object",
    properties: {
      time: { type: "string", description: "Time string (e.g., '14:30' or ISO date)" },
      from: { type: "string", description: "Source timezone (e.g., 'America/New_York')" },
      to: { type: "string", description: "Target timezone (e.g., 'Asia/Tokyo')" },
    },
    required: ["time", "from", "to"],
  },
  async execute(args) {
    const time = args.time as string;
    const from = args.from as string;
    const to = args.to as string;
    try {
      let date: Date;
      if (time.includes("T") || time.includes("-")) {
        date = new Date(time);
      } else {
        const now = new Date();
        const [h, m] = time.split(":").map(Number);
        const fromOffset = new Date(now.toLocaleString("en-US", { timeZone: from })).getTime() - now.getTime();
        const utcDate = new Date(now.getTime() + fromOffset);
        utcDate.setUTCHours(h, m, 0, 0);
        date = new Date(utcDate.getTime() - fromOffset);
      }
      const fromTime = date.toLocaleString("en-US", { timeZone: from, dateStyle: "full", timeStyle: "long" });
      const toTime = date.toLocaleString("en-US", { timeZone: to, dateStyle: "full", timeStyle: "long" });
      return `From (${from}):\n${fromTime}\n\nTo (${to}):\n${toTime}`;
    } catch {
      return `Failed to convert time. Use IANA timezone names like "America/New_York", "Asia/Tokyo", "Europe/London"`;
    }
  },
});

registerTool({
  name: "number_convert",
  description: "Convert numbers between bases (decimal, binary, octal, hex)",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "Number string" },
      from: { type: "string", enum: ["decimal", "binary", "octal", "hex"], description: "Source base" },
      to: { type: "string", enum: ["decimal", "binary", "octal", "hex"], description: "Target base" },
    },
    required: ["value", "from", "to"],
  },
  async execute(args) {
    const value = args.value as string;
    const from = args.from as string;
    const to = args.to as string;
    const bases: Record<string, number> = { decimal: 10, binary: 2, octal: 8, hex: 16 };
    const prefixes: Record<string, string> = { binary: "0b", octal: "0o", hex: "0x" };
    try {
      const clean = value.replace(/^(0x|0o|0b)/i, "").trim();
      const num = parseInt(clean, bases[from]);
      if (isNaN(num)) return `Invalid ${from} number: "${value}"`;
      let result: string;
      if (to === "decimal") result = num.toString(10);
      else result = prefixes[to] + num.toString(bases[to]);
      return `Decimal: ${num.toString(10)}\nBinary: ${num.toString(2)}\nOctal: ${num.toString(8)}\nHex: 0x${num.toString(16).toUpperCase()}\n\nResult (${to}): ${result}`;
    } catch {
      return `Conversion failed for "${value}"`;
    }
  },
});

registerTool({
  name: "duration_format",
  description: "Convert milliseconds to human-readable duration or vice versa",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "Duration as ms number or human string (e.g., '2h 30m 15s')" },
      action: { type: "string", enum: ["parse", "format"], description: "parse = string to ms, format = ms to string" },
    },
    required: ["value", "action"],
  },
  async execute(args) {
    const value = args.value as string;
    const action = args.action as string;
    if (action === "format") {
      const ms = Number(value);
      if (isNaN(ms)) return `Invalid number: "${value}"`;
      const abs = Math.abs(ms);
      const days = Math.floor(abs / 86400000);
      const hours = Math.floor((abs % 86400000) / 3600000);
      const mins = Math.floor((abs % 3600000) / 60000);
      const secs = Math.floor((abs % 60000) / 1000);
      const remainMs = abs % 1000;
      const parts: string[] = [];
      if (days) parts.push(`${days}d`);
      if (hours) parts.push(`${hours}h`);
      if (mins) parts.push(`${mins}m`);
      if (secs) parts.push(`${secs}s`);
      if (remainMs) parts.push(`${remainMs}ms`);
      return `${ms < 0 ? "-" : ""}${parts.join(" ") || "0ms"}\n(${abs.toLocaleString()} ms)`;
    }
    if (action === "parse") {
      const m = value.match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?\s*(?:(\d+)\s*ms)?/);
      if (!m) return `Cannot parse: "${value}"`;
      const total = (parseInt(m[1] || "0") * 86400000) + (parseInt(m[2] || "0") * 3600000) + (parseInt(m[3] || "0") * 60000) + (parseFloat(m[4] || "0") * 1000) + parseInt(m[5] || "0");
      return `${total} ms\n${total / 1000} seconds\n${total / 60000} minutes\n${total / 3600000} hours`;
    }
    return "Invalid action";
  },
});

registerTool({
  name: "json_query",
  description: "Extract values from JSON using dot notation (e.g., 'users.0.name')",
  parameters: {
    type: "object",
    properties: {
      json: { type: "string", description: "JSON string" },
      path: { type: "string", description: "Dot-notation path (e.g., 'data.items.0.title')" },
    },
    required: ["json", "path"],
  },
  async execute(args) {
    const json = args.json as string;
    const path = args.path as string;
    try {
      const data = JSON.parse(json);
      const keys = path.split(".").filter(Boolean);
      let current: unknown = data;
      for (const key of keys) {
        if (current === null || current === undefined) return `Path not found at "${key}"`;
        if (Array.isArray(current)) {
          const idx = parseInt(key);
          current = isNaN(idx) ? undefined : current[idx];
        } else {
          current = (current as Record<string, unknown>)[key];
        }
      }
      if (current === undefined) return `Path "${path}" not found`;
      return typeof current === "object" ? JSON.stringify(current, null, 2) : String(current);
    } catch {
      return `Invalid JSON or path`;
    }
  },
});

registerTool({
  name: "text_chunk",
  description: "Split text into chunks by size, word count, or sentence count",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to split" },
      chunk_size: { type: "number", description: "Chunk size (default: 500)" },
      by: { type: "string", enum: ["chars", "words", "sentences", "lines"], description: "Split by (default: chars)" },
    },
    required: ["text"],
  },
  async execute(args) {
    const text = args.text as string;
    const size = Math.max(Number(args.chunk_size) || 500, 1);
    const by = (args.by as string) || "chars";
    let items: string[];
    if (by === "words") items = text.split(/(\s+)/);
    else if (by === "sentences") items = text.split(/(?<=[.!?])\s+/);
    else if (by === "lines") items = text.split("\n");
    else items = text.split("");
    const chunks: string[] = [];
    let current = "";
    let count = 0;
    for (const item of items) {
      if (count >= size) { chunks.push(current.trim()); current = ""; count = 0; }
      current += item;
      count += by === "chars" ? 1 : item.trim().split(/\s+/).length;
    }
    if (current.trim()) chunks.push(current.trim());
    return `${chunks.length} chunks:\n\n${chunks.map((c, i) => `[Chunk ${i + 1}]: ${c}`).join("\n\n")}`;
  },
});

registerTool({
  name: "word_frequency",
  description: "Count word occurrences in text, sorted by frequency",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to analyze" },
      top: { type: "number", description: "Number of top words to show (default: 20)" },
    },
    required: ["text"],
  },
  async execute(args) {
    const text = (args.text as string).toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    const freq = new Map<string, number>();
    for (const w of text) freq.set(w, (freq.get(w) || 0) + 1);
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(Number(args.top) || 20, 100));
    const maxWord = Math.max(...sorted.map(([w]) => w.length));
    return sorted.map(([word, count]) => `${word.padEnd(maxWord + 2)} ${"█".repeat(Math.min(count, 30))} ${count}`).join("\n") || "No words found";
  },
});

registerTool({
  name: "slug_generate",
  description: "Generate URL slug from text",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to slugify" },
      separator: { type: "string", description: "Separator character (default: -)" },
    },
    required: ["text"],
  },
  async execute(args) {
    const text = args.text as string;
    const sep = (args.separator as string) || "-";
    const slug = text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .trim().replace(/\s+/g, sep)
      .replace(new RegExp(`${sep}+`, "g"), sep);
    return slug;
  },
});

registerTool({
  name: "html_to_text",
  description: "Convert HTML to clean readable text",
  parameters: {
    type: "object",
    properties: {
      html: { type: "string", description: "HTML content" },
      keep_links: { type: "boolean", description: "Keep link URLs (default: false)" },
    },
    required: ["html"],
  },
  async execute(args) {
    const html = args.html as string;
    let text = html;
    if (!args.keep_links) {
      text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2");
    } else {
      text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 [$1]");
    }
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text.slice(0, 10000);
  },
});

registerTool({
  name: "css_minify",
  description: "Minify or beautify CSS",
  parameters: {
    type: "object",
    properties: {
      css: { type: "string", description: "CSS content" },
      action: { type: "string", enum: ["minify", "beautify"], description: "Action" },
    },
    required: ["css", "action"],
  },
  async execute(args) {
    const css = args.css as string;
    const action = args.action as string;
    if (action === "minify") {
      return css.replace(/\s+/g, " ").replace(/\s*([{}:;,])\s*/g, "$1").replace(/;}/g, "}").trim();
    }
    if (action === "beautify") {
      let indent = 0;
      return css
        .replace(/\{/g, " {\n" + "  ".repeat(++indent))
        .replace(/\}/g, "\n" + "  ".repeat(--indent) + "}\n")
        .replace(/;/g, ";\n" + "  ".repeat(indent))
        .replace(/\n\s*\n/g, "\n")
        .trim();
    }
    return "Invalid action";
  },
});

registerTool({
  name: "json_to_csv",
  description: "Convert JSON array to CSV format",
  parameters: {
    type: "object",
    properties: {
      json: { type: "string", description: "JSON array string" },
      delimiter: { type: "string", description: "Column delimiter (default: comma)" },
    },
    required: ["json"],
  },
  async execute(args) {
    const json = args.json as string;
    const delim = (args.delimiter as string) || ",";
    try {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr) || arr.length === 0) return "Empty or non-array JSON";
      const headers = [...new Set(arr.flatMap((o) => Object.keys(o)))];
      const csv = [
        headers.join(delim),
        ...arr.map((row) =>
          headers.map((h) => {
            const val = row[h] ?? "";
            const str = typeof val === "object" ? JSON.stringify(val) : String(val);
            return str.includes(delim) || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          }).join(delim)
        ),
      ];
      return csv.join("\n");
    } catch {
      return "Invalid JSON array";
    }
  },
});

registerTool({
  name: "text_truncate",
  description: "Truncate text to a length with ellipsis and optional suffix",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to truncate" },
      max_length: { type: "number", description: "Max length (default: 100)" },
      ellipsis: { type: "string", description: "Ellipsis string (default: ...)" },
      word_boundary: { type: "boolean", description: "Break at word boundary (default: true)" },
    },
    required: ["text", "max_length"],
  },
  async execute(args) {
    const text = args.text as string;
    const max = Math.max(Number(args.max_length) || 100, 1);
    const ellipsis = (args.ellipsis as string) ?? "...";
    const wordBoundary = args.word_boundary !== false;
    if (text.length <= max) return text;
    let truncated = text.slice(0, max - ellipsis.length);
    if (wordBoundary && truncated !== text) {
      const lastSpace = truncated.lastIndexOf(" ");
      if (lastSpace > max * 0.6) truncated = truncated.slice(0, lastSpace);
    }
    return truncated + ellipsis;
  },
});

registerTool({
  name: "markdown_table",
  description: "Generate a Markdown table from a JSON array of objects",
  parameters: {
    type: "object",
    properties: {
      data: { type: "string", description: "JSON array of objects" },
      columns: { type: "string", description: "Comma-separated column names (auto-detect if empty)" },
    },
    required: ["data"],
  },
  async execute(args) {
    const data = args.data as string;
    try {
      const arr = JSON.parse(data);
      if (!Array.isArray(arr) || arr.length === 0) return "Empty or non-array JSON";
      const cols = args.columns
        ? (args.columns as string).split(",").map((c) => c.trim())
        : [...new Set(arr.flatMap((o) => Object.keys(o)))];
      const widths = cols.map((c) => Math.max(c.length, ...arr.map((r) => String(r[c] ?? "").length)));
      const header = cols.map((c, i) => c.padEnd(widths[i])).join(" | ");
      const sep = cols.map((_, i) => "-".repeat(widths[i])).join(" | ");
      const rows = arr.map((row) => cols.map((c, i) => String(row[c] ?? "").padEnd(widths[i])).join(" | "));
      return [header, sep, ...rows].join("\n");
    } catch {
      return "Invalid JSON";
    }
  },
});

registerTool({
  name: "color_palette",
  description: "Generate a color palette from a base hex color (complementary, analogous, triadic)",
  parameters: {
    type: "object",
    properties: {
      color: { type: "string", description: "Base hex color (e.g., '#3498db')" },
      scheme: { type: "string", enum: ["complementary", "analogous", "triadic", "split", "monochromatic"], description: "Color scheme" },
      count: { type: "number", description: "Number of colors (default: 5)" },
    },
    required: ["color", "scheme"],
  },
  async execute(args) {
    const hex = (args.color as string).replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    const hslToHex = (hh: number, ss: number, ll: number) => {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
      const p = 2 * ll - q;
      const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
      return `#${toHex(hue2rgb(p, q, hh + 1/3))}${toHex(hue2rgb(p, q, hh))}${toHex(hue2rgb(p, q, hh - 1/3))}`;
    };
    const scheme = args.scheme as string;
    const count = Math.min(Math.max(Number(args.count) || 5, 2), 12);
    const colors: string[] = [];
    if (scheme === "complementary") {
      for (let i = 0; i < count; i++) colors.push(hslToHex((h + 0.5 * i / count) % 1, s, l));
    } else if (scheme === "analogous") {
      const step = 30 / 360;
      for (let i = 0; i < count; i++) colors.push(hslToHex((h + step * (i - Math.floor(count/2))) % 1, s, l));
    } else if (scheme === "triadic") {
      for (let i = 0; i < count; i++) colors.push(hslToHex((h + (i * 120 / count) / 360) % 1, s, l));
    } else if (scheme === "split") {
      for (let i = 0; i < count; i++) colors.push(hslToHex((h + (i * 150 / count) / 360) % 1, s, l));
    } else {
      for (let i = 0; i < count; i++) colors.push(hslToHex(h, s, Math.max(0.1, Math.min(0.9, l + (i - count/2) * 0.1))));
    }
    return colors.join("\n");
  },
});

registerTool({
  name: "fibonacci",
  description: "Generate Fibonacci sequence up to N terms",
  parameters: {
    type: "object",
    properties: {
      n: { type: "number", description: "Number of terms (default: 20, max: 100)" },
    },
  },
  async execute(args) {
    const n = Math.min(Math.max(Number(args.n) || 20, 1), 100);
    const fib: bigint[] = [BigInt(0), BigInt(1)];
    for (let i = 2; i < n; i++) fib.push(fib[i - 1] + fib[i - 2]);
    const result = fib.slice(0, n);
    return result.map((v, i) => `F(${i}) = ${v}`).join("\n");
  },
});

registerTool({
  name: "primes",
  description: "Generate prime numbers up to N or first N primes",
  parameters: {
    type: "object",
    properties: {
      n: { type: "number", description: "Upper limit or count (default: 50)" },
      mode: { type: "string", enum: ["up_to", "count"], description: "up_to = primes ≤ N, count = first N primes (default: up_to)" },
    },
  },
  async execute(args) {
    const n = Math.min(Math.max(Number(args.n) || 50, 2), 10000);
    const mode = (args.mode as string) || "up_to";
    const primes: number[] = [];
    if (mode === "count") {
      let num = 2;
      while (primes.length < n) {
        if (primes.every((p) => num % p !== 0)) primes.push(num);
        num++;
      }
    } else {
      const sieve = new Uint8Array(n + 1);
      for (let i = 2; i <= n; i++) {
        if (!sieve[i]) { primes.push(i); for (let j = i * i; j <= n; j += i) sieve[j] = 1; }
      }
    }
    return `${primes.length} primes:\n${primes.join(", ")}`;
  },
});

registerTool({
  name: "isbn_validate",
  description: "Validate ISBN-10 or ISBN-13 and extract info",
  parameters: {
    type: "object",
    properties: {
      isbn: { type: "string", description: "ISBN number (with or without hyphens)" },
    },
    required: ["isbn"],
  },
  async execute(args) {
    const isbn = (args.isbn as string).replace(/[-\s]/g, "");
    if (/^\d{10}$/.test(isbn)) {
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += parseInt(isbn[i]) * (10 - i);
      const check = isbn[9] === "X" ? 10 : parseInt(isbn[9]);
      sum += check;
      return `ISBN-10: ${isbn}\nValid: ${sum % 11 === 0 ? "Yes" : "No"}\nCheck digit: ${isbn[9]}`;
    }
    if (/^\d{13}$/.test(isbn)) {
      let sum = 0;
      for (let i = 0; i < 13; i++) sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
      return `ISBN-13: ${isbn}\nValid: ${sum % 10 === 0 ? "Yes" : "No"}\nPrefix: ${isbn.slice(0, 3)}\nGroup: ${isbn.slice(3, 4)}\nPublisher: ${isbn.slice(4, 7)}\nTitle: ${isbn.slice(7, 12)}\nCheck: ${isbn[12]}`;
    }
    return `Invalid ISBN: must be 10 or 13 digits`;
  },
});

registerTool({
  name: "mac_lookup",
  description: "Look up MAC address vendor/manufacturer",
  parameters: {
    type: "object",
    properties: {
      mac: { type: "string", description: "MAC address (e.g., '00:1A:2B:3C:4D:5E')" },
    },
    required: ["mac"],
  },
  async execute(args) {
    const mac = (args.mac as string).replace(/[-:.]/g, "").toUpperCase().slice(0, 6);
    if (!/^[0-9A-F]{6}$/.test(mac)) return "Invalid MAC address format";
    try {
      const res = await fetch(`https://api.macvendors.com/${mac}`, { signal: AbortSignal.timeout(5000) });
      const vendor = await res.text();
      return `MAC: ${args.mac}\nOUI: ${mac}\nVendor: ${vendor}`;
    } catch {
      return `Could not look up MAC "${args.mac}"`;
    }
  },
});

registerTool({
  name: "mime_detect",
  description: "Detect MIME type from file extension or URL",
  parameters: {
    type: "object",
    properties: {
      filename: { type: "string", description: "File name, extension, or URL" },
    },
    required: ["filename"],
  },
  async execute(args) {
    const name = args.filename as string;
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const mimes: Record<string, string> = {
      html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript",
      json: "application/json", xml: "application/xml", yaml: "text/yaml", yml: "text/yaml",
      txt: "text/plain", csv: "text/csv", md: "text/markdown",
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp",
      pdf: "application/pdf", zip: "application/zip", tar: "application/x-tar",
      gz: "application/gzip", rar: "application/vnd.rar",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
      mp4: "video/mp4", webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska",
      doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
      tsv: "text/tab-separated-values",
      sql: "application/sql", sh: "application/x-sh",
    };
    const mime = mimes[ext] || "application/octet-stream";
    return `File: ${name}\nExtension: .${ext}\nMIME: ${mime}`;
  },
});

registerTool({
  name: "text_similarity",
  description: "Compare two texts and compute similarity score",
  parameters: {
    type: "object",
    properties: {
      text1: { type: "string", description: "First text" },
      text2: { type: "string", description: "Second text" },
      method: { type: "string", enum: ["jaccard", "cosine", "levenshtein"], description: "Similarity method" },
    },
    required: ["text1", "text2"],
  },
  async execute(args) {
    const a = (args.text1 as string).toLowerCase();
    const b = (args.text2 as string).toLowerCase();
    const method = (args.method as string) || "jaccard";
    const tokenize = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
    if (method === "jaccard") {
      const sa = tokenize(a), sb = tokenize(b);
      const inter = new Set([...sa].filter((x) => sb.has(x)));
      const union = new Set([...sa, ...sb]);
      const jaccard = union.size > 0 ? inter.size / union.size : 0;
      return `Jaccard similarity: ${(jaccard * 100).toFixed(1)}%\nCommon words: ${inter.size}/${union.size}`;
    }
    if (method === "cosine") {
      const freq = (s: string) => { const m = new Map<string, number>(); for (const w of s.split(/\s+/)) m.set(w, (m.get(w) || 0) + 1); return m; };
      const fa = freq(a), fb = freq(b);
      const allWords = new Set([...fa.keys(), ...fb.keys()]);
      let dot = 0, magA = 0, magB = 0;
      for (const w of allWords) { const va = fa.get(w) || 0; const vb = fb.get(w) || 0; dot += va * vb; magA += va * va; magB += vb * vb; }
      const cos = (magA && magB) ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
      return `Cosine similarity: ${(cos * 100).toFixed(1)}%\nCommon unique words: ${allWords.size}`;
    }
    if (method === "levenshtein") {
      const lenA = a.length, lenB = b.length;
      const dp: number[][] = Array.from({ length: lenA + 1 }, () => Array(lenB + 1).fill(0));
      for (let i = 0; i <= lenA; i++) dp[i][0] = i;
      for (let j = 0; j <= lenB; j++) dp[0][j] = j;
      for (let i = 1; i <= lenA; i++)
        for (let j = 1; j <= lenB; j++)
          dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0));
      const dist = dp[lenA][lenB];
      const maxLen = Math.max(lenA, lenB);
      const sim = maxLen > 0 ? ((maxLen - dist) / maxLen * 100).toFixed(1) : "100.0";
      return `Levenshtein distance: ${dist}\nSimilarity: ${sim}%\nMax length: ${maxLen}`;
    }
    return "Invalid method";
  },
});

registerTool({
  name: "punycode",
  description: "Convert internationalized domain names to/from punycode (ACE)",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", description: "Domain name (Unicode or punycode)" },
      action: { type: "string", enum: ["to_punycode", "from_punycode"], description: "Conversion direction" },
    },
    required: ["domain", "action"],
  },
  async execute(args) {
    const domain = args.domain as string;
    const action = args.action as string;
    if (action === "to_punycode") {
      try {
        const result = new URL(`https://${domain}`).hostname;
        return `Original: ${domain}\nPunycode: ${result}\nSame: ${domain === result ? "No conversion needed" : "Converted"}`;
      } catch {
        return `Domain: ${domain}\nPunycode: ${domain} (already ASCII or invalid)`;
      }
    }
    if (action === "from_punycode") {
      try {
        const url = new URL(`https://${domain}`);
        return `Punycode: ${domain}\nUnicode: ${url.hostname}`;
      } catch {
        return `Invalid punycode domain: "${domain}"`;
      }
    }
    return "Invalid action";
  },
});

registerTool({
  name: "http_headers",
  description: "Parse raw HTTP headers string into structured format",
  parameters: {
    type: "object",
    properties: {
      headers: { type: "string", description: "Raw HTTP headers text" },
    },
    required: ["headers"],
  },
  async execute(args) {
    const raw = args.headers as string;
    const lines = raw.split("\n").filter(Boolean);
    const parsed: Record<string, string> = {};
    const entries: string[] = [];
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      parsed[key] = val;
      entries.push(`${key}: ${val}`);
    }
    return `Parsed ${entries.length} header(s):\n\n${entries.join("\n")}\n\nJSON:\n${JSON.stringify(parsed, null, 2)}`;
  },
});

registerTool({
  name: "ipv4_calc",
  description: "Calculate IPv4 network info (CIDR, broadcast, hosts, subnets)",
  parameters: {
    type: "object",
    properties: {
      cidr: { type: "string", description: "CIDR notation (e.g., '192.168.1.0/24')" },
      action: { type: "string", enum: ["info", "subnets"], description: "info = network details, subnets = split into smaller subnets" },
      new_prefix: { type: "number", description: "For subnets: new prefix length (e.g., 26 to split /24 into 4x /26)" },
    },
    required: ["cidr", "action"],
  },
  async execute(args) {
    const cidr = args.cidr as string;
    const action = args.action as string;
    const match = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
    if (!match) return "Invalid CIDR format. Use e.g., 192.168.1.0/24";
    const [_, ipStr, prefixStr] = match;
    const prefix = parseInt(prefixStr);
    const ip = ipStr.split(".").map(Number);
    const ipNum = (ip[0] << 24 | ip[1] << 16 | ip[2] << 8 | ip[3]) >>> 0;
    const mask = (~0 << (32 - prefix)) >>> 0;
    const network = (ipNum & mask) >>> 0;
    const broadcast = (network | ~mask) >>> 0;
    const hosts = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.pow(2, 32 - prefix) - 2;
    const toDotted = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    if (action === "info") {
      return `Network: ${toDotted(network)}/${prefix}\nBroadcast: ${toDotted(broadcast)}\nMask: ${toDotted(mask)}\nUsable hosts: ${hosts}\nRange: ${toDotted(network + 1)} - ${toDotted(broadcast - 1)}`;
    }
    if (action === "subnets") {
      const newPrefix = Number(args.new_prefix) || prefix + 2;
      if (newPrefix <= prefix || newPrefix > 30) return `New prefix must be between ${prefix + 1} and 30`;
      const subnets = Math.pow(2, newPrefix - prefix);
      const results: string[] = [];
      for (let i = 0; i < Math.min(subnets, 16); i++) {
        const subNet = (network + i * Math.pow(2, 32 - newPrefix)) >>> 0;
        const subBroadcast = (subNet | ~((~0 << (32 - newPrefix)) >>> 0)) >>> 0;
        results.push(`${toDotted(subNet)}/${newPrefix}  (${toDotted(subNet + 1)} - ${toDotted(subBroadcast - 1)})`);
      }
      return `${subnets} subnets:\n${results.join("\n")}`;
    }
    return "Invalid action";
  },
});

registerTool({
  name: "text_wrap",
  description: "Word-wrap text to a given width, or indent/pad text",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to wrap" },
      width: { type: "number", description: "Column width (default: 80)" },
      indent: { type: "string", description: "Indent string (default: none)" },
      pad_char: { type: "string", description: "Pad character for padding (e.g., ' ' or '.')" },
    },
    required: ["text"],
  },
  async execute(args) {
    const text = args.text as string;
    const width = Math.max(Number(args.width) || 80, 10);
    const indent = (args.indent as string) || "";
    const padChar = args.pad_char as string | undefined;
    if (padChar) {
      return text.split("\n").map((line) => line.padEnd(width, padChar)).join("\n");
    }
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > width && current) {
        lines.push(indent + current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(indent + current);
    return lines.join("\n");
  },
});
