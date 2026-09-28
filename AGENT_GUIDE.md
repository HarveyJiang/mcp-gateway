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
| **公开端点** | `https://mcp.2020224.xyz/mcp/public` (无需鉴权) |
| **私有端点** | `https://mcp.2020224.xyz/mcp/private` (需 Bearer Token) |
| **备用域名** | `https://mcp-gateway.harveyme.workers.dev/mcp/*` |
| **健康检查** | `https://mcp.2020224.xyz/health` |

- `public`：公开，任何智能体可直接用，适合通用技能
- `private`：付费/私有，需 `Authorization: Bearer mcp_sk_...`，支持按 token 限 scopes/quota/限流

---

## 2. 给 Hermes 的一句话指令

**调公开服务（无需 token）：**
```
请读取 https://raw.githubusercontent.com/HarveyJiang/mcp-gateway/main/AGENT_GUIDE.md
然后使用 MCP Gateway 公开端点 https://mcp.2020224.xyz/mcp/public
用 Streamable HTTP 先 initialize 拿 mcp-session-id，再 tools/list 和 tools/call，文档里有完整示例。
```

**调私有/付费服务（需 token）：**
```
请读取 https://raw.githubusercontent.com/HarveyJiang/mcp-gateway/main/AGENT_GUIDE.md
私有端点是 https://mcp.2020224.xyz/mcp/private，需在所有请求头加 Authorization: Bearer mcp_sk_xxx
token 已给你：mcp_sk_xxx。按文档第3.4节方式连接，scopes 决定你能调哪些 private_* 工具。
```

本地路径：`请读取 /home/openchamber/workspaces/src/mcp-gateway/AGENT_GUIDE.md 并按文档调用 MCP`

---

## 3. 连接方式

### 3.1 MCP Inspector（可视化，最推荐）
```bash
# 公开
npx @modelcontextprotocol/inspector https://mcp.2020224.xyz/mcp/public
# 私有需加 header（Inspector -> Headers 填 Authorization: Bearer mcp_sk_xxx）
npx @modelcontextprotocol/inspector https://mcp.2020224.xyz/mcp/private
```
1. 点 Connect 2. List Tools 3. 选工具填参调用

### 3.2 标准 MCP 客户端 (TypeScript SDK) — Hermes 推荐

**公开（无鉴权）：**
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const client = new Client({ name: "hermes", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("https://mcp.2020224.xyz/mcp/public")));
console.log(await client.listTools()); // 能看到 public_get_time 等
console.log(await client.callTool({ name: "public_get_time", arguments: { timezone: "Asia/Shanghai" }}));
```

**私有（需 Bearer）：**
```typescript
const client2 = new Client({ name: "hermes", version: "1.0.0" });
await client2.connect(new StreamableHTTPClientTransport(
  new URL("https://mcp.2020224.xyz/mcp/private"),
  { requestInit: { headers: { Authorization: "Bearer mcp_sk_xxx" } } }
));
// 或用 X-API-Token 头： { "X-API-Token": "mcp_sk_xxx" }
await client2.callTool({ name: "private_echo", arguments: { message: "hello" }});
```

### 3.3 curl（底层 JSON-RPC）

**公开：**
```bash
curl -s -D /tmp/h.txt -X POST https://mcp.2020224.xyz/mcp/public \
 -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
 -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hermes","version":"1.0.0"}}}'
SID=$(grep -i "^mcp-session-id:" /tmp/h.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST https://mcp.2020224.xyz/mcp/public \
 -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Mcp-Session-Id: $SID" \
 -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
curl -s -X POST https://mcp.2020224.xyz/mcp/public \
 -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Mcp-Session-Id: $SID" \
 -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"public_get_time","arguments":{"timezone":"Asia/Shanghai"}}}'
```

**私有（多一个 Authorization 头）：**
```bash
TOKEN="mcp_sk_xxx"
curl -s -D /tmp/h.txt -X POST https://mcp.2020224.xyz/mcp/private \
 -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hermes","version":"1.0.0"}}}'
SID=$(grep -i "^mcp-session-id:" /tmp/h.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST https://mcp.2020224.xyz/mcp/private \
 -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
 -H "Authorization: Bearer $TOKEN" -H "Mcp-Session-Id: $SID" \
 -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"private_echo","arguments":{"message":"hello hermes"}}}'
```

必带头：`Content-Type`, `Accept: application/json, text/event-stream`, `Mcp-Session-Id`（initialize 后），私有再加 `Authorization: Bearer mcp_sk_...`（也支持 `X-API-Token` 或 `?token=`）

### 3.4 获取 Token（付费/私有）

```bash
# 管理员创建 token（ADMIN_TOKEN 在 wrangler.jsonc 的 vars 里）
curl -X POST https://mcp.2020224.xyz/admin/tokens \
 -H "Content-Type: application/json" -H "X-Admin-Token: e642b8bf2309a20fb040e059095d065b" \
 -d '{"name":"hermes-prod","plan":"pro","scopes":["private_echo","private_get_config"],"quota":100000}'

# 返回 {"token":"mcp_sk_...","prefix":"mcp_sk_...","id":"..."}  token只显示一次！

# 查所有 token
curl https://mcp.2020224.xyz/admin/tokens -H "X-Admin-Token: e642b8bf..."

# 吊销
curl -X DELETE https://mcp.2020224.xyz/admin/tokens/<id> -H "X-Admin-Token: e642b8bf..."

# 客户端自检 token 是否有效
curl -X POST https://mcp.2020224.xyz/auth/verify -H "Content-Type: application/json" -d '{"token":"mcp_sk_xxx"}'
```

`scopes`: `["private_echo"]` 限定只能调该工具，`["*"]` 或 `[]` 表示全部。`plan`: `free` (quota 1000, 60/min) / `pro` (100k, 300/min) 可自定义 `quota/rateLimitRpm/rateLimitRph`

---

## 4. 公开工具清单 (public)

### public_get_time — 指定时区当前时间
- input: `{ timezone: string default UTC (IANA e.g. Asia/Shanghai) }`
- 示例: `{"name":"public_get_time","arguments":{"timezone":"Asia/Shanghai"}}`
- 返回: `{"timezone":"Asia/Shanghai","time":"9/4/2026, 5:56:54 PM"}`

### public_generate_uuid — 生成 UUID
- input: `{ count: number 1-100 default 1 }`
- 返回: `["550e8400-..."]`

### public_get_weather — 天气演示
- input: `{ location: string, units: "metric"|"imperial" }`

### public_github_search — 搜公开 GitHub 仓库
- input: `{ query: string, per_page: 1-20 default 5, sort: stars|forks|updated, language?: string }`
- 示例: `{"name":"public_github_search","arguments":{"query":"mcp server","per_page":5}}`
- 返回: `{total, repos:[{name, description, stars, language, url}]}`，无 token 时限流 10 次/分钟

### public_shorten_url / public_expand_url — 短链生成与还原
- 生成 input: `{ url: "https://..." }`，返回 `{shortUrl, code, original}`，与 shorten.2020224.xyz 网站同款后端
- 还原 input: `{ code: "X5FRtq" 或完整短链 }`，返回 `{code, target}`，不实际跳转
- 示例: `{"name":"public_shorten_url","arguments":{"url":"https://example.com/long"}}`

### public_chengdu_hospitals — 成都医院名录（66家三甲，56公立/10民营）
- input: `{ level: 三级甲等|三级乙等|二级甲等|二级乙等|全部, ownership: 公立|民营|全部, district: 武侯区|双流区|简阳市...|全部, category: 综合|中医类|妇幼专科|口腔专科...|全部, keyword?, limit }`
- 示例: `{"name":"public_chengdu_hospitals","arguments":{"ownership":"民营"}}`
- 返回按等级分组 `{total, byLevel}`，多院区医院会在其服务的每个区都出现；v1仅收录三级甲等，二级及以下补充中

### gateway_* — 元信息
- `gateway_list_tools` / `gateway_list_resources` / `gateway_info` 均无参

---

## 5. 私有工具清单 (private) — `https://mcp.2020224.xyz/mcp/private` 需 Bearer

| 工具 | 说明 | 参数 | 所需 scope |
|------|------|------|------------|
| `private_echo` | 回显 | `message: string`, `prefix: string default "[PRIVATE]"` | `private_echo` 或 `*` |
| `private_get_config` | 查私有网关配置 | 无 | `private_get_config` |
| `private_set_config` | 改配置（管理员）| `allowedTools?: string[]`, `rateLimit?: {requestsPerMinute?, requestsPerHour?}` | `private_set_config` |
| `ai_generate` | Workers AI 文本生成（总结翻译问答，计 quota）| `prompt: string`, `system?: string`, `model default llama-3.1-8b-fast`, `max_tokens default 512` | `ai_generate` 或 `*` |
| `r2_upload` | R2 上传文本（上限 512KB/次）| `key: "reports/weekly.md"`, `content`, `contentType?` | `r2_upload` 或 `*` |
| `r2_read` | R2 读取文本（上限 256KB）| `key` | `r2_read` 或 `*` |
| `r2_list` | R2 按前缀列文件 | `prefix?`, `limit default 50` | `r2_list` 或 `*` |
| `r2_delete` | R2 删除文件 | `key` | `r2_delete` 或 `*` |
| 资源 `mcp://private/user/profile` | 当前用户 profile | 无 | 任意有效 token |

> R2 的 key 按 token 隔离（实际存为 `<userId>/<key>`），不同 token 互不可见。

> token 的 scopes 决定能调什么，调不在 scopes 里的会返回 `isError: true, "Tool ... not in token scopes"`

---

## 6. 智能体工作流

```
用户问时间 -> Hermes:
1. connect("https://mcp.2020224.xyz/mcp/public")
2. listTools() 确认 public_get_time 存在
3. callTool({name:"public_get_time", arguments:{timezone:"Asia/Shanghai"}})
4. JSON.parse(result.content[0].text).time -> 自然语言回答

用户要调私有 -> Hermes:
1. connect("https://mcp.2020224.xyz/mcp/private", {headers:{Authorization:"Bearer mcp_sk_xxx"}})
2. listTools()
3. callTool({name:"private_echo", arguments:{message:"hello"}})
4. 若 401 -> 提示 token 无效/过期；若 429 -> 提示 quota/限流
```

错误：
- `Session not found` → 重新 initialize 拿新 SID
- `Unauthorized` → 检查 Authorization 头
- `quota exceeded` / `rate limited` → 等待或升级 plan
- `Invalid timezone` → 用 IANA 格式

---

## 7. 客户端配置

**Claude Desktop (公开):**
```json
{ "mcpServers": { "mcp-gateway-public": { "command": "npx", "args": ["-y", "mcp-remote", "https://mcp.2020224.xyz/mcp/public"] } } }
```
**Claude Desktop (私有需 token，需 mcp-remote 支持 headers):**
```json
{ "mcpServers": { "mcp-gateway-private": { "command": "npx", "args": ["-y", "mcp-remote", "https://mcp.2020224.xyz/mcp/private", "--header", "Authorization: Bearer mcp_sk_xxx"] } } }
```

**Cursor / OpenCode (.cursor/mcp.json):**
```json
{
  "mcpServers": {
    "public": { "url": "https://mcp.2020224.xyz/mcp/public", "transport": "streamable-http" },
    "private": { "url": "https://mcp.2020224.xyz/mcp/private", "transport": "streamable-http", "headers": { "Authorization": "Bearer mcp_sk_xxx" } }
  }
}
```

---

## 8. 常见问题

**Q: Hermes 无弹窗怎么鉴权？** A: 就用 Bearer Token，配置里写死就行，不用 OAuth 跳转。

**Q: 公开和私有怎么选？** A: 通用技能放 public，内部/计费技能放 private 并给不同 token 不同 scopes。

**Q: 如何扩展新服务？** A: 在 `src/mcp-gateway.ts` 的 `registerPublicServices()`/`registerPrivateServices()` 加 `this.registerTool({...})`，`wrangler deploy` 后 `tools/list` 自动可见。

---

## 9. 维护者

- GitHub: https://github.com/HarveyJiang/mcp-gateway
- Worker: https://mcp-gateway.harveyme.workers.dev
- 域名: https://mcp.2020224.xyz
- 健康: `curl https://mcp.2020224.xyz/health`
- Admin Token: 见 `wrangler.jsonc` vars.ADMIN_TOKEN (当前 `e642b8bf...`)

> 最后更新：2026-09-04 (已上线 Bearer 鉴权)
