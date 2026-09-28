export const homeHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MCP Gateway - 模型上下文协议网关</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.2.0/remixicon.min.css">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  body { font-family: 'Inter', sans-serif; }
  .mono { font-family: 'JetBrains Mono', monospace; }
</style>
</head>
<body class="bg-[#fafafa] text-zinc-900 min-h-screen">
  <!-- Header -->
  <header class="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-zinc-200">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center"><i class="ri-plug-2-line text-xl"></i></div>
        <div>
          <div class="font-bold leading-none">MCP Gateway</div>
          <div class="text-xs text-zinc-500">mcp.2020224.xyz</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <a href="https://github.com/HarveyJiang/mcp-gateway" target="_blank" class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 text-white text-sm hover:bg-zinc-800"><i class="ri-github-line"></i> GitHub</a>
        <a href="/health" class="px-3 py-1.5 rounded-full border border-zinc-200 text-sm hover:bg-white">Health</a>
        <a href="https://raw.githubusercontent.com/HarveyJiang/mcp-gateway/main/AGENT_GUIDE.md" target="_blank" class="hidden sm:inline px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-sm">Agent Guide</a>
      </div>
    </div>
  </header>

  <!-- Hero -->
  <section class="max-w-6xl mx-auto px-6 pt-10 pb-6">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-zinc-200 text-xs text-zinc-600">
      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> 2 MCP servers · 27 tools · 10GB持久化 · Streamable HTTP
    </div>
    <h1 class="mt-4 text-4xl sm:text-5xl font-bold tracking-tight">模型上下文协议<span class="text-zinc-400">网关</span></h1>
    <p class="mt-3 text-zinc-600 max-w-2xl">统一的 MCP 服务网关，公开服务无需鉴权，私有服务支持 <span class="mono bg-white border border-zinc-200 px-1.5 py-0.5 rounded text-sm">Bearer mcp_sk_...</span> 按 token 限 scopes / quota / 限流。给 Hermes 这类无弹窗智能体直接用。</p>
    <div class="mt-6 flex flex-col sm:flex-row gap-3">
      <div class="flex-1 relative">
        <i class="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"></i>
        <input id="search" type="text" placeholder="搜索 MCP / 工具 / 说明...  (比如 time、uuid、echo)" class="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-zinc-200 outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10">
      </div>
      <div class="flex gap-2">
        <button data-filter="all" class="filter-btn active px-5 py-3 rounded-2xl bg-zinc-900 text-white text-sm font-medium">全部</button>
        <button data-filter="public" class="filter-btn px-5 py-3 rounded-2xl bg-white border border-zinc-200 text-sm">公开</button>
        <button data-filter="private" class="filter-btn px-5 py-3 rounded-2xl bg-white border border-zinc-200 text-sm">私有</button>
      </div>
    </div>
    <div class="mt-4 flex flex-wrap gap-2 text-xs">
      <span class="px-2.5 py-1 rounded-full bg-white border border-zinc-200">Endpoint: <span class="mono">/mcp/public</span> 无需鉴权</span>
      <span class="px-2.5 py-1 rounded-full bg-white border border-zinc-200">Endpoint: <span class="mono">/mcp/private</span> 需 Bearer</span>
      <span class="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">在 Inspector 输入上面 URL 即可调试</span>
    </div>
  </section>

  <!-- MCP List -->
  <main class="max-w-6xl mx-auto px-6 pb-12">
    <div id="mcpGrid" class="grid md:grid-cols-2 gap-6">
      <!-- Public MCP Card -->
      <div class="mcp-card group bg-white rounded-[24px] border border-zinc-200 overflow-hidden hover:border-zinc-300 transition" data-type="public" data-search="public mcp gateway 公开 通用技能 天气 时间 uuid github 搜索 仓库">
        <div class="p-6">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center"><i class="ri-global-line text-xl"></i></div>
              <div>
                <div class="font-semibold">Public MCP</div>
                <div class="text-xs text-zinc-500 mono">https://mcp.2020224.xyz/mcp/public</div>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">公开 · 免登录</span>
          </div>
          <p class="mt-3 text-sm text-zinc-600">通用技能，所有智能体可直接用。适合时间、ID、天气等公共能力，后续会持续把公共服务封装进来。</p>
          <div class="mt-4 flex gap-2">
            <button onclick="copy('https://mcp.2020224.xyz/mcp/public')" class="flex-1 py-2 rounded-xl bg-zinc-900 text-white text-sm">复制 URL</button>
            <button onclick="copy('npx @modelcontextprotocol/inspector https://mcp.2020224.xyz/mcp/public')" class="px-3 py-2 rounded-xl bg-white border border-zinc-200 text-sm mono">Inspector</button>
          </div>
        </div>
        <div class="bg-zinc-50 border-t border-zinc-200 p-2">
          <div class="text-xs text-zinc-500 px-4 py-2">包含 9 个工具</div>
          <div class="space-y-2 px-2 pb-2">
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="public_get_time 时间 时区 shanghai tokyo new_york">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">public_get_time</span><span class="text-xs px-2 py-0.5 rounded-full bg-zinc-900 text-white">readOnly</span></div>
              <div class="text-sm text-zinc-600 mt-1">获取指定 IANA 时区的当前时间。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5 overflow-x-auto">{"timezone":"Asia/Shanghai"} → {"time":"9/4/2026, 5:56 PM"}</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="public_generate_uuid uuid 唯一 id">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">public_generate_uuid</span><span class="text-xs px-2 py-0.5 rounded-full bg-zinc-900 text-white">readOnly</span></div>
              <div class="text-sm text-zinc-600 mt-1">生成 1-100 个随机 UUID。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5">{"count":2} → ["550e8400-..."]</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="public_get_weather 天气 weather beijing metric">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">public_get_weather</span><span class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 border">openWorld</span></div>
              <div class="text-sm text-zinc-600 mt-1">天气演示（后续接真实 API）。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5">{"location":"Beijing","units":"metric"}</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="public_github_search github 搜索 仓库 开源 stars">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">public_github_search</span><span class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 border">openWorld</span></div>
              <div class="text-sm text-zinc-600 mt-1">搜公开 GitHub 仓库，返回名称、简介、stars、语言、链接。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5">{"query":"mcp server","per_page":5} → repos[]</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="public_shorten_url public_expand_url 短链 短链接 shorten 展开 还原">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">public_shorten_url / public_expand_url</span><span class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 border">openWorld</span></div>
              <div class="text-sm text-zinc-600 mt-1">生成短链与还原短链（shorten.2020224.xyz 同款后端）。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5">{"url":"https://...long"} → {"shortUrl":"https://shorten.2020224.xyz/X5FRtq"}</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="gateway_list_tools gateway_info gateway_list_resources 元信息">
              <div class="mono text-sm font-medium">gateway_* <span class="text-zinc-500 font-normal">gateway_list_tools / gateway_info</span></div>
              <div class="text-sm text-zinc-600 mt-1">网关元信息，无参直接调。</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Private MCP Card + Computer -->
      <div class="mcp-card group bg-white rounded-[24px] border border-zinc-200 overflow-hidden hover:border-zinc-300 transition" data-type="private" data-search="private 私有 付费 token 鉴权 scopes quota computer 电脑 文件 持久化 fs exec git ai 大模型 生成 r2 存储 上传">
        <div class="p-6">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center"><i class="ri-lock-2-line text-xl"></i></div>
              <div>
                <div class="font-semibold">Private MCP</div>
                <div class="text-xs text-zinc-500 mono">https://mcp.2020224.xyz/mcp/private</div>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full bg-zinc-900 text-white text-xs font-medium">私有 · Bearer</span>
          </div>
          <p class="mt-3 text-sm text-zinc-600">需 <span class="mono bg-zinc-900 text-white px-1.5 py-0.5 rounded text-xs">Authorization: Bearer mcp_sk_...</span> 内部/付费技能，按 token 限 scopes、quota、限流。</p>
          <div class="mt-4 flex gap-2">
            <button onclick="copy('https://mcp.2020224.xyz/mcp/private')" class="flex-1 py-2 rounded-xl bg-zinc-900 text-white text-sm">复制 URL</button>
            <button onclick="document.getElementById('tokenHelp').scrollIntoView({behavior:'smooth'})" class="px-3 py-2 rounded-xl bg-white border border-zinc-200 text-sm">获取 Token</button>
          </div>
        </div>
        <div class="bg-zinc-50 border-t border-zinc-200 p-2">
          <div class="text-xs text-zinc-500 px-4 py-2">私有 18 个工具：3 私有 + 7 Computer持久化 + 1 AI + 4 R2 + 3 网关</div>
          <div class="space-y-2 px-2 pb-2">
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="private_echo 回显 私有">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">private_echo</span><span class="text-xs px-2 py-0.5 rounded-full bg-zinc-900 text-white">private</span></div>
              <div class="text-sm text-zinc-600 mt-1">回显消息，测试私有链路。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5">{"message":"hello hermes"} → "[PRIVATE] hello hermes"</div>
            </div>
            <div class="tool bg-emerald-50 border border-emerald-200 rounded-xl p-3" data-search="computer_write 文件 写入 持久化 10gb">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">computer_write</span><span class="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white">Computer</span></div>
              <div class="text-sm text-zinc-600 mt-1">写入持久化文件（10GB，跨会话不丢，自动建目录）。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5">{"path":"/notes/todo.md","content":"- [ ] ship it"}</div>
            </div>
            <div class="tool bg-emerald-50 border border-emerald-200 rounded-xl p-3" data-search="computer_read 读取 文件">
              <div class="mono text-sm font-medium">computer_read</div>
              <div class="text-sm text-zinc-600 mt-1">读取持久化文件。</div>
            </div>
            <div class="tool bg-emerald-50 border border-emerald-200 rounded-xl p-3" data-search="computer_ls 列表 目录 ls">
              <div class="mono text-sm font-medium">computer_ls</div>
              <div class="text-sm text-zinc-600 mt-1">列目录，返回文件列表。</div>
            </div>
            <div class="tool bg-emerald-50 border border-emerald-200 rounded-xl p-3" data-search="computer_mkdir 创建 目录 mkdir">
              <div class="mono text-sm font-medium">computer_mkdir</div>
              <div class="text-sm text-zinc-600 mt-1">创建目录（递归）。</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="computer_rm 删除 rm">
              <div class="mono text-sm font-medium">computer_rm</div>
              <div class="text-sm text-zinc-600 mt-1">删除文件/目录。</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="computer_exec 执行 shell 免费版不可用">
              <div class="mono text-sm font-medium">computer_exec</div>
              <div class="text-sm text-zinc-600 mt-1">执行 shell（需付费 Workers 计划，免费版提示升级）。</div>
            </div>
            <div class="tool bg-emerald-50 border border-emerald-200 rounded-xl p-3" data-search="computer_git_clone git 克隆">
              <div class="mono text-sm font-medium">computer_git_clone</div>
              <div class="text-sm text-zinc-600 mt-1">git clone 到持久化工作区。</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="ai_generate 大模型 生成 总结 翻译 llama workers ai">
              <div class="flex items-center justify-between"><span class="mono text-sm font-medium">ai_generate</span><span class="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">AI</span></div>
              <div class="text-sm text-zinc-600 mt-1">Workers AI 文本生成（默认 llama-3.1-8b），总结翻译问答都行，计入 token quota。</div>
              <div class="mt-2 mono text-xs bg-zinc-900 text-zinc-100 rounded-lg p-2.5">{"prompt":"总结...","system":"简洁回答"}</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="r2_upload r2_read r2_list r2_delete r2 存储 文件 上传 下载 对象">
              <div class="mono text-sm font-medium">r2_* <span class="text-zinc-500 font-normal">r2_upload / r2_read / r2_list / r2_delete</span></div>
              <div class="text-sm text-zinc-600 mt-1">R2 文件存取，按 token 隔离目录，单次上传 512KB、读取 256KB。</div>
            </div>
            <div class="tool bg-white border border-zinc-200 rounded-xl p-3" data-search="mcp://private/user/profile 资源">
              <div class="mono text-sm font-medium">mcp://private/user/profile</div>
              <div class="text-sm text-zinc-600 mt-1">资源：当前用户 profile。</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Token Help -->
    <section id="tokenHelp" class="mt-8 bg-white rounded-[24px] border border-zinc-200 p-6">
      <h3 class="font-semibold flex items-center gap-2"><i class="ri-key-2-line"></i> 私有/付费：如何获取 Token</h3>
      <p class="text-sm text-zinc-600 mt-2">给 Hermes 这种无弹窗智能体，用 Bearer 最合适。管理员用 <span class="mono">X-Admin-Token</span> 创建：</p>
      <div class="mt-3 mono text-xs bg-zinc-900 text-zinc-100 rounded-xl p-4 overflow-x-auto">
curl -X POST https://mcp.2020224.xyz/admin/tokens \\
 -H "X-Admin-Token: e642b8bf..." \\
 -H "Content-Type: application/json" \\
 -d '{"name":"hermes-prod","plan":"pro","scopes":["*"],"quota":100000}'
# 返回 {"token":"mcp_sk_..."}  只显示一次！
      </div>
      <div class="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
        <div class="p-3 rounded-xl bg-zinc-50 border border-zinc-200"><div class="font-medium">scopes</div><div class="text-zinc-600">["private_echo"] 限定单工具，["*"] 全部</div></div>
        <div class="p-3 rounded-xl bg-zinc-50 border border-zinc-200"><div class="font-medium">plan</div><div class="text-zinc-600">free: 1000次/60每分 · pro: 100k/300每分</div></div>
        <div class="p-3 rounded-xl bg-zinc-50 border border-zinc-200"><div class="font-medium">Header</div><div class="text-zinc-600 mono">Authorization: Bearer mcp_sk_...</div></div>
      </div>
    </section>

    <!-- Quick Start -->
    <section class="mt-6 bg-zinc-900 text-zinc-100 rounded-[24px] p-6">
      <h3 class="font-semibold">给 Hermes 的一句话</h3>
      <div class="mt-3 mono text-xs bg-white/10 rounded-xl p-4 flex items-center justify-between">
        <span>请读 https://raw.githubusercontent.com/HarveyJiang/mcp-gateway/main/AGENT_GUIDE.md 然后按文档调 https://mcp.2020224.xyz/mcp/public</span>
        <button onclick="copy('请读取 https://raw.githubusercontent.com/HarveyJiang/mcp-gateway/main/AGENT_GUIDE.md 然后使用 MCP Gateway 公开端点 https://mcp.2020224.xyz/mcp/public')" class="ml-4 px-3 py-1.5 rounded-full bg-white text-zinc-900 text-xs">复制</button>
      </div>
      <div class="mt-3 text-xs text-zinc-400">私有就把 URL 换成 /mcp/private 并加 Authorization 头。完整 curl/SDK 示例见 AGENT_GUIDE.md</div>
    </section>

    <footer class="mt-8 text-center text-xs text-zinc-500">
      Built on Cloudflare Workers · Durable Objects · Agents SDK · <a href="https://github.com/HarveyJiang/mcp-gateway" class="underline">GitHub</a> · <span id="count"></span>
    </footer>
  </main>

<script>
const search = document.getElementById('search');
const cards = document.querySelectorAll('.mcp-card');
const tools = document.querySelectorAll('.tool');
const filterBtns = document.querySelectorAll('.filter-btn');
let activeFilter = 'all';

function apply() {
  const q = search.value.toLowerCase().trim();
  let visibleCards = 0;
  cards.forEach(card => {
    const type = card.dataset.type;
    const matchType = activeFilter === 'all' || type === activeFilter;
    let cardVisible = false;
    if (matchType) {
      if (!q) cardVisible = true;
      else {
        if (card.dataset.search.toLowerCase().includes(q)) cardVisible = true;
        card.querySelectorAll('.tool').forEach(t => {
          if (t.dataset.search && t.dataset.search.toLowerCase().includes(q)) cardVisible = true;
          if (t.textContent.toLowerCase().includes(q)) cardVisible = true;
        });
      }
    }
    card.style.display = cardVisible ? '' : 'none';
    if (cardVisible) visibleCards++;
    // tool level filter
    card.querySelectorAll('.tool').forEach(t => {
      if (!q) t.style.display = '';
      else {
        const hit = (t.dataset.search && t.dataset.search.toLowerCase().includes(q)) || t.textContent.toLowerCase().includes(q);
        t.style.display = hit ? '' : 'none';
      }
    });
  });
  document.getElementById('count').textContent = visibleCards + ' MCP servers · ' + document.querySelectorAll('.tool:not([style*="display: none"])').length + ' tools visible';
}
search.addEventListener('input', apply);
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b=>{b.className='filter-btn px-5 py-3 rounded-2xl bg-white border border-zinc-200 text-sm'});
    btn.className='filter-btn active px-5 py-3 rounded-2xl bg-zinc-900 text-white text-sm font-medium';
    activeFilter = btn.dataset.filter;
    apply();
  });
});
apply();
function copy(t){navigator.clipboard.writeText(t); const n=document.createElement('div');n.textContent='已复制';n.className='fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-4 py-2 rounded-full text-sm';document.body.appendChild(n);setTimeout(()=>n.remove(),1200);}
</script>
</body>
</html>
`;