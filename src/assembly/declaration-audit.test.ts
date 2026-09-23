import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CAPABILITIES } from './capability-registry.js';
import { analyzeSystemGraph } from './system-graph.js';

// ═══════════════════════════════════════════════════════════════
//  申报对账守卫（REQ-ENGINEAUDIT 根因①·主程 2026-08-16）
//
//  病根（实证）：t2-matrix-duel 结算系统运行期经 resolveDamage 读 Resource，
//  reads 里瞒报了**半个月**——单测/门禁/audit 全绿，因为「申报 vs 实际访问」
//  之间没有任何机器对账；定序按假申报排出的序恰好能跑纯属注册序巧合。
//  （深审 A1 探针4/5 同证：相位错位 acceptance 全绿也是靠巧合。）
//
//  两道防线：
//  ① 申报 vs 实际访问（文件粒度）：能力文件里凡出现对组件名的字面访问
//     （getComponent/hasComponent/removeComponent/query/addComponent{type:…}），
//     该组件名必须出现在**同文件某个系统的 reads/writes/consumes 申报**里。
//     文件粒度是刻意的：resolveDamage 这类模块内帮手函数被 execute 调用，
//     逐系统归属静态判不动，但「文件里访问了、全文件零申报」恒为瞒报形态。
//  ② 全库软环棘轮：analyzeSystemGraph 的 SCC 报告此前只进 stderr 无人收割
//     （每趟 12~58 条告警）。基线**点名写死**——多一个环红（新瞒报/新耦合），
//     少一个也红（有人破了环 → 有意识地更新基线，不许静默漂移）。
//
//  局限（诚实声明）：静态字面量扫描抓不到「组件名经变量传入」的访问——那是
//  下一级（运行时探针对账）的活；本守卫先把主流形态（全库访问几乎全为字面量）
//  钉死，恰好覆盖 resolveDamage 那类真实病例。
// ═══════════════════════════════════════════════════════════════

const SKILLS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

/** 递归收集 src/skills 下的能力源文件（排除测试）。 */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listSourceFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** 文件里全部**系统级**申报（reads/writes/consumes）出现过的组件名并集。
 *  只认 `systems:` 之后的申报数组——capability 级聚合（components: {reads…}）是文档性质，
 *  定序真正消费的是 system 级；只在聚合里写、系统里漏 = 排序照样瞎（撤修验红实测：
 *  只删 system 级 NavAgent 时全文件并集仍被聚合兜住 → 守卫假绿，故收紧到此口径）。
 *  依赖 defineCapability 的书写惯例（components/config 在前、systems 在后·全库成立）。 */
function declaredUnion(src: string): Set<string> {
  const out = new Set<string>();
  // 行首锚定（复查建议 2026-08-16）：头注释里出现 `systems:` 字样会让裸 indexOf 提前切片，
  // 把聚合级混进并集（keybind.ts 实测形态）——只认真正的声明行。
  const m0 = /^\s{2}systems:\s*\[/m.exec(src);
  const scope = m0 === null ? src : src.slice(m0.index);
  for (const m of scope.matchAll(/(?:reads|writes|consumes):\s*\[([^\]]*)\]/g)) {
    for (const q of m[1].matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)) out.add(q[1]);
  }
  return out;
}

/** 文件里对组件名的字面访问（读侧 + 写侧一并收——申报并集不分侧，对账口径同并集）。 */
function accessedComponents(src: string): Set<string> {
  const out = new Set<string>();
  // getComponent<T>(eid, 'X') / hasComponent(eid, 'X') / removeComponent(eid, 'X')
  for (const m of src.matchAll(/\.(?:getComponent(?:<[^>]*>)?|hasComponent|removeComponent)\(\s*[^,)]+,\s*'([A-Za-z][A-Za-z0-9]*)'/g)) {
    out.add(m[1]);
  }
  // query('A', 'B', …)——参数全是组件名字面量
  for (const m of src.matchAll(/\.query\(([^)]*)\)/g)) {
    for (const q of m[1].matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)) out.add(q[1]);
  }
  // addComponent(eid, { type: 'X', … })——字面组件体（变量传入的抓不到·见文件头「局限」）
  for (const m of src.matchAll(/\.addComponent\(\s*[^,)]+,\s*\{\s*type:\s*'([A-Za-z][A-Za-z0-9]*)'/g)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * 豁免名单（逐条附实查理由·棘轮：只许清账不许添新——添新 = 又一个 resolveDamage 潜伏中）。
 * 键 = `<相对路径>|<组件名>`。
 */
const ACCESS_WHITELIST = new Map<string, string>([
  // debug-trace 案（日志基准守则）：opt-in 观测件，挂哪算哪、绝不进 hash/定序语义——
  // 各系统按守则读它属守则设计（NON_DETERMINISTIC 在案），不计瞒报。
  ...listWhitelist('DebugTrace', 'debug-trace 守则：opt-in 观测·NON_DETERMINISTIC 在案·不进定序语义'),
]);
function listWhitelist(comp: string, reason: string): Array<[string, string]> {
  // DebugTrace 的访问点在各能力文件里都是 findDebugTrace/appendTrace 的字面透传——按组件名统一豁免。
  return listSourceFiles(SKILLS_ROOT).map((f) => [`${relative(SKILLS_ROOT, f)}|${comp}`, reason]);
}

describe('申报对账 — 能力文件的实际组件访问 ⊆ 同文件系统申报并集（根因①）', () => {
  it('全库零瞒报（豁免逐条附理由·新增访问必须同步申报）', () => {
    const violations: string[] = [];
    for (const file of listSourceFiles(SKILLS_ROOT)) {
      const src = readFileSync(file, 'utf8');
      if (!/systems:\s*\[/.test(src) || !/execute\(/.test(src)) continue; // 纯帮手/纯数据模块不在对账面
      const declared = declaredUnion(src);
      if (declared.size === 0) continue; // 零申报系统文件（如纯 config 能力）另有 registry 守卫管
      const rel = relative(SKILLS_ROOT, file);
      for (const comp of accessedComponents(src)) {
        if (declared.has(comp)) continue;
        if (ACCESS_WHITELIST.has(`${rel}|${comp}`)) continue;
        violations.push(`${rel} 访问了 '${comp}' 但全文件零申报（reads/writes/consumes 都没有）`);
      }
    }
    // 出红时读这行：要么补申报（诚实化·注意定序影响，参照 matrix-duel 根因①先例——
    // 显式 runsBefore 压反向软边），要么真不该访问（改数据路由），最后才是附理由进豁免。
    expect(violations.sort()).toEqual([]);
  });

  it('守卫自检：对账逻辑真能咬住 resolveDamage 形态（合成样本·非真文件）', () => {
    // 半个月瞒报病例的最小复刻：execute 经帮手读 'Resource'，全文件申报只有别的组件。
    const sample = `
      function helper(world) { return world.getComponent<Resource>('e', 'Resource'); }
      export const cap = { systems: [{ id: 's', reads: ['DuelMatrix'], writes: ['ResourceModify'], consumes: [], execute(world) { helper(world); } }] };
    `;
    const declared = declaredUnion(sample);
    const accessed = accessedComponents(sample);
    expect(accessed.has('Resource')).toBe(true);
    expect(declared.has('Resource')).toBe(false); // ← 瞒报形态被识别
    expect([...accessed].filter((c) => !declared.has(c))).toEqual(['Resource']);
  });
});

// ── 相位落桶点名棘轮（根因① spec 第三腿·深审 A1 探针4）───────────────
// 病：把宣告系统挪错相位（Update↔Commit）没有任何机器咬——单测靠手写申报断言、
// acceptance 全绿纯靠注册序巧合。相位是语义（谁在事件清扫前/后跑），机器判不了「对不对」，
// 但能判「变没变」：非缺省相位的成员点名写死——进桶/出桶/挪桶都红，改相位必须带一次
// 有意识的基线更新（p0 缺省桶不点名：新系统默认落 p0 属日常，不设摩擦）。
describe('相位落桶棘轮 — 非缺省相位成员点名（根因①·A1 探针4 的机器化）', () => {
  it('非缺省相位的系统集合与基线逐一相等（挪相位必须同提交改基线）', () => {
    const byPhase = new Map<number, string[]>();
    for (const c of ALL_CAPABILITIES) {
      for (const s of c.systems ?? []) {
        const p = s.phase ?? 0;
        if (p === 0) continue;
        if (!byPhase.has(p)) byPhase.set(p, []);
        byPhase.get(p)!.push(s.id);
      }
    }
    const actual = [...byPhase.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([p, ids]) => `p${p}:${ids.sort().join(',')}`);
    expect(actual).toEqual(PHASE_BASELINE);
  });
});

/** 相位基线（2026-08-16 实测灌入）。改动纪律同 SCC 基线：挪相位 = 同提交带理由更新本表。 */
const PHASE_BASELINE: string[] = [
  // CAPGAP-RHETORIC-001 补充 A：把受控 InputQueue action.arg 路由成身份牌命令，必须早于 Intent 的解释器。
  'p-20:identity-card-input',
  // CAPGAP-RHETORIC-001：身份牌命令属于 Intent；只产 ResourceModify，交后续 Update 的 resource-apply 提交，避开资源 RMW SCC。
  'p-10:identity-card-play',
  'p4:rotation-apply',
  'p10:collision-resolve,collision-resolve-3d,tile-collision',
  'p14:conveyor-queue,friction,gauge,hierarchy-resolve,orbit-motion,text-binding',
  'p20:anim-state,block-view-sync,bounds-clamp,cooldown,craft-recipe,effect-apply,face-rotate,facing,jump,match-view-sync,matrix-duel-announce,matrix-duel-intent,stat-bind,weighted-spawn',
  'p30:group-gc', // 2026-09-08 G4 group 配套：Cleanup 相位（destroy-apply 之后摘除已销毁成员）
];

// ── 全库软环棘轮 ─────────────────────────────────────────────────
// analyzeSystemGraph 是「全局超集」分析（现实 world 只装子集·DAG 子图恒 DAG），
// 故 SCC 在这里作**棘轮**不作硬错：环的**点名集合**写死——
// 新环 = 有人引入了新的软耦合（大概率又是一次瞒报或缺显式边），当场红；
// 环消失 = 有人破了环，有意识地把它从基线删掉（禁静默漂移）。
describe('系统图软环棘轮 — 全库 SCC 点名基线（根因①·告警收割）', () => {
  it('SCC 集合与基线逐一相等（多一个红·少一个也红）', () => {
    const rep = analyzeSystemGraph(ALL_CAPABILITIES);
    // 硬不变量（system-graph.test.ts 已各自守着,此处顺带复核）：
    expect(rep.danglingEdges).toEqual([]);
    expect(rep.duplicateIds).toEqual([]);
    const sccKeys = rep.sccs
      .map((s) => `p${s.phase}:${s.systems.map((x) => x.id).sort().join('+')}|via:${s.viaComponents.join(',')}`)
      .sort();
    expect(sccKeys).toEqual(SCC_BASELINE);
  });
});

/**
 * 软环基线（2026-08-16 实测灌入·**六处瞒报补申报之后**的形状）。
 * 每条 = 一处「全局超集里成环、现实 world 只装子集/靠显式边活着」的在案耦合（DAG 子图恒 DAG，
 * 见 system-graph 文件头——真实装载若闭环，topological-sort 会 warn，matrix-duel 定序测试即先例防线）。
 * p0 大环 45 系统属全局超集现象：诚实申报越全它越大，不是病本身；病是**它变了没人看见**。
 * 变更纪律：新增 = 先按根因① matrix-duel 先例尝试显式边/数据路由消解，消不动才带理由改行；
 * 减少 = 同提交更新（记下是谁破的环）。禁静默改基线换绿。
 */
// 2026-09-03 P1a 严格模式补申报：match-resolve 补报 writes RandomSeed（nextRandom 推进 seed·此前漏报）→ 与其它
// RandomSeed RMW 系统在全库超集图里显影为同一 SCC（真实世界从不同时装载·全库测试 tick 零成环告警）。基线随之 +1 成员。
const SCC_BASELINE: string[] = [
  // p0 大环：prefab-spawn「展开殿后」十连钉边后 caster/merge-rule/mortal/prefab-spawn 已脱环
  // （PrefabOrigin/SpawnRequest 不再是闭环组件）——本行若再变大，先查是谁的新申报/新读面把它拉回来的。
  // 2026-09-12 +intent-barrier（REQ-111-AINPC）：**有意识的基线更新**，不是放过一个新环。
  // 查过了——它入环的形状与 turn-order / keybind / clickable **完全同款**：`runsAfter event-when`
  // 给它一条从环内来的显式入边，而它 `writes:['Signal']` 又给环内所有读 Signal 的系统去一条出边。
  // 任何「排在事件清扫之后、且发信号」的系统都必然落进这个 blob，这是 CYCLEHAZ 的类问题（方案 C 相位化才是正解），
  // 不是本件的申报缺陷。**本件真有过的那个缺陷已另行治本**：首版它还 `reads:['TurnOrder']`，
  // 与 turn-order 构成真 2-环（strict 模式当场抛）；改成由 `setBarrierTurn` 推回合号后那条读边消失，
  // 2-环随之消失（`intent-barrier.test.ts` ⑦ 断言 strict 不抛 + warn 数为零 + 系统不读 TurnOrder）。
  'p0:accel-apply+aggro+block-place+bounce-relay+card-pile+card-play-input+card-score-pass+clickable+dialogue+dice-roll+drag-place+drop-zone+event-when+flow+flow-field+grid-drag-square+grid-move+group-count+hitbox+intent-barrier+keybind+launch+match-resolve+match3-drag-swap+matrix-duel+merge-on-place+merge-proximity-clear+motion-apply+nav-follow+navmesh-bake+order-fulfill+over-time+overlap-detect+path-follow+poker-eval+pull-anchor+queue-slots+resource-apply+self-rule+state-sync+steering+string-apply+t3-slot-payout+timeline+tray+trigger-zone+turn-order+tween+zone-occupancy|via:Bounce,Clickable,Flag,HexPos,MergeEvent,NavGraph,OverTime,Overlap,PlaceBlockIntent,PlayedHand,RandomSeed,Relation,Resource,ResourceModify,RolledDice,Signal,State,Status,StringVar,Transform,Trigger,Tween,Velocity',
  'p10:collision-resolve+collision-resolve-3d+tile-collision|via:Transform,Velocity',
  'p20:anim-state+match-view-sync|via:Sprite',
  'p20:bounds-clamp+facing|via:Transform',
];
