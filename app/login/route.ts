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
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HuyyHere Gateway — Sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#1b1815;--panel:#232019;--wire:#3a3527;--paper:#f3ede1;--paper-dim:#b8ae9a;--brass:#d2a24c;--brass-dim:#d2a24c1f;--display:'Space Grotesk',sans-serif;--body:'Inter',sans-serif;--mono:'IBM Plex Mono',monospace}
  *{box-sizing:border-box}
  body{
    background:var(--ink);
    background-image:radial-gradient(ellipse 700px 500px at 20% -10%,#d2a24c14,transparent);
    color:var(--paper);font-family:var(--body);display:flex;align-items:center;justify-content:center;height:100vh;margin:0
  }
  .card{background:var(--panel);border:1px solid var(--wire);border-radius:14px;padding:48px 42px;text-align:center;width:360px}
  .brand{display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:10px}
  .brand .jack{width:10px;height:10px;border-radius:50%;background:var(--brass);box-shadow:0 0 0 4px var(--brass-dim)}
  h1{font-size:16px;font-weight:600;font-family:var(--display);letter-spacing:-.01em;margin:0}
  p{color:var(--paper-dim);font-size:13.5px;margin:12px 0 6px;line-height:1.5}
  .free{color:var(--brass);font-size:12.5px;font-weight:500;font-family:var(--mono);margin-bottom:26px}
  a.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#5865F2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:600;font-size:14px;transition:.15s;font-family:var(--body)}
  a.btn:hover{filter:brightness(1.08)}
  .err{color:#e15b4d;font-size:12.5px;margin-top:18px;background:#e15b4d1f;padding:8px 12px;border-radius:7px;font-family:var(--mono)}
</style>
</head>
<body>
<div class="card">
  <div class="brand"><span class="jack"></span><h1>huyyhere-gateway</h1></div>
  <p>Đăng nhập bằng Discord để dùng gateway</p>
  <div class="free">✦ free 2,000,000 tokens / ngày</div>
  <a class="btn" href="/api/oauth2/authorize">Login with Discord</a>
  ${errorMsg ? `<div class="err">${errorMsg}</div>` : ""}
</div>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
