import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld, EntityId, Component } from '@engine/core/types.js';
import { t } from '@engine/core/schema.js';
import { sortedIds } from '@engine/core/query.js';
import type { Signal } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  t2-cooldown —— 按名字的多冷却（owner 2026-09-09 令补齐·底层评审 §3.2 B-5 / §7 第一档）
//
//  game101 / game211 / game-g / game-103 / game102 五款各自数拍；引擎办法是「每个技能一个 Timer 实体」，能用但绕。
//  本能力：一实体一张 Cooldowns，里面按名字放若干槽 {id, duration, remaining}：
//    · 每拍 remaining>0 的槽 −1；归零那一拍可发 readySignal（挂本实体·source=本实体）
//    · `startOn:[{signal, id}]`：本拍在场信号名命中 → 该槽若就绪则 remaining=duration（开始冷却）并发 startedSignal；
//      若未就绪 → 不动并发 blockedSignal（「什么都没发生」的分支必须可见）
//    · 条件叶 `{kind:'cooldown', id, ready}` 让 event-when/self-rule/flow 直接读就绪态（engine/logic）
//  确定性：多实体按 id 升序；零随机。时长糖：槽在数组里，装载期时长糖只折顶层字段，槽 duration 请直接写拍数。
// ═══════════════════════════════════════════════════════════════

export interface CooldownSlot { id: string; duration: number; remaining: number }

export interface Cooldowns extends Component {
  readonly type: 'Cooldowns';
  slots: CooldownSlot[];
  startOn?: Array<{ signal: string; id: string }>;
  readySignal?: string; // 某槽归零那一拍发（arg = 槽 id）
  startedSignal?: string; // 开始冷却时发（arg = 槽 id）
  blockedSignal?: string; // 冷却中被触发时发（arg = 槽 id）
}

export function cooldownSlot(cd: Cooldowns, id: string): CooldownSlot | undefined {
  for (const s of cd.slots) if (s.id === id) return s;
  return undefined;
}

/** 就绪 = 槽存在且 remaining ≤ 0；无此槽视为就绪（未配置的技能不受冷却约束）。 */
export function cooldownReady(cd: Cooldowns, id: string): boolean {
  const s = cooldownSlot(cd, id);
  return !s || s.remaining <= 0;
}

/** 开始冷却；未就绪 → false 不动。 */
export function cooldownStart(cd: Cooldowns, id: string): boolean {
  const s = cooldownSlot(cd, id);
  if (!s || s.remaining > 0) return false;
  s.remaining = s.duration;
  return true;
}

/** 进度 [0,1]（1 = 就绪）。 */
export function cooldownProgress(cd: Cooldowns, id: string): number {
  const s = cooldownSlot(cd, id);
  if (!s || s.duration <= 0) return 1;
  const p = 1 - s.remaining / s.duration;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** 世界里首个（创建序）持有该槽 id 的 Cooldowns（条件叶 global 作用域用）。 */
export function findCooldownHolder(world: IWorld, id: string): EntityId | undefined {
  for (const e of world.queryEntities('Cooldowns')) {
    const cd = world.getComponent<Cooldowns>(e, 'Cooldowns');
    if (cd && cooldownSlot(cd, id)) return e;
  }
  return undefined;
}

const SlotSchema = t.obj({ id: t.str('槽名'), duration: t.num('冷却拍数'), remaining: t.num('剩余拍数（0 = 就绪）') });

export const cooldownCapability = defineCapability({
  id: 't2-cooldown',
  version: '1.0.0',

  describe: {
    name: 'cooldown',
    summary: '一实体多冷却槽：每拍递减；信号触发开始冷却（就绪才开、否则发 blocked）；归零发 ready。',
    semantic: ['cooldown', 'timer', 'ability', 'rate'],
    whenToUse:
      '技能/道具/攻击间隔：挂 Cooldowns{slots:[{id:"dash",duration:90,remaining:0}], startOn:[{signal:"dash",id:"dash"}], readySignal:"dashReady", blockedSignal:"dashBlocked"}。条件树用 {kind:"cooldown", id:"dash", ready:true} 读就绪；UI 进度用 cooldownProgress。别再在自己组件里数 elapsed。',
    examples: [
      'Cooldowns{ slots:[{id:"dash",duration:90,remaining:0},{id:"nova",duration:300,remaining:0}], startOn:[{signal:"dash",id:"dash"},{signal:"cast",id:"nova"}], readySignal:"cdReady" }',
      'EventWhen{ when:{kind:"cooldown", id:"nova", ready:true}, signal:"novaAvailable" }',
    ],
  },

  components: {
    provides: {
      Cooldowns: {
        category: 'config',
        describe: '按名字的多冷却槽 + 触发表 + 三个可选信号名。remaining 为运行态。',
        fields: {
          readySignal: { type: 'string', describe: '槽归零那一拍发（arg=槽 id）' },
          startedSignal: { type: 'string', describe: '开始冷却时发（arg=槽 id）' },
          blockedSignal: { type: 'string', describe: '冷却中被触发时发（arg=槽 id）' },
        },
        schema: t.obj({
          slots: t.arr(SlotSchema),
          startOn: t.opt(t.arr(t.obj({ signal: t.str('信号名'), id: t.str('槽名') }))),
          readySignal: t.opt(t.str()), startedSignal: t.opt(t.str()), blockedSignal: t.opt(t.str()),
        }),
      },
    },
    reads: ['Cooldowns', 'Signal'],
    writes: ['Cooldowns', 'Signal'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'cooldown',
      // Commit 相位（同 effect-apply）：读本拍 Update 产出的 Signal；写的 Cooldowns 供下一拍 Update 的条件叶读——
      // 跨相位无环（若留在 Update：读 Signal 排在 event-when 后、又被 event-when 读 Cooldowns → 闭环）。
      phase: SystemPhase.Commit,
      reads: ['Cooldowns', 'Signal'],
      writes: ['Cooldowns', 'Signal'],
      consumes: [],
      execute(world: IWorld) {
        const holders = sortedIds(world, 'Cooldowns');
        if (holders.length === 0) return;
        const names = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) names.add(s.name);
        }
        for (const eid of holders) {
          const cd = world.getComponent<Cooldowns>(eid, 'Cooldowns');
          if (!cd) continue;
          let emit: { name: string; arg: string } | undefined;
          // ① 递减 + 归零通知
          for (const s of cd.slots) {
            if (s.remaining <= 0) continue;
            s.remaining -= 1;
            if (s.remaining <= 0 && cd.readySignal && !emit) emit = { name: cd.readySignal, arg: s.id };
          }
          // ② 触发
          if (cd.startOn) {
            for (const tr of cd.startOn) {
              if (!names.has(tr.signal)) continue;
              const s = cooldownSlot(cd, tr.id);
              if (!s) continue;
              if (s.remaining > 0) { if (cd.blockedSignal && !emit) emit = { name: cd.blockedSignal, arg: s.id }; continue; }
              s.remaining = s.duration;
              if (cd.startedSignal && !emit) emit = { name: cd.startedSignal, arg: s.id };
            }
          }
          if (emit) world.addComponent<Signal>(eid, { type: 'Signal', name: emit.name, source: eid, arg: emit.arg });
        }
      },
    },
  ],
});
