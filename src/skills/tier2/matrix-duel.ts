import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase, type Component, type EntityId, type IWorld } from '@engine/core/types.js';
import type { Flag, Resource, ResourceModify, Signal, StringSet } from '@engine/protocol/components.js';
import type { DebugTrace } from '@engine/protocol/components.js';
import { findDebugTrace, appendTrace } from '../debug-trace.js';

// ═══════════════════════════════════════════════════════════════
//  matrix-duel —— 「同时决策 × 收益矩阵」结算解释器（REQ-MATRIXDUEL·Lead 裁决 2026-08-04）。
//
//  一句话：两边同时暗出一手 → 齐了就查一张**纯数据判定表**定胜负 → 发具名 Signal + 写 ResourceModify
//  → 清双方 intent。猜拳全变体（含蜥蜴斯波克）、田忌赛马、押注对决、兵种相克战棋同吃一份表。
//
//  为什么不能用现有件重组（Lead 已按核心规则走过「能否现有能力表达」）：
//    `ConditionExpr` 的 id 是**静态**的，表达不了「按本回合两侧出招动态查表」。三手可以硬写 9 条
//    t2-event-when 规则，但 ①遗物**运行时改写**判定表、②遗物**增设第四手**（3×3→4×4）静态规则集
//    表达不了——放弃它等于放弃这类作品的签名机制。故下沉为解释器型 capability（同 t3-dialogue 范式）。
//
//  边界（防加宽·Lead 钉死）：**不含** AI 策略选招（t2-event-when + t2-weighted-spawn 重组）、
//    **不含**手牌（t2-card-pile）、**不含**押注（t2-craft-recipe + t2-modifier-stack）。本件只做
//    「查表定胜负 + 按表结算 + 清 intent」这一格。
//
//  ── 数据 ────────────────────────────────────────────────────────
//    DuelMatrix{ throws[], beats{}, payoff{}, tie{}, patches[] }  挂在「对局」实体上（一场一份）
//    DuelIntent{ throw }                                          挂在**双方实体**上（本回合出哪一手）
//    DuelOutcome{ … }                                             本件内部结算记录（Update 产·Commit 播报后消费）
//  血量按 **local** 寻址（两侧各挂一份同 id 的 Resource，各扣各的）；附带效果按 **global** id 路由，
//  一效果一个瞬时载体实体（Update 建 → 当拍 resource-apply 消费 → Commit 播报后销毁，零跨拍状态）。
//  补丁三闭集（对局开始按**书写序**确定性套用·纯函数 fold·无隐藏缓存态）：
//    { kind:'beats' }      改克制关系（反律石板：石↔布 反转）
//    { kind:'payoff' }     改收益（剪伤害翻倍 / 平局改为双方回血 = tie.selfDamage 取负）
//    { kind:'add-throw' }  增设一手（第四指·空手：对任何手皆平 = beats:[] + beatenBy:[]）
//
//  ── 落盘门（Lead 附加②）─────────────────────────────────────────
//  未知补丁类型 / 补丁引用不存在的手 / beats·payoff 表残缺 / 互克矛盾 / effects 越权改 hpResource
//  → **装载期报错拒收**（`validateDuelMatrix` 说人话点名），运行期解析同一把尺子硬抛，**绝不静默跳过**。
//  静默跳过一条坏补丁 = 对局规则与作者意图不符却照跑，是这类查表机制最难查的一类 bug。
//
//  ── 定序（Lead 附加①·R10 范式·已实测）───────────────────────────
//  拆成两个系统，因为两条约束**在同一相位里可证成环**：
//    (a) 产 ResourceModify 必须排在 `resource-apply` **之前**（当拍扣血生效）；
//    (b) 发 Signal 必须排在 `event-when` **之后**（它每拍开头 query('Signal') 全局清扫，排它前面
//        自己发的信号当拍就被抹掉·同 keybind/clickable/timeline 纪律）。
//  而组件拓扑里已有 `resource-apply →(Resource) event-when` 一条边，于是
//  resource-apply → event-when →(a 的 runsAfter) 本系统 →(ResourceModify) resource-apply = 真环
//  （实测：topologicalSort 抛 Circular dependency）。解法 = 把「播报」拆到 Commit 相位：
//    · `matrix-duel`（Update·runsBefore resource-apply）：查表结算 → 写 ResourceModify + DuelOutcome + 清 intent
//    · `matrix-duel-announce`（Commit·runsBefore effect-apply）：读 DuelOutcome → 发具名 Signal
//  实测落序：`matrix-duel → resource-apply → event-when → matrix-duel-announce → effect-apply`
//  ——扣血当拍生效、event-when 当拍就能读到新血量判死亡、信号当拍被 effect-apply 消费，三者零延迟。
//  信号的清理白吃 event-when 下一拍的全局清扫（Update 早于 Commit），本件不留任何跨拍状态。
//
//  确定性：纯整数查表 + 补丁按书写序 fold；实体按 id 升序遍历；无 Math.random / 无浮点分支 / 无墙钟。
// ═══════════════════════════════════════════════════════════════

/** 一「手」的 id（rock/paper/scissors/void…，纯数据字符串，闭集由 DuelMatrix.throws 定义）。 */
export type DuelThrowId = string;

/** 附带效果：按 Resource id **全局路由**加减一个资源（洞察点 / 拳票 / 计数器…）。 */
export interface DuelEffect {
  resource: string; // 目标 Resource 的 id（全局唯一；**不得**是 hpResource，见落盘门）
  amount: number; // 增减量（负 = 扣）
}

/**
 * 伤害数值：**固定整数** 或 **按资源线性缩放**（REQ-108-ENG-01·owner 2026-08-06 判 A）。
 * 缩放式：`base + 出手方该资源当前值 × step`（game108 蓄力槽 = `10 + 蓄力 × 10`）。
 * 为什么必须下沉而非用 event-when 穷举：静态规则集会被消费方自己的数据打碎——遗物把蓄力上限
 * 3→4，穷举的 18 条规则就漏了第 4 档且**零报错**；线性式天然跟着上限走。
 * 通用性：蓄力/怒气/连击/加注倍率/兵力同一形状。
 *
 * **寻址两式**（`perSide` 二选一·REQ-108-ENG-01 返工 2026-08-06·owner 判 A）：
 *  · 缺省（绝对 id）：`scaleByResource` 就是 Resource 的 id，全世界只能有一份（多份 → 硬抛，见 resolveDamage）。
 *    适用于「双方共享一个池子」的形态（公共赌注 / 场地能量）。
 *  · `perSide: true`（相对名）：表里填**相对名**（如 `charge.rock`），运行期拼成
 *    **`<出手方实体 id>.<相对名>`**（→ `p1.charge.rock` / `p2.charge.rock`）。
 *    **这是「按侧缩放」的唯一正解**：`payoff` 是双方共用一张表、`scaleByResource` 只能填一个字符串，
 *    所以靠「各侧用唯一 id」是治不了的——表填了 p1 的 id，p2 出手照样取 p1 的槽（实测证伪，
 *    见 REQ-108-ENG-01 改判）。而引擎「一实体一组件」使侧实体那个 Resource 槽已被 hpResource 占死，
 *    真·local 寻址（读 attacker 自己身上那份）在这个形态下永远落空，故只能靠 id 组装。
 *
 * **不做隐式回落**（相对名找不到 → 不去试绝对名）：本能力这一路的每个 bug 都出在静默回落上，
 * 再加一条只会重蹈覆辙。找不到 = 退化成 base（绝不 NaN），与缺省式同口径。
 */
export type DuelDamage = number | {
  base: number;            // 基础伤害
  scaleByResource: string; // 缩放源：perSide 时填**相对名**，否则填 Resource 的**绝对 id**（均不得是 hpResource，见落盘门）
  step: number;            // 每 1 点资源加多少伤害
  perSide?: boolean;       // true = 相对名，运行期拼成 `<出手方实体 id>.<相对名>`（缺省 false = 绝对 id·零回归）
};

/** 某一手的收益（胜负两侧各一项，闭集两个数 + 一个具名信号 + 附带效果）。 */
export interface DuelPayoff {
  damage: DuelDamage; // 出此手**取胜**时对败方造成的伤害（扣败方的 hpResource）·可固定可按资源缩放
  selfDamageOnLose?: number; // 出此手**判负**时出手方额外自伤（剪刀祭式高风险手；缺省 0）
  signal?: string; // 出此手取胜时在**胜方实体**上发的具名 Signal（缺省回落 DuelMatrix.winSignal）
  effects?: DuelEffect[]; // 取胜时的附带资源效果（+1 洞察 / +1 拳票…）
}

/** 平局收益。selfDamage 取负 = 双方各回血（同调式遗物用 payoff 补丁改这里）。 */
export interface DuelTie {
  selfDamage: number; // 双方各受的僵持伤（负数 = 各回血）
  signal?: string; // 平局时在**双方实体各发一份**的具名 Signal
  effects?: DuelEffect[]; // 平局的附带资源效果（全局路由，只发一次）
}

/** 判定表（基表 + 补丁 fold 后的成品，纯数据）。 */
export interface DuelTable {
  throws: DuelThrowId[];
  beats: Record<DuelThrowId, DuelThrowId[]>; // 手 → 它克制的手（每一手都要有条目，不克任何手也要显式写 []）
  payoff: Record<DuelThrowId, DuelPayoff>; // 手 → 收益（每一手都要有条目）
  tie: DuelTie;
}

/** 对局开始按序套用的数据补丁（三闭集：改克制 / 改收益 / 增维）。 */
export type DuelPatch =
  | { kind: 'beats'; throw: DuelThrowId; beats: DuelThrowId[] }
  | { kind: 'payoff'; throw?: DuelThrowId; payoff?: Partial<DuelPayoff>; tie?: Partial<DuelTie> }
  | { kind: 'add-throw'; throw: DuelThrowId; beats?: DuelThrowId[]; beatenBy?: DuelThrowId[]; payoff: DuelPayoff };

/** 补丁类型闭集（落盘门点名用）。 */
export const DUEL_PATCH_KINDS = ['beats', 'payoff', 'add-throw'] as const;

/** 一场对局的判定表（挂「对局」实体）。base 表 + patches；解析是纯函数，组件本身只读。 */
export interface DuelMatrix extends Component, DuelTable {
  readonly type: 'DuelMatrix';
  duelId?: string; // 多场对局并存时的配对键（与 DuelIntent.duelId 对齐；缺省 '' = 单场）
  hpResource: string; // 伤害扣哪个 Resource 的 id（**按侧 local 寻址**：双方各挂一份同 id 的 Resource）
  winSignal?: string; // 胜方实体上的通用信号（被 payoff[手].signal 覆盖）
  loseSignal?: string; // 败方实体上的通用信号
  resolvedSignal?: string; // 对局实体上的「本回合已结算」信号（演出 cue 用）
  patches?: DuelPatch[];
  /**
   * 输入接缝（REQ-108-ENG-02）：`手 → 信号名`。本拍出现该名 Signal 时，把 **`Signal.source` 那一侧**
   * 的 `DuelIntent.throw` 置为对应的手（已有则覆盖 = 同一时区内改主意）。缺省不填 = 现状零回归。
   * 一条缝吃两侧：玩家点 UI 发信号、AI 由 event-when 发**同名信号**，都经 `Signal.source` 认侧。
   * ⚠ `add-throw` 补丁**运行时增设**的手若要可出，必须**预先**在本表留条目——
   *   补丁三闭集改不到 `intentSignals`（它是基表字段，不参与 fold）。
   */
  intentSignals?: Record<DuelThrowId, string>;
  /**
   * 结算副作用①（REQ-108-ENG-03·owner 2026-08-06 判 A1）：**相对名**。
   * 结算末尾把双方**各自出的那只手**对应的 `<该侧>.<相对名>.<手>` 资源清零
   * （胜/负/平三态都做）；**没出的手原样保留**。
   * 例：填 `charge` → p1 出石、p2 出剪 ⇒ `p1.charge.rock` 与 `p2.charge.scissors` 归零，其余四条不动。
   * 为什么归本件：**它是唯一同时知道「谁出了什么」的地方**，这本就是结算副作用；
   * 而 `t2-effect-apply` 的 `Effect.targetId` 是全局寻址、两侧共用一个出招信号名，分不清该清哪一侧（已实查证伪）。
   */
  /**
   * 结算门（REQ-108-ENG-06·owner 2026-08-07 判 A）：**Flag id**。设了则**只有该 Flag 为真时才结算**；
   * 不设 = 凑齐即算（**零回归**·旧行为逐字节不变）。
   *
   * 治的病：本解释器原本「双方 intent 一凑齐就立刻结算」，于是**表达不了任何有揭晓节拍的对局**——
   * 玩家提交那一刻血就掉了，「亮拳/开牌」那几秒变成播放已经发生过的事。而同时决策类玩法
   * （猜拳/押注/兵种相克/田忌赛马）的情绪核恰恰在揭晓。这是解释器的表达力缺口，不是某个游戏的偏好。
   *
   * **为什么是 Flag 而不是 ConditionExpr**：结算系统在 Update 且**刻意不读 Resource**
   * （读了与「排 resource-apply 之前」合围成环·文件头有实测记录）。**实测**：给结算系统加 `Flag`
   * 读面同样当场成环 `[resource-apply, self-rule, matrix-duel]`。故门**在 Commit 相位的接缝里判**
   * （那里读 Flag 实测不成环），判完把 `DuelIntent.armed` 置真；Update 的结算只认 `armed`，
   * **两边都不新增危险读面**。上游用 `t3-flow` 的 `onEnter:[{kind:'set-flag'}]` 开关它即可（现成能力）。
   */
  settleWhenFlag?: string;
  clearOnSettle?: string;
  /**
   * 结算副作用②（REQ-108-ENG-03）：**相对名**。结算末尾把双方本回合的手写进
   * `<该侧>.<相对名>` 的 `StringVar`（经 `StringSet` 事件，由 `x3-string-variable` 的 string-apply 落地）。
   * 例：填 `lastThrow` → `p1.lastThrow='rock'`。供「超时顺延保持上次选择」「AI 抄对手上一手」这类取用。
   * 为什么归本件：`Effect.kind` 十项里**没有写字符串**，全库只有 `t3-poker-hand` 与 `x3-string-variable`
   * 自己产 `StringSet`（已实查）——信号改得了数字，改不了字符串。
   */
  lastThrowVar?: string;
}

/** 某一侧本回合出的手（read-then-settle：结算后由本能力清除，同回合绝不二次结算）。 */
export interface DuelIntent extends Component {
  readonly type: 'DuelIntent';
  throw: DuelThrowId;
  duelId?: string; // 属于哪场对局（缺省 ''）
  // 结算门开过了（内部·由 Commit 接缝置）。仅当 DuelMatrix.settleWhenFlag 设了时有意义：
  // 结算只认已 armed 的 intent。不设门则本字段被忽略（零回归）。
  armed?: boolean;
}

/** 本回合的结算记录（Update 产 → Commit 播报后 consume；跨相位传结果用，不留过拍）。 */
export interface DuelOutcome extends Component {
  readonly type: 'DuelOutcome';
  duelId: string;
  tie: boolean;
  sides: EntityId[]; // 两侧实体（按 id 升序）
  throws: DuelThrowId[]; // 对应两侧所出的手
  winner?: EntityId;
  loser?: EntityId;
  winThrow?: DuelThrowId;
  loseThrow?: DuelThrowId;
  /** 待播报的具名信号（每实体至多一条 —— 引擎「一实体一组件」硬约束）。 */
  emit: Array<{ entity: EntityId; signal: string; arg?: string }>;
  /** 本次结算为附带效果开的瞬时载体实体（Update 建 → resource-apply 当拍消费 → Commit 播报后销毁，不留过拍）。 */
  carriers: EntityId[];
}

// ── 落盘门：校验 + 按序 fold ─────────────────────────────────────────────────

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 只覆盖「补丁里真给了值」的字段（避免 spread 把 undefined 也盖上去，抹掉基表配置）。 */
function mergeDefined<T extends object>(base: T, patch: Partial<T> | undefined): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function checkEffects(effects: DuelEffect[] | undefined, hpResource: string, at: string, issues: string[]): void {
  if (effects === undefined) return;
  if (!Array.isArray(effects)) {
    issues.push(`${at}.effects 不是数组`);
    return;
  }
  effects.forEach((e, i) => {
    if (!e || typeof e.resource !== 'string' || e.resource.length === 0) {
      issues.push(`${at}.effects[${i}] 缺 resource（要写目标 Resource 的 id）`);
      return;
    }
    if (!isFiniteNum(e.amount)) issues.push(`${at}.effects[${i}].amount 不是有限数字`);
    // effects 走**全局** id 路由，而两侧血量是同 id 的两份 Resource（靠 local 寻址区分）——
    // 让 effects 去改 hpResource 只会打中「第一个同 id 的资源」，是必错的写法，装载期直接拒收。
    if (e.resource === hpResource) {
      issues.push(
        `${at}.effects[${i}] 不能直接改血量资源 "${hpResource}"（两侧同 id 无法全局寻址）——` +
          `改伤害请用 payoff.damage / payoff.selfDamageOnLose / tie.selfDamage（tie.selfDamage 取负 = 双方回血）`,
      );
    }
  });
}

/**
 * 缩放源的**实际 Resource id**（REQ-108-ENG-01 返工）：
 *  · `perSide: true` → `<出手方实体 id>.<相对名>`（p1/p2 各自拼出各自的槽 = 按侧取值的落点）；
 *  · 缺省 → 表里那个绝对 id 原样（零回归）。
 * 纯字符串拼接、无 IO、无随机，故确定性与快照 hash 不受影响。
 */
// （findResourceHolder 已随根因① C 判删除：清零改 op:'set' 全局路由——
//  `<侧>.<相对名>.<手>` 天然唯一，resource-apply 自会按 id 找到槽，不再需要先读当前值。）

export function scaleResourceId(damage: Exclude<DuelDamage, number>, attacker: EntityId): string {
  return damage.perSide === true ? `${attacker}.${damage.scaleByResource}` : damage.scaleByResource;
}

/**
 * 伤害取值（REQ-108-ENG-01 + 其返工）：固定整数直接返回；缩放式 = `base + 出手方该资源当前值 × step`。
 * **按侧取值靠 `perSide` 组装 id**（见 DuelDamage 注释）——`payoff` 双方共用一张表、`scaleByResource`
 * 只能填一个字符串，故「各侧用唯一 id」治不了按侧（实测证伪）；真·local 寻址也永远落空
 * （侧实体那个 Resource 槽已被 hpResource 占死）。
 * 资源缺失/非有限 → 当 0（= 退化成 base·绝不 NaN 污染 hp 与快照 hash）。结果取整：全程整数、无浮点。
 */
export function resolveDamage(
  world: IWorld, damage: DuelDamage, attacker: EntityId,
  trace?: DebugTrace, tick = 0,
): number {
  if (typeof damage === 'number') return damage;
  const wantId = scaleResourceId(damage, attacker);
  // 寻址口径**照抄 resource-apply**（atoms/resource/index.ts:149-153），不自创：
  // ① 先看出手方**自己身上**那份 Resource（id 匹配才算）——槽真挂在出手方身上时走这条；
  // ② 找不到再按 id 全局找（引擎一实体一组件，hp 与蓄力这类必然分居不同实体，故这条才是常走的路）。
  let res = world.getComponent<Resource>(attacker, 'Resource');
  if (!res || res.id !== wantId) {
    // 全局回落**必须唯一**：出手方身上没有该 id 时，「取第一个同 id 的」会让 A 侧按 B 侧的槽算伤害
    // ——无报错无告警、只是数字错，正是本文件开头骂过的那类失败态（复查实测：p2 以自身蓄力 0
    // 取胜却按 p1 的蓄力 3 结算，多打 9 点血）。落盘门抓不到（落盘时看不见世界里挂了几份同 id），
    // 故与「表外的手」「>2 份 DuelIntent」同口径：永不自愈的数据错点名硬抛。
    res = undefined;
    const hits: EntityId[] = [];
    for (const [e] of world.query('Resource')) {
      const r = world.getComponent<Resource>(e, 'Resource');
      if (r && r.id === wantId) { hits.push(e); if (!res) res = r; }
    }
    if (hits.length > 1) {
      throw new Error(
        `matrix-duel: 出手方 "${attacker}" 身上没有资源 "${wantId}"，而世界里挂了 `
        + `${hits.length} 份同 id 的 Resource（全局回落只能有一份，否则会按错侧的值结算伤害）——`
        + `涉事实体：${hits.map((e) => `"${e}"`).join(' / ')}。`
        + `按侧缩放请改用 perSide:true + 相对名（表填 "charge"，槽命名 "${attacker}.charge"）；`
        + `共享池请确保该 id 全世界只有一份。`,
      );
    }
  }
  // 资源缺失/非有限 → 当 0（退化成 base）：**绝不让 NaN 进 hp 与快照 hash**
  // （同本 session 修 effect-apply NaN 污染的口径）。
  const ok = res !== undefined && Number.isFinite(res.current);
  const cur = ok ? res!.current : 0;
  // 守则第 3 类【reject】：**「什么都没发生」的分支必须留痕**——缩放源取不到时静默退化成 base，
  // 正是本能力吃过两次亏的形态（全局回落取错侧 / 唯一 id 也取不到按侧）。
  if (!ok) appendTrace(trace, tick, 'matrix-duel', 'reject', `缩放源 "${wantId}" 取不到 → 退化 base=${damage.base}`, `attacker=${attacker}`);
  else appendTrace(trace, tick, 'matrix-duel', 'decision', `缩放源 "${wantId}"=${cur}`, `attacker=${attacker}·perSide=${damage.perSide === true}`);
  return Math.trunc(damage.base + cur * damage.step);
}

function checkPayoffShape(p: DuelPayoff | undefined, hpResource: string, at: string, issues: string[]): void {
  if (!p || typeof p !== 'object') {
    issues.push(`${at} 缺收益条目（要写 {damage:数字}）`);
    return;
  }
  if (typeof p.damage === 'object' && p.damage !== null) {
    // 缩放式：三字段齐全 + 资源名非空 + **不得是 hpResource**（两侧同 id 无法全局寻址，
    // 同 checkEffects 的既有口径；拿血量当缩放源只会打中「第一个同 id 的资源」，是必错写法）。
    const d = p.damage;
    if (!isFiniteNum(d.base)) issues.push(`${at}.damage.base 不是有限数字`);
    if (!isFiniteNum(d.step)) issues.push(`${at}.damage.step 不是有限数字`);
    if (typeof d.scaleByResource !== 'string' || d.scaleByResource.length === 0) {
      issues.push(`${at}.damage.scaleByResource 未填（缩放式伤害要指明按哪个 Resource 缩放）`);
    } else if (d.scaleByResource === hpResource) {
      // 相对名同样拦：`<attacker>.hp` 这种拼法即便拼得出来也是拿血量当缩放源，语义上一样错。
      issues.push(
        `${at}.damage.scaleByResource 不能是血量资源 "${hpResource}"（两侧同 id 无法全局寻址）——`
        + '换一个专用资源（如蓄力/怒气槽）',
      );
    }
    if (d.perSide !== undefined && typeof d.perSide !== 'boolean') {
      issues.push(`${at}.damage.perSide 只能是布尔（true = scaleByResource 按 "<出手方实体 id>.<相对名>" 组装）`);
    }
  } else if (!isFiniteNum(p.damage)) {
    issues.push(`${at}.damage 不是有限数字（或写成 {base,scaleByResource,step} 缩放式）`);
  }
  if (p.selfDamageOnLose !== undefined && !isFiniteNum(p.selfDamageOnLose)) {
    issues.push(`${at}.selfDamageOnLose 不是有限数字`);
  }
  checkEffects(p.effects, hpResource, at, issues);
}

/**
 * 基表 + 补丁 → 成品表（按书写序 fold），同时收齐全部问题。
 * 补丁**逐条**在「套到此刻为止的表」上校验引用（增维补丁加进来的手，后续补丁即可引用），
 * 最后再对成品表做一次残缺 / 越界 / 互克体检。
 */
function foldDuelMatrix(m: DuelMatrix): { table: DuelTable; issues: string[] } {
  const issues: string[] = [];
  const hpResource = typeof m.hpResource === 'string' ? m.hpResource : '';
  if (hpResource.length === 0) issues.push('hpResource 未填（伤害要扣哪个 Resource 的 id）');

  // ① 拷一份基表（绝不改组件本身：解析是纯函数，每拍重算即得同一结果）
  const throws: DuelThrowId[] = Array.isArray(m.throws) ? [...m.throws] : [];
  if (throws.length === 0) issues.push('throws 为空：判定表至少要有一手');
  const seen = new Set<string>();
  for (const t of throws) {
    if (typeof t !== 'string' || t.length === 0) issues.push(`throws 里有空/非字符串的手`);
    else if (seen.has(t)) issues.push(`throws 有重复的手 "${t}"`);
    else seen.add(t);
  }
  const beats: Record<DuelThrowId, DuelThrowId[]> = {};
  for (const [k, v] of Object.entries(m.beats ?? {})) beats[k] = Array.isArray(v) ? [...v] : [];
  const payoff: Record<DuelThrowId, DuelPayoff> = {};
  for (const [k, v] of Object.entries(m.payoff ?? {})) payoff[k] = { ...v };
  let tie: DuelTie = mergeDefined({ selfDamage: 0 } as DuelTie, m.tie);

  // ② 补丁按书写序套用（每条先校引用再落表；坏补丁记问题、不落表——最终由调用方硬抛拒收）
  const patches = Array.isArray(m.patches) ? m.patches : [];
  patches.forEach((raw, i) => {
    const at = `patches[${i}]`;
    if (!raw || typeof raw !== 'object') {
      issues.push(`${at} 是空/非对象补丁`);
      return;
    }
    const p = raw as DuelPatch;
    switch (p.kind) {
      case 'beats': {
        if (!throws.includes(p.throw)) {
          issues.push(`${at}(改克制) 的手 "${p.throw}" 不在判定表里（现有：${throws.join('/') || '空'}）`);
          return;
        }
        if (!Array.isArray(p.beats)) {
          issues.push(`${at}(改克制) 的 beats 不是数组（不克任何手要显式写 []）`);
          return;
        }
        for (const b of p.beats) {
          if (!throws.includes(b)) issues.push(`${at}(改克制) 引用了不存在的手 "${b}"（现有：${throws.join('/')}）`);
          else if (b === p.throw) issues.push(`${at}(改克制) 让手 "${b}" 克制自己`);
        }
        beats[p.throw] = [...p.beats];
        return;
      }
      case 'payoff': {
        if (p.payoff === undefined && p.tie === undefined) {
          issues.push(`${at}(改收益) 既没给 payoff 也没给 tie（这条补丁什么都没改）`);
          return;
        }
        if (p.payoff !== undefined) {
          if (p.throw === undefined) {
            issues.push(`${at}(改收益) 给了 payoff 却没说改哪一手（缺 throw）`);
          } else if (!throws.includes(p.throw)) {
            issues.push(`${at}(改收益) 的手 "${p.throw}" 不在判定表里（现有：${throws.join('/') || '空'}）`);
          } else {
            payoff[p.throw] = mergeDefined(payoff[p.throw] ?? ({ damage: 0 } as DuelPayoff), p.payoff);
          }
        }
        if (p.tie !== undefined) tie = mergeDefined(tie, p.tie);
        return;
      }
      case 'add-throw': {
        if (typeof p.throw !== 'string' || p.throw.length === 0) {
          issues.push(`${at}(增维) 没给新手的 id`);
          return;
        }
        if (throws.includes(p.throw)) {
          issues.push(`${at}(增维) 的手 "${p.throw}" 已经在判定表里了（增维补丁只能加新手）`);
          return;
        }
        let ok = true;
        for (const b of p.beats ?? []) {
          if (!throws.includes(b)) {
            issues.push(`${at}(增维) 的 beats 引用了不存在的手 "${b}"（现有：${throws.join('/')}）`);
            ok = false;
          }
        }
        for (const b of p.beatenBy ?? []) {
          if (!throws.includes(b)) {
            issues.push(`${at}(增维) 的 beatenBy 引用了不存在的手 "${b}"（现有：${throws.join('/')}）`);
            ok = false;
          }
        }
        checkPayoffShape(p.payoff, hpResource, `${at}(增维).payoff`, issues);
        if (!ok) return;
        throws.push(p.throw);
        beats[p.throw] = [...(p.beats ?? [])];
        for (const b of p.beatenBy ?? []) (beats[b] ??= []).push(p.throw);
        payoff[p.throw] = { ...p.payoff };
        return;
      }
      default: {
        const kind = (raw as { kind?: unknown }).kind;
        issues.push(`${at} 是未知补丁类型 "${String(kind)}"（闭集只有：${DUEL_PATCH_KINDS.join(' / ')}）`);
        return;
      }
    }
  });

  // ③ 成品表体检：残缺 / 越界 / 自克 / 互克 / 平局收益
  const known = new Set(throws);
  for (const t of throws) {
    const row = beats[t];
    if (!Array.isArray(row)) {
      issues.push(`beats 表残缺：手 "${t}" 没有 beats 条目（不克任何手也要显式写 []）`);
    } else {
      const dup = new Set<string>();
      for (const b of row) {
        if (!known.has(b)) issues.push(`beats["${t}"] 引用了不存在的手 "${b}"（现有：${throws.join('/')}）`);
        else if (b === t) issues.push(`beats["${t}"] 让手 "${t}" 克制自己`);
        else if (dup.has(b)) issues.push(`beats["${t}"] 重复列了 "${b}"`);
        dup.add(b);
      }
    }
    checkPayoffShape(payoff[t], hpResource, `payoff["${t}"]`, issues);
  }
  for (const k of Object.keys(beats)) if (!known.has(k)) issues.push(`beats 有多余条目 "${k}"（不在 throws 里）`);
  for (const k of Object.keys(payoff)) if (!known.has(k)) issues.push(`payoff 有多余条目 "${k}"（不在 throws 里）`);
  // 互克 = 同一格既判 A 胜又判 B 胜，查表无法定胜负（反律石板只反一半时的典型漏配）。
  for (const a of throws) {
    for (const b of beats[a] ?? []) {
      if (a < b && (beats[b] ?? []).includes(a)) {
        issues.push(`判定表矛盾：手 "${a}" 与 "${b}" 互克（同一格定不出胜负）——改克制补丁记得把反向那条也去掉`);
      }
    }
  }
  if (!tie || !isFiniteNum(tie.selfDamage)) issues.push('tie.selfDamage 不是有限数字（平局僵持伤；取负 = 双方回血）');
  checkEffects(tie?.effects, hpResource, 'tie', issues);

  // 结算副作用（REQ-108-ENG-03）：两个相对名——非空字符串，且不得是 hpResource
  // （拿血量当清零/记手的落点只会误伤对局本身，与 effects/scaleByResource 同一条拒收口径）。
  for (const [field, val] of [['clearOnSettle', m.clearOnSettle], ['lastThrowVar', m.lastThrowVar]] as const) {
    if (val === undefined) continue;
    if (typeof val !== 'string' || val.length === 0) {
      issues.push(`${field} 要填非空**相对名**（如 "charge" / "lastThrow"，运行期拼成 "<侧>.<相对名>…"）`);
    } else if (val === m.hpResource) {
      issues.push(`${field} 不能是血量资源 "${m.hpResource}"（相对名拼出来会撞上对局血量，必错）`);
    }
  }
  // 输入接缝（REQ-108-ENG-02）：手必须在 throws 内、信号名非空、且一个信号名不许映射到两只手
  // （同名两义 = 点一下同时想出两手，永不自愈的数据错，装载期直接拒收）。
  if (m.intentSignals !== undefined) {
    if (typeof m.intentSignals !== 'object' || m.intentSignals === null || Array.isArray(m.intentSignals)) {
      issues.push('intentSignals 不是「手 → 信号名」的对象');
    } else {
      const bySignal = new Map<string, DuelThrowId>();
      for (const [thrown, sigName] of Object.entries(m.intentSignals)) {
        if (!known.has(thrown)) issues.push(`intentSignals 有多余条目 "${thrown}"（不在 throws 里）`);
        if (typeof sigName !== 'string' || sigName.length === 0) {
          issues.push(`intentSignals["${thrown}"] 的信号名未填（要写 UI/AI 发的那个 Signal 名）`);
          continue;
        }
        const prev = bySignal.get(sigName);
        if (prev !== undefined) issues.push(`intentSignals 里信号名 "${sigName}" 同时映射到 "${prev}" 与 "${thrown}"（一个信号只能出一手）`);
        else bySignal.set(sigName, thrown);
      }
    }
  }

  return { table: { throws, beats, payoff, tie }, issues };
}

/** 体检（不抛）：返回全部问题（人话）。空数组 = 这张表可以落盘。 */
export function checkDuelMatrix(m: DuelMatrix): string[] {
  return foldDuelMatrix(m).issues;
}

/** 落盘门（抛出版）：有任一问题即拒收，错误文本逐条点名（Lead 附加②口径）。 */
export function validateDuelMatrix(m: DuelMatrix): void {
  const issues = checkDuelMatrix(m);
  if (issues.length) throw new Error(`matrix-duel 装载校验失败:\n  - ${issues.join('\n  - ')}`);
}

/** 基表 + 补丁 → 成品判定表（纯函数·按书写序·先过落盘门，坏数据硬抛，绝不静默跳过）。 */
export function resolveDuelMatrix(m: DuelMatrix): DuelTable {
  const { table, issues } = foldDuelMatrix(m);
  if (issues.length) throw new Error(`matrix-duel 装载校验失败:\n  - ${issues.join('\n  - ')}`);
  return table;
}

/** 查表定胜负（纯整数集合查表）：'a' = 前者胜，'b' = 后者胜，'tie' = 平（含同手 / 互不克制）。 */
export function duelVerdict(table: DuelTable, a: DuelThrowId, b: DuelThrowId): 'a' | 'b' | 'tie' {
  const aWins = (table.beats[a] ?? []).includes(b);
  const bWins = (table.beats[b] ?? []).includes(a);
  if (aWins === bWins) return 'tie'; // 都不克（含同手） / 互克（互克已被落盘门拒收，此处兜底判平）
  return aWins ? 'a' : 'b';
}

// ── 系统 ─────────────────────────────────────────────────────────────────────

/** 附带效果的瞬时载体实体 id（一效果一实体 —— 引擎「一实体一 ResourceModify 槽」）。 */
const carrierId = (matrixEid: EntityId, i: number): EntityId => `duel:${matrixEid}#${i}`;

export const matrixDuelCapability = defineCapability({
  id: 't2-matrix-duel',
  version: '1.0.0',

  describe: {
    name: 'matrix-duel',
    summary:
      '同时决策 × 收益矩阵结算解释器：双方各挂 DuelIntent{throw}，两侧齐备即查 DuelMatrix 定胜负 → 按 payoff/tie 写 ResourceModify（伤害/附带效果）+ 发具名 Signal → 清双方 intent（同回合绝不二次结算）。patches 三闭集（改克制 / 改收益 / 增设新手）在对局开始按书写序确定性套用；坏补丁装载期拒收。',
    semantic: ['tier2', 'logic', 'duel', 'matrix', 'determinism'],
    whenToUse:
      '任何「两边同时暗出一手、查一张固定表定胜负与收益」的对抗：猜拳全变体（含蜥蜴斯波克）、田忌赛马、押注对决、兵种相克战棋。给对局实体挂 DuelMatrix，双方实体各挂 Resource{id:hpResource} + 本回合的 DuelIntent。AI 怎么选招（t2-event-when + t2-weighted-spawn）、手牌（t2-card-pile）、押注（t2-craft-recipe + t2-modifier-stack）都不归本件。',
    examples: [
      "三手基表：DuelMatrix{ hpResource:'hp', throws:['rock','paper','scissors'], beats:{rock:['scissors'],paper:['rock'],scissors:['paper']}, payoff:{rock:{damage:6},scissors:{damage:5,effects:[{resource:'insight',amount:1}]},paper:{damage:4,signal:'duel_paper_win'}}, tie:{selfDamage:1} }",
      "出招：给双方实体各挂 DuelIntent{throw:'rock'} / DuelIntent{throw:'scissors'} → 当拍结算：石胜、剪方 -6 hp、双方 intent 清空",
      "遗物·反律石板（改克制）：patches:[{kind:'beats',throw:'rock',beats:['scissors','paper']},{kind:'beats',throw:'paper',beats:[]}]（两条一起写，只反一半会被落盘门判互克拒收）",
      "遗物·同调（改收益）：patches:[{kind:'payoff',tie:{selfDamage:-3}}] → 平局改为双方各回 3 血",
      "遗物·第四指空手（增维 3×3→4×4）：patches:[{kind:'add-throw',throw:'void',beats:[],beatenBy:[],payoff:{damage:0}}] → 对任何手皆平",
    ],
  },

  components: {
    provides: {
      DuelMatrix: {
        category: 'config',
        describe:
          '一场对局的判定表（纯数据）+ 补丁列表。挂在「对局」实体上；双方实体各挂一份 Resource{id:hpResource} 供 local 寻址扣血。',
        fields: {
          duelId: { type: 'string', describe: '多场对局并存时的配对键（与 DuelIntent.duelId 对齐；缺省 "" = 单场）' },
          hpResource: { type: 'string', describe: '伤害扣哪个 Resource 的 id（双方各挂一份同 id 的 Resource，按 local 寻址各扣各的）' },
          throws: { type: 'string[]', describe: '本表全部「手」的 id 闭集，如 ["rock","paper","scissors"]' },
          beats: { type: 'string', describe: 'Record<手, 它克制的手[]>：每一手都要有条目，不克任何手也要显式写 []（残缺=装载期拒收）；不得自克，不得互克' },
          payoff: { type: 'string', describe: 'Record<手, {damage, selfDamageOnLose?, signal?, effects?}>：每一手都要有条目。damage=出此手取胜时对败方的伤害；selfDamageOnLose=出此手判负时额外自伤；effects 按 Resource id 全局路由（不得改 hpResource）' },
          tie: { type: 'string', describe: '平局收益 {selfDamage, signal?, effects?}：selfDamage=双方各受的僵持伤，取负 = 双方各回血' },
          patches: { type: 'string', describe: '对局开始按书写序套用的数据补丁，三闭集：{kind:"beats",throw,beats[]} 改克制 / {kind:"payoff",throw?,payoff?,tie?} 改收益 / {kind:"add-throw",throw,beats?,beatenBy?,payoff} 增设一手。未知类型 / 引用不存在的手 / 表残缺 → 装载期报错拒收' },
          winSignal: { type: 'string', describe: '胜方实体上发的通用信号（被 payoff[取胜那手].signal 覆盖）' },
          loseSignal: { type: 'string', describe: '败方实体上发的通用信号' },
          resolvedSignal: { type: 'string', describe: '对局实体上发的「本回合已结算」信号（演出 cue 用）' },
        },
      },
      DuelIntent: {
        category: 'intent',
        describe: '某一侧本回合出的手。两侧齐备即结算，结算后由本能力清除（同一回合绝不二次结算）。',
        fields: {
          throw: { type: 'string', describe: '出哪一手（必须是 DuelMatrix.throws 里的 id）' },
          duelId: { type: 'string', describe: '属于哪场对局（与 DuelMatrix.duelId 对齐；缺省 ""）' },
        },
      },
      DuelOutcome: {
        category: 'event',
        describe: '本回合的结算记录（Update 相位产出 → Commit 相位播报具名信号后即被消费，不留过拍）。',
        fields: {
          duelId: { type: 'string', describe: '哪场对局' },
          tie: { type: 'boolean', describe: '是否平局' },
          sides: { type: 'string[]', describe: '两侧实体 id（升序）' },
          throws: { type: 'string[]', describe: '两侧对应所出的手' },
          winner: { type: 'EntityId', describe: '胜方实体（平局缺省）' },
          loser: { type: 'EntityId', describe: '败方实体（平局缺省）' },
          winThrow: { type: 'string', describe: '取胜的那一手' },
          loseThrow: { type: 'string', describe: '落败的那一手' },
          emit: { type: 'string', describe: '待播报的具名信号 [{entity,signal,arg?}]（每实体至多一条）' },
          carriers: { type: 'string[]', describe: '附带效果的瞬时载体实体 id（本拍 resource-apply 消费其 ResourceModify 后，播报系统销毁）' },
        },
      },
    },
    reads: ['DuelMatrix', 'DuelIntent', 'DuelOutcome', 'Signal', 'Resource', 'Flag'],
    writes: ['ResourceModify', 'DuelIntent', 'DuelOutcome', 'Signal', 'StringSet'],
    consumes: ['DuelOutcome'],
  },

  config: {},

  systems: [
    {
      // ① 结算（Update）：查表 → 写 ResourceModify → 记 DuelOutcome → 清双方 intent。
      // runsBefore resource-apply（Lead 附加①·R10 范式）：本系统产 ResourceModify，必须排它前面，
      // 扣血当拍生效。
      // **读 Resource 已诚实申报**（根因①·owner 2026-08-16 判 C）：resolveDamage 取缩放源是真读，
      // 自 REQ-108-ENG-01 起瞒报了半个月。申报不成环的机理 = topological-sort 规则③
      // 「显式边覆盖相反方向的组件推断边」：本系统读的是**本拍 pre-apply 值**（蓄力在伤害结算前
      // 的读数），故对每个会与本系统同世界的 Resource **直写者**显式排前——resource-apply（事件
      // 消费落账）与 self-rule（决策系统·坐结算链尾直写 Resource）各压掉一条反向软边；漏谁谁的
      // 软边就闭环（定序测试连 console.warn 一起断言为零，漏一条当场红——2026-08-16 实测
      // 只写 resource-apply 时恰剩 [resource-apply, self-rule, matrix-duel] 三元环）。
      // 附带效果仍不自己找目标实体，发 scope:'global' 的 ResourceModify 交 resource-apply 按 id 路由；
      // 结算清零（clearOnSettle）同理走载体 + op:'set'——写目标值 0 不需要读当前值。
      id: 'matrix-duel',
      reads: ['DuelMatrix', 'DuelIntent', 'Resource'],
      writes: ['ResourceModify', 'DuelIntent', 'DuelOutcome'],
      consumes: [],
      runsBefore: ['resource-apply', 'self-rule'],
      execute(world: IWorld) {
        const matrixIds = sortedIds(world, 'DuelMatrix');
        if (matrixIds.length === 0) return;
        const intentIds = sortedIds(world, 'DuelIntent');

        // 日志基准守则（owner 2026-08-06）：opt-in——世界没挂 DebugTrace 时 `tr` 为 undefined，
        // 下面全部 appendTrace 都是 no-op（零开销）。拍号由宿主推进（禁墙钟）。
        const tr = findDebugTrace(world);
        const tk = tr?.tick ?? 0;
        for (const mid of matrixIds) {
          const md = world.getComponent<DuelMatrix>(mid, 'DuelMatrix');
          if (!md) continue;
          // 落盘门（Lead 附加②）：每拍按同一把尺子校验 + 按书写序套补丁。纯函数、零缓存态，
          // 故「对局开始把 patches 摆好」= 本拍起全部结算都用套好的表。坏数据在此硬抛，绝不静默跳过。
          const table = resolveDuelMatrix(md);

          const key = md.duelId ?? '';
          const sides: Array<{ eid: EntityId; intent: DuelIntent }> = [];
          for (const iid of intentIds) {
            const it = world.getComponent<DuelIntent>(iid, 'DuelIntent');
            if (it && (it.duelId ?? '') === key) sides.push({ eid: iid, intent: it });
          }
          // 结算门（REQ-108-ENG-06）：设了 `settleWhenFlag` 就只结算**已 armed** 的 intent。
          // arming 在 Commit 接缝里做（那里读 Flag 不成环）；此处**不读 Flag**，只认 intent 上的标记
          // ——这正是这个设计的要害：Update 侧零新增读面，定序一动不动。
          // 未 armed = 双方已提交但还没到揭晓那一拍 ⇒ 与「一侧没提交」同为**瞬时**态，等下一拍。
          if (md.settleWhenFlag && sides.some((sd) => sd.intent.armed !== true)) {
            appendTrace(tr, tk, 'matrix-duel', 'reject', `duel "${key}" 结算门未开（settleWhenFlag=${md.settleWhenFlag}）→ 本拍不结算`);
            continue;
          }
          // < 2：一侧还没提交 → 本拍不结算、等齐（**瞬时**态，下一拍可能就齐了，合理跳过）。
          // > 2：同一 duelId 挂了三份及以上 DuelIntent = 数据错，**永远不会自己变回 2** →
          //      旧实现一并 continue 就成了静默永久死锁（对局静止、零报错、最难查）。
          //      本文件对「表外的手」已立同一规矩：这类永不自愈的数据错必须点名硬抛，
          //      故此处补齐同口径（engine-review-2026-08-04 §3.3 · P2）。
          if (sides.length > 2) {
            throw new Error(
              `matrix-duel: duelId "${key}" 挂了 ${sides.length} 份 DuelIntent（判定表是两方对决，只能有 2 份）——`
              + `涉事实体：${sides.map((s) => `"${s.eid}"`).join(' / ')}`,
            );
          }
          if (sides.length < 2) {
            // 守则第 3 类【reject】：本拍不结算。这是「什么都没发生」的分支，外部完全不可见——
            // 一旦某侧的 intent 因接线错误永远到不了，只看现象就是「对局静止、零报错」。
            appendTrace(tr, tk, 'matrix-duel', 'reject', `duelId "${key}" 未齐（${sides.length}/2）→ 本拍不结算`);
            continue;
          }

          const [sa, sb] = sides;
          const ta = sa.intent.throw;
          const tb = sb.intent.throw;
          for (const s of sides) {
            if (!table.throws.includes(s.intent.throw)) {
              // 表外的手 = 数据错。此处若 fail-closed 静默跳过，两侧 intent 会永远齐着却什么都不发生
              // ——对局静止死锁是最难查的失败态，故与落盘门同口径点名硬抛。
              throw new Error(
                `matrix-duel: 实体 "${s.eid}" 的 DuelIntent 出了判定表外的手 "${s.intent.throw}"（本表只有：${table.throws.join('/')}）`,
              );
            }
          }

          // 血量：两侧各自那份同 id 的 Resource 靠 **local** 寻址区分，故 ResourceModify 必须挂在该侧实体上
          // （每实体一个槽 → 同侧的多笔血量增减先累加成一笔）。
          const hpDelta = new Map<EntityId, number>();
          const addHp = (eid: EntityId, amount: number): void => {
            hpDelta.set(eid, (hpDelta.get(eid) ?? 0) + amount);
          };
          // 附带效果：全局 id 路由，一效果一条 ResourceModify → 各自开一个瞬时载体实体（Commit 播报后销毁）。
          const pending: DuelEffect[] = [];
          const addEffects = (effects: DuelEffect[] | undefined): void => {
            for (const e of effects ?? []) if (e.amount !== 0) pending.push(e);
          };

          const verdict = duelVerdict(table, ta, tb);
          // 守则第 1 类【decision】：查表选了哪一条——本能力的核心分叉，一个点恰好一条。
          appendTrace(tr, tk, 'matrix-duel', 'decision', `判定 ${verdict}`, `${sa.eid}:${ta} vs ${sb.eid}:${tb}`);
          const emit: DuelOutcome['emit'] = [];
          let outcome: DuelOutcome;

          if (verdict === 'tie') {
            if (table.tie.selfDamage !== 0) {
              addHp(sa.eid, -table.tie.selfDamage);
              addHp(sb.eid, -table.tie.selfDamage);
            }
            addEffects(table.tie.effects);
            if (table.tie.signal) {
              emit.push({ entity: sa.eid, signal: table.tie.signal, arg: ta });
              emit.push({ entity: sb.eid, signal: table.tie.signal, arg: tb });
            }
            outcome = {
              type: 'DuelOutcome',
              duelId: key,
              tie: true,
              sides: [sa.eid, sb.eid],
              throws: [ta, tb],
              emit,
              carriers: [],
            };
          } else {
            const win = verdict === 'a' ? sa : sb;
            const lose = verdict === 'a' ? sb : sa;
            const winThrow = verdict === 'a' ? ta : tb;
            const loseThrow = verdict === 'a' ? tb : ta;
            const wp = table.payoff[winThrow];
            const lp = table.payoff[loseThrow];
            // 败方挨两笔：胜方那手的 damage + 自己那手的 selfDamageOnLose（同一 hp 槽，合并成一条）。
            // damage 可为缩放式 → 按**出手方（胜方）**自己身上那份资源取值（侧 local·同 hpResource 口径）。
            const loserDelta = -resolveDamage(world, wp.damage, win.eid, tr, tk) - (lp.selfDamageOnLose ?? 0);
            if (loserDelta !== 0) addHp(lose.eid, loserDelta);
            addEffects(wp.effects);
            const winSignal = wp.signal ?? md.winSignal;
            if (winSignal) emit.push({ entity: win.eid, signal: winSignal, arg: winThrow });
            if (md.loseSignal) emit.push({ entity: lose.eid, signal: md.loseSignal, arg: loseThrow });
            outcome = {
              type: 'DuelOutcome',
              duelId: key,
              tie: false,
              sides: [sa.eid, sb.eid],
              throws: [ta, tb],
              winner: win.eid,
              loser: lose.eid,
              winThrow,
              loseThrow,
              emit,
              carriers: [],
            };
          }
          if (md.resolvedSignal) {
            emit.push({ entity: mid, signal: md.resolvedSignal, arg: verdict === 'tie' ? '' : outcome.winThrow });
          }

          // 守则第 4 类【commit】：实际写入摘要。**聚合一条**（不逐实体刷屏 = 守则「循环内只记聚合」）。
          appendTrace(tr, tk, 'matrix-duel', 'commit',
            [...hpDelta].filter(([, a]) => a !== 0).map(([e, a]) => `${e}${a > 0 ? '+' : ''}${a}`).join(' ') || '无血量变动',
            `资源 "${md.hpResource}"`);
          for (const [eid, amount] of hpDelta) {
            if (amount === 0) continue;
            world.addComponent(eid, {
              type: 'ResourceModify',
              resourceId: md.hpResource,
              amount,
              scope: 'local',
            } as ResourceModify);
          }
          pending.forEach((e, i) => {
            const cid = carrierId(mid, i);
            world.destroyEntity(cid); // 防御：上一拍若异常中断没销毁，createEntity 会因重名抛错
            world.createEntity(cid);
            world.addComponent(cid, {
              type: 'ResourceModify',
              resourceId: e.resource,
              amount: e.amount,
              scope: 'global',
            } as ResourceModify);
            outcome.carriers.push(cid);
          });
          // 结算清零（REQ-108-ENG-03·根因① C 改版）：只清各侧**出过的那只手**。op:'set' 写目标值 0
          // 不需要读当前值 → 本操作从播报（Commit·靠读 Resource 发 -当前值）搬回结算拍：
          // 与伤害同拍原子生效（清零本就是「这手已用掉」的一部分），且不再有「持有者 ResourceModify
          // 槽被占就静默跳过」的旧漏拍面。槽 id 全局唯一（<侧>.<相对名>.<手>）→ global 路由，
          // 载体走 effects 同一条生命周期；槽不存在时 resource-apply 静默跳过（与旧「找不到持有者」同形）。
          if (md.clearOnSettle) {
            [{ eid: sa.eid, thrown: ta }, { eid: sb.eid, thrown: tb }].forEach((s, j) => {
              const cid = carrierId(mid, pending.length + j);
              world.destroyEntity(cid);
              world.createEntity(cid);
              world.addComponent(cid, {
                type: 'ResourceModify',
                resourceId: `${s.eid}.${md.clearOnSettle}.${s.thrown}`,
                amount: 0,
                op: 'set',
                scope: 'global',
              } as ResourceModify);
              outcome.carriers.push(cid);
            });
          }
          world.addComponent(mid, outcome);
          // 清双方 intent —— 同一回合绝不二次结算（下一回合由出招侧重新挂 DuelIntent）。
          world.removeComponent(sa.eid, 'DuelIntent');
          world.removeComponent(sb.eid, 'DuelIntent');
        }
      },
    },
    {
      // ② 播报（Commit）：读结算记录 → 在对应实体上发具名 Signal（source = 该实体，供 effect-apply
      // 的 '@signal-source' 寻址「谁赢谁抽牌」）。放 Commit 是为了排在 event-when（Update）的全局
      // Signal 清扫**之后**、effect-apply（Commit）之前——见文件头「定序」的成环证明。
      // 信号无需自清：下一拍 event-when 的全局清扫会带走（Update 早于 Commit），本件不留跨拍状态。
      id: 'matrix-duel-announce',
      phase: SystemPhase.Commit,
      // REQ-108-ENG-03 起还兼「结算副作用」之 lastThrowVar（读 DuelMatrix 取相对名·写 StringSet）。
      // 清零已随根因① C 判搬回结算系统（op:'set' 写目标值不需要读当前值）——本系统不再读
      // Resource、不再写 ResourceModify，申报随之缩窄（历史上这两项就是为清零而生，见 git 历史）。
      reads: ['DuelOutcome', 'DuelMatrix'],
      writes: ['Signal', 'StringSet'],
      consumes: ['DuelOutcome'],
      runsBefore: ['effect-apply'], // 组件拓扑（写 Signal → effect-apply 读）本已排前，显式加固
      execute(world: IWorld) {
        const ids = sortedIds(world, 'DuelOutcome');
        if (ids.length === 0) return;
        // 结算与播报之间隔着整个 Update 尾段（mortal/destroy 可能已收走某一侧实体）→ 先取存活集合。
        const alive = new Set(world.getAllEntities());
        for (const oid of ids) {
          const o = world.getComponent<DuelOutcome>(oid, 'DuelOutcome');
          if (!o) continue;
          for (const s of o.emit) {
            if (!alive.has(s.entity) || world.hasComponent(s.entity, 'Signal')) continue; // 一实体一 Signal 槽，先到先得
            world.addComponent(s.entity, {
              type: 'Signal',
              name: s.signal,
              source: s.entity,
              ...(s.arg !== undefined && s.arg !== '' ? { arg: s.arg } : {}),
            } as Signal);
          }
          // 附带效果的瞬时载体：ResourceModify 已由本拍 resource-apply 消费，此处收走空壳（不留过拍垃圾）。
          for (const cid of o.carriers) world.destroyEntity(cid);

          // ── 结算副作用（REQ-108-ENG-03）───────────────────────────────────
          // DuelOutcome 挂在**对局实体**上（结算处 `world.addComponent(mid, outcome)`），故 oid === 对局实体。
          const md = world.getComponent<DuelMatrix>(oid, 'DuelMatrix');
          if (!md) continue;
          for (let i = 0; i < o.sides.length; i++) {
            const side = o.sides[i];
            const thrown = o.throws[i];
            if (!alive.has(side)) continue; // 该侧已被 mortal/destroy 收走 → 无处可写，跳过
            // （清零已搬回结算系统·op:'set' 载体·见 settle 的「结算清零」块——根因① C 判）
            // 记本回合的手：走 StringSet 一次性写事件（由 x3-string-variable 的 string-apply 落地）。
            if (md.lastThrowVar && !world.hasComponent(side, 'StringSet')) {
              world.addComponent(side, {
                type: 'StringSet',
                id: `${side}.${md.lastThrowVar}`,
                value: thrown,
                scope: 'global',
              } as StringSet);
            }
          }
        }
      },
    },
    {
      // ③ 输入接缝（Commit·REQ-108-ENG-02）：读本拍 Signal → 给 `Signal.source` 那一侧挂 DuelIntent。
      // 本件此前**有出口没入口**（describe 原文「双方各挂 DuelIntent」= 假定别人挂好），而现有能力
      // 一条都产不出组件：Effect.kind 十项 / SelfAction.kind 五项都没有「加组件」，prefab 只建新实体
      // （已逐条实查）。范式对标 t3-dialogue 自带 advance/choose 输入接缝。
      //
      // **为什么放 Commit 而不是 Update**（定序·已实测·非纸面推理）：本系统读 Signal，而 event-when
      // 是 Signal 写者且排在 resource-apply 之后，故放 Update 就闭合成环——实测把本系统改 Update，
      // topological-sort 报：环 [resource-apply, event-when, self-rule, matrix-duel, matrix-duel-intent]
      // （闭环组件 DuelIntent/Signal/Resource/ResourceModify/Flag/State）。
      // ⚠ 注意它**不抛**：REQ-CYCLEHAZ B 之后是「告警 + 按注册序确定性裁决」，落序不合语义而照跑，
      //   接缝会**静默失效**（实测两条接缝用例转红、其余全绿）——又一个只告警不拦的失败面，故不能靠它兜。
      // 放 Commit 后走「标准离散反馈·一拍延迟」（同 effect-apply 口径）：本拍点击 → 下一拍 Update 结算。
      // 对局是秒级时区、一拍 = 一帧，无感知代价；换来零定序改动（边界要求不碰拆相位）。
      id: 'matrix-duel-intent',
      phase: SystemPhase.Commit,
      // 读 `Flag` 是给结算门用的（REQ-108-ENG-06）。**为什么门判在这儿**：Update 的结算系统
      // 加任何读面都成环（实测 `Flag` 当场闭合 `[resource-apply, self-rule, matrix-duel]`），
      // 而本系统在 Commit，读 Flag 实测不成环（定序用例覆盖）。
      reads: ['DuelMatrix', 'Signal', 'Flag', 'Resource'], // Resource：`hasComponent(side,'Resource')` 判信号源是不是对局侧（P1a 严格模式补齐·此前漏报）
      writes: ['DuelIntent'],
      consumes: [],
      runsAfter: ['matrix-duel-announce'], // 播报的胜负信号绝不该被当成出招输入（同拍两者都在 Commit）
      execute(world: IWorld) {
        const tr = findDebugTrace(world); // opt-in·没挂 DebugTrace 就全程 no-op（日志基准守则）
        const tk = tr?.tick ?? 0;
        const matrixIds = sortedIds(world, 'DuelMatrix');
        if (matrixIds.length === 0) return;
        for (const mid of matrixIds) {
          const md = world.getComponent<DuelMatrix>(mid, 'DuelMatrix');
          if (!md) continue;

          // ── 结算门 arming（REQ-108-ENG-06）：门开着就把本场双方的 intent 标成"可结算"。
          // 下一拍 Update 的结算系统只认这个标记（它读不了 Flag，见上面 reads 注释）。
          if (md.settleWhenFlag) {
            const fe = world.byId('Flag', 'id', md.settleWhenFlag); // B-3：索引取首个（= 旧 for…break）
            const open = fe === undefined ? false : (world.getComponent<Flag>(fe, 'Flag')?.active ?? false);
            const key = md.duelId ?? '';
            for (const [iid] of world.query('DuelIntent')) {
              const it = world.getComponent<DuelIntent>(iid, 'DuelIntent');
              if (!it || (it.duelId ?? '') !== key) continue;
              if (open) {
                if (it.armed !== true) world.addComponent(iid, { ...it, armed: true } as DuelIntent);
                continue;
              }
              // ── 过期回收（REQ-108-ENG-07·owner 2026-08-07 判 A）─────────────────────
              // 门**关着**而这份 intent **已经 armed** ⇒ 它的揭晓窗口已经过去却没结算完
              //（唯一成因：armed 后被 ENG-02 接缝改主意/单侧掉队，而结算要两侧齐）。
              // 不回收的话没人清得掉它——**结算是 DuelIntent 唯一的清理点，而门关着时结算不发生**
              // ⇒ 它会滞留到下一回合，用**上一回合的手**参与结算。
              // 实证（主程复查 ENG-04/05/06 的第③步探针）：p1 血 20→13，p2 本回合根本没出手，
              // 却用上一回合滞留的 paper 打出 7 点伤害，**零报错**。
              // **只回收 armed 的**：没 armed 的是「本回合已提交、正等门开」的正常态，动它就把玩法打断了。
              if (it.armed === true) {
                world.removeComponent(iid, 'DuelIntent');
                appendTrace(tr, tk, 'matrix-duel-intent', 'reject',
                  `回收过期 intent："${iid}" 的 ${it.throw}（已 armed 但门已关）`,
                  `settleWhenFlag=${md.settleWhenFlag}·揭晓窗口已过`);
              }
            }
          }

          if (!md.intentSignals) continue;
          const table = resolveDuelMatrix(md);
          // 信号名 → 手（反查表按信号名建，避免每个信号都遍历一遍 intentSignals）
          const bySignal = new Map<string, DuelThrowId>();
          for (const [thrown, sigName] of Object.entries(md.intentSignals)) {
            if (typeof sigName === 'string' && sigName.length > 0) bySignal.set(sigName, thrown);
          }
          if (bySignal.size === 0) continue;
          // 实体按 id 升序遍历（确定性·同本件其余系统）
          for (const [eid] of world.query('Signal').sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
            const s = world.getComponent<Signal>(eid, 'Signal');
            if (!s) continue;
            const thrown = bySignal.get(s.name);
            if (thrown === undefined) continue;
            // 表外的手不许经输入接缝溜进来（结算期对表外的手是硬抛·此处提前挡在门口，
            // 因为 add-throw 补丁增设的手若没在 intentSignals 里留条目，本来就出不了）。
            if (!table.throws.includes(thrown)) continue;
            const side = s.source;
            if (!side || !world.hasComponent(side, 'Resource')) {
              // 守则第 3 类【reject】：**「什么都没发生」的分支必须留痕**。
              // 这里是 `KeyBinding.source`/`EventWhen.source` 代发（ENG-04/05）打错字的落点——
              // 代发侧刻意不校验「目标实体存在」（动态生灭的游戏会被误伤·主程 2026-08-07 裁），
              // 于是悬空 source 的唯一症状就是「点了没反应」。不留这一条就真的查不出来。
              appendTrace(tr, tk, 'matrix-duel-intent', 'reject',
                `信号 "${s.name}" 的 source "${side}" 不是对局侧（无 ${'Resource'} 组件）→ 不产 intent`,
                '代发 source 打错字 / 该侧已被销毁');
              continue;
            }
            // 已有 intent 则覆盖——同一时区内改主意是合法操作。
            world.addComponent(side, { type: 'DuelIntent', throw: thrown, ...(md.duelId ? { duelId: md.duelId } : {}) } as DuelIntent);
          }
        }
      },
    },

  ],
});
