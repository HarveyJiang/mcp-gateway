import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodRawShape, ZodObject } from "zod";
import type { Env } from "./index";
import { getUserWorkspace } from "./workspace";

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
      allowedTools: ["private_echo", "private_get_config", "private_set_config", "computer_write", "computer_read", "computer_ls", "computer_rm", "computer_exec", "computer_git_clone", "computer_mkdir"],
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
