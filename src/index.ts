import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { McpGateway } from "./mcp-gateway";

export interface Env {
  PublicMCP: DurableObjectNamespace<McpGateway>;
  PrivateMCP: DurableObjectNamespace<McpGateway>;
}

export { McpGateway } from "./mcp-gateway";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Public MCP endpoint (no auth required)
    if (url.pathname.startsWith("/mcp/public")) {
      return McpGateway.serve("/mcp/public", { binding: "PublicMCP" }).fetch(request, env, ctx);
    }

    // Private MCP endpoint (requires auth)
    if (url.pathname.startsWith("/mcp/private")) {
      return McpGateway.serve("/mcp/private", { binding: "PrivateMCP" }).fetch(request, env, ctx);
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "mcp-gateway" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // API info
    if (url.pathname === "/") {
      return new Response(JSON.stringify({
        name: "MCP Gateway",
        version: "1.0.0",
        endpoints: {
          public: "/mcp/public",
          private: "/mcp/private",
          health: "/health"
        }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};