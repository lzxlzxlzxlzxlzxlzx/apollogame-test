// tier2 · rate-limit —— 「谁本 tick 可以开始」的通用限流/错峰调度（纯函数·sim 安全·确定性）。
//
// 提升自 games/game211/duel-scheduler.ts `planDuelStarts`（小队 36:36 对决限并发 + 错峰）——那里的
// 「候选对 / 距离优先 / 双方小队忙」是特例；这里抽成 **候选 key + 优先级 + 它占用的资源集**：
//   · 小队对决：key = pairKey(a,b) · priority = 距离 · uses = [a, b]
//   · 技能冷却队列：key = 技能 id · priority = 排队序 · uses = [施法者]
//   · 大特效预算：key = 特效实例 · priority = 重要度 · uses = [] （只吃并发/每 tick 名额）
// 消费方拿返回的 key 列表去做真正的生成/物理；本件不碰世界、不用壁钟、不用 Math.random、无超越函数。
//
// 确定性：候选按 priority 升序，同 priority 按 key 字典序全序 tie-break → 同集合任意输入顺序必得同输出（可回放/对拍）。
// game211 保留自己的一份（不改 games）；新消费方直接用本件。

/** 限流参数。 */
export interface RateLimitConfig {
  /** 同时最多几个 key 处于 active。 */
  maxConcurrent: number;
  /** 两次「开始」之间至少隔几 tick（错峰闸）。0 = 不错峰。 */
  gapTicks: number;
  /** 每 tick 最多开始几个（并发额度够也不许同 tick 齐开）。 */
  maxPerTick: number;
}

/** 调度输入。 */
export interface RateLimitState {
  /** 正在进行的 key → 它占用的资源集；其资源本 tick 不可再被新 key 占用。 */
  active: ReadonlyMap<string, readonly string[]>;
  /** 上一次有 key **开始**的 tick；从未开始过传 -Infinity。 */
  lastStartTick: number;
  /** 当前 tick。 */
  tick: number;
}

/** 一个候选：稳定 key · 优先级（小者先）· 它要占用的资源（如两个小队 id）。 */
export interface Candidate {
  key: string;
  priority: number;
  uses: readonly string[];
}

/** 无序对的稳定键（与传入顺序无关）——active/immune 类集合都用它索引。 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 从 pairKey 还原两个成员 id。 */
export function pairMembers(key: string): [string, string] {
  const i = key.indexOf('|');
  return [key.slice(0, i), key.slice(i + 1)];
}

/** 此刻已被 active 占用的资源全集。 */
function busyResources(active: ReadonlyMap<string, readonly string[]>): Set<string> {
  const s = new Set<string>();
  for (const uses of active.values()) for (const r of uses) s.add(r);
  return s;
}

/** 候选全序：priority 升序，同级按 key 字典序（确定性 tie-break）。 */
function compareCandidate(p: Candidate, q: Candidate): number {
  if (p.priority !== q.priority) return p.priority - q.priority;
  return p.key < q.key ? -1 : p.key > q.key ? 1 : 0;
}

/**
 * 决定本 tick 哪些候选可以开始（**纯函数**·不改入参）。规则按序：
 *  ① 错峰闸：`tick - lastStartTick < gapTicks` → 一个都不开；
 *  ② 并发闸：`active.size ≥ maxConcurrent` → 不开；
 *  ③ 候选按「priority 升序，同级 key 字典序」逐个检查：
 *     已在 active / 任一 `uses` 资源正忙（含本 tick 刚安排的）→ 跳过；否则开始并把它的资源标忙；
 *     同 key 重复出现只取第一次；
 *  ④ 本 tick 开始数 ≤ `maxPerTick`，且总并发 ≤ `maxConcurrent`。
 * 返回要开始的 key 列表（去重·确定序）。
 */
export function planStarts(state: RateLimitState, candidates: readonly Candidate[], cfg: RateLimitConfig): string[] {
  if (state.tick - state.lastStartTick < cfg.gapTicks) return []; // ① 错峰
  let slots = Math.min(cfg.maxConcurrent - state.active.size, cfg.maxPerTick); // ②④
  if (slots <= 0) return [];
  const busy = busyResources(state.active);
  const sorted = [...candidates].sort(compareCandidate);
  const out: string[] = [];
  const chosen = new Set<string>();
  for (const c of sorted) {
    if (slots <= 0) break;
    if (state.active.has(c.key) || chosen.has(c.key)) continue; // 正在进行 / 本 tick 已选
    if (c.uses.some((r) => busy.has(r))) continue;                // 资源另有占用（含本 tick 刚安排的）
    out.push(c.key);
    chosen.add(c.key);
    for (const r of c.uses) busy.add(r);
    slots -= 1;
  }
  return out;
}
