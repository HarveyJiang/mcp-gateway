# MCP Gateway

A Cloudflare Workers-based MCP (Model Context Protocol) Gateway that provides both **public** and **private** MCP services. Built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) for durable, stateful MCP servers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Gateway                             │
├──────────────────────────┬──────────────────────────────────┤
│      Public MCP          │         Private MCP               │
│      (No Auth Required)  │      (Authenticated Access)       │
├──────────────────────────┼──────────────────────────────────┤
│  /mcp/public             │  /mcp/private                     │
│  - Weather API           │  - Internal tools                 │
│  - Time service          │  - Config management              │
│  - UUID generator        │  - User profiles                  │
│  - Custom public tools   │  - Private resources              │
└──────────────────────────┴──────────────────────────────────┘
```

## Features

- **Dual Access Modes**: Public (open) and Private (authenticated) MCP endpoints
- **Durable Objects**: Stateful MCP servers with persistent storage via SQLite
- **Streamable HTTP Transport**: Modern MCP transport for external clients
- **Rate Limiting**: Configurable per-gateway rate limits
- **Tool/Resource Registry**: Dynamic registration of tools and resources
- **TypeScript**: Full type safety with Zod schema validation
- **Cloudflare Workers**: Edge deployment with global distribution

## Endpoints

| Endpoint | Access | Description |
|----------|--------|-------------|
| `/mcp/public` | Public | Streamable HTTP MCP endpoint for public services |
| `/mcp/private` | Private | Streamable HTTP MCP endpoint for private services |
| `/health` | Public | Health check endpoint |
| `/` | Public | API information |

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- Wrangler CLI: `npm install -g wrangler`

### Installation

```bash
cd mcp-gateway
npm install
```

### Development

```bash
# Start local development server
npm run dev

# In another terminal, test with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:8787/mcp/public
```

### Deployment

```bash
# Login to Cloudflare (first time only)
wrangler login

# Deploy to Cloudflare Workers
npm run deploy
```

## Configuration

### Environment Variables

Configure via `wrangler.jsonc` or Cloudflare dashboard:

```jsonc
{
  "vars": {
    "PUBLIC_RATE_LIMIT_RPM": "60",
    "PUBLIC_RATE_LIMIT_RPH": "1000",
    "PRIVATE_RATE_LIMIT_RPM": "300",
    "PRIVATE_RATE_LIMIT_RPH": "10000"
  }
}
```

### Customizing Public Services

Edit `src/mcp-gateway.ts` in the `PublicMCP.registerPublicServices()` method:

```typescript
this.registerTool({
  name: "public_my_service",
  description: "My custom public service",
  inputSchema: {
    param: z.string().describe("Description")
  },
  handler: async ({ param }) => {
    // Call your API
    const result = await fetch(`https://api.example.com/${param}`);
    return { content: [{ type: "text", text: await result.text() }] };
  }
});
```

### Customizing Private Services

Edit `src/mcp-gateway.ts` in the `PrivateMCP.registerPrivateServices()` method. Private services require authentication (configure OAuth via `@cloudflare/workers-oauth-provider`).

## Adding New Services

### 1. Create a Service Module

```typescript
// src/services/my-service.ts
import { ToolDefinition } from "../mcp-gateway";

export function createMyServiceTools(): ToolDefinition[] {
  return [
    {
      name: "my_service_action",
      description: "Perform an action",
      inputSchema: { input: z.string() },
      handler: async ({ input }) => {
        // Your logic here
        return { content: [{ type: "text", text: `Result: ${input}` }] };
      }
    }
  ];
}
```

### 2. Register in Gateway

```typescript
// In PublicMCP or PrivateMCP onInit()
import { createMyServiceTools } from "./services/my-service";

private async registerPublicServices(): Promise<void> {
  // ... existing tools
  
  for (const tool of createMyServiceTools()) {
    this.registerTool(tool);
  }
}
```

## Authentication (Private Gateway)

The private gateway requires authentication. Set up OAuth with `@cloudflare/workers-oauth-provider`:

```bash
npm install @cloudflare/workers-oauth-provider
```

Configure in `wrangler.jsonc`:

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "PublicMCP", "class_name": "PublicMCP" },
      { "name": "PrivateMCP", "class_name": "PrivateMCP" },
      { "name": "OAuthProvider", "class_name": "OAuthProvider" }
    ]
  }
}
```

See [Cloudflare MCP Security Docs](https://developers.cloudflare.com/agents/api-reference/securing-mcp-servers/) for complete OAuth setup.

## Testing

### Unit Tests

```bash
npm test
```

### MCP Inspector

```bash
# Test public endpoint
npx @modelcontextprotocol/inspector http://localhost:8787/mcp/public

# Test private endpoint (requires auth)
npx @modelcontextprotocol/inspector http://localhost:8787/mcp/private
```

### Manual Testing

```bash
# Health check
curl https://your-worker.workers.dev/health

# List public tools
curl -X POST https://your-worker.workers.dev/mcp/public \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call public tool
curl -X POST https://your-worker.workers.dev/mcp/public \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"public_get_time","arguments":{"timezone":"America/New_York"}}}'
```

## Project Structure

```
mcp-gateway/
├── src/
│   ├── index.ts              # Worker entry point
│   ├── mcp-gateway.ts        # Core gateway classes (PublicMCP, PrivateMCP)
│   ├── mcp-gateway.test.ts   # Unit tests
│   └── services/             # Custom service modules (add your own)
├── wrangler.jsonc            # Cloudflare Workers config
├── tsconfig.json             # TypeScript config
├── package.json              # Dependencies
└── README.md                 # This file
```

## Built-in Tools

### Public Gateway

| Tool | Description |
|------|-------------|
| `gateway_list_tools` | List all available tools |
| `gateway_list_resources` | List all available resources |
| `gateway_info` | Get gateway configuration |
| `public_get_weather` | Get weather (demo) |
| `public_get_time` | Get current time for timezone |
| `public_generate_uuid` | Generate random UUIDs |

### Private Gateway

| Tool | Description |
|------|-------------|
| `gateway_list_tools` | List all available tools |
| `gateway_list_resources` | List all available resources |
| `gateway_info` | Get gateway configuration |
| `private_echo` | Echo message with prefix |
| `private_get_config` | Get private gateway config |
| `private_set_config` | Update gateway config (admin) |

## Built-in Resources

| Resource URI | Description |
|--------------|-------------|
| `mcp://gateway/config` | Gateway configuration |
| `mcp://gateway/tools` | List of tool names |
| `mcp://private/user/profile` | Current user profile (private) |

## Extending for Your Services

This gateway is designed as a **framework** for wrapping common services as MCP tools. Examples of services to add:

- **Database Access**: D1, R2, Hyperdrive queries
- **API Integrations**: GitHub, Slack, Notion, Linear
- **AI Services**: Workers AI, Vectorize, AI Gateway
- **Infrastructure**: Cloudflare API, Terraform, Kubernetes
- **Internal Tools**: Custom business logic, admin functions

Each service becomes a set of MCP tools registered in either the public or private gateway.

## License

MIT