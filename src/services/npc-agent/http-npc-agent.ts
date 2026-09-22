import type { AgentContext, Intent, NpcAgentPort } from '@engine/protocol/agent.js';

export interface HttpNpcAgentConfig {
  /** 决策 API 端点。 */
  readonly endpoint: string;
  /** 鉴权（可选·Bearer）。 */
  readonly apiKey?: string;
  /** 注入 fetch（测试 / Node）；缺省用全局 fetch。 */
  readonly fetchImpl?: typeof fetch;
  /** 单次请求的毫秒上限（**只约束这条 HTTP**，不是 sim 的超时判据——后者归 barrier 的整数回合数）。 */
  readonly timeoutMs?: number;
}

/**
 * 真后端骨架 —— 把 `AgentContext` POST 给外部决策服务，解析回闭集意图。provider 无关（端点 + 鉴权可配）。
 *
 * 三条纪律（与 `HttpAishePort` 同源，外加一条本件特有的）：
 * ① **绝不抛**。网络错、超时、非 2xx、JSON 烂、字段缺——统统落成 `[]` 并记 `lastError`。
 *    理由：这条调用挂在异步旁路上，抛出去会冲进 sim 的 tick；而「什么都没拿到」本身是 barrier
 *    已经设计了的一条路（超期 → 确定性降级补默认动词），不需要异常来表达。
 * ② **绝不碰 world / snapshot / hash**。入参是扁平切片，出参是 POD。
 * ③ **只做形状归一，不做闭集裁决**。动词是否在闭集内、参数个数对不对，由 `t2-intent-barrier` 判
 *    （game111 capability-plan §3 原文：「校验闭集成员资格与参数形状的那一层归 intent-barrier」）。
 *    端口若自己先过滤一遍，被拒的那些就永远不会留下 `reject` 痕迹 —— 正是「什么都没发生」最难查的形状。
 */
export class HttpNpcAgentPort implements NpcAgentPort {
  /** 最近一次失败原因（成功时为 undefined）。给 UI/诊断读，不进世界。 */
  lastError: string | undefined;

  constructor(private readonly cfg: HttpNpcAgentConfig) {}

  async decide(ctx: AgentContext): Promise<readonly Intent[]> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const ctl = this.cfg.timeoutMs !== undefined && typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = ctl !== undefined && this.cfg.timeoutMs !== undefined
      ? setTimeout(() => ctl.abort(), this.cfg.timeoutMs)
      : undefined;
    try {
      const res = await doFetch(this.cfg.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          npcId: ctx.npcId,
          turn: ctx.turn,
          verbs: ctx.verbs,
          needs: ctx.needs,
          perceived: ctx.perceived,
          memories: ctx.memories,
          persona: ctx.persona,
          hints: ctx.hints,
        }),
        signal: ctl?.signal,
      });
      if (!res.ok) {
        this.lastError = `http ${res.status}`;
        return [];
      }
      const body: unknown = await res.json();
      this.lastError = undefined;
      return parseIntents(body, ctx.npcId, ctx.turn);
    } catch (e) {
      this.lastError = String((e as { message?: unknown } | undefined)?.message ?? e);
      return [];
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

/**
 * 后端回包 → `Intent[]`（纯函数·可单测，不发网络）。
 *
 * 只做形状归一，**不判闭集**（见类注释 ③）：
 * · 接受 `{ intents: [...] }` 或裸数组两种形状（后端十有八九两种都出现过）。
 * · `npcId` / `turn` **一律用本地的**，不信回包——否则后端一句 `npcId:"<别人>"` 就能代别的 NPC 下指令。
 * · `verb` 非字符串或空 → 整条丢（没有动词的意图没有任何可归一的余地）。
 * · `args` 只留标量（字符串/有限数字）；其余元素丢弃，参数个数对不上由 barrier 拒收并留痕。
 */
export function parseIntents(body: unknown, npcId: string, turn: number): Intent[] {
  const raw: unknown = Array.isArray(body) ? body : (body as { intents?: unknown } | null)?.intents;
  if (!Array.isArray(raw)) return [];
  const out: Intent[] = [];
  for (const item of raw) {
    const verb = (item as { verb?: unknown } | null)?.verb;
    if (typeof verb !== 'string' || verb.length === 0) continue;
    const rawArgs = (item as { args?: unknown }).args;
    const args: (string | number)[] = [];
    if (Array.isArray(rawArgs)) {
      for (const a of rawArgs) {
        if (typeof a === 'string') args.push(a);
        else if (typeof a === 'number' && Number.isFinite(a)) args.push(a);
      }
    }
    out.push(args.length > 0 ? { npcId, verb, args, turn } : { npcId, verb, turn });
  }
  return out;
}
