import { defineCapability } from '@engine/core/define-capability.js';
import { worldSeed } from '@engine/core/query.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { ScalarValueSchema } from '@engine/protocol/schemas/logic.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { Effect, Signal, Sensor, Visibility, DestroyRequest, Timer, Tag, PrefabOrigin, RandomSeed, Flag } from '@engine/protocol/components.js';
import { buildConditionLookup } from './condition.js';
import { ctxOf, applyWrite, evalValue, writeTargetOf } from '@engine/logic/index.js';
import { chancePass } from '@atom-skills/index.js';
import { findScoreTrace, appendScoreEvent } from '../score-trace.js';
import { cmpStr } from '@engine/math/scalar.js';

// effect-apply —— Condition→Event→**Effect** 的 Effect 侧（链的合龙石）。
//
// 当本 tick 存在名为 Effect.onSignal 的 Signal 时，施加一个声明式效果（按 id 全局定位）：
//   - set-flag       ：把 Flag(id=targetId).active 设为 Boolean(value)
//   - modify-resource ：给 Resource(id=targetId).current 加 Number(value) 并钳进上下限
//   - set-state      ：把 State(fsmId=targetId).current 设为 String(value)
//
// 跑在 Commit 阶段（产信号的 event-when 在 Update）：这样 event-when→effect-apply 的先后由 phase
// 定序，且 effect 对 Flag/State/Resource 的写入由**下一 tick** 的条件读到（标准离散反馈，一拍延迟）。
// "信号 → 置 flag → 下帧条件读 flag → 再触发" 即让多步机制（连锁/开关→门）纯配置涌现。
// 确定性：只读/写确定状态、按 id 定位（与 Condition 读侧、resource 写侧对称），不碰浮点超越函数。
// 查找复用 buildConditionLookup 的按 id 索引（O(1)，Reviewer #3）。

// REQ-E-023①：数 Tag.flags 命中掩码的实体数（集合计数，与遍历序无关 → 确定）。供 valueFrom.countOf
// 表达"每个 tagged 物 +X"（每小丑/每张牌/每钢铁牌…）——自描述一行、零游戏侧记账，过弱-LLM 尺子。
// Effect 字段 schema（P1c）。真实数据实证（game102 sweep）：物理/批量 kind 不填 targetId（用 targetEntity/tagMask 寻址），
// 故 targetId 只对逻辑 kind 必填——TS 接口写的是必填（历史·蓝图侧 as 掉了），schema 以数据为准、按 kind 分支精确要求。
const EFFECT_COMMON = {
  onSignal: t.str('触发该效果的信号名（event-when 产出的 Signal.name）'),
  targetEntity: t.opt(t.entity("物理/时序 kind：set-sensor/set-visible/destroy/reset-timer 的目标实体 id；哨兵 '@signal-source' = 触发信号的源实体")),
  tagMask: t.opt(t.num('批量 kind：Tag 掩码（destroy-tagged/set-visible-tagged/set-flag-tagged）')),
  keepResource: t.opt(t.str('destroy-tagged：保留持有该 Resource.id 的实体不销毁')),
  value: t.opt(ScalarValueSchema),
  op: t.opt(t.enum(['add', 'mul', 'set'] as const, "modify-resource 运算(REQ-012)：add(默认,current+value)|mul(current*value)|set(=value)")),
  order: t.opt(t.num('结算顺序(REQ-012)：同信号命中的 Effect 按 order 升序依次结算（缺省 0）。乘法依赖顺序时必填。')),
  valueFrom: t.opt(t.obj({
    resourceId: t.opt(t.str('base = 具名 Resource.current')),
    coeff: t.opt(t.num('系数（缺省 1）')),
    timesResourceId: t.opt(t.str('再乘另一资源 current（资源×资源）')),
    countOf: t.opt(t.num('base = Tag 掩码命中的实体数（每个 ×coeff）')),
  }, '动态值(REQ-013/E-023①)：v=base×factor')),
  chance: t.opt(t.obj({ num: t.num(), den: t.num() }, '概率门(REQ-E-023②)：nextRandom < num/den 才施用')),
} as const;
const LOGICAL_KINDS = ['set-flag', 'set-flag-tagged', 'modify-resource', 'set-state'] as const; // 按 id 路由 → targetId 必填
const PHYSICAL_KINDS = ['set-sensor', 'set-visible', 'set-visible-tagged', 'destroy', 'destroy-tagged', 'reset-timer'] as const; // 按实体/tag 寻址
const EFFECT_PROPS = {
  kind: t.enum([...LOGICAL_KINDS, ...PHYSICAL_KINDS] as const,
    "逻辑:set-flag|modify-resource|set-state（targetId 必填）；物理(REQ-008):set-sensor|set-visible|destroy|reset-timer；批量(按Tag掩码):destroy-tagged|set-visible-tagged|set-flag-tagged"),
  targetId: t.opt(t.str('逻辑 kind 必填：Flag.id / Resource.id / State.fsmId（按 id 全局定位）；set-flag-tagged：Flag.id（tagMask 命中的实体里再按此 id 指名）')),
  ...EFFECT_COMMON,
} as const;

export const effectApplyCapability = defineCapability({
  id: 't2-effect-apply',
  version: '1.0.0',

  describe: {
    name: 'effect-apply',
    summary: '信号在场时施加声明式效果（置 Flag / 改 Resource / 设 State，均按 id 全局定位；亦可按 Tag 掩码批量作用一片实体）。Condition→Event→Effect 的 Effect 侧。',
    semantic: ['tier2', 'logic', 'effect'],
    whenToUse:
      '想让一个 Signal（由 event-when 产出）直接产生世界改动而不写游戏代码时。挂 Effect{onSignal,kind,targetId,value}。跑在 Commit，效果下一 tick 被条件读到（一拍反馈）。',
    examples: [
      '好感越 60 → 解锁告白：Effect{ onSignal:"S_love_60", kind:"set-flag", targetId:"S_confess_unlocked", value:true }',
      '踩到陷阱信号 → 扣血：Effect{ onSignal:"trap", kind:"modify-resource", targetId:"hp", value:-10 }',
      '两开关都开 → 推进剧情态：Effect{ onSignal:"both_switches", kind:"set-state", targetId:"story", value:"door_open" }',
      '踩开关 → 墙变可穿过（物理）：Effect{ onSignal:"plate_on", kind:"set-sensor", targetEntity:"wall_3", value:true }',
      'Balatro 小丑 ×Mult(REQ-012)：Effect{ onSignal:"score", kind:"modify-resource", targetId:"mult", op:"mul", value:1.5, order:3 }（order 保证先加后乘）',
      'Balatro 最终计分 score += chips×mult(REQ-013)：Effect{ onSignal:"commit", kind:"modify-resource", targetId:"score", op:"add", valueFrom:{ resourceId:"chips", timesResourceId:"mult" } }',
      'Bull「每 $1 +2 筹码」(REQ-013)：Effect{ onSignal:"score", kind:"modify-resource", targetId:"chips", op:"add", valueFrom:{ resourceId:"money", coeff:2 } }',
      '限时门(REQ-009)：踩开关 → 重置/启动计时器：Effect{ onSignal:"plate_on", kind:"reset-timer", targetEntity:"door_timer", value:120 }（elapsed=0、duration=120）→ 配 condition(timer gte 120)→关门',
      '过阈值解锁东区(REQ-ORDERROT)：Effect{ onSignal:"S_progress_50", kind:"set-flag-tagged", tagMask:ZONE_EAST_BIT, targetId:"webbed", value:false } → 清 ZONE_EAST 所有格的 webbed flag → 整片可拖',
    ],
  },

  components: {
    provides: {
      Effect: defineComponent('Effect', EFFECT_PROPS, {
        category: 'config',
        describe: '声明「当 onSignal 在场时施加的效果」。kind 决定改 Flag/Resource/State（按 id 全局定位）或按 Tag 掩码批量作用一片实体。',
        refine: (v) => ((LOGICAL_KINDS as readonly string[]).includes(String(v.kind)) && typeof v.targetId !== 'string'
          ? [{ path: 'targetId', message: `kind:${JSON.stringify(v.kind)} 按 id 路由，targetId 必填（Flag.id / Resource.id / State.fsmId）`, severity: 'error' }]
          : []),
      }),
    },
    reads: ['Effect', 'Signal', 'Timer', 'Tag', 'PrefabOrigin', 'RandomSeed'],
    writes: ['Flag', 'Resource', 'State', 'Sensor', 'Visibility', 'DestroyRequest', 'Timer', 'RandomSeed'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'effect-apply',
      phase: SystemPhase.Commit,
      reads: ['Effect', 'Signal', 'Timer', 'Tag', 'PrefabOrigin', 'RandomSeed'],
      writes: ['Flag', 'Resource', 'State', 'Sensor', 'Visibility', 'DestroyRequest', 'Timer', 'RandomSeed'],
      consumes: [],
      execute(world) {
        // 收集本 tick 在场的信号名 + 各名的 source 实体列表（REQ-F-041：'@signal-source' 寻址用；query 序确定）。
        const signals = new Set<string>();
        const sources = new Map<string, string[]>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) {
            signals.add(s.name);
            const list = sources.get(s.name);
            if (list) list.push(s.source); else sources.set(s.name, [s.source]);
          }
        }
        if (signals.size === 0) return;
        // 目标解析（REQ-F-041）：targetEntity='@signal-source' → 触发信号的 source 实体（可多个，如同拍点两个席位）。
        // 「点谁卖谁/点谁选谁」的指针标配寻址——运行时实例 id 装配期不可知，信号源是唯一的数据可达句柄。
        const targetsOf = (ef: Effect): string[] =>
          ef.targetEntity === '@signal-source' ? (sources.get(ef.onSignal) ?? []) : ef.targetEntity ? [ef.targetEntity] : [];

        const ctx = ctxOf(world, buildConditionLookup(world)); // P2a：规则内核上下文（global 寻址·同 tick 一份 id 索引）

        // REQ-012：收集本 tick 命中的 Effect，按 order **升序**（并列按 eid tie-break）依次结算。
        // 乘法（×mult）引入顺序依赖 → 结算顺序须是显式数据；modify-resource 就地连写 r.current，按此序天然有序确定。
        const hits: Array<{ eid: string; ef: Effect }> = [];
        for (const [eid] of world.query('Effect')) {
          const ef = world.getComponent<Effect>(eid, 'Effect');
          if (ef && signals.has(ef.onSignal)) hits.push({ eid, ef });
        }
        hits.sort((a, b) => (a.ef.order ?? 0) - (b.ef.order ?? 0) || cmpStr(a.eid, b.eid));

        // REQ-019：opt-in 计分 trace（仅当世界有 ScoreTrace 单例；限 modify-resource 数值步，redline）。
        const trace = findScoreTrace(world);
        // REQ-E-023②：概率门用的世界 RNG（首个 RandomSeed；roll 推进其序列，确定/录放安全）。
        const rng = worldSeed(world); // 黑板单例（P1b）·统一取法（B-3）

        for (const { eid, ef } of hits) {
          if (ef.chance && !chancePass(rng, ef.chance.num, ef.chance.den)) continue; // REQ-E-023②：概率未中 → 跳过本效果（roll 已推进 RNG）
          switch (ef.kind) {
            // set-flag / set-state 走规则内核 applyWrite（P2a）：按 id 全局路由·目标不存在则不动；
            // flag 布尔化（'true' 字符串也算真·避免 Boolean("false")===true 的 JS 陷阱）由内核统一。
            case 'set-flag':
            case 'set-state': {
              applyWrite(ctx, { to: writeTargetOf(ef.kind, ef.targetId), value: ef.value });
              break;
            }
            // ── set-flag-tagged（REQ-ORDERROT 姊妹条·批量 tag 域解锁）：destroy-tagged/set-visible-tagged 的
            // Flag 孪生——tagMask 命中的实体里，谁的 Flag.id 恰好等于 targetId，就把它的 Flag.active 设为 value。
            // 运行时实例 id 装配期不可知 → 按 Tag 批量寻址（同 destroy-tagged/set-visible-tagged）；须再按
            // targetId 指名具体哪个 Flag——因为同一 tagMask 命中的实体群里可能各自挂着不同语义的 Flag（webbed/
            // locked/…），set-flag 的全局单点 lookup 只会碰到第一个同 id 的 Flag，表达不了"一整片区域各自的
            // Flag 逐个置位"。集合语义与遍历序无关（纯集合操作，Tag 扫描按 id 升序·无随机）；只触已有 Flag
            // 且 id 匹配的实体（不凭空 add，同 set-visible-tagged 纪律）。用例：进度过阈值 → 解锁东区蛛网格
            // （Effect{ onSignal, kind:'set-flag-tagged', tagMask:ZONE_EAST_BIT, targetId:'webbed', value:false }）。
            case 'set-flag-tagged': {
              const mask = Number(ef.tagMask);
              if (Number.isFinite(mask) && mask !== 0) {
                const active = ef.value === true || ef.value === 'true';
                for (const [tid] of world.query('Tag')) {
                  const tg = world.getComponent<Tag>(tid, 'Tag');
                  if (tg && (tg.flags & mask) !== 0) {
                    const fl = world.getComponent<Flag>(tid, 'Flag');
                    if (fl && fl.id === ef.targetId) fl.active = active;
                  }
                }
              }
              break;
            }
            case 'modify-resource': {
              // REQ-012/013/E-023①：op 决定运算（add/mul/set）、valueFrom 决定量（资源×资源 / 计数×系数），
              // 钳进 [min,max]。P2a：量折成内核 ValueExpr（缺资源 → undefined = 无效不动·countOf 计 0 合法），
              // 写入走 applyWrite（唯一的一份 clamp·非有限值拒写）；ScoreTrace 记内核返回的本步量/写后值。
              const value = ef.valueFrom
                ? evalValue(ctx, {
                    mul: [
                      ef.valueFrom.countOf !== undefined ? { count: ef.valueFrom.countOf } : { res: ef.valueFrom.resourceId ?? '' },
                      ef.valueFrom.timesResourceId ? { res: ef.valueFrom.timesResourceId } : (ef.valueFrom.coeff ?? 1),
                    ],
                  })
                : Number(ef.value);
              const res = applyWrite(ctx, { to: { res: ef.targetId }, op: ef.op, value });
              if (res.ok) appendScoreEvent(trace, 'effect', ef.targetId, (ef.op ?? 'add') as 'set' | 'add' | 'mul', res.v!, res.after!, eid);
              break;
            }
            // ── 物理 kind（REQ-008）：信号→物理改动，按 targetEntity 定位。补上"踩开关→门开"的最后一环。──
            case 'set-sensor': {
              // 给目标实体加/去 Sensor（非实心）→ collision-resolve 跳过它 = 可穿过（踩开关→墙变门）。
              const on = ef.value === true || ef.value === 'true';
              for (const te of targetsOf(ef)) {
                if (on) {
                  if (!world.hasComponent(te, 'Sensor')) world.addComponent(te, { type: 'Sensor' } as Sensor);
                } else {
                  world.removeComponent(te, 'Sensor');
                }
              }
              break;
            }
            case 'set-visible': {
              // 切目标实体可见性（门消失/出现）。无 Visibility 则补一个。
              const visible = ef.value === true || ef.value === 'true';
              for (const te of targetsOf(ef)) {
                const vis = world.getComponent<Visibility>(te, 'Visibility');
                if (vis) vis.visible = visible;
                else world.addComponent(te, { type: 'Visibility', visible, active: true } as Visibility);
              }
              break;
            }
            // ── set-visible-tagged（REQ-F-056，destroy-tagged 的可见性孪生）：tagMask 命中者 Visibility.visible=value。
            // 运行时实例 id 装配期不可知 → 按 Tag 批量寻址（同 destroy-tagged）。集合语义与遍历序无关；只触有 Visibility
            // 的实体（不凭空 add，避免给纯逻辑实体塞渲染组件）。备战 token 战斗期隐藏 / 相位 gizmo 等"阶段性显隐"用。
            case 'set-visible-tagged': {
              const mask = Number(ef.tagMask);
              if (Number.isFinite(mask) && mask !== 0) {
                const visible = ef.value === true || ef.value === 'true';
                for (const [tid] of world.query('Tag')) {
                  const tg = world.getComponent<Tag>(tid, 'Tag');
                  if (tg && (tg.flags & mask) !== 0) {
                    const vis = world.getComponent<Visibility>(tid, 'Visibility');
                    if (vis) vis.visible = visible;
                  }
                }
              }
              break;
            }
            case 'destroy': {
              // 发 DestroyRequest，destroy-apply 消费后移除目标实体（清障碍/点谁卖谁）。
              for (const te of targetsOf(ef)) {
                if (!world.hasComponent(te, 'DestroyRequest')) {
                  world.addComponent(te, { type: 'DestroyRequest', entityId: te } as DestroyRequest);
                }
              }
              break;
            }
            // ── destroy-tagged（REQ-F-032 清场）：value=Tag 掩码，命中者全部发自销毁请求。运行时展开
            // 的实例 id 装配期不可知 → 单 targetEntity 寻址不可用，按 Tag 批量是唯一数据寻址。集合语义
            // 与遍历序无关；挂件由 hierarchy-cascade 级联；Commit 写请求 → 次拍 destroy-apply 统一移除。──
            case 'destroy-tagged': {
              const mask = Number(ef.value);
              if (Number.isFinite(mask) && mask !== 0) {
                // REQ-F-048①：keepResource 设了 → 按 PrefabOrigin.seq 升序（无戳者排最后、同序按 id）
                // 保留前 N 个（N=该资源 current），只清多余=入场逆序（超员自动卖/波次限额）。缺省全清。
                const matched: Array<{ tid: string; seq: number }> = [];
                for (const [tid] of world.query('Tag')) {
                  const tg = world.getComponent<Tag>(tid, 'Tag');
                  if (tg && (tg.flags & mask) !== 0) {
                    const po = world.getComponent<PrefabOrigin>(tid, 'PrefabOrigin');
                    matched.push({ tid, seq: po ? po.seq : Number.MAX_SAFE_INTEGER });
                  }
                }
                let doomedList = matched;
                if (ef.keepResource) {
                  const keepRes = ctx.lookup!.resource(ef.keepResource);
                  const keep = keepRes ? Math.max(0, Math.floor(keepRes.current)) : 0;
                  matched.sort((a, b) => a.seq - b.seq || cmpStr(a.tid, b.tid));
                  doomedList = matched.slice(keep);
                }
                for (const { tid } of doomedList) {
                  if (!world.hasComponent(tid, 'DestroyRequest')) {
                    world.addComponent(tid, { type: 'DestroyRequest', entityId: tid } as DestroyRequest);
                  }
                }
              }
              break;
            }
            // ── reset-timer（REQ-009）：事件→重置/启动计时器。按 targetEntity 定位 Timer，elapsed=0
            // （从此刻重新计时）；value 给了数值则一并设 duration。配 condition(timer gte N)→event-when→effect
            // 即"踩下那刻起 N 拍自动关门/塌陷"等限时机制纯数据涌现。──
            case 'reset-timer': {
              for (const te of targetsOf(ef)) {
                const t = world.getComponent<Timer>(te, 'Timer');
                if (t) {
                  t.elapsed = 0;
                  const d = Number(ef.value);
                  if (Number.isFinite(d) && d > 0) t.duration = d;
                }
              }
              break;
            }
          }
        }
      },
    },
  ],
});
