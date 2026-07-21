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
<style>
  :root{--bg:#0b0f14;--surface:#131922;--surface-2:#1a212c;--border:#262f3d;--text:#edf1f5;--text-dim:#8492a6;--text-faint:#4d5b6e;--brand:#2dd4bf;--err:#f2495c;--err-dim:#f2495c1f;--mono:ui-monospace,'JetBrains Mono','SF Mono',Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif}
  *{box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:46px 40px;text-align:center;width:360px}
  .brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px}
  .brand .dot{width:8px;height:8px;border-radius:50%;background:var(--brand);box-shadow:0 0 10px var(--brand)}
  h1{font-size:15px;font-weight:700;font-family:var(--mono);letter-spacing:.2px}
  p{color:var(--text-dim);font-size:13px;margin:10px 0 8px}
  .free{color:var(--brand);font-size:12.5px;font-weight:600;margin-bottom:24px}
  a.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#5865F2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:600;font-size:14px;transition:.15s}
  a.btn:hover{filter:brightness(1.08)}
  .err{color:var(--err);font-size:12.5px;margin-top:18px;background:var(--err-dim);padding:8px 12px;border-radius:7px;font-family:var(--mono)}
</style>
</head>
<body>
<div class="card">
  <div class="brand"><span class="dot"></span><h1>huyyhere-gateway</h1></div>
  <p>Đăng nhập bằng Discord để dùng gateway</p>
  <div class="free">✦ Free 2,000,000 tokens mỗi ngày</div>
  <a class="btn" href="/api/oauth2/authorize">Login with Discord</a>
  ${errorMsg ? `<div class="err">${errorMsg}</div>` : ""}
</div>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
