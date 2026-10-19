import type { AgentContext, Intent, NpcAgentPort } from '@engine/protocol/agent.js';

/** 一条桩规则（纯数据）：哪个需求垫底 → 产哪个动词。 */
export interface NullAgentRule {
  /** 需求 key（对 `AgentContext.needs` 的键）。 */
  readonly whenLowest: string;
  readonly verb: string;
  readonly args?: readonly (string | number)[];
}

export interface NullNpcAgentConfig {
  /** 规则表（按序匹配第一条命中的）。缺省 = 空表，一律产 fallback。 */
  readonly rules?: readonly NullAgentRule[];
  /** 兜底动词（规则全不命中时产它）。缺省 `'rest'`。 */
  readonly fallbackVerb?: string;
  /** 点名脚本：npcId → 固定意图（测试要「这个 NPC 就吐这个」时用，优先于规则表）。 */
  readonly script?: Readonly<Record<string, readonly { verb: string; args?: readonly (string | number)[] }[]>>;
}

/**
 * 空 NPC 决策后端 —— **不调任何外部服务**，同样的入参恒产同样的意图。
 *
 * 这不是「聊胜于无的占位」，而是**全库 AI 游戏的测试基建**（REQ-111-ENG-01 原文）：没有它，
 * 任何 LLM 驱动的游戏都进不了无网 CI，也没有断网降级路径可验。照 `NullAishePort` 的先例写：
 * 记调用日志便于断言、零网络、零墙钟、零裸 `Math.random`。
 *
 * 决策规则（确定性，三步）：
 * ① `script[npcId]` 在场 → 照它产（点名优先）。
 * ② 否则找**需求垫底**的那一项（值最小；**同值按 key 名升序**定死，不靠对象键序）→ 查规则表。
 * ③ 规则不命中 / 无需求读数 → 产 `fallbackVerb`。
 * 产出的动词若不在 `ctx.verbs` 闭集内，barrier 会照常拒收——桩不自我豁免，这条正是「拒收链路」的测试入口。
 */
export class NullNpcAgentPort implements NpcAgentPort {
  readonly log: AgentContext[] = [];

  constructor(private readonly cfg: NullNpcAgentConfig = {}) {}

  async decide(ctx: AgentContext): Promise<readonly Intent[]> {
    this.log.push(ctx);
    const scripted = this.cfg.script?.[ctx.npcId];
    if (scripted) return scripted.map((s) => ({ npcId: ctx.npcId, verb: s.verb, args: s.args, turn: ctx.turn }));

    const lowest = lowestNeed(ctx.needs);
    if (lowest !== undefined) {
      for (const r of this.cfg.rules ?? []) {
        if (r.whenLowest === lowest) return [{ npcId: ctx.npcId, verb: r.verb, args: r.args, turn: ctx.turn }];
      }
    }
    return [{ npcId: ctx.npcId, verb: this.cfg.fallbackVerb ?? 'rest', turn: ctx.turn }];
  }
}

/**
 * 需求垫底的 key（纯函数·确定性）。空/缺省 → undefined。
 * **同值按 key 名升序**：否则结果跟着对象键序走，换一次 JSON 序就换一个决策 → 回放对不上。
 */
export function lowestNeed(needs: Readonly<Record<string, number>> | undefined): string | undefined {
  if (!needs) return undefined;
  const keys = Object.keys(needs).sort();
  if (keys.length === 0) return undefined;
  let best = keys[0];
  for (const k of keys) if (needs[k] < needs[best]) best = k;
  return best;
}
