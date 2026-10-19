import { defineCapability } from '@engine/core/define-capability.js';
import { worldSeed, sortedIds } from '@engine/core/query.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { WeightedSpawn, Signal, RandomSeed, Resource, Transform, SpawnRequest } from '@engine/protocol/components.js';
import { nextRandom } from '@atom-skills/index.js';
import { weightedPick } from './weighted-pick.js';

// ═══════════════════════════════════════════════════════════════
//  weighted-spawn —— 「点一下生成器，够资源才扣、扣了按权重吐一个随机模板」的确定性生成桥
//  （REQ-TAPSPAWN·game101《海港绯闻》生成器缺口，Lead 裁决 2026-07-25）。
//
//  真缺口：t3-caster 的 onSignal→SpawnRequest 只能产出**固定** template；k1-spawn/prefab 也不含
//  "按权重表随机选模板"这一步。game101 的生成器（clickable→craft-recipe 扣体力→event-when→caster
//  固定产出）因此只能吐掉表首项，加权掉落表长期占位待建（blueprint.ts 注释①）。本能力把
//  「可选原子扣资源」+「世界种子加权抽模板」+「发 SpawnRequest」三步收进一个组件，一步到位。
//
//  分工（严守 manifesto，只补"权重表随机选模板"真缺口）：
//    · 掉落表/权重/资源成本 = 纯数据（WeightedSpawn，最弱 LLM 可产）。
//    · 触发（哪拍抽）= Signal（clickable/event-when 重组，同 caster.onSignal 惯例）。
//    · 加权抽的算法核 = 共享纯函数 weightedPick（weighted-pick.ts，抽自 draft-offer，DRY）。
//    · 真实例化 = 现有 k1-spawn/prefab-spawn（本能力只发 SpawnRequest，不展开）。
//
//  afford 口径同 craft-recipe（不足整单不动·不扣不 spawn）：先扣成本、再抽模板——两步按 spec
//  顺序执行，即便抽出的表因权重全零/空表而"抽不动"，已扣的成本也不回滚（同一次"生成器出规则"
//  触发即成立，产出是否命中是另一件事，与 craft-recipe 的 costs/gains 各自独立同理）。
//
//  确定性：唯一随机来源 = 世界单例 RandomSeed（首个 RandomSeed 实体，同 dice-roll/effect-apply
//  找单例的惯例）→ nextRandom 推进序列；无 RandomSeed → fail-closed 不抽不 spawn（成本已按①扣）。
//  query 按 id 升序处理（与 craft-recipe/mortal 同惯例），多生成器同 tick 触发时结算顺序确定。
//
//  定序（撞环踩坑，同 stat-bind.ts 文件头纪律）：本系统读 Signal 又读改写 Resource——若留在 Update
//  相位，会与 event-when（读 Resource 判条件、写 Signal）互为前驱成 RMW 伪环（event-when 写 Signal→
//  本系统读；本系统写 Resource→event-when 读，两边反向）。**真正的解**同 craft-recipe/effect-apply：
//  跳出 Update 相位——本系统是"读本 tick 已产生的 Signal、原子结算 afford+随机抽"，语义正是 Commit
//  相位（同 craft-recipe 的"信号+可负担才成交"）。phase 分桶让本系统自动排在全部 Update 相位系统
//  （clickable/event-when/resource-apply…）之后，零 runsAfter、零环，且对未来任何新增 Update 系统
//  免疫。代价：写的 SpawnRequest 要下一 tick 的 Update 相位 prefab-spawn 才读到、真正展开实体——
//  与 game101 现状（craft-recipe→次拍 event-when→caster→prefab-spawn）同一档延迟，非 bug。
//  Commit 相位内仍可能撞环：craft-recipe 同为 Commit 且同读改写 Resource（两边"afford 才动"闸门
//  同存一 tick）、effect-apply 同为 Commit 且同读改写 RandomSeed（概率门 vs 加权抽同用世界 RNG）——
//  两者都会与本系统各自组一条 RMW 伪环，显式 runsAfter 覆盖反向组件推断边打破（同 topological-sort.ts
//  注释"显式边覆盖相反方向组件边"，先例见 dice-roll.ts 的 runsBefore card-score-pass）。
//  写 SpawnRequest 不声明对 prefab-spawn 的 runsBefore：本系统只写不读/不 consume SpawnRequest，
//  prefab-spawn 读+consume 它 → 组件拓扑自动把本系统排在 prefab-spawn 之前（同 caster/mortal 先例）。
// ═══════════════════════════════════════════════════════════════

/** 世界随机种子（黑板单例）——统一取法 engine/core/query.worldSeed（B-3）。 */
const findWorldSeed = worldSeed;

export const weightedSpawnCapability = defineCapability({
  id: 't2-weighted-spawn',
  version: '1.0.0',

  describe: {
    name: 'weighted-spawn',
    summary: '信号到达时（可选）原子扣自身资源，够则用世界种子 PRNG 按权重表抽一个模板，在自身位置发 SpawnRequest（真生成交现成 prefab-spawn）。不足资源整单不动；掉落表空/权重全零静默不 spawn。',
    semantic: ['tier2', 'spawn', 'random', 'economy', 'determinism'],
    whenToUse:
      '"点一下产出一个随机物件/敌人/掉落物，还可能先扣体力/金币"的生成器。挂 WeightedSpawn{onSignal,cost?,table}。固定产出（非随机）用 t3-caster 即可，本能力专补"按权重表随机选模板"。',
    examples: [
      '海港绯闻生成器：WeightedSpawn{ onSignal:"do_spawn_fisher", cost:{id:"energy",amount:1}, table:[{templateId:"fish_common",weight:70},{templateId:"fish_rare",weight:30}] } → 够体力才扣 1 点体力，按 7:3 抽一条鱼',
      '无成本纯随机刷怪：WeightedSpawn{ onSignal:"wave_tick", table:[{templateId:"slime",weight:8},{templateId:"boss",weight:1}] }',
      '空表兜底：WeightedSpawn{ onSignal:"x", table:[] } → 收到信号也不 spawn、不崩（数据未配全时安全退化）',
    ],
  },

  components: {
    provides: {
      WeightedSpawn: {
        category: 'config',
        describe: '声明「onSignal 到达时（可选）原子扣自身 Resource、够则按 table 权重抽一个模板发 SpawnRequest」。cost 缺省=无成本；table 空/权重全零=不 spawn。',
        fields: {
          onSignal: { type: 'string', describe: '触发本组件的信号名（clickable/event-when 等产出的 Signal.name）' },
          cost: { type: 'string', describe: '可选原子成本 {id,amount}：扣自身 Resource(id).current；current<amount 整单不动（不扣不 spawn，同 craft-recipe）；扣后钳进 min' },
          table: { type: 'string', describe: '加权掉落表 [{templateId,weight}]：按 weight 比例抽一个 templateId；空表/权重全零=不 spawn、不崩' },
        },
      },
    },
    reads: ['WeightedSpawn', 'Transform', 'Signal', 'RandomSeed', 'Resource'],
    writes: ['Resource', 'RandomSeed', 'SpawnRequest'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'weighted-spawn',
      phase: SystemPhase.Commit,
      // craft-recipe（Resource RMW）/ effect-apply（RandomSeed RMW）同为 Commit 相位——打破两处伪环
      // （见文件头"定序"）。谁先谁后对结果无影响（各自只读改自己组件表内的实体），仅需钉死一个方向。
      runsAfter: ['craft-recipe', 'effect-apply'],
      reads: ['WeightedSpawn', 'Transform', 'Signal', 'RandomSeed', 'Resource'],
      writes: ['Resource', 'RandomSeed', 'SpawnRequest'],
      consumes: [],
      execute(world: IWorld) {
        // 本 tick 在场的信号名（同 craft-recipe/dice-roll 惯例）。
        const signals = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) signals.add(s.name);
        }
        if (signals.size === 0) return;

        // 世界单例 RNG：本 tick 只查一次（同 stat-bind 找 ModifierTotals 的缓存惯例），多生成器共用同一
        // RandomSeed 推进序列，跨生成器结算顺序（按 id 升序）即决定谁先抽——确定性、可回放。
        let rng: RandomSeed | undefined;
        let rngResolved = false;

        const ids = sortedIds(world, 'WeightedSpawn', 'Transform');
        for (const id of ids) {
          const ws = world.getComponent<WeightedSpawn>(id, 'WeightedSpawn');
          if (!ws || !signals.has(ws.onSignal)) continue;

          // ① 原子 afford（同 craft-recipe 口径）：不足 → 整单不动（不扣、不抽、不 spawn）。
          if (ws.cost) {
            const r = world.getComponent<Resource>(id, 'Resource');
            if (!r || r.id !== ws.cost.id || r.current < ws.cost.amount) continue;
            const next = r.current - ws.cost.amount;
            r.current = next < r.min ? r.min : next;
          }

          // ② 世界种子加权抽模板：无 RNG → fail-closed 不抽不 spawn（成本已按①扣，不回滚）。
          if (!rngResolved) {
            rng = findWorldSeed(world);
            rngResolved = true;
          }
          if (!rng) continue;
          const picked = weightedPick(ws.table, () => nextRandom(rng!));
          if (!picked) continue; // 空表 / 权重全零 → 不 spawn、不崩

          // ③ 发 SpawnRequest（自身 Transform 落点）；真实例化交现成 prefab-spawn（组件拓扑自动排在其后）。
          const t = world.getComponent<Transform>(id, 'Transform')!;
          world.addComponent(id, { type: 'SpawnRequest', templateId: picked.templateId, x: t.x, y: t.y } as SpawnRequest);
        }
      },
    },
  ],
});
