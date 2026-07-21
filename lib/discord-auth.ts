import crypto from "crypto";

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const OWNER_DISCORD_ID = process.env.DISCORD_OWNER_ID;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !OWNER_DISCORD_ID || !SESSION_SECRET) {
  throw new Error(
    "Discord OAuth env vars are required: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, DISCORD_OWNER_ID, SESSION_SECRET"
  );
}

export const SESSION_COOKIE_NAME = "gw_session";
export const STATE_COOKIE_NAME = "gw_oauth_state";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h
export const SESSION_MAX_AGE_SEC = SESSION_TTL_MS / 1000;

export interface Session {
  id: string;
  username: string;
  email: string | null;
  isOwner: boolean;
}

export function isOwnerId(discordId: string): boolean {
  return discordId === OWNER_DISCORD_ID;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: REDIRECT_URI!,
    response_type: "code",
    scope: "identify email",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function generateState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function exchangeCodeForUser(code: string): Promise<{ id: string; username: string; email: string | null }> {
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI!,
    }),
  });
  if (!tokenRes.ok) throw new Error(`discord token exchange failed: ${tokenRes.status}`);
  const tokenData = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) throw new Error(`discord user fetch failed: ${userRes.status}`);
  const user = (await userRes.json()) as { id: string; username: string; email?: string | null; verified?: boolean };
  // Discord only returns email if the `email` scope was granted and the
  // account has a verified email attached.
  const email = user.verified && user.email ? user.email : null;
  return { id: user.id, username: user.username, email };
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET!).update(payload).digest("hex");
}

// Any authenticated Discord user gets a session now (not owner-only).
// Owner-only gating happens at the route/UI level via isOwnerId().
export function createSessionCookieValue(discordId: string, username: string, email: string | null): string {
  const payload = JSON.stringify({ id: discordId, u: username, e: email, exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionCookieValue(value: string | undefined | null): Session | null {
  if (!value) return null;
  const [encoded, sig] = value.split(".");
  if (!encoded || !sig) return null;

  const expectedSig = sign(encoded);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload.id !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    const username = typeof payload.u === "string" ? payload.u : "unknown";
    const email = typeof payload.e === "string" ? payload.e : null;
    return { id: payload.id, username, email, isOwner: isOwnerId(payload.id) };
  } catch {
    return null;
  }
}
