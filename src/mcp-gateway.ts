import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodRawShape, ZodObject } from "zod";
import type { Env } from "./index";
import { getUserWorkspace } from "./workspace";
import { CHENGDU_HOSPITALS } from "./data/chengdu-hospitals";

// ============================================================================
// Types
// ============================================================================

export interface GatewayState {
  config: GatewayConfig;
}

export interface GatewayConfig {
  name: string;
  version: string;
  description: string;
  isPublic: boolean;
  allowedTools?: string[];
  rateLimit: RateLimitConfig;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

export interface ToolDefinition<TSchema extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: TSchema;
  handler: (args: z.infer<ZodObject<TSchema>>) => Promise<{ content: Array<{ type: string; text: string }> }>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
  handler: (uri: URL) => Promise<{ contents: Array<{ text: string; uri: string }> }>;
}

// ============================================================================
// Base MCP Gateway Class
// ============================================================================

export type GatewayProps = { userId?: string; name?: string; scopes?: string[]; plan?: string };
export class McpGateway extends McpAgent<Env, GatewayState, GatewayProps> {
  server = new McpServer({
    name: "MCP Gateway",
    version: "1.0.0"
  });

  // In-memory registries (not persisted, rebuilt on init)
  private toolRegistry = new Map<string, ToolDefinition>();
  private resourceRegistry = new Map<string, ResourceDefinition>();

  initialState: GatewayState = {
    config: {
      name: "MCP Gateway",
      version: "1.0.0",
      description: "Unified MCP Gateway for public and private services",
      isPublic: true,
      rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 }
    }
  };

  async init(): Promise<void> {
    // Defensive: ensure state and config exist (handles upgrades from old schema)
    if (!this.state || !this.state.config) {
      console.log("State missing or config undefined, resetting to initialState", JSON.stringify(this.state));
      this.setState(this.initialState);
    }
    this.registerBuiltinTools();
    this.registerBuiltinResources();
    await this.onInit(this.state.config);
  }

  protected async onInit(config: GatewayConfig): Promise<void> {}

  private registerBuiltinTools(): void {
    this.server.registerTool(
      "gateway_list_tools",
      { description: "List all available tools in this gateway", inputSchema: {} },
      async () => ({
        content: [{ type: "text", text: JSON.stringify(
          Array.from(this.toolRegistry.entries()).map(([name, def]) => ({
            name, description: def.description, annotations: def.annotations
          })), null, 2) }]
      })
    );

    this.server.registerTool(
      "gateway_list_resources",
      { description: "List all available resources in this gateway", inputSchema: {} },
      async () => ({
        content: [{ type: "text", text: JSON.stringify(
          Array.from(this.resourceRegistry.entries()).map(([uri, def]) => ({
            uri, name: def.name, description: def.description, mimeType: def.mimeType
          })), null, 2) }]
      })
    );

    this.server.registerTool(
      "gateway_info",
      { description: "Get gateway configuration and status", inputSchema: {} },
      async () => {
        const config = this.state.config;
        return {
          content: [{ type: "text", text: JSON.stringify({
            name: config.name, version: config.version, description: config.description,
            isPublic: config.isPublic, toolCount: this.toolRegistry.size, resourceCount: this.resourceRegistry.size
          }, null, 2) }]
        };
      }
    );
  }

  private registerBuiltinResources(): void {
    this.server.resource("gateway:config", "mcp://gateway/config", async (uri) => ({
      contents: [{ text: JSON.stringify(this.state.config, null, 2), uri: uri.href }]
    }));
    this.server.resource("gateway:tools", "mcp://gateway/tools", async (uri) => ({
      contents: [{ text: JSON.stringify(Array.from(this.toolRegistry.keys()), null, 2), uri: uri.href }]
    }));
  }

  protected registerTool<TSchema extends ZodRawShape>(def: ToolDefinition<TSchema>): void {
    if (this.toolRegistry.has(def.name)) throw new Error(`Tool ${def.name} already registered`);
    this.toolRegistry.set(def.name, def as unknown as ToolDefinition);

    const callback = async (args: unknown) => {
      // 1) global gateway allow list (for PrivateMCP)
      if (!this.state.config.isPublic && this.state.config.allowedTools) {
        if (!this.state.config.allowedTools.includes(def.name)) {
          throw new Error(`Tool ${def.name} not allowed in private gateway`);
        }
      }
      // 2) per-token scopes (passed via ctx.props)
      const props = (this as any).props as GatewayProps | undefined;
      if (props?.scopes && props.scopes.length > 0) {
        if (!props.scopes.includes(def.name) && !props.scopes.includes("*")) {
          throw new Error(`Tool ${def.name} not in token scopes`);
        }
      }
      return def.handler(args as z.infer<ZodObject<TSchema>>);
    };

    this.server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      callback as any
    );
  }

  protected registerResource(def: ResourceDefinition): void {
    if (this.resourceRegistry.has(def.uri)) throw new Error(`Resource ${def.uri} already registered`);
    this.resourceRegistry.set(def.uri, def);
    this.server.resource(def.name, def.uri, async (uri) => def.handler(uri));
  }

  protected updateConfig(config: Partial<GatewayConfig>): void {
    const newConfig = { ...this.state.config, ...config };
    this.setState({ config: newConfig });
  }

  protected getConfig(): GatewayConfig { return this.state.config; }
}

// ============================================================================
// Public MCP Gateway (Open Access)
// ============================================================================

export class PublicMCP extends McpGateway {
  initialState: GatewayState = {
    config: {
      name: "MCP Gateway - Public",
      version: "1.0.0",
      description: "Public MCP services accessible to all",
      isPublic: true,
      rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 }
    }
  };

  protected async onInit(config: GatewayConfig): Promise<void> {
    await this.registerPublicServices();
  }

  private async registerPublicServices(): Promise<void> {
    this.registerTool({
      name: "public_get_weather",
      description: "Get current weather for a location (public demo)",
      inputSchema: {
        location: z.string().describe("City name or coordinates"),
        units: z.enum(["metric", "imperial"]).default("metric").describe("Temperature units")
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async ({ location, units }) => ({
        content: [{ type: "text", text: JSON.stringify({
          location, temperature: units === "metric" ? 22 : 72, condition: "Sunny", units, source: "demo"
        }, null, 2) }]
      })
    });

    this.registerTool({
      name: "public_get_time",
      description: "Get current time for a timezone",
      inputSchema: { timezone: z.string().default("UTC").describe("IANA timezone (e.g., America/New_York)") },
      annotations: { readOnlyHint: true, idempotentHint: true },
      handler: async ({ timezone }) => {
        try {
          const time = new Date().toLocaleString("en-US", { timeZone: timezone });
          return { content: [{ type: "text", text: JSON.stringify({ timezone, time }, null, 2) }] };
        } catch {
          return { content: [{ type: "text", text: `Invalid timezone: ${timezone}` }] };
        }
      }
    });

    this.registerTool({
      name: "public_generate_uuid",
      description: "Generate a random UUID",
      inputSchema: { count: z.number().min(1).max(100).default(1).describe("Number of UUIDs to generate") },
      annotations: { readOnlyHint: true, idempotentHint: false },
      handler: async ({ count }) => {
        const uuids = Array.from({ length: count }, () => globalThis.crypto.randomUUID());
        return { content: [{ type: "text", text: JSON.stringify(uuids, null, 2) }] };
      }
    });

    this.registerTool({
      name: "public_shorten_url",
      description: "Create a short link via shorten.2020224.xyz. Turns a long URL into https://shorten.2020224.xyz/XXXXXX. Same backend as the website, no auth needed.",
      inputSchema: {
        url: z.string().describe("Long URL starting with http:// or https://"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async ({ url }) => {
        try {
          if (!/^https?:\/\//i.test(url.trim())) {
            return { content: [{ type: "text", text: "Invalid URL: must start with http:// or https://" }] };
          }
          const res = await fetch("https://shorten.2020224.xyz/api/shorten", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url.trim() }),
          });
          const data = await res.json() as any;
          if (!res.ok) {
            return { content: [{ type: "text", text: `Shorten failed: ${data.error || res.status}` }] };
          }
          return { content: [{ type: "text", text: JSON.stringify({ shortUrl: data.shortUrl, code: data.code, original: url.trim() }, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Shorten failed: ${e.message}. Retry later.` }] };
        }
      }
    });

    this.registerTool({
      name: "public_expand_url",
      description: "Resolve a shorten.2020224.xyz short link to its target URL without following the redirect.",
      inputSchema: {
        code: z.string().describe("Short code or full short URL, e.g. 'X5FRtq' or 'https://shorten.2020224.xyz/X5FRtq'"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async ({ code }) => {
        try {
          const c = code.trim().split("/").filter(Boolean).pop() || "";
          if (!c) return { content: [{ type: "text", text: "Invalid code: empty" }] };
          const res = await fetch(`https://shorten.2020224.xyz/${encodeURIComponent(c)}`, { method: "GET", redirect: "manual" });
          const target = res.headers.get("location");
          if ((res.status === 301 || res.status === 302) && target) {
            return { content: [{ type: "text", text: JSON.stringify({ code: c, target }, null, 2) }] };
          }
          return { content: [{ type: "text", text: `Not found or unexpected status ${res.status} for code: ${c}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Expand failed: ${e.message}. Retry later.` }] };
        }
      }
    });

    this.registerTool({
      name: "public_chengdu_hospitals",
      description: "检索成都市医院名录, 支持按等级(三级甲等/三级乙等/二级甲等/二级乙等)/公立民营/行政区/专科/关键词过滤, 结果按等级分组返回. v1收录66家三级甲等.",
      inputSchema: {
        level: z.enum(["三级甲等", "三级乙等", "二级甲等", "二级乙等", "全部"]).default("全部").describe("医院等级"),
        ownership: z.enum(["公立", "民营", "全部"]).default("全部").describe("公立(含军队/国企)或民营(含社会办医)"),
        district: z.string().default("全部").describe("行政区, 如武侯区/双流区/简阳市/金堂县, 或全部"),
        category: z.string().default("全部").describe("综合/中医类/妇幼专科/口腔专科/眼科专科/肿瘤专科/骨科专科/精神专科/传染病专科/职业病专科/肛肠专科/生殖专科, 或全部"),
        keyword: z.string().optional().describe("名称关键词, 如华西/眼科/妇幼"),
        limit: z.number().min(1).max(66).default(66).describe("最多返回条数"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
      handler: async ({ level, ownership, district, category, keyword, limit }) => {
        let list = CHENGDU_HOSPITALS.filter(h =>
          (level === "全部" || h.level === level) &&
          (ownership === "全部" || h.ownership === ownership) &&
          (district === "全部" || h.district === district || h.address.includes(district)) &&
          (category === "全部" || h.category === category) &&
          (!keyword || h.name.includes(keyword))
        );
        const total = list.length;
        list = list.slice(0, limit);
        const byLevel: Record<string, typeof list> = {};
        for (const h of list) {
          (byLevel[h.level] = byLevel[h.level] || []).push(h);
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              total, filters: { level, ownership, district, category, keyword: keyword || "" },
              byLevel,
              note: "v1收录成都市66家三级甲等医院(56公立/10民营). 查三级乙等/二级请直接用level过滤, 二级及以下名录补充中.",
            }, null, 2),
          }],
        };
      }
    });

    this.registerTool({
      name: "public_github_search",
      description: "Search public GitHub repositories by keyword. Returns name, description, stars, language, url. No auth needed (rate limited without GITHUB_TOKEN).",
      inputSchema: {
        query: z.string().describe("Search keywords, e.g. 'mcp server typescript'"),
        per_page: z.number().min(1).max(20).default(5).describe("Number of results (1-20)"),
        sort: z.enum(["stars", "forks", "updated"]).default("stars").describe("Sort order"),
        language: z.string().optional().describe("Filter by language, e.g. 'TypeScript'"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async ({ query, per_page, sort, language }) => {
        try {
          const q = language ? `${query} language:${language}` : query;
          const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${per_page}&sort=${sort}&order=desc`;
          // @ts-ignore env on McpAgent
          const env = (this as any).env as Env;
          const headers: Record<string, string> = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "mcp-gateway",
          };
          if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
          const res = await fetch(url, { headers });
          if (res.status === 403) {
            return { content: [{ type: "text", text: "GitHub API rate limited (10 req/min without token). Set GITHUB_TOKEN as Worker secret to raise limits, or retry in a minute." }] };
          }
          if (!res.ok) {
            return { content: [{ type: "text", text: `GitHub API error ${res.status}: ${await res.text()}` }] };
          }
          const data = await res.json() as any;
          const repos = (data.items || []).map((r: any) => ({
            name: r.full_name,
            description: r.description,
            stars: r.stargazers_count,
            language: r.language,
            url: r.html_url,
            updated: r.updated_at,
          }));
          return { content: [{ type: "text", text: JSON.stringify({ total: data.total_count, repos }, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Search failed: ${e.message}. Check network or retry.` }] };
        }
      }
    });
  }
}

// ============================================================================
// Private MCP Gateway (Authenticated Access)
// ============================================================================

export class PrivateMCP extends McpGateway {
  initialState: GatewayState = {
    config: {
      name: "MCP Gateway - Private",
      version: "1.0.0",
      description: "Private MCP services for authenticated users (with Computer workspace)",
      isPublic: false,
      allowedTools: ["private_echo", "private_get_config", "private_set_config", "computer_write", "computer_read", "computer_ls", "computer_rm", "computer_exec", "computer_git_clone", "computer_mkdir", "ai_generate", "r2_upload", "r2_read", "r2_list", "r2_delete"],
      rateLimit: { requestsPerMinute: 300, requestsPerHour: 10000 }
    }
  };

  protected async onInit(config: GatewayConfig): Promise<void> {
    await this.registerPrivateServices();
  }

  private async registerPrivateServices(): Promise<void> {
    this.registerTool({
      name: "private_echo",
      description: "Echo back the input message (private)",
      inputSchema: {
        message: z.string().describe("Message to echo"),
        prefix: z.string().default("[PRIVATE]").describe("Prefix to add")
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
      handler: async ({ message, prefix }) => ({
        content: [{ type: "text", text: `${prefix} ${message}` }]
      })
    });

    this.registerTool({
      name: "private_get_config",
      description: "Get private gateway configuration",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({
        content: [{ type: "text", text: JSON.stringify(this.state.config, null, 2) }]
      })
    });

    this.registerTool({
      name: "private_set_config",
      description: "Update private gateway configuration (admin only)",
      inputSchema: {
        allowedTools: z.array(z.string()).optional().describe("List of allowed tool names"),
        rateLimit: z.object({
          requestsPerMinute: z.number().optional(),
          requestsPerHour: z.number().optional()
        }).optional()
      },
      annotations: { destructiveHint: true, readOnlyHint: false },
      handler: async ({ allowedTools, rateLimit }) => {
        const updates: Partial<GatewayConfig> = {};
        if (allowedTools) updates.allowedTools = allowedTools;
        if (rateLimit) updates.rateLimit = { ...this.state.config.rateLimit, ...rateLimit } as RateLimitConfig;
        this.updateConfig(updates);
        return { content: [{ type: "text", text: "Configuration updated successfully" }] };
      }
    });

    // ===== Computer Workspace Tools (persistent 10GB) =====
    // helper to get user workspace by token userId (props)
    const getWs = async () => {
      const props = (this as any).props as GatewayProps | undefined;
      const userId = props?.userId || (this as any).name || "anonymous";
      // @ts-ignore this.env exists on McpAgent
      const env = (this as any).env as Env;
      const ws = await getUserWorkspace(env, userId);
      return ws;
    };

    this.registerTool({
      name: "computer_write",
      description: "Write file to persistent workspace (10GB, survives restarts). Use for AI to save notes, code, configs. Auto-creates parent dirs.",
      inputSchema: {
        path: z.string().describe("Absolute path e.g. /notes/todo.md or /workspace/app/index.ts"),
        content: z.string().describe("File content"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      handler: async ({ path, content }) => {
        console.log("computer_write", path);
        const ws: any = await getWs();
        try {
          // auto mkdir parent
          const dir = path.substring(0, path.lastIndexOf("/")) || "/";
          if (dir !== "/") {
            try { await ws.fs.mkdir(dir, { recursive: true }); } catch {}
          }
          await ws.fs.writeFile(path, content);
          console.log("computer_write done");
          return { content: [{ type: "text", text: `Written ${path} (${content.length} bytes)` }] };
        } catch (e: any) {
          console.log("computer_write error", e.message);
          return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "computer_mkdir",
      description: "Create directory in workspace (recursive)",
      inputSchema: { path: z.string().describe("Directory path e.g. /notes/daily") },
      annotations: { readOnlyHint: false },
      handler: async ({ path }) => {
        const ws: any = await getWs();
        try {
          await ws.fs.mkdir(path, { recursive: true });
          return { content: [{ type: "text", text: `Created ${path}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "computer_read",
      description: "Read file from persistent workspace",
      inputSchema: { path: z.string().describe("Absolute path e.g. /notes/todo.md") },
      annotations: { readOnlyHint: true },
      handler: async ({ path }) => {
        console.log("computer_read", path);
        const ws: any = await getWs();
        try {
          const data = await ws.fs.readFile(path, "utf8");
          return { content: [{ type: "text", text: String(data) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "computer_ls",
      description: "List directory in workspace",
      inputSchema: { path: z.string().default("/").describe("Directory path e.g. / or /workspace") },
      annotations: { readOnlyHint: true },
      handler: async ({ path }) => {
        console.log("computer_ls", path);
        const ws: any = await getWs();
        try {
          const entries = await ws.fs.readdir(path);
          return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "computer_rm",
      description: "Delete file or directory in workspace",
      inputSchema: {
        path: z.string().describe("Path to delete"),
        recursive: z.boolean().default(false).describe("Recursive for directories"),
      },
      annotations: { destructiveHint: true },
      handler: async ({ path, recursive }) => {
        const ws: any = await getWs();
        try {
          await ws.fs.rm(path, { recursive });
          return { content: [{ type: "text", text: `Removed ${path}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "computer_exec",
      description: "Execute shell command in workspace (requires paid Workers plan for backend, currently disabled). Use computer_read/ls for free plan.",
      inputSchema: {
        command: z.string().describe("Shell command e.g. 'cat /notes/todo.md' or 'ls -la /'"),
      },
      annotations: { destructiveHint: false, openWorldHint: false },
      handler: async ({ command }) => {
        const ws: any = await getWs();
        try {
          if (!ws.runtime?.exec) {
            return { content: [{ type: "text", text: "Exec backend not enabled (free plan). File ops work: use computer_write/read/ls/rm. Upgrade to Workers Paid to enable WorkerShellBackend for exec." }] };
          }
          const run: any = await ws.runtime.exec(command);
          const res: any = await run.result();
          const out = res.stdout ?? res.output ?? JSON.stringify(res);
          const err = res.stderr ? `\nSTDERR: ${res.stderr}` : "";
          return { content: [{ type: "text", text: `Exit ${res.exitCode ?? 0}\n${out}${err}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Exec error: ${e.message}. Note: exec needs paid plan.` }] };
        }
      }
    });

    this.registerTool({
      name: "computer_git_clone",
      description: "Git clone a repository into workspace (persistent)",
      inputSchema: {
        url: z.string().describe("Git repo URL e.g. https://github.com/cloudflare/computer"),
        dir: z.string().default("/workspace/repo").describe("Destination dir in workspace"),
      },
      annotations: { destructiveHint: false },
      handler: async ({ url, dir }) => {
        const ws: any = await getWs();
        try {
          // @ts-ignore git client on workspace
          if (ws.git?.clone) {
            await ws.git.clone({ url, dir });
            return { content: [{ type: "text", text: `Cloned ${url} to ${dir}` }] };
          } else {
            // fallback via exec
            const run: any = await ws.runtime.exec(`git clone ${url} ${dir}`);
            const res: any = await run.result();
            return { content: [{ type: "text", text: `git clone exit ${res.exitCode}: ${res.stdout || res.stderr}` }] };
          }
        } catch (e: any) {
          return { content: [{ type: "text", text: `Clone error: ${e.message}` }] };
        }
      }
    });

    // ===== Workers AI (text generation, billed to account, token quota applies) =====
    this.registerTool({
      name: "ai_generate",
      description: "Generate text with Workers AI (default llama-3.1-8b-instruct). Use for summarize, translate, draft, Q&A. Counts against token quota.",
      inputSchema: {
        prompt: z.string().describe("User prompt"),
        system: z.string().optional().describe("System instruction, e.g. 'You are a concise assistant'"),
        model: z.string().default("@cf/meta/llama-3.1-8b-instruct-fast").describe("Workers AI model id"),
        max_tokens: z.number().min(1).max(2048).default(512).describe("Max output tokens"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ prompt, system, model, max_tokens }) => {
        // @ts-ignore env on McpAgent
        const env = (this as any).env as Env;
        if (!env.AI) {
          return { content: [{ type: "text", text: "Workers AI binding not configured. Add \"ai\": {\"binding\": \"AI\"} to wrangler.jsonc and redeploy." }] };
        }
        try {
          const messages = [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ];
          const out = await env.AI.run(model, { messages, max_tokens }) as any;
          const text = out.response ?? out.result ?? JSON.stringify(out);
          return { content: [{ type: "text", text: String(text) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `AI error: ${e.message}. Check model id and Workers AI availability.` }] };
        }
      }
    });

    // ===== R2 Files (per-token isolated prefix: <userId>/<key>) =====
    const r2Key = () => {
      const props = (this as any).props as GatewayProps | undefined;
      const userId = props?.userId || (this as any).name || "anonymous";
      // @ts-ignore env on McpAgent
      const env = (this as any).env as Env;
      return { userId, bucket: env.FILES };
    };
    const cleanKey = (userId: string, key: string) => {
      const k = key.replace(/^\/+/, "");
      if (!k || k.includes("..")) throw new Error("Invalid key: must be a relative path without '..'");
      return `${userId}/${k}`;
    };

    this.registerTool({
      name: "r2_upload",
      description: "Upload text content to R2 (stored under your token prefix, max 512KB per call). Use for reports, exports, shared files.",
      inputSchema: {
        key: z.string().describe("Relative path, e.g. 'reports/weekly.md'"),
        content: z.string().describe("File content (text)"),
        contentType: z.string().default("text/plain; charset=utf-8").describe("MIME type"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      handler: async ({ key, content, contentType }) => {
        const { userId, bucket } = r2Key();
        if (!bucket) return { content: [{ type: "text", text: "R2 binding not configured. Add r2_buckets FILES to wrangler.jsonc and redeploy." }] };
        if (content.length > 512 * 1024) return { content: [{ type: "text", text: "Content too large (max 512KB per call). Split into smaller uploads." }] };
        try {
          const fullKey = cleanKey(userId, key);
          await bucket.put(fullKey, content, { httpMetadata: { contentType } });
          return { content: [{ type: "text", text: JSON.stringify({ key: fullKey, size: content.length }, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Upload failed: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "r2_read",
      description: "Read a text file from R2 (your token prefix, max 256KB returned).",
      inputSchema: { key: z.string().describe("Relative path, e.g. 'reports/weekly.md'") },
      annotations: { readOnlyHint: true },
      handler: async ({ key }) => {
        const { userId, bucket } = r2Key();
        if (!bucket) return { content: [{ type: "text", text: "R2 binding not configured." }] };
        try {
          const obj = await bucket.get(cleanKey(userId, key));
          if (!obj) return { content: [{ type: "text", text: `Not found: ${key}` }] };
          if (obj.size > 256 * 1024) return { content: [{ type: "text", text: `File too large (${obj.size} bytes, max 256KB). Narrow the key or split the file.` }] };
          return { content: [{ type: "text", text: await obj.text() }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Read failed: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "r2_list",
      description: "List files in your R2 prefix.",
      inputSchema: {
        prefix: z.string().default("").describe("Filter by path prefix, e.g. 'reports/'"),
        limit: z.number().min(1).max(100).default(50).describe("Max keys to return"),
      },
      annotations: { readOnlyHint: true },
      handler: async ({ prefix, limit }) => {
        const { userId, bucket } = r2Key();
        if (!bucket) return { content: [{ type: "text", text: "R2 binding not configured." }] };
        try {
          const res = await bucket.list({ prefix: `${userId}/${prefix.replace(/^\/+/, "")}`, limit });
          const files = (res.objects || []).map((o: any) => ({ key: o.key.replace(`${userId}/`, ""), size: o.size, updated: o.uploaded }));
          return { content: [{ type: "text", text: JSON.stringify({ files, truncated: res.truncated }, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `List failed: ${e.message}` }] };
        }
      }
    });

    this.registerTool({
      name: "r2_delete",
      description: "Delete a file from your R2 prefix.",
      inputSchema: { key: z.string().describe("Relative path to delete") },
      annotations: { destructiveHint: true, readOnlyHint: false },
      handler: async ({ key }) => {
        const { userId, bucket } = r2Key();
        if (!bucket) return { content: [{ type: "text", text: "R2 binding not configured." }] };
        try {
          await bucket.delete(cleanKey(userId, key));
          return { content: [{ type: "text", text: `Deleted ${key}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Delete failed: ${e.message}` }] };
        }
      }
    });

    this.registerResource({
      uri: "mcp://private/user/profile",
      name: "private_user_profile",
      description: "Current user profile (private)",
      mimeType: "application/json",
      handler: async (uri) => ({
        contents: [{ text: JSON.stringify({
          id: (this as any).name || "unknown", gateway: "private", connectedAt: new Date().toISOString()
        }, null, 2), uri: uri.href }]
      })
    });
  }
}
