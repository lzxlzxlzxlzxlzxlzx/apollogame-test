import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld, Component } from '@engine/core/types.js';
import type { StatBind, ModifierTotals, Stats } from '@engine/protocol/components.js';
import { findDebugTrace, appendTrace } from '@skills/debug-trace.js';

// 投影目标组件闭集（= 本能力的 writes 申报·单一真相）。P1a 严格模式实证：目标是数据驱动的（binding.component），
// 申报却是固定表——数据写到表外组件（game-103 曾投到 Velocity）= 调度图不知情的写入。故：表加 Velocity，
// 且运行时按表校验，表外目标 reject 留痕跳过（不静默写）。要投新组件 → 加进本表（= 加进申报）。
export const STAT_BIND_TARGETS = ['Controllable', 'Steering', 'Shape', 'Hitbox', 'Timer', 'Caster', 'Resource', 'Velocity'] as const;
const TARGET_SET: ReadonlySet<string> = new Set(STAT_BIND_TARGETS);

// ═══════════════════════════════════════════════════════════════
//  stat-bind —— 属性桥/投影器（REQ-SURVIVOR被动轴）。modifier-stack 产出一张 ModifierTotals.totals，
//  t2-stats 产出一份 Stats.effective——但谁都不知道该把哪个字段写回哪个具体组件（moveSpeed 该写
//  Controllable.speed 还是 Steering.speed？range 该写 Shape.radius 还是别的？）。这道"聚合值 → 具体
//  组件字段"的接线此前无处表达，游戏层只能手写 system 逐字段抄，正是数据驱动宣言要拒绝的那种代码。
//
//  StatBind{bindings:[{source,key,component,field,op?,base?}]} 一实体多条 binding：
//    source:'ModifierTotals' → 读世界单例聚合表 totals[key]；source:'Stats' → 读本实体 Stats.effective[key]。
//    投影目标 = getComponent(id, binding.component)[binding.field]；目标组件不存在 → 跳过（绝不代创建）。
//
//  ⚠️ 幂等投影（第一坑）：目标字段按 **binding.base**（不是当前字段值）与源值组合，每 tick 从 base 重算：
//    set: v／mul: base×v／add: base+v／div: base÷v（防除零回退 base，攻速→冷却的逆映射专用）。
//    绝不 `c[field] = c[field] * v` 读当前字段再改——那样每 tick 复利滚雪球，几拍就爆、破确定性
//    （同 aggregateModifiers/computeEffective 的"每帧从源头全量重算"纪律，见 modifier-stack.ts/stats.ts）。
//
//  定序（第二坑：撞环，踩过 runsAfter 才摸清楚）：最初想法是 stat-bind 留在 Update 相位、靠
//  runsAfter:['modifier-stack','resource-apply','timer-advance'] 打破"modifier-stack 读 Resource/Timer
//  （valueFrom/gate）而 stat-bind 又写 Resource/Timer"这条传递环。但 Update 相位内还有更多**预先存在**的
//  显式边会连锁反应：hitbox 自带 runsBefore:['resource-apply']（伤害要同帧落地）、steering 自带
//  runsBefore:['hitbox']（CC 要读上一拍 Status）——一旦要求 stat-bind 排在 resource-apply 之后、
//  又要排在 hitbox/steering 之前（好让它们同帧读到投影值），就与这两条已有显式边首尾相接成环
//  （steering→hitbox→resource-apply→stat-bind→steering，或若反过来也一样打不开）。这类"新增一个
//  Update 相位系统就要跟全场所有既有 runsAfter/runsBefore 逐个对齐"的打地鼠没有尽头。
//  **真正的解**：跳出 Update 相位——stat-bind 是"读本 tick 已算好的 ModifierTotals/Stats 结果、
//  提交最终投影"，语义上正是 Commit 相位（同 jump/effect-apply/craft-recipe/bounds-clamp/facing/anim-state
//  的"基于本 tick 解算结果的最终写入"，见 tier1/2/index.ts phase 注释）。phase 号只升不将跨相位排回，
//  topological-sort.ts 按 phase 分桶各自排序、桶间零边——stat-bind 落在 Commit 后，自动排在全部
//  Update 相位系统（modifier-stack/stat-apply/resource-apply/timer-advance/hitbox/steering/caster…）
//  之后，零 runsAfter、零环，且对未来任何新增 Update 系统天然免疫（不必逐个加显式边）。
//  代价：投影写的 Resource.max/Timer.duration/Steering.speed 等要下一 tick 的 Update 相位系统才读到
//  最新值——与 steering 读"上一拍 Status"（冻结延迟一帧生效）同一纪律，可接受、非 bug。
//  已知残留债（不在本次 REQ 范围，供后续 REQ 参考）：t2-craft-recipe / t2-effect-apply 也在 Commit 相位
//  且分别 RMW Resource / RMW Timer——若某游戏把它们与 stat-bind 的对应 binding 同装，仍可能撞环，
//  届时按同法加显式 runsAfter/runsBefore 即可（本次未验证、未处理，游戏层若撞上按 requests.md 报）。
//
//  确定性：纯算术（set/mul/add/div 四则运算），无 Math.random/Date.now/墙钟；world.query 结果按 id 排序
//  遍历（与 modifier-stack/steering 同惯例）。
// ═══════════════════════════════════════════════════════════════

/** 幂等投影核：按 op 把 base 与源值 v 组合成目标字段新值（纯函数，不读当前字段值）。 */
export function projectStatBind(op: 'set' | 'mul' | 'add' | 'div', base: number | undefined, v: number): number {
  switch (op) {
    case 'mul':
      return (base ?? 1) * v;
    case 'add':
      return (base ?? 0) + v;
    case 'div':
      return v !== 0 ? (base ?? 0) / v : (base ?? 0);
    case 'set':
    default:
      return v;
  }
}

/** 世界里第一个 ModifierTotals 实体（约定单例，同 dice-roll/effect-apply 找首个 RandomSeed 的惯例）。 */
function findWorldTotals(world: IWorld): ModifierTotals | undefined {
  const id = world.singleton('ModifierTotals'); // 黑板单例（P1b）：严格模式多份即抛·生产按创建序取首个（= 旧 for…break 语义）
  return id === undefined ? undefined : world.getComponent<ModifierTotals>(id, 'ModifierTotals');
}

export const statBindCapability = defineCapability({
  id: 't2-stat-bind',
  version: '1.0.0',

  describe: {
    name: 'stat-bind',
    summary: '属性桥：把 ModifierTotals(世界单例聚合表) 或 Stats(本实体 effective) 按 key 投影到本实体任意其它组件的字段（幂等重算：目标=base 与源值按 op 组合，绝不复利累积）。目标组件不存在则跳过该 binding。',
    semantic: ['tier2', 'logic', 'stat', 'modifier', 'bridge'],
    whenToUse:
      '装备/buff/羁绊算出的聚合数值需要真正驱动某个具体组件字段时（moveSpeed 要改 Controllable.speed/Steering.speed、range 要改 Shape.radius、attackSpeed 要改 Timer.duration、maxHp 要改 Resource.max）。挂 StatBind{bindings}，每条声明 source+key（读哪个聚合值）+ component+field（写哪个组件字段）+ op/base（怎么组合）。modifier-stack/stats 只产出总表/effective，本能力才是"总表落地生效"那一步。',
    examples: [
      '移速加成：{ source:"ModifierTotals", key:"moveSpeed", component:"Controllable", field:"speed", op:"mul", base:3 } → Controllable.speed = 3×totals.moveSpeed',
      '射程加成：{ source:"ModifierTotals", key:"range", component:"Shape", field:"radius", op:"mul", base:20 } → Shape.radius = 20×totals.range',
      '攻速→冷却：{ source:"ModifierTotals", key:"attackSpeed", component:"Timer", field:"duration", op:"div", base:60 } → Timer.duration = 60÷totals.attackSpeed（攻速倍率越高冷却越短）',
      '最大生命：{ source:"Stats", key:"maxHp", component:"Resource", field:"max", op:"set" } → Resource.max = Stats.effective.maxHp',
    ],
  },

  components: {
    provides: {
      StatBind: {
        category: 'config',
        describe: '属性投影表：每条 binding 把一个聚合源字段(ModifierTotals 单例 或 本实体 Stats.effective)按 op 投影到本实体某组件的某字段。目标组件不存在则跳过；每 tick 从 base 幂等重算。',
        fields: {
          bindings: { type: 'string', describe: '投影条目列表 [{source,key,component,field,op?,base?}]（source: ModifierTotals|Stats；op 缺省 set）' },
        },
      },
    },
    // 只读真正的源：StatBind(配置) + ModifierTotals(世界单例聚合) + Stats(本实体 effective)。
    // ⚠️ 目标组件（Controllable/Steering/Shape/Hitbox/Timer/Caster/Resource…）只 write 不 read——本能力是
    // 纯投影器（目标字段 = base∘v·从不读当前字段值），若把它们放进 reads，会与同相位其它 RMW 同组件的
    // 系统多出一条反向"读边"→撞 Circular：effect-apply / craft-recipe 皆 Commit 相位且 RMW Resource/Timer，
    // 而 game-103 蓝图已装 effect-apply——一旦游戏加 maxHp→Resource（或 attackSpeed→Timer）binding 即成环
    // 蓝图 load 不了（PE-103 踩过的同类死环）。故 reads 不含写目标·只靠 writes 让本相位读者排在其后（单向边）。
    reads: ['StatBind', 'ModifierTotals', 'Stats'],
    writes: [...STAT_BIND_TARGETS],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'stat-bind',
      // Commit 相位（见文件头"定序·第二坑"注释）：读本 tick 已算好的 ModifierTotals/Stats、提交最终投影。
      // phase 分桶保证自动排在全部 Update 相位系统之后，零 runsAfter、零环，见文件头详述。
      phase: SystemPhase.Commit,
      reads: ['StatBind', 'ModifierTotals', 'Stats'],
      writes: [...STAT_BIND_TARGETS],
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'StatBind');
        if (ids.length === 0) return;

        // 世界单例 ModifierTotals：本 tick 只查一次（同 dice-roll 找首个 RandomSeed 的缓存惯例）。
        let totals: ModifierTotals | undefined;
        let totalsResolved = false;

        for (const id of ids) {
          const sb = world.getComponent<StatBind>(id, 'StatBind');
          if (!sb) continue;

          for (const b of sb.bindings) {
            // ① 取源值 v：缺源（无单例 / 无 Stats / 无该 key）→ 跳过本条，不崩、不写。
            let v: number | undefined;
            if (b.source === 'ModifierTotals') {
              if (!totalsResolved) {
                totals = findWorldTotals(world);
                totalsResolved = true;
              }
              const raw = totals?.totals[b.key];
              v = typeof raw === 'number' ? raw : undefined;
            } else {
              const stats = world.getComponent<Stats>(id, 'Stats');
              const raw = stats?.effective[b.key];
              v = typeof raw === 'number' ? raw : undefined;
            }
            if (v === undefined) continue;

            // ② 取目标组件：表外目标 → reject 留痕跳过（申报闭集之外的写调度图不知情·见 STAT_BIND_TARGETS）；不存在 → 跳过（绝不代创建，见 spec）。
            if (!TARGET_SET.has(b.component)) {
              const tr = findDebugTrace(world);
              appendTrace(tr, tr?.tick ?? 0, 'stat-bind', 'reject', `${id}: target ${b.component}.${b.field}`, '不在 STAT_BIND_TARGETS 闭集（申报之外的写·调度图不知情）');
              continue;
            }
            const target = world.getComponent(id, b.component) as (Component & Record<string, unknown>) | undefined;
            if (!target) continue;

            // ③ 幂等投影：目标字段 = base 与 v 按 op 组合（不读当前字段值，见文件头 ⚠️）。
            target[b.field] = projectStatBind(b.op ?? 'set', b.base, v);
          }
        }
      },
    },
  ],
});
