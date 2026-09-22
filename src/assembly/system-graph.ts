import type { SystemDeclaration, ComponentType } from '@engine/core/types.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import { stronglyConnectedComponents } from '@engine/core/topological-sort.js';

// ═══════════════════════════════════════════════════════════════
//  system-graph —— 系统调度依赖图分析（REQ-STAB·积木稳定性工具）。
//
//  引擎 topological-sort 在 load 时把一个 world 的全部系统按 phase 分桶、桶内拓扑排序：
//    · 组件推断边：A 写 X 且 B 读/consume X ⇒ A→B。
//    · 显式边：runsAfter[id]⇒id→self；runsBefore[id]⇒self→id。
//    · 显式边**删除相反方向的组件边**（打破 RMW 伪环）。
//  有环时（REQ-CYCLEHAZ 方案 B 后）引擎分流：**纯组件推断环**→确定性平局裁决 + console.warn 留痕（能装载，
//  但顺序只保证可复现、不保证合语义）；**有显式申报边参与的环**→照旧抛错。两种都不告诉你是哪条边/哪个
//  组件闭的环。本模块用 **Tarjan 精确切出最小 SCC**（复用引擎同一实现）、点名闭环组件、给破环建议，
//  并检出两类**恒为 bug** 的形态：悬空显式边（runsBefore/runsAfter 指向不存在的系统=静默失效）、
//  重复 system id（同 id 多能力=idToIndex 覆盖·定序静默改变）。
//
//  健全性：world 只装子集系统；DAG 的子图恒为 DAG。故「全局图无 SCC ⇒ 任何 world 都可排」是充分条件。
//  但全局超集常含「现实从不同装」的能力组合而成环——因此 SCC 作**信息/棘轮**报，硬失败只给悬空边/重复 id。
//  本模块与 topological-sort 的边模型**逐条对齐**（改引擎调度语义须同步改此文件·配套 fidelity 测试钉死）。
// ═══════════════════════════════════════════════════════════════

export interface SysRef {
  id: string;
  capId: string;
  phase: number;
  sys: SystemDeclaration;
}

export interface Scc {
  phase: number;
  systems: Array<{ id: string; capId: string }>;
  /** 闭环的 RMW 组件（SCC 内既被写又被读的共享组件）——破环从这里下手。 */
  viaComponents: string[];
  /** 破环建议：在这些系统对之间加显式 runsBefore/runsAfter。 */
  suggestion: string;
}

export interface DanglingEdge {
  system: string;
  capId: string;
  kind: 'runsBefore' | 'runsAfter';
  ref: string; // 指向的不存在系统 id
}

export interface SystemGraphReport {
  systemCount: number;
  phases: number[];
  explicitEdgeCount: number;
  sccs: Scc[];
  danglingEdges: DanglingEdge[];
  duplicateIds: Array<{ id: string; caps: string[] }>;
  /** 全局按 phase 是否可排（无 SCC）。 */
  acyclic: boolean;
}

/** 展平所有能力的系统，标注 capId + phase（缺省 0）。 */
export function collectSystems(caps: readonly CapabilityDefinition[]): SysRef[] {
  const out: SysRef[] = [];
  for (const c of caps) {
    for (const s of c.systems ?? []) {
      out.push({ id: s.id, capId: c.id, phase: s.phase ?? 0, sys: s });
    }
  }
  return out;
}

/** 同一 system id 出现在 >1 能力（全局 idToIndex 会静默覆盖 → 定序不可预期）。 */
export function findDuplicateSystemIds(refs: readonly SysRef[]): Array<{ id: string; caps: string[] }> {
  const byId = new Map<string, string[]>();
  for (const r of refs) {
    const arr = byId.get(r.id) ?? [];
    arr.push(r.capId);
    byId.set(r.id, arr);
  }
  const dups: Array<{ id: string; caps: string[] }> = [];
  for (const [id, caps] of byId) if (caps.length > 1) dups.push({ id, caps });
  return dups.sort((a, b) => a.id.localeCompare(b.id));
}

/** 显式 runsBefore/runsAfter 指向一个**全局都不存在**的系统 id → 静默失效（typo/删系统的定序漏洞）。 */
export function findDanglingEdges(refs: readonly SysRef[]): DanglingEdge[] {
  const known = new Set(refs.map((r) => r.id));
  const out: DanglingEdge[] = [];
  for (const r of refs) {
    for (const ref of r.sys.runsBefore ?? []) if (!known.has(ref)) out.push({ system: r.id, capId: r.capId, kind: 'runsBefore', ref });
    for (const ref of r.sys.runsAfter ?? []) if (!known.has(ref)) out.push({ system: r.id, capId: r.capId, kind: 'runsAfter', ref });
  }
  return out;
}

// 单个 phase 桶内：完全复刻 topological-sort 的最终邻接（组件边经显式覆盖 + 显式边），
// 并记录每条组件边由哪个组件产生（供破环点名）。
interface PhaseGraph {
  refs: SysRef[];
  adj: Set<number>[];
  /** compEdgeComponents[u][v] = 产生 u→v 组件边的组件集合（用于点名 RMW 组件）。 */
  compEdgeComponents: Map<string, Set<string>>;
}

function buildPhaseGraph(refs: SysRef[]): PhaseGraph {
  const n = refs.length;
  const idToIndex = new Map<string, number>();
  refs.forEach((r, i) => idToIndex.set(r.id, i));

  const writersOf = new Map<ComponentType, number[]>();
  for (let i = 0; i < n; i++) for (const w of refs[i].sys.writes) {
    if (!writersOf.has(w)) writersOf.set(w, []);
    writersOf.get(w)!.push(i);
  }
  const componentEdges: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const compEdgeComponents = new Map<string, Set<string>>();
  const noteComp = (u: number, v: number, c: string) => {
    const k = `${u}->${v}`;
    if (!compEdgeComponents.has(k)) compEdgeComponents.set(k, new Set());
    compEdgeComponents.get(k)!.add(c);
  };
  for (let i = 0; i < n; i++) {
    const deps = new Set([...refs[i].sys.reads, ...refs[i].sys.consumes]);
    for (const dep of deps) {
      const writers = writersOf.get(dep);
      if (!writers) continue;
      for (const w of writers) if (w !== i) { componentEdges[w].add(i); noteComp(w, i, dep); }
    }
  }
  // 事件推断边（P1b 总线·与 topological-sort 1b 逐条对齐）：emitter(E) → listener(E)，点名时标 `event:E`。
  const emittersOf = new Map<string, number[]>();
  for (let i = 0; i < n; i++) for (const e of refs[i].sys.emits ?? []) {
    if (!emittersOf.has(e)) emittersOf.set(e, []);
    emittersOf.get(e)!.push(i);
  }
  for (let i = 0; i < n; i++) for (const e of refs[i].sys.listens ?? []) {
    const ems = emittersOf.get(e);
    if (!ems) continue;
    for (const w of ems) if (w !== i) { componentEdges[w].add(i); noteComp(w, i, `event:${e}`); }
  }

  const explicitEdges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (const afterId of refs[i].sys.runsAfter ?? []) { const j = idToIndex.get(afterId); if (j !== undefined && j !== i) explicitEdges.push([j, i]); }
    for (const beforeId of refs[i].sys.runsBefore ?? []) { const j = idToIndex.get(beforeId); if (j !== undefined && j !== i) explicitEdges.push([i, j]); }
  }
  // 显式边删相反方向组件边。
  for (const [u, v] of explicitEdges) componentEdges[v].delete(u);

  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let u = 0; u < n; u++) for (const v of componentEdges[u]) adj[u].add(v);
  for (const [u, v] of explicitEdges) adj[u].add(v);
  return { refs, adj, compEdgeComponents };
}

/** 完整分析：全部能力 → 悬空边 / 重复 id / 逐 phase 最小 SCC（含闭环组件 + 破环建议）。 */
export function analyzeSystemGraph(caps: readonly CapabilityDefinition[]): SystemGraphReport {
  const refs = collectSystems(caps);
  const duplicateIds = findDuplicateSystemIds(refs);
  const danglingEdges = findDanglingEdges(refs);
  let explicitEdgeCount = 0;
  for (const r of refs) explicitEdgeCount += (r.sys.runsBefore?.length ?? 0) + (r.sys.runsAfter?.length ?? 0);

  const phases = Array.from(new Set(refs.map((r) => r.phase))).sort((a, b) => a - b);
  const sccs: Scc[] = [];
  for (const phase of phases) {
    const pref = refs.filter((r) => r.phase === phase);
    const g = buildPhaseGraph(pref);
    for (const comp of stronglyConnectedComponents(g.adj)) {
      const set = new Set(comp);
      const via = new Set<string>();
      for (const u of comp) for (const v of g.adj[u]) {
        if (!set.has(v)) continue;
        const cs = g.compEdgeComponents.get(`${u}->${v}`);
        if (cs) for (const c of cs) via.add(c);
      }
      const systems = comp.map((i) => ({ id: pref[i].id, capId: pref[i].capId })).sort((a, b) => a.id.localeCompare(b.id));
      const viaComponents = [...via].sort();
      sccs.push({
        phase, systems, viaComponents,
        suggestion: viaComponents.length
          ? `在环内系统间加显式 runsBefore/runsAfter 打破 RMW（闭环组件：${viaComponents.join(', ')}）`
          : '在环内系统间加显式 runsBefore/runsAfter 打破',
      });
    }
  }
  return {
    systemCount: refs.length,
    phases,
    explicitEdgeCount,
    sccs,
    danglingEdges,
    duplicateIds,
    acyclic: sccs.length === 0,
  };
}
