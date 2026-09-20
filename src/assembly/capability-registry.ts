import {damageRoutingCapability} from '@skills/tier2/damage-routing.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import { allAtomCapabilities, extensionAtomCapabilities } from '@atom-skills/index.js';
import {
  motionApplyCapability,
  accelApplyCapability,
  lifetimeCapability,
  rotationApplyCapability,
  animationCapability,
  hierarchyResolveCapability,
  hierarchyCascadeCapability,
  tweenCapability,
} from '@skills/tier1/index.js';
import {
  collisionResolveCapability,
  groundSenseCapability,
  jumpCapability,
  boundsClampCapability,
  triggerZoneCapability,
  frictionCapability,
  eventWhenCapability,
  effectApplyCapability,
  cameraFollowCapability,
  clickableCapability,
  craftRecipeCapability,
  mergeOnPlaceCapability,
  orderFulfillCapability,
  mergeProximityClearCapability,
  zoneOccupancyCapability,
  hitboxCapability,
  overTimeCapability,
  mortalCapability,
  steeringCapability,
  keybindCapability,
  statsCapability,
  launchCapability,
  tilemapCapability,
  animStateCapability,
  facingCapability,
  faceRotateCapability,
  cardPlayCapability,
  diceRollCapability,
  cardPileCapability,
  selfRuleCapability,
  groupCountCapability,
  gridMoveCapability,
  pathfindCapability,
  gaugeCapability,
  textBindingCapability,
  spriteBindingCapability,
  dragPlaceCapability,
  trayCapability,
  queueSlotsCapability,
  gridDragSquareCapability,
  match3DragSwapCapability,
  modifierStackCapability,
  behaviorTreeCapability,
  orbitMotionCapability,
  pathFollowCapability,
  flowFieldCapability,
  statBindCapability,
  bounceRelayCapability,
  pullAnchorCapability,
  weightedSpawnCapability,
  matrixDuelCapability,
} from '@skills/tier2/index.js';
import { dialogueCapability, match3BoardCapability, prefabCapability, casterCapability, aggroCapability, pokerHandCapability, cardScoringCapability, flowCapability, mergeRuleCapability, timelineCapability, slotPayoutCapability, blockGridCapability, handPatternCapability } from '@skills/tier3/index.js';

// ═══════════════════════════════════════════════════════════════
//  能力注册表 (Capability Registry) —— manifest 加载的地基
//
//  「游戏=数据」要闭环：导出的 manifest 只存 capability **id 列表**(纯数据)，
//  要把它变回可运行的 WorldBlueprint，就得有一张 id → 能力**对象** 的表。
//  这里把引擎全部能力聚成单一注册表(同一组 import 单例 → 与各游戏 build 用的是同一对象，
//  重建后行为/哈希一致)。新增能力时在此登记一次即可被 manifest 引用。
// ═══════════════════════════════════════════════════════════════

export const ALL_CAPABILITIES: readonly CapabilityDefinition[] = [
  damageRoutingCapability,
  ...allAtomCapabilities,
  ...extensionAtomCapabilities,
  // tier1
  motionApplyCapability,
  accelApplyCapability,
  lifetimeCapability,
  rotationApplyCapability,
  animationCapability,
  hierarchyResolveCapability,
  hierarchyCascadeCapability,
  tweenCapability,
  // tier2
  collisionResolveCapability,
  groundSenseCapability,
  jumpCapability,
  boundsClampCapability,
  triggerZoneCapability,
  frictionCapability,
  eventWhenCapability,
  effectApplyCapability,
  cameraFollowCapability,
  clickableCapability,
  craftRecipeCapability,
  mergeOnPlaceCapability,
  orderFulfillCapability,
  mergeProximityClearCapability,
  zoneOccupancyCapability,
  hitboxCapability,
  overTimeCapability,
  mortalCapability,
  steeringCapability,
  keybindCapability,
  statsCapability,
  launchCapability,
  tilemapCapability,
  animStateCapability,
  facingCapability,
  // t2-face-rotate（REQ-FACE-ROTATE）：facing 姊妹件——按 velocity/Relation(target) 方向写 FaceDir 单位向量
  // （sim 零 trig·sqrt 归一）；渲染器读它算 atan2 转视觉旋转角（render-only，2D 路径专用）。
  faceRotateCapability,
  cardPlayCapability,
  diceRollCapability,
  cardPileCapability,
  selfRuleCapability,
  groupCountCapability,
  gridMoveCapability,
  pathfindCapability,
  gaugeCapability,
  textBindingCapability,
  spriteBindingCapability,
  dragPlaceCapability,
  trayCapability,
  // t2-queue-slots（REQ-POOL-ADVANCE 缺口）：压实队列——消费队首/中间任一成员，存活成员整体前移
  // 补成连续 0..N-1（槽间不留空）；前 headCount 个自动挂/摘 Clickable。tray 的姊妹件：tray=占坑制
  // 不前移，本件=排队递补，两者互补而非重叠。
  queueSlotsCapability,
  gridDragSquareCapability,
  // t2-match3-drag-swap（REQ-INPUT-拖拽交换）：三消拖拽滑动手势输入桥——drag 动作→主轴邻格选中 Signal（同点选形）。
  match3DragSwapCapability,
  // t2-stats（上）= modifier-stack 的**实体属性特例**（只做 (base+Σadd)×Πmul、无字段表策略/无门控）；
  // 债记（REQ-CAP 下沉裁决）：stats 原样不动，「字段表 + max/min/or/floor 混合策略 + ConditionExpr 门控」的
  // 通用聚合走下方 t2-modifier-stack；stats 消费方若需门控/逐字段策略，后续另立 REQ 迁移到 modifier-stack。
  modifierStackCapability,
  // t2-behavior-tree（REQ-BT）：通用行为树·纯数据树（五节点闭集）+ 确定性解释器；黑板复用既有 Resource/Flag/StringVar
  // （不新立组件·provides 空）；叶=消费方注册表（TS 例外口径）；随机经传入 RandomSeed→回放/万手 sim 安全。
  behaviorTreeCapability,
  // t2-orbit-motion（REQ-SURVIVOR护盾绕转·VBUG-02）：圆周运动——绕 centerId/原点匀速环绕、写 Transform。
  // 运行时零 sin/cos（rotor 状态 + 常量步 + sqrt 归一·确定性 lockstep 安全）；护盾/卫星/环刃/环绕镜头通用。
  orbitMotionCapability,
  // t2-path-follow（REQ-PATHFOLLOW）：固定航点轨道匀速跑——沿 waypoints 依次朝下个航点走、到 arriveRadius
  // 算到达进下一航点（loop/停末点）、写 Velocity。与 steering/launch 同链，不索敌不绕障，巡逻/传送带/固定弹道通用。
  pathFollowCapability,
  // t2-flow-field（REQ-FLOWFIELD）：群体流场寻路——一张 FlowField 铺一次（cost → 多源 Dijkstra 积分场 →
  // 每格取积分最小邻格），全部 FlowAgent 查表得方向写 Velocity。成本 ∝ 地图格数、**与单位数无关**
  // （实测千单位查表 0.075ms/tick，而 A*-per-agent 同规模稳态 20ms+、首拍 500ms+）。
  // 与 pathfind 并存不互斥：单位多目标少用它，单位少各走各的用 pathfind。整数积分 → 逐位可复现。
  flowFieldCapability,
  // t2-stat-bind（REQ-SURVIVOR被动轴）：属性桥——把 ModifierTotals(单例)/Stats(本实体 effective) 按 key
  // 投影到本实体任意组件字段（moveSpeed→Controllable.speed、range→Shape.radius、attackSpeed→Timer.duration
  // 等），幂等重算不复利。runsAfter modifier-stack/stat-apply/resource-apply/timer-advance 打破传递环。
  statBindCapability,
  // t2-bounce-relay（REQ-SURVIVOR武器缺口 W7）：跳弹命中重定向——消费 Launch.bounce 落地的持久 Bounce
  // 状态，命中后按剩余次数 nearestByTag 转向下一个目标（保持速度模长）。
  bounceRelayCapability,
  // t2-pull-anchor（REQ-SURVIVOR武器缺口 W9）：区域施加器（重组·非下沉）——锚点批量把邻近已挂 Steering
  // 的实体 Relation(target) 改指自己，复用 t2-steering 现成 seek 拉过去（黑洞/吸附类武器）。
  pullAnchorCapability,
  // t2-weighted-spawn（REQ-TAPSPAWN·game101 生成器缺口）：信号→（可选）原子扣自身资源→世界种子 PRNG
  // 按权重表抽一个模板→发 SpawnRequest（真生成交现成 prefab-spawn）。runsAfter resource-apply 破 RMW 伪环。
  weightedSpawnCapability,
  // t2-matrix-duel（REQ-MATRIXDUEL·game108《拳律》签名机制）：同时决策 × 收益矩阵结算解释器——双方 DuelIntent
  // 齐备即查 DuelMatrix 定胜负 → 写 ResourceModify + 发具名 Signal → 清双方 intent。判定表 + 三闭集补丁
  // （改克制/改收益/增设新手）全是数据，坏补丁装载期拒收；猜拳全变体/田忌赛马/兵种相克通吃。
  matrixDuelCapability,
  // tier3
  dialogueCapability,
  match3BoardCapability,
  prefabCapability,
  casterCapability,
  aggroCapability,
  pokerHandCapability,
  cardScoringCapability,
  flowCapability,
  mergeRuleCapability,
  timelineCapability,
  slotPayoutCapability,
  blockGridCapability,
  // t3-hand-pattern（REQ-GUANDAN-牌型）：变长牌族判型 + 跨型压制序 + 逢人配确定性解释器（掼蛋/斗地主/跑得快通用）。
  handPatternCapability,
];

export const CAPABILITY_REGISTRY: ReadonlyMap<string, CapabilityDefinition> = (() => {
  // 重复 id 守卫：Map 构造会让后注册者静默覆盖前者（typo 或误用旧 id 时行为悄悄改变、极难查）。
  // 注册表是 manifest→引擎的单一真相，重复即配置 bug → 构造期早失败、点名冲突两者。
  const m = new Map<string, CapabilityDefinition>();
  for (const cap of ALL_CAPABILITIES) {
    if (m.has(cap.id)) throw new Error(`能力注册表出现重复 id "${cap.id}"（两个 capability 抢同一 id；改名或删其一）`);
    m.set(cap.id, cap);
  }
  return m;
})();

/** id 列表 → 能力对象列表；任一 id 未注册即抛错(早失败、信息明确)。 */
export function resolveCapabilities(ids: readonly string[]): CapabilityDefinition[] {
  const out: CapabilityDefinition[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    const cap = CAPABILITY_REGISTRY.get(id);
    if (cap) out.push(cap);
    else unknown.push(id);
  }
  if (unknown.length) {
    throw new Error(`manifest: 未知 capability id: ${unknown.join(', ')}（不在能力注册表内）`);
  }
  return out;
}

/** 组件类型 → **全部**声明提供它的 capability id（登记序）。多于 1 个 = 该组件被多个能力共用。
 *  共用本身可以是刻意的（如 `BoardCell` 被 match3-board / block-grid 共用同一视图格接口，
 *  两边字段完全相同），但它让「从组件反推能力」这件事**在语义上就无解**——见下方 AMBIGUOUS。 */
export const COMPONENT_PROVIDERS_ALL: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const cap of ALL_CAPABILITIES) {
    for (const type of Object.keys(cap.components?.provides ?? {})) {
      const list = m.get(type);
      if (list) list.push(cap.id);
      else m.set(type, [cap.id]);
    }
  }
  return m;
})();

/** 被多个能力共同提供的组件 → 提供者清单。推断**刻意不碰**这些（不猜），由 manifest 显式声明。 */
export const AMBIGUOUS_COMPONENTS: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, readonly string[]>();
  for (const [type, ids] of COMPONENT_PROVIDERS_ALL) if (ids.length > 1) m.set(type, ids);
  return m;
})();

/** 组件类型 → 提供它的 capability id。**只收唯一提供者**；多提供者组件不入表（见 AMBIGUOUS_COMPONENTS）。
 *
 *  为什么不再「先登记者胜」（engine-review-2026-08-04 §3.3 · owner 2026-08-05 拍板修）：
 *  旧规则会把共用组件**静默判给注册表里排前面的那个能力**——实测 `BoardCell` 被判给
 *  match3-board（注册序 166 早于 block-grid 176），于是一个方块放置游戏只要没显式写
 *  `capabilities`，就会被装上**三消解释器**，且零报错。更糟的是同仓另一处
 *  （validate-manifest 的 collectFieldSchemas）用的是**后登记者胜**，两处规则相反 →
 *  「按 A 的规格校验字段、却把 B 的解释器装给你」。
 *  共用组件的正确姿势是**承认推不出来**：不猜、由 parseManifest 发告警要求显式声明能力，
 *  fail-loud 取代 fail-silent。单一提供者的组件（绝大多数）推断行为完全不变。 */
export const COMPONENT_PROVIDERS: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [type, ids] of COMPONENT_PROVIDERS_ALL) if (ids.length === 1) m.set(type, ids[0]!);
  return m;
})();

/**
 * 从 entities 用到的组件类型，反推"提供这些组件"的能力 id 集合。
 * 注意：只覆盖**提供组件**的能力；纯行为系统(如 motion-apply 把 Velocity 施加到 Transform)
 * 不提供组件、推不出来——所以 manifest 最好显式带 capabilities，inference 仅作兜底/提示。
 */
export function inferCapabilityIds(entities: Record<string, Record<string, unknown>>): string[] {
  const ids = new Set<string>();
  for (const comps of Object.values(entities)) {
    for (const type of Object.keys(comps)) {
      const capId = COMPONENT_PROVIDERS.get(type);
      if (capId) ids.add(capId);
    }
  }
  return [...ids];
}
