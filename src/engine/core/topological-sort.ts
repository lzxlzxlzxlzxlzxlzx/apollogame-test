import type { SystemDeclaration, ComponentType } from './types.js';

// 系统定序：先按 phase 分桶（缺省 0=Update），phase 升序；桶内按「组件依赖 + 显式定序」拓扑排序；
// 跨 phase 的顺序由 phase 号决定。
//
// 桶内的边有两种来源：
//   1) 组件依赖（自动）：A 写 X 且 B 读/consume X ⇒ A 在 B 前。
//   2) 显式定序（runsAfter/runsBefore，按 id）：用于纯组件拓扑无法/不该表达的顺序。
// 关键：当两个系统都 read-modify-write 同一组件时，组件图会给出互为前驱的两条边 → 判成环；
// **显式边会覆盖相反方向的组件推断边**，从而以确定顺序打破这种 RMW 伪环（见 R10）。
//
// ── REQ-CYCLEHAZ 方案 B（2026-08-04·止血安全网）──────────────────────────────
// 背景：组件推断边规则下，任意两个系统 RMW 同一黑板组件（Resource/Flag/State/CardPile…）即互为前驱
// 成 2-环。全库普查 101 能力两两配对得 65 对成环——这是**类问题不是点问题**，靠 O(n²) 显式申报堵不住。
// 于是：**纯组件推断成的环**（环内零显式边参与）不再炸装载，改为「确定性平局裁决 + console.warn 留痕」；
// **只要环上有任何一条显式申报边参与，照旧抛**（那是真申报 bug，必须拦）。
// 正解仍是相位化（能力按语义分 phase 跨桶天然无环，REQ-CYCLEHAZ 方案 C），B 只是安全网。
// ── P2d（engine-architecture-review-2026-09-02 D2b）：平局键 = **系统 id 字典序**，不再是注册下标。────────────
// 此前 Kahn 按下标出队、环内也按下标裁决，而下标 = Engine.load 遍历 manifest `capabilities[]` 的顺序（未声明时
// = JSON 键序）——系统执行序成了游戏数据的一部分：两端 capabilities 列序不同 → 环内系统换序 → 状态分叉。
// 现在无约束系统之间与软环内部一律按 id 字典序（最小字典序拓扑序），与 manifest / 注册序 / JSON 键序全部无关。
// 申报完整（P1a 严格模式已实证）意味着无边的系统之间真的互不相关 → 换序不改行为；黄金 hash 全绿是判据。
export interface SortOptions {
  /** 软环（纯组件推断边闭合）的处置：warn = 平局裁决 + console.warn（生产缺省）；throw = 抛（严格模式/门禁·新软环在 CI 即红）。 */
  softCycle?: 'warn' | 'throw';
}

export function topologicalSort(systems: SystemDeclaration[], opts: SortOptions = {}): SystemDeclaration[] {
  const phases = Array.from(new Set(systems.map((s) => s.phase ?? 0))).sort((a, b) => a - b);
  if (phases.length <= 1) return sortWithinPhase(systems, phases[0] ?? 0, opts);

  const result: SystemDeclaration[] = [];
  for (const phase of phases) {
    result.push(...sortWithinPhase(systems.filter((s) => (s.phase ?? 0) === phase), phase, opts));
  }
  return result;
}

/** 系统 id 字典序（平局键·与注册序无关）。 */
function idOrder(systems: SystemDeclaration[]): number[] {
  return systems.map((_, i) => i).sort((a, b) => (systems[a].id < systems[b].id ? -1 : systems[a].id > systems[b].id ? 1 : 0));
}

// 单个阶段内的拓扑排序（Kahn 算法），边 = 组件推断边（经显式定序覆盖后）+ 显式定序边。
function sortWithinPhase(systems: SystemDeclaration[], phase: number, opts: SortOptions): SystemDeclaration[] {
  const n = systems.length;
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) idToIndex.set(systems[i].id, i);

  // 1) 组件推断边：writer(X) → reader/consumer(X)。单独存放，便于被显式边覆盖。
  const writersOf = new Map<ComponentType, number[]>();
  for (let i = 0; i < n; i++) {
    for (const w of systems[i].writes) {
      if (!writersOf.has(w)) writersOf.set(w, []);
      writersOf.get(w)!.push(i);
    }
  }
  const componentEdges: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) {
    const deps = new Set([...systems[i].reads, ...systems[i].consumes]);
    for (const dep of deps) {
      const writers = writersOf.get(dep);
      if (!writers) continue;
      for (const w of writers) if (w !== i) componentEdges[w].add(i);
    }
  }
  // 1b) 事件推断边（P1b 总线）：emitter(E) → listener(E)。与组件推断边同等（软边·可被显式边覆盖·可平局裁决）。
  const emittersOf = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (const e of systems[i].emits ?? []) {
      if (!emittersOf.has(e)) emittersOf.set(e, []);
      emittersOf.get(e)!.push(i);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const e of systems[i].listens ?? []) {
      const ems = emittersOf.get(e);
      if (!ems) continue;
      for (const w of ems) if (w !== i) componentEdges[w].add(i);
    }
  }

  // 2) 显式定序边（仅限本桶内的 id）：runsAfter[X] ⇒ X→self；runsBefore[Y] ⇒ self→Y。
  const explicitEdges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (const afterId of systems[i].runsAfter ?? []) {
      const j = idToIndex.get(afterId);
      if (j !== undefined && j !== i) explicitEdges.push([j, i]);
    }
    for (const beforeId of systems[i].runsBefore ?? []) {
      const j = idToIndex.get(beforeId);
      if (j !== undefined && j !== i) explicitEdges.push([i, j]);
    }
  }

  // 3) 显式边覆盖相反方向的组件推断边（打破 RMW 伪环）。
  for (const [u, v] of explicitEdges) componentEdges[v].delete(u);

  // 4) 合并成最终邻接表（先组件边后显式边，保证缺省情形与原实现逐位一致）。
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let u = 0; u < n; u++) for (const v of componentEdges[u]) adj[u].add(v);
  for (const [u, v] of explicitEdges) adj[u].add(v);

  // 5) Kahn 快车道：无环即到此为止。出队按 id 字典序（P2d）。
  const rank = idOrder(systems);
  let order = kahn(adj, n, rank);
  if (order.length === n) return order.map((i) => systems[i]);

  // 6) 有环 → 精确切出最小 SCC，按「环是不是**申报自相矛盾**」分流（方案 B）。
  //
  // 分流判据（钉死·比「环上有显式边就抛」更准，理由见下）：
  //   · **显式申报边 = 硬约束**，任何情况下都不砍——作者写了 runsAfter/runsBefore 就是要那个先后。
  //   · **组件推断边 = 软约束**，只表达「两系统碰同一黑板组件」，不表达真实先后 → 成环时可砍。
  //   · 故「只由显式边构成的子图」自身成环 ⇔ 申报自相矛盾（A 说在 B 前、B 说在 A 前）→ **照旧抛**；
  //     否则环一定是软边闭合的 → 按确定性平局裁决打破（下方 6b）。
  // 为何不是「环上有任一显式边即抛」：Lead 核查点名的三元环 event-when→timeline→resource-apply
  // 恰恰带一条**完全正确**的显式边（timeline.runsAfter:['event-when']），闭环的是 timeline/resource-apply
  // 之间 RMW Resource 的推断边。按「有显式边即抛」会把这类正常申报连坐炸掉（且越申报越容易炸），
  // 与 B「止血」的目的相反。真申报 bug（互指）仍被下面这一关拦死。
  const explicitKeys = new Set(explicitEdges.map(([u, v]) => `${u}->${v}`));
  const cycles = stronglyConnectedComponents(adj);

  // 6a) 显式边自成环 = 申报自相矛盾 → 抛（点名成环的申报边）。
  const explicitOnly: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (const [u, v] of explicitEdges) explicitOnly[u].add(v);
  const declaredCycles = stronglyConnectedComponents(explicitOnly);
  if (declaredCycles.length > 0) {
    const detail = declaredCycles
      .map((c) => {
        const edges = intraEdges(c, explicitOnly).map(([u, v]) => `${systems[u].id}→${systems[v].id}`);
        return `[${sortedIds(c, systems).join(', ')}]（申报边：${edges.sort().join(', ')}）`;
      })
      .join('；');
    throw new Error(
      `Circular dependency detected among systems: ${declaredCycles.flatMap((c) => sortedIds(c, systems)).join(', ')}. ` +
        `**显式 runsAfter/runsBefore 申报自相矛盾**（申报边自成环），不做平局裁决：${detail}。` +
        `请改申报方向，或把其中一方拆到更后的 phase。`,
    );
  }

  // 6b) 环由组件推断边闭合 → 确定性平局裁决打破。
  //
  // 砍边语义（钉死·勿随手改）：对每个 SCC，**砍掉环内全部推断边、保留环内全部显式边**，再按
  // 「平局键升序，但服从保留下来的显式边」给环内成员定一条**全序链** m0→m1→…→mk。
  // 四点保证：① 环内相对序确定（同一世界每次装载同序 → 录放一致）；② 显式申报绝不被裁决推翻
  // （链是显式子图的一个拓扑序）；③ SCC 对外的入边/出边原样保留 → 裁决结果继续参与全图传播
  // （下游仍排在整个 SCC 之后，不是「砍一条边了事」）；④ 不引入新环——SCC 极大性保证任意
  // 「成员⇝成员」的路径全落在 SCC 内部，而内部只剩与链同向的显式边，故链边只能单向前进。
  //
  // 平局键 = **系统在输入数组中的下标** = 它被 addSystem 注册进 world 的顺序（= 蓝图 capabilities
  // 的装载序）。而 `ALL_CAPABILITIES` 注册表按 atoms→tier1→tier2→tier3 编写，故按注册表序装载时
  // 该键天然就是「tier 序优先、同 tier 按能力注册序」。键值随世界固定 → 顺序固定。
  for (const cycle of cycles) {
    const inCycle = new Set(cycle);
    // 砍软边（推断边）、留硬边（显式边）。
    for (const u of cycle) {
      for (const v of [...adj[u]]) {
        if (inCycle.has(v) && !explicitKeys.has(`${u}->${v}`)) adj[u].delete(v);
      }
    }
    const members = orderCycleMembers(cycle, adj, systems);
    for (let k = 0; k + 1 < members.length; k++) adj[members[k]].add(members[k + 1]);
    warnTieBreak(phase, members, systems, opts.softCycle ?? 'warn');
  }

  order = kahn(adj, n, rank);
  if (order.length !== n) {
    // 兜底：破环后仍排不出（理论不可达——SCC 全部拆过即为 DAG）。宁可炸也不静默出半张表。
    const stuck = systems.filter((_, i) => !order.includes(i)).map((s) => s.id);
    throw new Error(
      `Circular dependency detected among systems: ${stuck.join(', ')}. ` +
        `（平局裁决后仍不可排——定序器内部不变量被破坏，请报引擎主程）`,
    );
  }
  return order.map((i) => systems[i]);
}

// Kahn 算法（P2d：每步取**入度 0 中 id 字典序最小**者 → 最小字典序拓扑序·确定、与注册序无关）。
// 返回可排出的节点下标序；长度 < n 即有环。n ≤ 百余系统，线性挑选足够。
function kahn(adj: Set<number>[], n: number, rank: number[]): number[] {
  const inDegree = new Array(n).fill(0);
  for (let u = 0; u < n; u++) for (const v of adj[u]) inDegree[v]++;
  const done = new Array<boolean>(n).fill(false);
  const out: number[] = [];
  for (;;) {
    let pick = -1;
    for (const i of rank) if (!done[i] && inDegree[i] === 0) { pick = i; break; }
    if (pick === -1) break;
    done[pick] = true;
    out.push(pick);
    for (const v of adj[pick]) inDegree[v]--;
  }
  return out;
}

/**
 * Tarjan 强连通分量（迭代式·避免深递归爆栈）。只返回 size>1 的分量 = 真环。
 * （`src/assembly/system-graph.ts` 的图分析复用本函数——一份实现，防两处漂移。）
 */
export function stronglyConnectedComponents(adj: Set<number>[]): number[][] {
  const n = adj.length;
  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  let idx = 0;
  const out: number[][] = [];

  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    // 迭代 DFS：帧 = [node, 邻居数组, 下标]
    const work: Array<{ v: number; nbrs: number[]; i: number }> = [{ v: s, nbrs: [...adj[s]], i: 0 }];
    index[s] = low[s] = idx++; stack.push(s); onStack[s] = true;
    while (work.length) {
      const f = work[work.length - 1];
      if (f.i < f.nbrs.length) {
        const w = f.nbrs[f.i++];
        if (index[w] === -1) {
          index[w] = low[w] = idx++; stack.push(w); onStack[w] = true;
          work.push({ v: w, nbrs: [...adj[w]], i: 0 });
        } else if (onStack[w]) {
          low[f.v] = Math.min(low[f.v], index[w]);
        }
      } else {
        if (low[f.v] === index[f.v]) {
          const comp: number[] = [];
          for (;;) { const w = stack.pop()!; onStack[w] = false; comp.push(w); if (w === f.v) break; }
          if (comp.length > 1) out.push(comp);
        }
        work.pop();
        if (work.length) low[work[work.length - 1].v] = Math.min(low[work[work.length - 1].v], low[f.v]);
      }
    }
  }
  return out;
}

// 环内边（u→v 两端都在环上）。
function intraEdges(cycle: number[], adj: Set<number>[]): Array<[number, number]> {
  const set = new Set(cycle);
  const out: Array<[number, number]> = [];
  for (const u of cycle) for (const v of adj[u]) if (set.has(v)) out.push([u, v]);
  return out;
}

/**
 * 环内成员的最终相对序 = 「平局键（下标）升序，但服从环内保留下来的显式边」。
 * 做法 = 只在环内跑一次 Kahn，每步取**入度 0 中下标最小**者（环规模极小，线性挑选足够）。
 * 显式子图已在 6a 验过无环 → 必能全部取出；兜底把万一漏下的按键序补尾，绝不丢成员。
 */
function orderCycleMembers(cycle: number[], adj: Set<number>[], systems: SystemDeclaration[]): number[] {
  const members = [...cycle].sort((a, b) => (systems[a].id < systems[b].id ? -1 : systems[a].id > systems[b].id ? 1 : 0)); // 平局键 = id 字典序（P2d）
  const remaining = new Set(members);
  const indeg = new Map<number, number>(members.map((m) => [m, 0]));
  for (const u of members) for (const v of adj[u]) if (remaining.has(v)) indeg.set(v, indeg.get(v)! + 1);

  const out: number[] = [];
  for (;;) {
    const pick = members.find((m) => remaining.has(m) && indeg.get(m) === 0);
    if (pick === undefined) break;
    remaining.delete(pick);
    out.push(pick);
    for (const v of adj[pick]) if (remaining.has(v)) indeg.set(v, indeg.get(v)! - 1);
  }
  for (const m of members) if (remaining.has(m)) out.push(m);
  return out;
}

function sortedIds(cycle: number[], systems: SystemDeclaration[]): string[] {
  return [...cycle].sort((a, b) => a - b).map((i) => systems[i].id);
}

// 留痕：点名环成员 + 闭环组件 + 裁决出的顺序 + 「显式申报可覆盖」提示。
// （warn 只是旁路输出，不参与定序 → 不影响确定性。）
function warnTieBreak(phase: number, members: number[], systems: SystemDeclaration[], mode: 'warn' | 'throw'): void {
  const via = new Set<ComponentType>();
  for (const u of members) {
    for (const v of members) {
      if (u === v) continue;
      const deps = new Set([...systems[v].reads, ...systems[v].consumes]);
      for (const w of systems[u].writes) if (deps.has(w)) via.add(w);
    }
  }
  const ids = members.map((i) => systems[i].id);
  const msg =
    `[topological-sort] phase ${phase}：检测到由**组件推断边**闭合的定序环 ` +
      `[${[...members].map((i) => systems[i].id).sort().join(', ')}]` +
      `（闭环组件：${[...via].sort().join(', ') || '—'}）。环上无自相矛盾的显式申报 → 按确定性平局裁决` +
      `（系统 id 字典序·已服从既有 runsAfter/runsBefore）定序为：${ids.join(' → ')}。` +
      `此顺序仅保证可复现、不保证合语义：要指定先后请用 runsAfter/runsBefore 显式申报覆盖，` +
      `或按语义把系统拆到不同 phase（REQ-CYCLEHAZ）。`;
  if (mode === 'throw') throw new Error(msg + '（严格模式：软环即错——请申报 runsAfter/runsBefore 或拆相位）');
  console.warn(msg);
}
