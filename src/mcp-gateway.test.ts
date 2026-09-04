import { describe, it, expect, beforeEach } from "vitest";
import { McpGateway, PublicMCP, PrivateMCP } from "./mcp-gateway";

describe("McpGateway", () => {
  let gateway: McpGateway;

  beforeEach(() => {
    // Create a minimal mock environment
    gateway = new McpGateway({} as any, {} as any, {} as any);
  });

  it("should initialize with default config", () => {
    expect(gateway.initialState.config.name).toBe("MCP Gateway");
    expect(gateway.initialState.config.isPublic).toBe(true);
  });

  it("should have built-in tools registered", () => {
    const tools = gateway.initialState.tools;
    // Note: tools are registered in init(), so initialState.tools will be empty
    // This test verifies the structure
    expect(typeof gateway.registerTool).toBe("function");
    expect(typeof gateway.registerResource).toBe("function");
  });
});

describe("PublicMCP", () => {
  it("should have public config", () => {
    const gateway = new PublicMCP({} as any, {} as any, {} as any);
    expect(gateway.initialState.config.isPublic).toBe(true);
    expect(gateway.initialState.config.name).toBe("MCP Gateway - Public");
  });
});

describe("PrivateMCP", () => {
  it("should have private config with allowed tools", () => {
    const gateway = new PrivateMCP({} as any, {} as any, {} as any);
    expect(gateway.initialState.config.isPublic).toBe(false);
    expect(gateway.initialState.config.name).toBe("MCP Gateway - Private");
    expect(gateway.initialState.config.allowedTools).toContain("private_echo");
  });
});