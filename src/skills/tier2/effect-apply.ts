import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { Effect, Signal, Sensor, Visibility, DestroyRequest, Timer, Tag, PrefabOrigin, RandomSeed, Flag, Resource, State } from '@engine/protocol/components.js';
import { buildConditionLookup, evaluateCondition } from './condition.js';
// REQ-G109-002 条件门复用 self 作用域求值器（零新造条件语义）。**只 import，不改 self-rule.ts 一行**
// （领工声明边界栏明列）。无环：self-rule.ts 只依赖 condition.js，不反向依赖本文件。
import { evaluateSelfCondition } from './self-rule.js';
import { chancePass } from '@atom-skills/index.js';
import { findScoreTrace, appendScoreEvent } from '../score-trace.js';

// effect-apply —— Condition→Event→**Effect** 的 Effect 侧（链的合龙石）。
//
// 当本 tick 存在名为 Effect.onSignal 的 Signal 时，施加一个声明式效果。寻址有**两条路**：
//   · targetEntity 缺省 → 按 id **全局**定位（lookup.xxx(targetId)，找唯一持有者）；
//   · targetEntity 在场 → 按**实体**定位（targetsOf()，含 '@signal-source' 指针寻址）。
// 这两条路过去是分裂的：物理 kind（set-sensor/set-visible/destroy/reset-timer）自 REQ-008 起就走
// targetsOf()，三个逻辑 kind 却把 targetEntity **静默忽略**（REQ-F-041 只写了一半）。同一份「点谁改谁」
// 的数据于是在物理上成立（game-f 卖席 destroy）、在逻辑上写到了别的实体——见下方 set-flag 的实查记录。
//   - set-flag       ：把 Flag(id=targetId).active 设为 Boolean(value)
//   - modify-resource ：给 Resource(id=targetId).current 加 Number(value) 并钳进上下限
//   - set-state      ：把 State(fsmId=targetId).current 设为 String(value)
//
// 上面管的是「**写谁**」。两道门管「**要不要写**」：
//   · REQ-G109-002（owner 2026-09-17 判 A）`when?: ConditionExpr`——**self 作用域**门，按**信号源实体**求值
//     （复用 evaluateSelfCondition）。与 targetEntity 复合：哨兵 '@signal-source' → 逐个源过门、只有过门者
//     被施效；其它目标（字面实体/全局 id/tagMask 批量）→ 任一源过门即施放一次。
//   · REQ-G109-003（owner 2026-09-18 判 A）`whenGlobal?: ConditionExpr`——**全局作用域**门，按全局 id 求值，
//     与 when 取 AND。逐字镜像 SelfRule.whenGlobal（REQ-F-035）。补的是「做某动作 ∧ **全局**状态够」
//     （体力/金币/回合相位/解锁门）——self 门读不到挂在外地单例上的那半边。
// 两道门缺省都不设 = 逐字旧行为（零回归）。
//
// 跑在 Commit 阶段（产信号的 event-when 在 Update）：这样 event-when→effect-apply 的先后由 phase
// 定序，且 effect 对 Flag/State/Resource 的写入由**下一 tick** 的条件读到（标准离散反馈，一拍延迟）。
// "信号 → 置 flag → 下帧条件读 flag → 再触发" 即让多步机制（连锁/开关→门）纯配置涌现。
// 确定性：只读/写确定状态、按 id 定位（与 Condition 读侧、resource 写侧对称），不碰浮点超越函数。
// 查找复用 buildConditionLookup 的按 id 索引（O(1)，Reviewer #3）。

// REQ-E-023①：数 Tag.flags 命中掩码的实体数（集合计数，与遍历序无关 → 确定）。供 valueFrom.countOf
// 表达"每个 tagged 物 +X"（每小丑/每张牌/每钢铁牌…）——自描述一行、零游戏侧记账，过弱-LLM 尺子。
function countByTag(world: IWorld, mask: number): number {
  if (!Number.isFinite(mask) || mask === 0) return 0;
  let n = 0;
  for (const [tid] of world.query('Tag')) {
    const tg = world.getComponent<Tag>(tid, 'Tag');
    if (tg && (tg.flags & mask) !== 0) n++;
  }
  return n;
}

export const effectApplyCapability = defineCapability({
  id: 't2-effect-apply',
  version: '1.0.0',

  describe: {
    name: 'effect-apply',
    summary: '信号在场时施加声明式效果（置 Flag / 改 Resource / 设 State；按 id 全局定位，或按 targetEntity 实体定位含 @signal-source 指针，或按 Tag 掩码批量作用一片实体），可加 when 条件门。Condition→Event→Effect 的 Effect 侧。',
    semantic: ['tier2', 'logic', 'effect'],
    whenToUse:
      '想让一个 Signal（由 event-when 产出）直接产生世界改动而不写游戏代码时。挂 Effect{onSignal,kind,targetId,value,targetEntity?,when?}。跑在 Commit，效果下一 tick 被条件读到（一拍反馈）。「点某物→只在某条件下改它」用 targetEntity:"@signal-source" + when 一起写。',
    examples: [
      '点自己那格才长（条件门+指针）:Effect{ onSignal:"act", kind:"modify-resource", targetId:"stage", targetEntity:"@signal-source", when:{kind:"state",fsmId:"tile",equals:"sown"}, value:1 }',
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
      Effect: {
        category: 'config',
        describe: '声明「当 onSignal 在场时施加的效果」。kind 决定改 Flag/Resource/State（按 id 全局定位）或按 Tag 掩码批量作用一片实体。',
        fields: {
          onSignal: { type: 'string', describe: '触发该效果的信号名（event-when 产出的 Signal.name）' },
          kind: { type: 'string', describe: "逻辑:'set-flag'|'modify-resource'|'set-state'；物理(REQ-008):'set-sensor'|'set-visible'|'destroy'；批量(按Tag掩码):'destroy-tagged'(value=Tag掩码,清场REQ-F-032)|'set-visible-tagged'(tagMask=Tag掩码,批量切可见REQ-F-056)|'set-flag-tagged'(tagMask=Tag掩码+targetId=Flag.id,批量置flag)；时序(REQ-009):'reset-timer'" },
          targetId: { type: 'string', describe: '逻辑 kind：Flag.id / Resource.id / State.fsmId（targetEntity 缺省时按 id 全局定位；在场时按该实体的组件匹配）；set-flag-tagged：Flag.id（tagMask 命中的实体里再按此 id 指名哪个 Flag）' },
          targetEntity: { type: 'EntityId', describe: "目标实体 id（**全部 kind 通用**，非仅物理/时序）。哨兵 '@signal-source' = 触发本 onSignal 的信号源实体（REQ-F-041「点谁改谁」的指针寻址）。缺省才走全局 id 定位。注：指名了实体但无匹配组件 → 不施且**不回落全局**（回落=又写错实体）" },
          when: { type: 'string', describe: "self 条件门（REQ-G109-002）：布尔条件树 ConditionExpr，按**信号源实体**求值，不成立则本效果不施。与 targetEntity 复合：'@signal-source' → 逐个源过门、只有过门者被施效；其它目标 → 任一源过门即施放一次。叶子 resource/flag/state/timer/string 读**该实体自己那一份**（self 作用域，同 t2-self-rule）。缺省=无门=零回归" },
          whenGlobal: { type: 'string', describe: "全局条件门（REQ-G109-003）：ConditionExpr，按**全局 id** 求值（同 t2-self-rule 的 whenGlobal / REQ-F-035），与 when 取 AND、先求它。用来表达「做某动作 ∧ **全局**状态够」——体力/金币/回合相位/天数/解锁门（self 门读不到挂在外地单例上的那半边）。缺省=不设=零回归" },
          value: { type: 'string', describe: 'modify-resource=数值；set-flag/set-flag-tagged/set-sensor/set-visible/set-visible-tagged=布尔；set-state=目标状态名；destroy/destroy-tagged 忽略' },
          op: { type: 'string', describe: "modify-resource 运算(REQ-012)：'add'(默认,current+value)|'mul'(current*value,×倍率)|'set'(=value)" },
          order: { type: 'number', describe: '结算顺序(REQ-012)：同信号命中的 Effect 按 order 升序依次结算（缺省 0）。乘法依赖顺序时必填。' },
          valueFrom: { type: 'string', describe: "动态值(REQ-013/E-023①)：{resourceId?,coeff?,timesResourceId?,countOf?}，v=base×factor；base=countOf(按Tag掩码数实体)或具名Resource，factor=另一资源|系数。解 score+=chips×mult、每$1+2c、abstract每小丑+3倍；缺省用静态 value" },
        },
      },
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
        // REQ-G109-002 条件门：判**单个**信号源实体过不过门。`when` 缺省 → 恒真（零回归：在场数据无一填它）。
        // 复用 self 作用域求值器——叶子读的是**该实体自己那一份** Resource/Flag/State/Timer/StringVar。
        const gatePass = (ef: Effect, src: string): boolean =>
          !ef.when || evaluateSelfCondition(world, src, ef.when);
        // 目标解析（REQ-F-041）：targetEntity='@signal-source' → 触发信号的 source 实体（可多个，如同拍点两个席位）。
        // 「点谁卖谁/点谁选谁」的指针标配寻址——运行时实例 id 装配期不可知，信号源是唯一的数据可达句柄。
        // REQ-G109-002：源实体先**逐个过门**再当目标。同拍点两格、只一格已翻土 → 只有那一格被施效。
        // 注意「滤空」与「本就无源」的分别：滤空由下方 hit 级的 some 门兜住（整个效果跳过），
        // 故三个逻辑 kind 的 `if (direct.length) … 否则回落全局` 老路径**不会**被门滤空误触发（不写错实体）。
        const targetsOf = (ef: Effect): string[] =>
          ef.targetEntity === '@signal-source'
            ? (sources.get(ef.onSignal) ?? []).filter((s) => gatePass(ef, s))
            : ef.targetEntity ? [ef.targetEntity] : [];

        const lookup = buildConditionLookup(world);

        // REQ-012：收集本 tick 命中的 Effect，按 order **升序**（并列按 eid tie-break）依次结算。
        // 乘法（×mult）引入顺序依赖 → 结算顺序须是显式数据；modify-resource 就地连写 r.current，按此序天然有序确定。
        const hits: Array<{ eid: string; ef: Effect }> = [];
        for (const [eid] of world.query('Effect')) {
          const ef = world.getComponent<Effect>(eid, 'Effect');
          if (ef && signals.has(ef.onSignal)) hits.push({ eid, ef });
        }
        hits.sort((a, b) => (a.ef.order ?? 0) - (b.ef.order ?? 0) || (a.eid < b.eid ? -1 : a.eid > b.eid ? 1 : 0));

        // REQ-019：opt-in 计分 trace（仅当世界有 ScoreTrace 单例；限 modify-resource 数值步，redline）。
        const trace = findScoreTrace(world);
        // REQ-E-023②：概率门用的世界 RNG（首个 RandomSeed；roll 推进其序列，确定/录放安全）。
        let rng: RandomSeed | undefined;
        for (const [rid] of world.query('RandomSeed')) { rng = world.getComponent<RandomSeed>(rid, 'RandomSeed'); break; }

        for (const { eid, ef } of hits) {
          if (ef.chance && !chancePass(rng, ef.chance.num, ef.chance.den)) continue; // REQ-E-023②：概率未中 → 跳过本效果（roll 已推进 RNG）
          // REQ-G109-003 全局条件门（owner 2026-09-18 判 A）：按**全局 id** 求值，与 when 取 AND。
          // 逐字镜像 SelfRule.whenGlobal（REQ-F-035）。补的是 self 门够不着的那半边：「做某动作 ∧ 全局
          // 状态够」（体力/金币/回合相位/解锁门）。lookup 本拍已建好 → **零新增遍历**；缺省不设 = 零回归。
          // 先求全局门（短路）再求 self 门：全局门是「相位/预算」级的，不成立就没必要问实体的状态。
          if (ef.whenGlobal && !evaluateCondition(world, ef.whenGlobal, lookup)) continue;
          // REQ-G109-002 条件门（hit 级·全 kind 通用）：**任一**源实体过门才有资格施放。
          //   · '@signal-source'：本支只决定「施不施」；**施给谁**由上面 targetsOf 的逐源过滤定（只有过门者入列）。
          //   · 其它目标（字面实体 / 全局 id / tagMask 批量）：门问的是「**发起者**有没有资格」，不是「落点合不合格」
          //     ——故这里对了就整支施放一次（读本格状态、写全局背包的形态，见 REQ-G109-002 §5 按作物路由）。
          //   · 全部源都不过门（或无源）→ 整个效果跳过。**这一步挡住逻辑 kind 的「滤空回落全局」陷阱**：
          //     若放它过去，targetsOf 返回空列表会让旧代码走 `else { lookup.xxx(targetId) }` 写到别的实体上。
          if (ef.when) {
            const src = sources.get(ef.onSignal) ?? [];
            if (!src.some((s) => gatePass(ef, s))) continue;
          }
          switch (ef.kind) {
            case 'set-flag': {
              // REQ-F-041 补齐（逻辑 kind 的指针寻址）。物理 kind 自 REQ-008 起就走 targetsOf()，
              // 逻辑 kind 却一直只认全局 lookup.flag(targetId)、把 targetEntity **静默忽略**——同一份
              // 「点谁改谁」的数据在物理上成立（game-f 卖席 destroy 有独立回归）、在逻辑上写到了**别的**
              // 实体。实查（game109 S2 探针 P1-a）：「点 tile-b 格 → tile-a.tilled 被置真、tile-b 没变」。
              // 这是 REQ-F-041 没写完的一半，不是新能力——`set-flag-tagged` 那个批量件本身就是为绕开
              // 这个洞造的（其注释自陈「set-flag 的全局单点 lookup 表达不了…」）。
              // 纪律同 set-flag-tagged：只触**已有 Flag 且 id 匹配**的目标（不凭空 add；id 不符则不施，
              // 不给同群语义不同的 Flag 误伤）。
              // 零回归：targetEntity 缺省 → targetsOf() 返回 [] → 整支不执行，原路径逐字不变。
              const active = ef.value === true || ef.value === 'true';
              const direct = targetsOf(ef);
              if (direct.length) {
                for (const te of direct) {
                  const df = world.getComponent<Flag>(te, 'Flag');
                  if (df && df.id === ef.targetId) df.active = active;
                }
                break;
              }
              const f = lookup.flag(ef.targetId);
              // 显式布尔/字符串判定，避免 Boolean("false")===true 的 JS 陷阱（Reviewer Bug1）。
              if (f) f.active = active;
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
              // REQ-F-041 补齐（逻辑 kind 的指针寻址，完整说明见上方 set-flag）：targetEntity 在场 →
              // 逐个施于目标实体；缺省 → 回落旧的全局单点路径。
              // 下方 v 的计算与旧版**逐字相同**，只有「施加对象」由单点 `r` 变成列表 `dst`——
              // 无 targetEntity 时 dst 恒为 [全局那一个]，与旧版逐字等价（零回归）。
              const direct = targetsOf(ef);
              const dst: Resource[] = [];
              if (direct.length) {
                for (const te of direct) {
                  const tr = world.getComponent<Resource>(te, 'Resource');
                  if (tr && tr.id === ef.targetId) dst.push(tr); // 纪律同 set-flag-tagged：只触已有且 id 匹配者
                }
                if (dst.length === 0) break; // 目标群里没有同 id 资源 → 本步不施（不回落全局，避免又写错实体）
              } else {
                const gr = lookup.resource(ef.targetId);
                if (gr) dst.push(gr);
              }
              // REQ-012：op 决定运算 —— add(默认 current+value) / mul(current*value，×倍率) / set(value)；钳进 [min,max]。
              if (dst.length) {
                // REQ-013：valueFrom 在场 → v 取自资源（量纲动态值 / 两资源相乘），否则用静态 value。
                //   v = resource[resourceId].current × (timesResourceId ? resource[timesResourceId].current : coeff ?? 1)
                // 解最终计分 score += chips×mult、Bull 每$1+2c、星球升级 chips += level×增量。缺资源按 0 处理（无效=不动）。
                let v: number;
                // 「缺资源 = 无效 = 不动」这条契约必须显式实现，不能靠 v=0 兜（engine-review-2026-08-04
                // §3.3 · P1）：v=0 只对 add 恰好等价「不动」，对 mul 是**把资源清零**、对 set 是**设成 0**
                // ——同一句注释在三个 op 下语义相反。故这里记下「来源缺失」，下面整步跳过。
                let sourceMissing = false;
                if (ef.valueFrom) {
                  // REQ-E-023①：countOf 在场 → base = Tag.flags 命中掩码的实体数（每个 tagged 物 ×coeff）；否则读具名 Resource。
                  let base: number;
                  if (ef.valueFrom.countOf !== undefined) {
                    base = countByTag(world, ef.valueFrom.countOf); // 计数 0 是合法结果、不算缺失
                  } else {
                    const br = lookup.resource(ef.valueFrom.resourceId ?? '');
                    if (!br) sourceMissing = true;
                    base = br?.current ?? 0;
                  }
                  let factor: number;
                  if (ef.valueFrom.timesResourceId) {
                    const fr = lookup.resource(ef.valueFrom.timesResourceId);
                    if (!fr) sourceMissing = true;
                    factor = fr?.current ?? 0;
                  } else {
                    factor = ef.valueFrom.coeff ?? 1;
                  }
                  v = base * factor;
                } else {
                  v = Number(ef.value); // value 缺失/非数 → NaN，由下面的有限性门拦住
                }
                // 非有限值（value 漏填得 NaN、±Infinity）绝不能落进 world：NaN 的钳位比较全为 false，
                // 上面那行 min/max 钳位**钳不住**，NaN 会直接写进 Resource 并**污染确定性 hash**
                // （lockstep 立刻误报 desync、存档 hash 也跟着废）。同「缺资源」一并按无效步跳过。
                if (sourceMissing || !Number.isFinite(v)) break;
                for (const r of dst) {
                  const next = ef.op === 'mul' ? r.current * v : ef.op === 'set' ? v : r.current + v;
                  r.current = next < r.min ? r.min : next > r.max ? r.max : next;
                  // REQ-019：记一步（target/op/本步量 v/本步后值/来源=Effect 实体 id）。UI 据 target/source 演出小丑抖动。
                  appendScoreEvent(trace, 'effect', ef.targetId, (ef.op ?? 'add') as 'set' | 'add' | 'mul', v, r.current, eid);
                }
              }
              break;
            }
            case 'set-state': {
              // REQ-F-041 补齐（同 set-flag）：targetEntity 在场 → 逐个施于目标实体，按 fsmId 匹配。
              // 缺省 → 全局 lookup（一个 fsmId 只有唯一持有者），逐字不变。
              const direct = targetsOf(ef);
              if (direct.length) {
                for (const te of direct) {
                  const ds = world.getComponent<State>(te, 'State');
                  if (ds && ds.fsmId === ef.targetId) ds.current = String(ef.value);
                }
                break;
              }
              const st = lookup.state(ef.targetId);
              if (st) st.current = String(ef.value);
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
                  const keepRes = lookup.resource(ef.keepResource);
                  const keep = keepRes ? Math.max(0, Math.floor(keepRes.current)) : 0;
                  matched.sort((a, b) => a.seq - b.seq || (a.tid < b.tid ? -1 : a.tid > b.tid ? 1 : 0));
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
