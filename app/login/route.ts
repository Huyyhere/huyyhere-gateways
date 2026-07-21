import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/discord-auth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Phiên đăng nhập không hợp lệ, vui lòng thử lại.",
  oauth_failed: "Đăng nhập Discord thất bại, vui lòng thử lại.",
};

export async function GET(req: NextRequest) {
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const errorCode = req.nextUrl.searchParams.get("error") || "";
  const errorMsg = ERROR_MESSAGES[errorCode] || "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HuyyHere Gateway — Sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#06080f;--surface:#111631;--border:#1e2548;--text:#e8ecf4;--muted:#505a7e;--accent:#3b82f6;--accent-glow:#3b82f640}
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    background:var(--bg);
    background-image:radial-gradient(ellipse 800px 600px at 20% -10%,#3b82f60a,transparent),radial-gradient(ellipse 600px 500px at 80% 5%,#06b6d408,transparent);
    color:var(--text);font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;
  }
  .card{
    background:linear-gradient(135deg,#11163180,#171d4060);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    border:1px solid var(--border);border-radius:16px;padding:48px 42px;text-align:center;width:380px;
  }
  .brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px}
  .brand-icon{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#06b6d4);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;font-family:'Space Grotesk',sans-serif;box-shadow:0 0 20px var(--accent-glow)}
  h1{font-size:16px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:-.02em}
  p{color:#8b93b3;font-size:13.5px;margin:14px 0 6px;line-height:1.6}
  .free{color:#3b82f6;font-size:12px;font-weight:600;font-family:'JetBrains Mono',monospace;margin-bottom:28px;letter-spacing:0.04em}
  a.btn{
    display:inline-flex;align-items:center;justify-content:center;gap:8px;
    background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;text-decoration:none;
    padding:12px 24px;border-radius:999px;font-weight:600;font-size:14px;transition:.2s;font-family:'Inter',sans-serif;
    box-shadow:0 0 30px var(--accent-glow);border:none;cursor:pointer;
  }
  a.btn:hover{filter:brightness(1.12);transform:translateY(-1px);text-decoration:none;color:#fff}
  .err{color:#ef4444;font-size:12px;margin-top:18px;background:#ef444418;padding:8px 14px;border-radius:8px;font-family:'JetBrains Mono',monospace}
</style>
</head>
<body>
<div class="card">
  <div class="brand"><div class="brand-icon">H</div><h1>huyyhere</h1></div>
  <p>Sign in with Discord to use the gateway</p>
  <div class="free">2,000,000 tokens free / day</div>
  <a class="btn" href="/api/oauth2/authorize">Login with Discord</a>
  ${errorMsg ? `<div class="err">${errorMsg}</div>` : ""}
</div>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
