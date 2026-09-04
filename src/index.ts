import { McpGateway, PublicMCP, PrivateMCP } from "./mcp-gateway";
import { extractToken, validateToken, createToken, listTokens, revokeToken, requireAdmin } from "./auth";
import { homeHTML } from "./home";
import { Workspace } from "./workspace";

export interface Env {
  PublicMCP: any;
  PrivateMCP: any;
  Workspace: any;
  LOADER?: any;
  DB: any;
  KV: any;
  ADMIN_TOKEN: string;
}

export { McpGateway, PublicMCP, PrivateMCP } from "./mcp-gateway";
export { Workspace } from "./workspace";

function json(data: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Token, X-Admin-Token, mcp-session-id",
    "Access-Control-Expose-Headers": "mcp-session-id",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Public MCP endpoint (no auth required)
    if (url.pathname.startsWith("/mcp/public")) {
      return PublicMCP.serve("/mcp/public", { binding: "PublicMCP" }).fetch(request, env, ctx);
    }

    // Private MCP endpoint (requires Bearer token)
    if (url.pathname.startsWith("/mcp/private")) {
      const token = extractToken(request);
      if (!token) {
        return json({ error: "Unauthorized: Bearer token required. Use Authorization: Bearer mcp_sk_... or X-API-Token header" }, 401, corsHeaders());
      }
      const res = await validateToken(env, token);
      if (!res.valid) {
        return json({ error: `Unauthorized: ${res.reason}` }, 401, corsHeaders());
      }
      // pass user info to DO via props (for per-tool scope checks)
      const props = { userId: res.info.id, name: res.info.name, scopes: res.info.scopes, plan: res.info.plan };
      // @ts-ignore props not in standard ctx
      return PrivateMCP.serve("/mcp/private", { binding: "PrivateMCP" }).fetch(request, env, { ...ctx, props } as any);
    }

    // Admin: create token
    if (url.pathname === "/admin/tokens" && request.method === "POST") {
      if (!requireAdmin(request, env)) return json({ error: "Forbidden: invalid admin token. Use X-Admin-Token header" }, 403, corsHeaders());
      const body = await request.json().catch(()=>({})) as any;
      const { name, scopes, plan, quota, rateLimitRpm, rateLimitRph, expiresAt } = body;
      if (!name) return json({ error: "name required" }, 400, corsHeaders());
      const out = await createToken(env, { name, scopes, plan, quota, rateLimitRpm, rateLimitRph, expiresAt });
      return json({ 
        id: out.id, 
        token: out.token, 
        prefix: out.prefix,
        name,
        scopes: scopes ?? [],
        plan: plan ?? "free",
        warning: "Token shown only once, store it securely!" 
      }, 200, corsHeaders());
    }

    if (url.pathname === "/admin/tokens" && request.method === "GET") {
      if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403, corsHeaders());
      const tokens = await listTokens(env);
      return json({ tokens }, 200, corsHeaders());
    }

    if (url.pathname.startsWith("/admin/tokens/") && request.method === "DELETE") {
      if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403, corsHeaders());
      const id = url.pathname.split("/").pop()!;
      const ok = await revokeToken(env, id);
      if (!ok) return json({ error: "not found" }, 404, corsHeaders());
      return json({ ok: true }, 200, corsHeaders());
    }

    // Verify token (for Hermes/client self-check)
    if (url.pathname === "/auth/verify" && request.method === "POST") {
      const body = await request.json().catch(()=>({})) as any;
      const token = body.token || extractToken(request);
      if (!token) return json({ valid: false, reason: "missing token" }, 400, corsHeaders());
      const res = await validateToken(env, token);
      if (!res.valid) return json({ valid: false, reason: res.reason }, 200, corsHeaders());
      return json({ valid: true, info: { id: res.info.id, name: res.info.name, plan: res.info.plan, quota: res.info.quota, used: res.info.used, scopes: res.info.scopes } }, 200, corsHeaders());
    }

    // Debug workspace (no auth, for testing Computer)  ?user=xxx&path=/hello.txt&op=write|read|ls
    if (url.pathname === "/debug/workspace") {
      try {
        const { getUserWorkspace } = await import("./workspace");
        const user = url.searchParams.get("user") || "debug-test";
        const op = url.searchParams.get("op") || "test";
        const p = url.searchParams.get("path") || "/hello.txt";
        const ws: any = await getUserWorkspace(env, user);
        if (op === "write") {
          const content = url.searchParams.get("content") || "world " + new Date().toISOString();
          const dir = p.substring(0, p.lastIndexOf("/")) || "/";
          if (dir !== "/") try { await ws.fs.mkdir(dir, { recursive: true }); } catch {}
          await ws.fs.writeFile(p, content);
          return json({ ok: true, op, user, path: p, content }, 200, corsHeaders());
        } else if (op === "read") {
          const data = await ws.fs.readFile(p, "utf8");
          return json({ ok: true, op, user, path: p, data }, 200, corsHeaders());
        } else if (op === "ls") {
          const list = await ws.fs.readdir(p);
          return json({ ok: true, op, user, path: p, list }, 200, corsHeaders());
        } else {
          await ws.fs.writeFile("/hello.txt", "world " + new Date().toISOString());
          const data = await ws.fs.readFile("/hello.txt", "utf8");
          const list = await ws.fs.readdir("/");
          return json({ ok: true, data, list, user }, 200, corsHeaders());
        }
      } catch (e: any) {
        return json({ ok: false, error: e.message, stack: e.stack }, 500, corsHeaders());
      }
    }

    // Health check
    if (url.pathname === "/health") {
      return json({ status: "ok", service: "mcp-gateway" }, 200, corsHeaders());
    }

    // API info (json for Accept: application/json)
    if (url.pathname === "/api" || url.pathname === "/api/info") {
      return json({
        name: "MCP Gateway",
        version: "1.0.0",
        endpoints: {
          public: "https://mcp.2020224.xyz/mcp/public (no auth)",
          private: "https://mcp.2020224.xyz/mcp/private (Bearer mcp_sk_...)",
          health: "/health",
          admin_create_token: "POST /admin/tokens (X-Admin-Token)",
          admin_list_tokens: "GET /admin/tokens",
          verify: "POST /auth/verify"
        },
        docs: "https://github.com/HarveyJiang/mcp-gateway/blob/main/AGENT_GUIDE.md"
      }, 200, corsHeaders());
    }

    // Homepage
    if (url.pathname === "/" || url.pathname === "/index.html") {
      // serve html if browser, json if explicit Accept: application/json
      const accept = request.headers.get("Accept") || "";
      if (accept.includes("application/json")) {
        return json({
          name: "MCP Gateway",
          version: "1.0.0",
          endpoints: {
            public: "https://mcp.2020224.xyz/mcp/public",
            private: "https://mcp.2020224.xyz/mcp/private",
          }
        }, 200, corsHeaders());
      }
      return new Response(homeHTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() }
      });
    }

    return json({ error: "Not found" }, 404, corsHeaders());
  }
};