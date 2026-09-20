// Tier 2 涌现层（规则与约束 / 感知 / 控制）。读取 Tier 1 与检测原子的结果，施加约束、派生事实、响应输入。
// 跨阶段用 SystemPhase 显式定序（Update→Resolve→Commit），避免与"读位置/读速度"的系统在纯组件拓扑上成环。
export { collisionResolveCapability } from './collision-resolve.js';
export { groundSenseCapability } from './ground-sense.js';
export { jumpCapability, JUMP_SPEED } from './jump.js';
export { boundsClampCapability } from './bounds-clamp.js';
export { triggerZoneCapability, ZONE_FLAG } from './trigger-zone.js';
export { frictionCapability } from './friction.js';
export { eventWhenCapability } from './event-when.js';
export { evaluateCondition } from './condition.js';
export { effectApplyCapability } from './effect-apply.js';
export { cameraFollowCapability } from './camera-follow.js';
export { clickableCapability } from './clickable.js';
export { craftRecipeCapability } from './craft-recipe.js';
export { mergeOnPlaceCapability } from './merge-on-place.js';
export { orderFulfillCapability } from './order-fulfill.js';
export { mergeProximityClearCapability } from './merge-proximity-clear.js';
export { zoneOccupancyCapability } from './zone-occupancy.js';
export { hitboxCapability } from './hitbox.js';
export { overTimeCapability } from './over-time.js';
export { mortalCapability } from './mortal.js';
export { steeringCapability } from './steering.js';
export { flowFieldCapability } from './flow-field.js';
export { keybindCapability } from './keybind.js';
export { statsCapability, computeEffective } from './stats.js';
export { launchCapability } from './launch.js';
// bounce-relay（REQ-SURVIVOR武器缺口 W7）：跳弹命中重定向段——消费 Launch.bounce 落地的持久 Bounce
// 状态（launch 自删前一次性落地，因 Launch 是 fire-once 装不下"命中后还能再弹几次"的运行时状态）。
export { bounceRelayCapability } from './bounce-relay.js';
export { tilemapCapability, findTilemap, isSolidTile } from './tilemap.js';
export { animStateCapability } from './anim-state.js';
export { facingCapability } from './facing.js';
// face-rotate（REQ-FACE-ROTATE）：俯视有向物按方向旋转贴图——sim 写单位方向向量 FaceDir(sqrt 归一·零 trig)，
// 渲染器读它算 atan2 转视觉旋转角（render-only）。facing 的姊妹件：facing 输出左右镜像，本件输出整体旋转角。
export { faceRotateCapability } from './face-rotate.js';
// card-play（REQ-016/017）：卡牌「出牌」确定性输入接缝——命令流→按 owner 路由各玩家 PlayedHand + scoring Flag。可 lockstep 多人。
export { cardPlayCapability, decodeCard, encodeCard } from './card-play.js';
// dice-roll（REQ-GAMED #1）：掷一份声明好的骰池——rollOnSignal 触发→消费 RandomSeed 确定性掷 DicePool→写 RolledDice。
// 锁定重掷（只重掷未锁骰）+ 结算前禁骰（#4 并入）。骰能力族：对掷 opposedRoll 为同族纯函数（dice.ts，非 capability）。
export { diceRollCapability } from './dice-roll.js';
export { rollDicePool, applyBanFilter, opposedRoll, OPPOSED_MAX_REROLL } from './dice.js';
export type { TiePolicy, OpposedResult } from './dice.js';
// draft-offer（REQ-SURVIVOR编排 E1）：Roguelite 升级三选一抽选纯函数核（非 capability·先例见 dice.ts）——
// 按已持有/槽位满否过滤候选池 → 加权抽 N 个不重复 offer → applyPick 回填。种子化确定性。
export { rollOffer, applyPick, isEligible } from './draft-offer.js';
export type { DraftCandidate, DraftState, RollOfferOpts } from './draft-offer.js';
// spawn-director（REQ-SURVIVOR编排 E3）：波次刷怪调度纯函数核（非 capability·先例见 dice.ts）——
// 波表 + 每秒速率累积 + 同屏 cap 上限 → tickDirector 出本 tick 该发的 SpawnRequest 列（真生成交 k1-spawn）。
export { createDirector, tickDirector } from './spawn-director.js';
export type { DirectorWave, Director, SpawnRing, TickOpts } from './spawn-director.js';
// orbit-motion（REQ-SURVIVOR护盾绕转·VBUG-02）：圆周运动能力——绕 centerId/原点匀速环绕、每 tick 写 Transform。
// 运行时零 sin/cos（rotor 状态 + 常量步 + sqrt 归一·确定性 lockstep 安全）；orbitAt 助手 authoring 期算 trig 常量。
export { orbitMotionCapability, orbitAt } from './orbit-motion.js';
// card-pile（REQ-017）：牌库/手牌 sim 内确定性管理（发牌/选牌下标/补牌/弃牌）——回合流程数据化 + lockstep 共同前置。
export { cardPileCapability } from './card-pile.js';
// self-rule（REQ-021）：逻辑链实体本地(self)作用域——对每个实体读自身条件→对自身施效。补动态多实体自治缺口。
export { selfRuleCapability, evaluateSelfCondition } from './self-rule.js';
// group-count（REQ-022）：集合读——按 Tag 掩码数全场实体→写数值 Resource（羁绊/波次/人口）。阈值信号=event-when(edge) 重组。
export { groupCountCapability } from './group-count.js';
// grid-move + hex（REQ-024）：六边形棋盘确定性 A* 寻路 + 逐格移动（金铲铲式自动战斗；跨游戏战棋/RTS/塔防复用）。
export { gridMoveCapability } from './grid-move.js';
export { hexDistance, hexNextStep, HEX_DIRS } from './hex.js';
export type { Hex } from './hex.js';
// pathfind（REQ-寻路）：连续自由空间寻路——航点图 NavGraph(摆放数据) + 通用 A*(astar.ts) + 沿路跟随写 Velocity。
// grid-move(六格离散) 的连续坐标对偶；动态避让复用 collision-resolve（正交）。
export { pathfindCapability, nearestNode, buildAdjacency } from './pathfind.js';
// path-follow（REQ-PATHFOLLOW）：固定航点轨道匀速跑——沿 waypoints 依次朝下个航点走，到 arriveRadius
// 算到达→游标前进（loop 回到 0/否则停末点）→ 写 Velocity。与 steering 同链，不索敌/不绕障，巡逻/传送带/固定弹道通用。
export { pathFollowCapability, pathFollowAt } from './path-follow.js';
// gauge（REQ-F-029）：Resource 比例 → 条形 Shape 投影（实时血条/蓝条/读条；左锚从右端缩，渲染器零改动）。
export { gaugeCapability } from './gauge.js';
// text-binding（REQ-F-043）：Resource 数字 → Text 投影（HUD 金币/回合/等级；gauge 管条、本件管数字）。
export { textBindingCapability } from './text-binding.js';
// sprite-binding（REQ-G109-004）：Resource 数字 → 外观投影（生长阶/升级外观/血量变色；text-binding 管文字、gauge 管条、本件管长相）。
export { spriteBindingCapability } from './sprite-binding.js';
// drag-place（REQ-F-045）：拖拽摆放输入桥——壳层合成 drag 动作→命中 Draggable→hex 吸附/回席/限额（摆子/放塔通用）。
export { dragPlaceCapability } from './drag-place.js';
export { trayCapability } from './tray.js';
// queue-slots（REQ-POOL-ADVANCE 缺口）：压实队列——存活成员每 tick 重排成连续 0..N-1（消费队首/中间
// 任一成员即全体前移，槽间不留空隙）；前 headCount 个自动挂/摘 Clickable。与 tray（占坑制、老成员不
// 前移）互补，用哪个看场景是"占坑"还是"排队递补"。
export { queueSlotsCapability } from './queue-slots.js';
// grid-drag-square（REQ-CAP·Block Blast 机制②）：方形网格 polyomino 拖放输入桥——命中托盘块取 slot、
// 终点吸附方格 → 写 PlaceBlockIntent（block-grid 消费）。区别于 drag-place 的六边+移子（此为方形+盖章）。
export { gridDragSquareCapability, squarePointToCell } from './grid-drag-square.js';
// match3-drag-swap（REQ-INPUT-拖拽交换）：三消拖拽滑动手势输入桥——起点格由 clickable 按下选中、本能力补主轴方向
// 邻格选中 Signal（与点选逐字节同形）→ t3-match3-board idle 交换。未过 0.4 格阈值=点选；idle 相位零改动·不进 hash。
export { match3DragSwapCapability, pickSwapTarget, DRAG_SWAP_THRESHOLD_CELLS } from './match3-drag-swap.js';
export type { NeighborCandidate } from './match3-drag-swap.js';
export { hexCellToPoint, hexPointToCell } from './grid-move.js';
// modifier-stack（REQ-CAP 下沉）：修正聚合栈——全场 ModifierSource（字段表+合并策略+门控）→ ModifierTotals。
// stats 的超集（逐字段混合 add/mul/max/min/or/floor + ConditionExpr 门控）；下沉小丑计分/天罡/地煞三处同构聚合。
export { modifierStackCapability, aggregateModifiers, modifierCtx } from './modifier-stack.js';
export type { ModifierRow, ModifierCtx } from './modifier-stack.js';
// behavior-tree（REQ-BT）：通用行为树——纯数据树（selector/sequence/invert/condition/action 五节点闭集）+ 确定性解释器。
// 黑板复用既有 Resource/Flag/StringVar（不新立组件）；叶=消费方注册表 registerBTLeaves；随机经传入 RandomSeed→同 seed 同决策轨。
export {
  behaviorTreeCapability,
  registerBTLeaves,
  getBTLeaf,
  hasBTLeaf,
  registeredLeafNames,
  clearBTLeaves,
  collectBTLeafNames,
  checkBehaviorTree,
  validateBehaviorTree,
  validateBehaviorTreeForGame,
  tickBehaviorTree,
  MAX_BT_DEPTH,
} from './behavior-tree.js';
export type { BTNode, BTNodeType, BTStatus, BTAction, BTLeafResult, BTLeafFn, BTLeafTable, BTTickResult, BehaviorTree, BTValidateOptions } from './behavior-tree.js';
// stat-bind（REQ-SURVIVOR被动轴）：属性桥/投影器——把 ModifierTotals(世界单例聚合表)/Stats(本实体 effective)
// 按 key 投影到本实体任意其它组件字段（幂等：每 tick 从 base 重算，不读当前字段值）。modifier-stack/stats
// 只产出总表/effective，本能力才是"接线到具体组件字段"那一步（moveSpeed→Controllable.speed 等）。
export { statBindCapability, projectStatBind } from './stat-bind.js';
// pull-anchor（REQ-SURVIVOR武器缺口 W9）：区域施加器——锚点每 tick 批量把邻近已挂 Steering 的实体
// Relation(target) 改指向自己，复用 t2-steering 现成的 seek 把它们"拉"过来（黑洞/吸附类武器，重组非下沉）。
export { pullAnchorCapability } from './pull-anchor.js';
// weighted-pick（REQ-TAPSPAWN·DRY 抽取）：加权轮盘赌单抽共享纯函数核——按 weight 比例从 entries 选一个，
// 浮点越界回退末元素兜底。draft-offer.weightedPickDistinct（去重多抽）与 weighted-spawn（单抽）共用。
export { weightedPick } from './weighted-pick.js';
// weighted-spawn（REQ-TAPSPAWN·game101 生成器缺口）：信号→（可选）原子扣自身资源→世界种子 PRNG 按权重表
// 抽一个模板→发 SpawnRequest（真生成交现成 prefab-spawn）。runsAfter resource-apply 打破 RMW 伪环。
export { weightedSpawnCapability } from './weighted-spawn.js';
// matrix-duel（REQ-MATRIXDUEL·game108 签名机制）：同时决策 × 收益矩阵结算解释器——双方 DuelIntent 齐备即查
// DuelMatrix 定胜负 → 写 ResourceModify + 发具名 Signal → 清双方 intent；patches 三闭集（改克制/改收益/增设新手）
// 对局开始按书写序确定性套用，坏补丁装载期拒收（checkDuelMatrix/validateDuelMatrix）。
export {
  matrixDuelCapability,
  checkDuelMatrix,
  validateDuelMatrix,
  resolveDuelMatrix,
  duelVerdict,
  DUEL_PATCH_KINDS,
} from './matrix-duel.js';
export type {
  DuelThrowId,
  DuelEffect,
  DuelPayoff,
  DuelTie,
  DuelTable,
  DuelPatch,
  DuelMatrix,
  DuelIntent,
  DuelOutcome,
} from './matrix-duel.js';

export { knockbackCapability } from './knockback.js';
