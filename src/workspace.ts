import { DurableObject } from "cloudflare:workers";
import { withWorkspace, getWorkspace } from "@cloudflare/computer";

class Base extends DurableObject<any> {
  constructor(ctx: DurableObjectState, env: any) { super(ctx, env); }
}

// 基础 DO，用 withWorkspace 包一层，获得持久化 VFS (10GB SQLite)
// 注意: exec 后端需要 paid plan 的 Worker Loader，当前免费版先只提供 FS + git
// 后续升级到 paid 后可加 WorkerShellBackend / ContainerBackend
export class Workspace extends withWorkspace(
  Base,
  (self: any) => ({
    storage: self.ctx.storage,
  })
) {}

// helper: 按 userId 拿 workspace
export async function getUserWorkspace(env: any, userId: string) {
  const id = env.Workspace.idFromName(userId);
  const ws = await getWorkspace(env.Workspace.get(id));
  return ws;
}
