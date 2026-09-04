# MCP Gateway 智能体使用指南 (Agent Guide)

> 给智能体（Hermes / Claude / Cursor / OpenCode 等）阅读的文档。
> 你只需要把这个文件丢给智能体，说：“读这个文档，按里面的方式调用 MCP”。

---

## 1. 网关信息

| 项目 | 值 |
|------|-----|
| **网关名称** | MCP Gateway |
| **版本** | 1.0.0 |
| **协议** | Model Context Protocol (MCP) - Streamable HTTP |
| **公开端点** | `https://mcp.2020224.xyz/mcp/public` |
| **私有端点** | `https://mcp.2020224.xyz/mcp/private` |
| **备用域名** | `https://mcp-gateway.harveyme.workers.dev/mcp/public` |
| **健康检查** | `https://mcp.2020224.xyz/health` |

- `public`：无需鉴权，任何智能体可直接用
- `private`：需鉴权，后续会加 OAuth/Bearer Token

---

## 2. 给 Hermes 的一句话指令

复制下面这段发给 Hermes：

```
请读取 https://raw.githubusercontent.com/HarveyJiang/mcp-gateway/main/AGENT_GUIDE.md
然后使用 MCP Gateway 的公开端点 https://mcp.2020224.xyz/mcp/public
用 Streamable HTTP 方式调用工具。你需要：
1. 先 initialize 拿到 mcp-session-id
2. 再调用 tools/list 查看可用工具
3. 按需调用 public_get_time 等工具
文档里有完整 curl 和 SDK 示例，直接照做。
```

或者本地路径：
```
请读取 /home/openchamber/workspaces/src/mcp-gateway/AGENT_GUIDE.md 并按文档调用 MCP
```

---

## 3. 连接方式

### 3.1 MCP Inspector（可视化调试，最推荐新手）
```bash
npx @modelcontextprotocol/inspector https://mcp.2020224.xyz/mcp/public
```
1. 点 Connect
2. List Tools
3. 选 `public_get_time` 填参调用

### 3.2 标准 MCP 客户端 (TypeScript SDK)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "hermes", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("https://mcp.2020224.xyz/mcp/public"))
);

// 查看工具
const { tools } = await client.listTools();
console.log(tools.map(t => t.name)); // gateway_list_tools, public_get_time ...

// 调用 public_get_time
const result = await client.callTool({
  name: "public_get_time",
  arguments: { timezone: "Asia/Shanghai" }
});
console.log(result.content[0].text);
// -> {"timezone":"Asia/Shanghai","time":"9/4/2026, 5:56:54 PM"}
```

### 3.3 curl（底层 JSON-RPC，了解原理）

```bash
# Step 1: initialize 拿 session id
curl -s -D /tmp/h.txt -X POST https://mcp.2020224.xyz/mcp/public \
 -H "Content-Type: application/json" \
 -H "Accept: application/json, text/event-stream" \
 -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hermes","version":"1.0.0"}}}'

SID=$(grep -i "^mcp-session-id:" /tmp/h.txt | awk '{print $2}' | tr -d '\r')
echo $SID # 记住这个 id，后续请求都要带

# Step 2: 列工具
curl -s -X POST https://mcp.2020224.xyz/mcp/public \
 -H "Content-Type: application/json" \
 -H "Accept: application/json, text/event-stream" \
 -H "Mcp-Session-Id: $SID" \
 -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Step 3: 调 public_get_time
curl -s -X POST https://mcp.2020224.xyz/mcp/public \
 -H "Content-Type: application/json" \
 -H "Accept: application/json, text/event-stream" \
 -H "Mcp-Session-Id: $SID" \
 -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"public_get_time","arguments":{"timezone":"Asia/Shanghai"}}}'
```

**必带头**：
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`
- `Mcp-Session-Id: <initialize返回的id>`（首次 initialize 除外）

---

## 4. 公开工具清单 (public)

### 4.1 public_get_time — 获取指定时区当前时间
- **描述**：Get current time for a timezone
- **inputSchema**：
```json
{
  "timezone": { "type": "string", "default": "UTC", "description": "IANA timezone (e.g., America/New_York, Asia/Shanghai)" }
}
```
- **调用示例**：
```json
{ "name": "public_get_time", "arguments": { "timezone": "Asia/Shanghai" } }
```
- **返回**：
```json
{ "timezone": "Asia/Shanghai", "time": "9/4/2026, 5:56:54 PM" }
```
- **常用时区**：`Asia/Shanghai`, `Asia/Tokyo`, `America/New_York`, `Europe/London`, `UTC`

### 4.2 public_generate_uuid — 生成随机 UUID
- **inputSchema**：
```json
{ "count": { "type": "number", "minimum": 1, "maximum": 100, "default": 1 } }
```
- **示例**：`{"name":"public_generate_uuid","arguments":{"count":2}}`
- **返回**：`["550e8400-...","6ba7b810-..."]`

### 4.3 public_get_weather — 天气演示（后续接真实 API）
- **inputSchema**：
```json
{
  "location": { "type": "string", "description": "City name or coordinates" },
  "units": { "type": "string", "enum": ["metric","imperial"], "default": "metric" }
}
```
- **示例**：`{"name":"public_get_weather","arguments":{"location":"Beijing","units":"metric"}}`

### 4.4 gateway_* — 网关元信息
- `gateway_list_tools`：列出本网关所有工具（无参）
- `gateway_list_resources`：列出所有资源（无参）
- `gateway_info`：返回网关配置和工具数量（无参）

---

## 5. 私有工具清单 (private) — `https://mcp.2020224.xyz/mcp/private`

> 需鉴权，公开测试会返回 401/403，后续会开放 Token。

| 工具 | 说明 | 参数 |
|------|------|------|
| `private_echo` | 回显消息 | `message: string`, `prefix: string (default "[PRIVATE]")` |
| `private_get_config` | 获取私有网关配置 | 无 |
| `private_set_config` | 更新配置（管理员） | `allowedTools?: string[]`, `rateLimit?: {requestsPerMinute?, requestsPerHour?}` |
| 资源 `mcp://private/user/profile` | 当前用户 profile | 无 |

---

## 6. 智能体完整工作流（照抄即可）

```
智能体收到用户请求 -> 判断是否需要时间/UUID/天气 -> 按以下步骤执行：

1. 连接：client.connect("https://mcp.2020224.xyz/mcp/public")
2. 发现：client.listTools()  → 确认 public_get_time 存在
3. 调用：client.callTool({name:"public_get_time", arguments:{timezone:"Asia/Shanghai"}})
4. 解析：result.content[0].text 是 JSON 字符串，JSON.parse 后取 time 字段
5. 回答：把时间用自然语言返回给用户
```

**错误处理**：
- 如果返回 `Session not found` → 重新 initialize 拿新 SID
- 如果返回 `Invalid timezone` → 提示用户用 IANA 时区格式
- 网络超时 → 重试，最多 3 次

---

## 7. 给各种客户端的配置

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "mcp-gateway-public": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.2020224.xyz/mcp/public"]
    }
  }
}
```

### Cursor / Windsurf / OpenCode  (.cursor/mcp.json)
```json
{
  "mcpServers": {
    "mcp-gateway": {
      "url": "https://mcp.2020224.xyz/mcp/public",
      "transport": "streamable-http"
    }
  }
}
```

### 通用 mcp.json
```json
{
  "mcpServers": {
    "public": { "url": "https://mcp.2020224.xyz/mcp/public", "transport": "http" },
    "private": { "url": "https://mcp.2020224.xyz/mcp/private", "transport": "http" }
  }
}
```

---

## 8. 常见问题

**Q: 为什么 curl 直接调 tools/call 返回 Session not found？**
A: Streamable HTTP 必须先调 `initialize` 拿 `mcp-session-id`，后续请求都要带这个头。

**Q: Hermes 怎么知道何时调哪个工具？**
A: 告诉它：“当用户问时间、时区、现在几点，就调 public_get_time；当需要唯一 ID 就调 public_generate_uuid”。写在 system prompt 里。

**Q: 私有工具怎么用？**
A: 目前私有端点未开鉴权，公开调用会失败。后续会提供 Bearer Token，在 Header 加 `Authorization: Bearer <token>` 即可。

**Q: 如何扩展新服务？**
A: 在 `src/mcp-gateway.ts` 的 `registerPublicServices()` 加 `this.registerTool({...})`，重新 `wrangler deploy` 即可，智能体下次 `tools/list` 就能看到新工具。

---

## 9. 维护者

- GitHub: https://github.com/HarveyJiang/mcp-gateway
- Worker: https://mcp-gateway.harveyme.workers.dev
- 自定义域名: https://mcp.2020224.xyz
- 健康检查: `curl https://mcp.2020224.xyz/health`

> 最后更新：2026-09-04
