import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import type { IWorld } from '@engine/core/types.js';
import type { Signal } from '@engine/protocol/components.js';
import { findDebugTrace, appendTrace } from '../debug-trace.js';
import {
  decayEntries, evictWeakest, normalizeEntry, recallFrom, sortById,
  type Memory, type MemoryEntry, type MemoryRules, type RecallQuery,
} from './memory-core.js';

// ═══════════════════════════════════════════════════════════════
//  t2-memory —— 记忆原语（REQ-111-MEMORY · owner 2026-09-12 判 A）
//
//  要表达的一句话：**「谁在何时对谁做了什么，且这件事会淡忘、会被传开」**。
//  实查结论（下沉依据）：registry 零记忆能力；`t1-event-log` 只是平铺流水（无衰减/无检索/无归属，
//  且未注册为 capability）；`f1-resource` + `x3-string-variable` 硬凑 = 在游戏层写一个检索解释器，
//  正是宪法明禁的「数据表 + 游戏层自写解释器」。通用性证据已在库里——game101（海港绯闻）
//  整作以「绯闻传播」为名，与记忆流转同构。
//
//  四件事，全是数据：
//    ① 记账 `remember`：条目 = { id, subject, object?, turn, strength, tags, source }。
//    ② 衰减：逐标签速率（`MemoryRules.decay`），强度降到 `forgetBelow` 以下即遗忘（移除）。
//       触发二选一：`decaySignal`（回合制游戏一回合一次·推荐）或 `period` 拍计数（照抄 `t2-over-time` 的形状）。
//    ③ 检索 `recall`：标签命中 + 强度 + 时近，**整数**打分取 top-K。
//    ④ 流转 `shareMemory`：把一条复制给另一 NPC 并打折强度——涌现叙事「链式影响」的唯一载体。
//
//  **算法全在 `memory-core.ts`**（纯函数核·零 World）：打分/排序/衰减/淘汰。本文件只剩读写世界 + 系统声明。
//
//  ── 确定性口径（🔴 本件进 hash）────────────────────────────────────────
//  · **全整数**（核里逐条注明）：除法只出现在 `shareMemory` 的打折处且走 `Math.floor`。
//  · **全序**：检索/淘汰同分时按条目 id 升序兜底，绝不留「同分看谁先来」。
//  · **禁墙钟**：时间轴只有调用方传进来的整数回合号与本系统数的拍数。
//  · **存档兼容**：两个组件都是新增，旧档里不存在 → 缺席即不进 canonical，旧档 hash 语义原样不变。
//    已有档要加记忆，挂空 `Memory{entries:[]}` 即可；空 entries 本身也改 hash，故属**新世代存档**，
//    不做旧档原地迁移（无歧义口径：旧档 = 无记忆世界，读出来照旧跑）。
//
//  定序：`memory-decay` 跑在 `Update`，`runsAfter event-when`（信号由它每拍开头清场，同 keybind/turn-order 纪律）。
//  不声明 `runsBefore`：衰减结果按标准离散反馈给**下一拍**的读侧，不跟任何系统抢同拍次序。
// ═══════════════════════════════════════════════════════════════

export type { Memory, MemoryEntry, MemoryRules, RecallQuery, RecallWeights } from './memory-core.js';
export { recallFrom, scoreEntry, decayAmount, decayEntries, DEFAULT_WEIGHTS } from './memory-core.js';

/** 取某实体的 top-K 记忆（无 `Memory` → 空数组）。 */
export function recall(world: IWorld, entityId: string, q: RecallQuery = {}): MemoryEntry[] {
  const m = world.getComponent<Memory>(entityId, 'Memory');
  return m ? recallFrom(m.entries, q) : [];
}

/** 取规则表（`rulesId` 指名优先，否则取实体 id 最小的那个 MemoryRules；全无 → undefined）。 */
export function findMemoryRules(world: IWorld, rulesId?: string): MemoryRules | undefined {
  let fallback: MemoryRules | undefined;
  for (const id of sortedIds(world, 'MemoryRules')) {
    const r = world.getComponent<MemoryRules>(id, 'MemoryRules');
    if (!r) continue;
    if (rulesId !== undefined && r.id === rulesId) return r;
    if (fallback === undefined) fallback = r;
  }
  return rulesId === undefined ? fallback : undefined;
}

/**
 * 记一条（无 `Memory` 组件则新建）。同 id 已在 → **刷新**（取强度较大者 + 更新回合号/来源），不叠第二条。
 * 强度/回合号一律 trunc 归一：小数强度进 hash 就是一个跨端漂移源，而调用方是数据侧（可能是 LLM 产的数）。
 */
export function remember(world: IWorld, entityId: string, entry: MemoryEntry): void {
  const norm = normalizeEntry(entry);
  let m = world.getComponent<Memory>(entityId, 'Memory');
  if (!m) {
    world.addComponent<Memory>(entityId, { type: 'Memory', entries: [norm] });
    m = world.getComponent<Memory>(entityId, 'Memory');
  } else {
    const i = m.entries.findIndex((e) => e.id === norm.id);
    if (i >= 0) m.entries[i] = { ...norm, strength: Math.max(m.entries[i].strength, norm.strength) };
    else m.entries.push(norm);
  }
  if (!m) return;
  const max = findMemoryRules(world, m.rulesId)?.max;
  if (max !== undefined && max > 0 && m.entries.length > max) m.entries = evictWeakest(m.entries, max);
  // **entries 恒按 id 升序存**（不是为了好看）：数组序会进 canonical，也就是进 hash。若按插入序存，
  // 「谁先被记」这件事就成了世界指纹的一部分——而它会被「本端哪个 NPC 先回包」之类的本地事实影响。
  // 排序存之后，记忆集合相同 ⇒ hash 必然相同（memory.test.ts「插入序不改 hash」钉死）。
  sortById(m.entries);
}

/**
 * 把一条记忆转述给另一个实体（**链式影响的唯一载体**）。
 * 副本 id = `<原 id>><收方>`（再转述同 id 走 `remember` 的刷新路径，不无限增殖）；
 * 强度 = `floor(原强度 × shareDiscount / 1000)`；`source` = `share:<转述方>` —— 「这条记忆从哪来」
 * 可被 UI 显示、可被测试断言，正是 framework §6④ 判 B 时附带约束要的那个可观测落点。
 * 返回副本强度；原条目不存在 / 折后为 0 → 不写、返回 0（「什么都没发生」的分支记 `reject`）。
 */
export function shareMemory(world: IWorld, fromId: string, toId: string, entryId: string): number {
  const trace = findDebugTrace(world);
  const tk = trace?.tick ?? 0;   // trace 红线②：拍号取世界的，绝不 Date.now()
  const src = world.getComponent<Memory>(fromId, 'Memory');
  const e = src?.entries.find((x) => x.id === entryId);
  if (!e) {
    appendTrace(trace, tk, 'memory-share', 'reject', `${fromId}→${toId} ${entryId}`, 'no-entry');
    return 0;
  }
  const permille = Math.trunc(findMemoryRules(world, src?.rulesId)?.shareDiscount ?? 1000);
  const strength = Math.floor(e.strength * permille / 1000);
  if (strength <= 0) {
    appendTrace(trace, tk, 'memory-share', 'reject', `${fromId}→${toId} ${entryId}`, 'discounted-to-zero');
    return 0;
  }
  remember(world, toId, {
    id: `${e.id}>${toId}`, subject: e.subject, object: e.object, turn: e.turn,
    strength, tags: [...e.tags], source: `share:${fromId}`,
  });
  appendTrace(trace, tk, 'memory-share', 'commit', `${fromId}→${toId} ${entryId}`, `strength=${strength}`);
  return strength;
}

export const memoryCapability = defineCapability({
  id: 't2-memory',
  version: '1.0.0',

  describe: {
    name: 'memory',
    summary: '记忆原语：条目(主体/客体/回合/强度/标签/来源) + 逐标签衰减与遗忘 + 确定性整数 top-K 检索 + 跨实体转述(打折强度)。',
    semantic: ['tier2', 'npc', 'memory', 'social', 'emergent-narrative'],
    whenToUse:
      'NPC 要「记住谁对自己做过什么、会淡忘、会被传开」：实体挂 Memory{entries:[]}，世界挂一份 MemoryRules{id, decay:[{tag,amount}], forgetBelow, max, shareDiscount, decaySignal|period}；写用 remember()，读用 recall()（标签+强度+时近整数打分 top-K），传播用 shareMemory()。绯闻/仇怨/好感来源/证词链通用。只要计数则 f1-resource 台账就够，别上本件。',
    examples: [
      'MemoryRules{ id:"town", decay:[{tag:"gossip",amount:5},{tag:"trauma",amount:1}], defaultDecay:2, forgetBelow:1, max:40, shareDiscount:600, decaySignal:"newTurn" }',
      'remember(world,"npc-mol",{ id:"m1", subject:"player", object:"npc-mol", turn:7, strength:80, tags:["gossip"], source:"talk:3" })',
      'recall(world,"npc-mol",{ tags:["gossip"], k:3, now:12 }) → 按 命中×100 + 强度 + 时近×2 整数打分取前三',
      'shareMemory(world,"npc-mol","npc-naro","m1") → npc-naro 得 id "m1>npc-naro"·强度 80×600/1000=48·source "share:npc-mol"',
    ],
  },

  components: {
    provides: {
      Memory: {
        category: 'resource',
        describe: '记忆容器：条目列表（POD·进 hash·恒按 id 升序存）。衰减/遗忘由 memory-decay 系统按 MemoryRules 结算。',
        fields: {
          entries: { type: 'string[]', describe: 'MemoryEntry[]（{id,subject,object?,turn,strength,tags,source}）' },
          rulesId: { type: 'string', describe: '规则表 id（缺省取世界里第一个 MemoryRules）' },
          ticks: { type: 'number', describe: 'period 模式的拍计数（内部运行态）' },
        },
        schema: t.obj({
          entries: t.arr(t.obj({
            id: t.str(), subject: t.str(), object: t.opt(t.str()), turn: t.num(),
            strength: t.num(), tags: t.arr(t.str()), source: t.str(),
          })),
          rulesId: t.opt(t.str()),
          ticks: t.opt(t.num()),
        }),
      },
      MemoryRules: {
        category: 'config',
        describe: '衰减/遗忘/容量/转述折扣的数据表（单例·按 id 定位）。衰减触发：decaySignal 优先，否则 period 拍计数。',
        fields: {
          id: { type: 'string', describe: '规则表 id' },
          decay: { type: 'string[]', describe: '[{tag,amount}]：逐标签衰减量（命中多个取最大）' },
          defaultDecay: { type: 'number', describe: '未命中标签时的衰减量（缺省 1）' },
          forgetBelow: { type: 'number', describe: '强度低于此值即遗忘（缺省 1）' },
          max: { type: 'number', describe: '每实体条目上限（超了丢最弱）' },
          shareDiscount: { type: 'number', describe: '转述折扣（千分比·缺省 1000 不打折）' },
          decaySignal: { type: 'string', describe: '衰减触发信号名（回合制：一回合一次）' },
          period: { type: 'number', describe: '衰减周期（拍）·decaySignal 缺省时用；0 = 不自动衰减' },
        },
        schema: t.obj({
          id: t.str(),
          decay: t.arr(t.obj({ tag: t.str(), amount: t.num() })),
          defaultDecay: t.opt(t.num()), forgetBelow: t.opt(t.num()), max: t.opt(t.num()),
          shareDiscount: t.opt(t.num()), decaySignal: t.opt(t.str()), period: t.opt(t.num()),
        }),
      },
    },
    reads: ['Memory', 'MemoryRules', 'Signal'],
    writes: ['Memory'],
    consumes: [],
  },

  config: {
    forgetBelow: { type: 'number', default: 1, describe: '遗忘阈值', question: '强度降到多少以下就忘掉？', ui: { control: 'input' } },
    shareDiscount: { type: 'number', default: 600, describe: '转述折扣（千分比）', question: '一句话转述一遍，还剩几成可信？', ui: { control: 'input' } },
  },

  systems: [
    {
      id: 'memory-decay',
      // 信号由 event-when 每拍开头清场 → 读信号的系统一律排它之后（同 keybind/clickable/turn-order 纪律）。
      runsAfter: ['event-when'],
      reads: ['Memory', 'MemoryRules', 'Signal'],
      writes: ['Memory'],
      consumes: [],
      execute(world: IWorld) {
        const holders = sortedIds(world, 'Memory');
        if (holders.length === 0) return;
        let names: Set<string> | undefined;   // 本拍在场的信号名（按需收集一次·与 turn-order 同形）
        const signalPresent = (name: string): boolean => {
          if (!names) {
            names = new Set<string>();
            for (const [sid] of world.query('Signal')) {
              const s = world.getComponent<Signal>(sid, 'Signal');
              if (s) names.add(s.name);
            }
          }
          return names.has(name);
        };

        const trace = findDebugTrace(world);
        let decayed = 0, forgot = 0;
        for (const id of holders) {
          const m = world.getComponent<Memory>(id, 'Memory');
          if (!m || m.entries.length === 0) continue;
          const rules = findMemoryRules(world, m.rulesId);
          if (!rules) continue;   // 缺规则 ≠ 用一套隐含默认值偷偷改世界

          // 触发判据（二选一·全整数·零墙钟）：具名信号 / 拍周期。
          let fire: boolean;
          if (rules.decaySignal !== undefined) {
            fire = signalPresent(rules.decaySignal);
          } else {
            const period = Math.trunc(rules.period ?? 0);
            if (period <= 0) continue;
            const ticks = (m.ticks ?? 0) + 1;
            m.ticks = ticks % period;
            fire = ticks % period === 0;
          }
          if (!fire) continue;

          const { survivors, forgot: gone } = decayEntries(m.entries, rules);
          forgot += gone;
          decayed += 1;
          if (survivors.length !== m.entries.length) m.entries = survivors;
        }
        // 密度：每拍最多一条（无事 0 条）。`reject` 那一类在 shareMemory / 调用侧记，这里只记聚合结果。
        if (decayed > 0) appendTrace(trace, trace?.tick ?? 0, 'memory-decay', 'commit', `decayed=${decayed}`, forgot > 0 ? `forgot=${forgot}` : undefined);
      },
    },
  ],
});
