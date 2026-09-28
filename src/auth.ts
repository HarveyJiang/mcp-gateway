import type { Env } from "./index";

export interface TokenRow {
  id: string;
  token_hash: string;
  token_prefix: string;
  name: string;
  scopes: string;
  plan: string;
  quota: number;
  used: number;
  rate_limit_rpm: number;
  rate_limit_rph: number;
  is_active: number;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ValidToken {
  id: string;
  token_hash: string;
  token_prefix: string;
  name: string;
  scopes: string[];
  plan: string;
  quota: number;
  used: number;
  rateLimitRpm: number;
  rateLimitRph: number;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const xApi = request.headers.get("X-API-Token") || request.headers.get("x-api-token");
  if (xApi) return xApi.trim();
  // also support query ?token=
  const url = new URL(request.url);
  const q = url.searchParams.get("token");
  if (q) return q.trim();
  return null;
}

export async function validateToken(env: Env, token: string): Promise<{ valid: true; info: ValidToken } | { valid: false; reason: string }> {
  if (!token) return { valid: false, reason: "missing token" };
  const hash = await sha256Hex(token);
  const cacheKey = `token:${hash}`;

  // 1. try KV cache
  try {
    const cached = await env.KV.get(cacheKey, "json") as ValidToken | null;
    if (cached) {
      // still need to check rate/quota live? we check via KV counters, quota via cached used may be stale
      // refetch quota from D1 periodically? for MVP use cached but check quota via D1 each time
      // fall through to D1 for quota check
    }
  } catch {}

  // 2. D1 lookup
  const row = await env.DB.prepare("SELECT * FROM tokens WHERE token_hash = ?").bind(hash).first() as any as TokenRow | null;
  if (!row) return { valid: false, reason: "invalid token" };
  if (!row.is_active) return { valid: false, reason: "token revoked" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { valid: false, reason: "token expired" };
  if (row.used >= row.quota) return { valid: false, reason: "quota exceeded" };

  let scopes: string[] = [];
  try { scopes = JSON.parse(row.scopes); } catch { scopes = []; }

  // 3. rate limiting via KV
  const now = Date.now();
  const minuteKey = `rate:${hash}:m:${Math.floor(now / 60000)}`;
  const hourKey = `rate:${hash}:h:${Math.floor(now / 3600000)}`;

  const [mCount, hCount] = await Promise.all([
    env.KV.get(minuteKey).then((v: string | null) => parseInt(v || "0")),
    env.KV.get(hourKey).then((v: string | null) => parseInt(v || "0")),
  ]);
  if (mCount >= row.rate_limit_rpm) return { valid: false, reason: "rate limited (per minute)" };
  if (hCount >= row.rate_limit_rph) return { valid: false, reason: "rate limited (per hour)" };

  // increment counters (fire and forget, but await for correctness)
  await Promise.all([
    env.KV.put(minuteKey, String(mCount + 1), { expirationTtl: 60 }),
    env.KV.put(hourKey, String(hCount + 1), { expirationTtl: 3600 }),
  ]);

  // update used/last_used async (don't block)
  env.DB.prepare("UPDATE tokens SET used = used + 1, last_used_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run().catch(()=>{});
  // update KV cache
  const info: ValidToken = {
    id: row.id,
    token_hash: hash,
    token_prefix: row.token_prefix,
    name: row.name,
    scopes,
    plan: row.plan,
    quota: row.quota,
    used: row.used + 1,
    rateLimitRpm: row.rate_limit_rpm,
    rateLimitRph: row.rate_limit_rph,
  };
  await env.KV.put(cacheKey, JSON.stringify(info), { expirationTtl: 300 }).catch(()=>{});

  return { valid: true, info };
}

export async function createToken(env: Env, opts: {
  name: string;
  scopes?: string[];
  plan?: string;
  quota?: number;
  rateLimitRpm?: number;
  rateLimitRph?: number;
  expiresAt?: string | null;
}): Promise<{ id: string; token: string; prefix: string; row: TokenRow }> {
  const token = `mcp_sk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const hash = await sha256Hex(token);
  const prefix = token.slice(0, 12) + "...";
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const scopes = opts.scopes ?? [];
  const plan = opts.plan ?? "free";
  const quota = opts.quota ?? (plan === "pro" ? 100000 : 1000);
  const rpm = opts.rateLimitRpm ?? (plan === "pro" ? 300 : 60);
  const rph = opts.rateLimitRph ?? (plan === "pro" ? 10000 : 1000);

  await env.DB.prepare(
    "INSERT INTO tokens (id, token_hash, token_prefix, name, scopes, plan, quota, used, rate_limit_rpm, rate_limit_rph, is_active, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?, ?)"
  ).bind(id, hash, prefix, opts.name, JSON.stringify(scopes), plan, quota, rpm, rph, opts.expiresAt ?? null, now).run();

  const row = await env.DB.prepare("SELECT * FROM tokens WHERE id = ?").bind(id).first() as any as TokenRow;
  return { id, token, prefix, row: row! };
}

export async function listTokens(env: Env): Promise<TokenRow[]> {
  const res = await env.DB.prepare("SELECT id, token_prefix, name, scopes, plan, quota, used, rate_limit_rpm, rate_limit_rph, is_active, expires_at, created_at, last_used_at FROM tokens ORDER BY created_at DESC").all() as any as { results: TokenRow[] };
  return res.results ?? [];
}

export async function revokeToken(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT token_hash FROM tokens WHERE id = ?").bind(id).first() as any as TokenRow | null;
  if (!row) return false;
  await env.DB.prepare("UPDATE tokens SET is_active = 0 WHERE id = ?").bind(id).run();
  await env.KV.delete(`token:${row.token_hash}`).catch(()=>{});
  return true;
}

export function requireAdmin(request: Request, env: Env): boolean {
  const admin = request.headers.get("X-Admin-Token") || request.headers.get("Authorization")?.replace("Bearer ","") || new URL(request.url).searchParams.get("admin_token");
  return admin === env.ADMIN_TOKEN;
}
