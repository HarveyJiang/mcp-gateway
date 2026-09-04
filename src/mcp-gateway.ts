import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

export interface GatewayState {
  tools: Map<string, ToolDefinition>;
  resources: Map<string, ResourceDefinition>;
  config: GatewayConfig;
}

export interface GatewayConfig {
  name: string;
  version: string;
  description: string;
  isPublic: boolean;
  allowedTools?: string[];  // For private: list of allowed tool names
  rateLimit?: RateLimitConfig;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
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

export class McpGateway extends McpAgent<Env, GatewayState, {}> {
  server = new McpServer({
    name: "MCP Gateway",
    version: "1.0.0"
  });

  initialState: GatewayState = {
    tools: new Map(),
    resources: new Map(),
    config: {
      name: "MCP Gateway",
      version: "1.0.0",
      description: "Unified MCP Gateway for public and private services",
      isPublic: true
    }
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  async init(): Promise<void> {
    // Load configuration from state or use defaults
    const config = this.state.config;
    
    // Register built-in tools
    this.registerBuiltinTools();
    
    // Register built-in resources
    this.registerBuiltinResources();

    // Custom initialization hook
    await this.onInit(config);
  }

  protected async onInit(config: GatewayConfig): Promise<void> {
    // Override in subclasses for custom initialization
  }

  // ============================================================================
  // Built-in Tools
  // ============================================================================

  private registerBuiltinTools(): void {
    // List all available tools
    this.server.registerTool(
      "gateway_list_tools",
      {
        description: "List all available tools in this gateway",
        inputSchema: {}
      },
      async () => {
        const tools = Array.from(this.state.tools.entries()).map(([name, def]) => ({
          name,
          description: def.description,
          inputSchema: def.inputSchema,
          annotations: def.annotations
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(tools, null, 2) }]
        };
      }
    );

    // List all available resources
    this.server.registerTool(
      "gateway_list_resources",
      {
        description: "List all available resources in this gateway",
        inputSchema: {}
      },
      async () => {
        const resources = Array.from(this.state.resources.entries()).map(([uri, def]) => ({
          uri,
          name: def.name,
          description: def.description,
          mimeType: def.mimeType
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(resources, null, 2) }]
        };
      }
    );

    // Gateway info
    this.server.registerTool(
      "gateway_info",
      {
        description: "Get gateway configuration and status",
        inputSchema: {}
      },
      async () => {
        const config = this.state.config;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              name: config.name,
              version: config.version,
              description: config.description,
              isPublic: config.isPublic,
              toolCount: this.state.tools.size,
              resourceCount: this.state.resources.size
            }, null, 2)
          }]
        };
      }
    );
  }

  // ============================================================================
  // Built-in Resources
  // ============================================================================

  private registerBuiltinResources(): void {
    this.server.resource(
      "gateway:config",
      "mcp://gateway/config",
      async (uri) => ({
        contents: [{
          text: JSON.stringify(this.state.config, null, 2),
          uri: uri.href
        }]
      })
    );

    this.server.resource(
      "gateway:tools",
      "mcp://gateway/tools",
      async (uri) => ({
        contents: [{
          text: JSON.stringify(Array.from(this.state.tools.keys()), null, 2),
          uri: uri.href
        }]
      })
    );
  }

  // ============================================================================
  // Public API for Registering Tools/Resources
  // ============================================================================

  /**
   * Register a new tool (can be called from init or dynamically)
   */
  protected registerTool(def: ToolDefinition): void {
    if (this.state.tools.has(def.name)) {
      throw new Error(`Tool ${def.name} already registered`);
    }
    this.state.tools.set(def.name, def);

    this.server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema
      },
      async (args) => {
        // Check if tool is allowed (for private gateway)
        if (!this.state.config.isPublic && this.state.config.allowedTools) {
          if (!this.state.config.allowedTools.includes(def.name)) {
            throw new Error(`Tool ${def.name} not allowed in private gateway`);
          }
        }
        return def.handler(args);
      }
    );
  }

  /**
   * Register a new resource
   */
  protected registerResource(def: ResourceDefinition): void {
    if (this.state.resources.has(def.uri)) {
      throw new Error(`Resource ${def.uri} already registered`);
    }
    this.state.resources.set(def.uri, def);

    this.server.resource(
      def.name,
      def.uri,
      async (uri) => {
        return def.handler(uri);
      }
    );
  }

  /**
   * Update gateway configuration
   */
  protected updateConfig(config: Partial<GatewayConfig>): void {
    this.setState({
      config: { ...this.state.config, ...config }
    });
  }

  /**
   * Get current gateway configuration
   */
  protected getConfig(): GatewayConfig {
    return this.state.config;
  }
}

// ============================================================================
// Public MCP Gateway (Open Access)
// ============================================================================

export class PublicMCP extends McpGateway {
  initialState: GatewayState = {
    tools: new Map(),
    resources: new Map(),
    config: {
      name: "MCP Gateway - Public",
      version: "1.0.0",
      description: "Public MCP services accessible to all",
      isPublic: true,
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000
      }
    }
  };

  protected async onInit(config: GatewayConfig): Promise<void> {
    // Register public services here
    // Example: public APIs, open data, etc.
    await this.registerPublicServices();
  }

  private async registerPublicServices(): Promise<void> {
    // Example: Weather service
    this.registerTool({
      name: "public_get_weather",
      description: "Get current weather for a location (public demo)",
      inputSchema: {
        location: z.string().describe("City name or coordinates"),
        units: z.enum(["metric", "imperial"]).default("metric").describe("Temperature units")
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async ({ location, units }) => {
        // In production, call actual weather API
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              location,
              temperature: units === "metric" ? 22 : 72,
              condition: "Sunny",
              units,
              source: "demo"
            }, null, 2)
          }]
        };
      }
    });

    // Example: Time service
    this.registerTool({
      name: "public_get_time",
      description: "Get current time for a timezone",
      inputSchema: {
        timezone: z.string().default("UTC").describe("IANA timezone (e.g., America/New_York)")
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
      handler: async ({ timezone }) => {
        try {
          const time = new Date().toLocaleString("en-US", { timeZone: timezone });
          return {
            content: [{ type: "text", text: JSON.stringify({ timezone, time }, null, 2) }]
          };
        } catch {
          return {
            content: [{ type: "text", text: `Invalid timezone: ${timezone}` }]
          };
        }
      }
    });

    // Example: UUID generator
    this.registerTool({
      name: "public_generate_uuid",
      description: "Generate a random UUID",
      inputSchema: {
        count: z.number().min(1).max(100).default(1).describe("Number of UUIDs to generate")
      },
      annotations: { readOnlyHint: true, idempotentHint: false },
      handler: async ({ count }) => {
        const uuids = Array.from({ length: count }, () => crypto.randomUUID());
        return {
          content: [{ type: "text", text: JSON.stringify(uuids, null, 2) }]
        };
      }
    });
  }
}

// ============================================================================
// Private MCP Gateway (Authenticated Access)
// ============================================================================

export class PrivateMCP extends McpGateway {
  initialState: GatewayState = {
    tools: new Map(),
    resources: new Map(),
    config: {
      name: "MCP Gateway - Private",
      version: "1.0.0",
      description: "Private MCP services for authenticated users",
      isPublic: false,
      allowedTools: [
        "private_echo",
        "private_get_config",
        "private_set_config"
      ],
      rateLimit: {
        requestsPerMinute: 300,
        requestsPerHour: 10000
      }
    }
  };

  protected async onInit(config: GatewayConfig): Promise<void> {
    await this.registerPrivateServices();
  }

  private async registerPrivateServices(): Promise<void> {
    // Example: Echo service (for testing)
    this.registerTool({
      name: "private_echo",
      description: "Echo back the input message (private)",
      inputSchema: {
        message: z.string().describe("Message to echo"),
        prefix: z.string().default("[PRIVATE]").describe("Prefix to add")
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
      handler: async ({ message, prefix }) => {
        return {
          content: [{ type: "text", text: `${prefix} ${message}` }]
        };
      }
    });

    // Example: Configuration management
    this.registerTool({
      name: "private_get_config",
      description: "Get private gateway configuration",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      handler: async () => {
        return {
          content: [{ type: "text", text: JSON.stringify(this.state.config, null, 2) }]
        };
      }
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
        if (rateLimit) updates.rateLimit = { ...this.state.config.rateLimit, ...rateLimit };
        
        this.updateConfig(updates);
        
        return {
          content: [{ type: "text", text: "Configuration updated successfully" }]
        };
      }
    });

    // Private resource: user profile
    this.registerResource({
      uri: "mcp://private/user/profile",
      name: "private_user_profile",
      description: "Current user profile (private)",
      mimeType: "application/json",
      handler: async (uri) => ({
        contents: [{
          text: JSON.stringify({
            id: this.name, // Durable Object instance name as user ID
            gateway: "private",
            connectedAt: new Date().toISOString()
          }, null, 2),
          uri: uri.href
        }]
      })
    });
  }
}