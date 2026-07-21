// Chạy: node scripts/test-providers.mjs
// Yêu cầu Node 18+. Đọc .env ở thư mục gốc project.
// Test 2 lớp: (1) gọi THẲNG từng provider, (2) gọi qua gateway local (nếu đang `npm run dev`).

import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env");
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

function keyPool(prefix) {
  const keys = [];
  let i = 1;
  while (env[`${prefix}_API_KEY_${i}`]) keys.push(env[`${prefix}_API_KEY_${i}`]), i++;
  if (env[`${prefix}_API_KEY`]) keys.push(env[`${prefix}_API_KEY`]);
  return keys;
}

async function testDirect(name, baseUrl, apiKey, model) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const ms = Date.now() - start;
    const text = await res.text();
    let snippet = text.slice(0, 300);
    if (res.ok) {
      console.log(`✅ [${name}] ${model} — ${res.status} (${ms}ms)`);
    } else {
      console.log(`❌ [${name}] ${model} — HTTP ${res.status} (${ms}ms)`);
      console.log(`   body: ${snippet}`);
    }
  } catch (e) {
    console.log(`💥 [${name}] ${model} — network error: ${e.message}`);
  }
}

async function testGateway(baseUrl, gatewayKey, model) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gatewayKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const ms = Date.now() - start;
    const text = await res.text();
    if (res.ok) {
      console.log(`✅ [gateway] ${model} — ${res.status} (${ms}ms)`);
    } else {
      console.log(`❌ [gateway] ${model} — HTTP ${res.status} (${ms}ms)`);
      console.log(`   body: ${text.slice(0, 300)}`);
    }
  } catch (e) {
    console.log(`💥 [gateway] ${model} — network error: ${e.message}`);
  }
}

async function listModels(name, baseUrl, apiKey, filter) {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.log(`   (không lấy được /models list từ ${name}: HTTP ${res.status})`);
      return;
    }
    const data = await res.json();
    const ids = (data.data || []).map((m) => m.id);
    const matched = filter ? ids.filter((id) => id.toLowerCase().includes(filter)) : ids;
    console.log(`   Model catalog thật của ${name} (khớp "${filter || "*"}"):`, matched.slice(0, 30));
  } catch (e) {
    console.log(`   (lỗi khi lấy /models từ ${name}: ${e.message})`);
  }
}

async function main() {
  console.log("=== 1. Test THẲNG từng provider (bỏ qua gateway) ===\n");

  const blackcatKeys = keyPool("BLACKCAT");
  if (blackcatKeys[0]) await testDirect("BlackCat", env.BLACKCAT_BASE_URL, blackcatKeys[0], env.BLACKCAT_MODEL);

  const zlkKeys = keyPool("ZLKPRO");
  if (zlkKeys[0]) {
    // Test cả có prefix và không, để xác nhận model slug đúng
    for (const m of ["kimi-k2.7-code", "minimax-m3", "kimi-k2.6", "deepseek-v4-pro"]) {
      await testDirect("ZLKPro", env.ZLKPRO_BASE_URL, zlkKeys[0], m);
    }
    console.log("\n   Đang lấy danh sách model thật từ ZLKPro (đối chiếu slug đúng)...");
    await listModels("ZLKPro", env.ZLKPRO_BASE_URL, zlkKeys[0], "kimi");
    await listModels("ZLKPro", env.ZLKPRO_BASE_URL, zlkKeys[0], "minimax");
    await listModels("ZLKPro", env.ZLKPRO_BASE_URL, zlkKeys[0], "deepseek");
  }

  const venusesKeys = keyPool("VENESES");
  if (venusesKeys[0]) {
    await testDirect("Venuses", env.VENESES_BASE_URL, venusesKeys[0], env.VENESES_MODEL_GLM_5_2);
    await testDirect("Venuses", env.VENESES_BASE_URL, venusesKeys[0], env.VENESES_MODEL_GROK_4_5);
  }

  const zaiKeys = keyPool("ZAI");
  if (zaiKeys[0]) {
    await testDirect("Z.AI", env.ZAI_BASE_URL, zaiKeys[0], "glm-4.7-flash");
    await testDirect("Z.AI", env.ZAI_BASE_URL, zaiKeys[0], "glm-4.5-flash");
  }

  console.log("\n=== 2. Test qua gateway local (cần `npm run dev` đang chạy ở port 3000) ===\n");
  const gwBase = process.env.GATEWAY_TEST_URL || "http://localhost:3000";
  const gwKey = env.OWNER_SECRET;
  for (const m of ["mimo-code-free", "kimi-k2.7-code", "minimax-m3", "kimi-k2.6", "deepseek-v4-pro", "glm-5.2", "grok-4.5", "glm-4.7-flash", "glm-4.5-flash"]) {
    await testGateway(gwBase, gwKey, m);
  }
}

main();
