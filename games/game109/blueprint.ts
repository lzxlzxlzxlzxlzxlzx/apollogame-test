// ═══════════════════════════════════════════════════════════════════════════
//  game109 · 种田（暂名）—— play-field 世界 = 纯数据（WorldBlueprint）。**零游戏层 system 代码**。
//
//  玩法 = 数据的组合（能力清单见 buildBlueprint 的 capabilities）：
//    6×6 地块   = 一格一实体（Transform+Shape+Sprite+Color+Tag+Clickable+Flag+State+Resource+StringVar+SelfRule）
//    4 个动作   = 「点工具按钮选工具 → 点地块干活」两段点击，每段都是 clickable 产信号 + effect-apply 结算
//    睡觉结算   = 「相位旗 + SelfRule 自清」把『浇过水的才长』做成数据（P2-a/b 实证）
//    卖货/通关  = effect-apply 的 valueFrom（背包×卖价）+ t3-flow 的阈值转移（P5-a 实证）
//
//  ── 动作链的骨（S2 探针 P7 实查所得·**S3 必须照办**）：三拍握手 ──────────────────
//  每个「干活」动作 = TWO 效果（写地块 State 的那半 + 扣全局体力的那半），两半**互相读对方写的量**：
//  扣费写 energy、干活那半读 energy（whenGlobal）；干活那半写地块 State、扣费的门若读 State 也被它改。
//  → effect-apply 的 hits 按 `Effect.order` 升序结算、**并列按 eid 字典序** tie-break，于是
//    结算序成了语义的一部分，两半**直接对读必然自锁**（两个方向都实测撞过墙：要么活没干成体力却没了，
//    要么活干了体力没扣）。解法 = 中间插一个**只活在同一拍 Commit 内**的临时态 busy：
//      ①CLAIM(order 0)  写 busy —— self 门判「这格允许干这活」、全局门判「体力≥1 ∧ 选中的是这把工具」
//      ②SPEND(order 1)  门读 **busy**（「本次点击已被认领」这个**瞬时事实**）→ 全局体力 -1
//      ③SETTLE(order 2) busy → 目标持久态（浇水/收获另有 FOLLOW/CLOSE 两拍把 busy 收干净）
//    于是：点不满足前置的格子 → ①的门挡住 → busy 根本没出现 → ②③连带不成立 → **不白扣体力**；
//    体力不够 → ①的全局门挡住 → 同样不出现 busy → 不扣。**每一拍的 order 都必须显式写死**
//    （听凭 eid 字典序 = 把语义交给命名——P7-e 留档就是这个指纹）。
//
//  ── 相位事实（读实现 + 实跑证实）─────────────────────────────────────────────
//  clickable=Update → self-rule=Resolve → effect-apply=Commit，Resolve 先于 Commit，
//  故「Commit 写旗 → 下一拍 Resolve 读旗」跨拍反馈恒为 1 tick：睡觉结算天然跨 2 拍（P2-b）。
// ═══════════════════════════════════════════════════════════════════════════

import type { WorldBlueprint, EntityBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import {
  transformCapability, shapeCapability, spriteCapability, colorCapability, tagCapability,
  resourceCapability, flagCapability, stateCapability, randomCapability, frameCapability,
} from '@zerocraft/engine/atom-skills/index.js';
import type { ConditionExpr } from '@zerocraft/engine/engine/protocol/components.js';
import {
  clickableCapability, effectApplyCapability, selfRuleCapability, eventWhenCapability,
  keybindCapability, spriteBindingCapability,
} from '@zerocraft/engine/skills/tier2/index.js';
import { hierarchyResolveCapability } from '@zerocraft/engine/skills/tier1/index.js';
import { flowCapability } from '@zerocraft/engine/skills/tier3/index.js';
import {
  ACTIONS, BALANCE, CROPS, CROP_BY_ID, FARM, FROZEN_FLAG, GROW_PHASE_FLAG, LIFE_TINTS, RES,
  SIGNALS, TILE_FLAG, TILE_FSM, TILE_STATE, TOOLS, type CropDef, type ToolDef,
} from './data.js';
import {
  FIELD_H, FIELD_W, PLANT, SOIL_SKINS, TILE_BIT, Z,
  barFrames, tileX, tileY,
} from './theme.js';

// ── 装配期小工具（纯数据构造·非运行时系统）────────────────────────────────────
const XF = (x: number, y: number): Record<string, unknown> => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const box = (w: number, h: number): Record<string, unknown> => ({ kind: 'box', width: w, height: h });
const col = (tint: number, alpha = 1): Record<string, unknown> => ({ tint, alpha });
const skin = (textureKey: string, zOrder: number): Record<string, unknown> =>
  ({ textureKey, anchorX: 0.5, anchorY: 0.5, zOrder });

/** 三拍握手（+ 浇水/收获的附加拍）的拍序。**显式写死·绝不听凭 eid 字典序**（P7-e 留档）。 */
const BEAT = {
  CLAIM: 0, // 认领：写临时态 busy
  SPEND: 1, // 扣费：读 busy（瞬时事实）扣全局体力
  SETTLE: 2, // 落定：busy → 目标持久态（浇水=置「今日已浇」Flag / 收获=入背包）
  FOLLOW: 3, // 附加写入（收获=清生长阶）
  CLOSE: 4, // 收尾：把 busy 抹回持久态（浇水回 sown、收获回 tilled）
} as const;

const TOOL_TILL = TOOLS.find((t) => t.id === 'till')!;
const TOOL_SOW = TOOLS.find((t) => t.id === 'sow')!;
const TOOL_WATER = TOOLS.find((t) => t.id === 'water')!;
const TOOL_REAP = TOOLS.find((t) => t.id === 'reap')!;

// ── 门（ConditionExpr）工厂 ────────────────────────────────────────────────
/** self 门：这格现在处于某状态吗（P6-a：点不满足前置的格子 → 动作被拒且不白扣体力）。 */
const atState = (s: string): ConditionExpr => ({ kind: 'state', fsmId: TILE_FSM, equals: s });
/** self 门：今日还没浇过（浇水的前置门·防重复浇水白扣体力）。 */
//   ⚠ `not.of` 是**单个** ConditionExpr（不是数组！）。写成 `of:[...]` 时 `expr.of.kind === undefined`
//   → evaluateSelfCondition 的 switch 穿透 → 返回 undefined → `!undefined = true` ⇒ 门**恒真且不报错**。
//   S3 首轮实红就死在这（重复浇水白扣体力 17→16）；类型标注 ConditionExpr 在场时 tsc 能当场拦住它。
const notWatered: ConditionExpr = { kind: 'not', of: { kind: 'flag', id: TILE_FLAG } };
/** self 门：这格种的正是这种作物（按作物路由·P6-c）。 */
const isCrop = (id: string): ConditionExpr => ({ kind: 'string', id: 'crop', equals: id });
/** self 门：这格已成熟（生长阶 ≥ 该作物天数·P6-b）。 */
const isRipe = (crop: CropDef): ConditionExpr =>
  ({ kind: 'resource', id: RES.stage, cmp: 'gte', value: crop.days });
/** 全局门：体力够（P7-b：不够则动作被拒且**不扣**）。 */
const hasEnergy: ConditionExpr = { kind: 'resource', id: RES.energy, cmp: 'gte', value: 1 };
/** 全局门：当前选中的是这把工具（没有写字符串的 Effect kind → 工具只能以整数下标存在 Resource 里）。 */
const toolIs = (t: ToolDef): ConditionExpr => ({ kind: 'resource', id: RES.tool, cmp: 'eq', value: t.index });
/**
 * 全局门：对局**未结束**（R-20 终局冻结·owner 2026-09-18 裁「冻住」）。
 * `flow` 转 `won` 时置真 `FROZEN_FLAG` ⇒ 干活/睡觉/卖货的门一律落空 → 终局屏上世界不再推进。
 * 为什么不是「加一条 flow 条件 kind」：`ConditionExpr` 的 kind 是**闭集**（always/and/or/not/resource/
 * flag/state/timer/string），加一种要动全库；而 `FlowAction` **本就支持 `set-flag`** ⇒ 用一枚既有旗
 * 表达「已终局」是**零引擎改动**的等价物（flag 门是本作已在用的词汇）。
 */
const notFrozen: ConditionExpr = { kind: 'flag', id: FROZEN_FLAG, equals: false };
const and = (...of: ConditionExpr[]): ConditionExpr => ({ kind: 'and', of });

// ═══════════════════════════════════════════════════════════════════════════
//  地块（36 格）
// ═══════════════════════════════════════════════════════════════════════════
//  一格六件事（一实体一组件槽的硬约束下，三个槽各司其职）：
//    Flag{watered}    = 今日已浇（唯一 Boolean 槽）
//    State{fsmId:tile}= 整条生命周期 wild → tilled → sown（+ 同拍临时的 busy）
//    Resource{stage}  = 生长阶（唯一数值槽）
//    StringVar{crop}  = 这格种什么（**装配期定死**：没有写字符串的 Effect kind，sow 写不进去）
//    SelfRule         = 「浇过水 ∧ 已播种 ∧ 未熟 ∧ 生长相位」→ 自家生长阶 +1 且**自清浇水旗**
function tileEntity(row: number, colIndex: number, crop: CropDef): EntityBlueprint {
  return {
    Transform: XF(tileX(colIndex), tileY(row)),
    Shape: box(FARM.cell - 10, FARM.cell - 10),
    // 皮肤槽（S6）：**土壤** 6 档（行序见 theme.SOIL_SKINS）——地块自己画土，作物另起子实体（cropEntity）。
    // 初值 = 行 0（荒·干）；首拍起由下面的 binding 按「生命周期 × 今日已浇」逐拍换图。
    Sprite: skin(SOIL_SKINS[0], Z.tile),
    // 地色 = 生命周期 × 今日已浇（R-10/R-11）：下标由 SpriteBinding 合成
    //（`states` 给行、`flagId` 占最低位、`stride` 缺省 1 = 不读资源 ⇒ 单看「土壤是什么状态」）。
    // 生长阶**不**走这条通道（走子实体的 Gauge 条，见 plantEntity 的注）——两轴挤一张 tint 表会到
    // 12~24 色，人眼分不开。
    Color: col(LIFE_TINTS[0]),
    Tag: { flags: TILE_BIT },
    Clickable: { action: SIGNALS.WORK },
    Flag: { id: TILE_FLAG, active: false },
    State: { fsmId: TILE_FSM, current: TILE_STATE.WILD, previous: TILE_STATE.WILD },
    Resource: { id: RES.stage, current: 0, min: 0, max: crop.days }, // 成熟即停（stage 停在 days）
    StringVar: { id: 'crop', value: crop.id },
    SpriteBinding: {
      resourceId: RES.stage, // 合成模式下 stride≤1 不读它；填着是为了单轴/合成两种模式同一份数据都能读
      states: [TILE_STATE.WILD, TILE_STATE.TILLED, TILE_STATE.SOWN], // 行号 = indexOf(State.current)
      flagId: TILE_FLAG, // 最低位 = 今日已浇
      // 两条平行轴共用**同一份下标**（三支数组互不干扰：skins→textureKey·tints→Color.tint）：
      //   tints = 素坯地色（**无图时的回退**·S6 前的全部观感都在这条上）
      //   skins = 真图（**S6 上图的通路**·owner 2026-09-19 裁 C「连土壤逐档上地块」）
      // 两条都在册 ⇒ 美术是增量：图没到/加载失败 → 渲染器回退 Shape + tints，与 S5 素坯逐像素同。
      tints: LIFE_TINTS, // 6 行 = 3 状态 × 2（干/湿）
      skins: SOIL_SKINS, // 6 行同上（行 1/3 不可达·与各自「干」档共图·见 theme 注）
    },
    SelfRule: {
      // self 作用域：读**自身**的浇水旗 / 状态 / 生长阶；whenGlobal 读全局生长相位（REQ-F-035）。
      when: and(
        { kind: 'flag', id: TILE_FLAG },
        atState(TILE_STATE.SOWN),
        { kind: 'not', of: isRipe(crop) }, // ⚠ 单个 expr，不是数组（同 notWatered 的坑）
      ),
      whenGlobal: { kind: 'flag', id: GROW_PHASE_FLAG },
      do: [
        { kind: 'modify-resource', op: 'add', value: 1 },
        // ⚠ 自清是**要害**（P2-b 实查）：不清则 Resolve 每拍都满足条件 → 每拍长一阶（首轮实测 4 tick 长 3 阶）。
        { kind: 'set-flag', value: false },
      ],
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  作物子实体（S6 美术关新增·每格一个）
// ═══════════════════════════════════════════════════════════════════════════
//  为什么另起子实体而不是挂在地块上：一实体一类组件**只有一个槽**（引擎契约），而地块那条
//  `SpriteBinding` 的位置已被「生命周期 × 今日已浇」6 行占满（土壤）。作物要的是
//  「生命周期 × 生长阶」另一对轴（wild/tilled 时**根本没有苗**；sown 才按阶换帧）——
//  硬叠上去会把 6 行撑成 18~24 行（LIFE_TINTS 的注里已经算过一次这笔账）。
//  ⇒ 拆成子实体后**零引擎改动**：`fromParent:true` 让子实体读**宿主（地块）**的 Resource/State/Flag
//    （`sprite-binding.ts:169-173` 明写「State/Flag 与 Resource 是同一套寻址，不另立规矩」），
//    于是「阶 = 宿主那格的 stage」「行 = 宿主那格的生命周期」都读得到，两条 binding 各管一摊。
//
//  帧表（frames）的摆法：`i = 行 × stride + clamp(stage, stride)`，stride = days+1
//    行 0 wild  → 全空帧（没翻土·不该有苗）
//    行 1 tilled→ 全空帧（翻好了但没播种·仍不该有苗）
//    行 2 sown  → 0,1,…,days（该作物各阶·末位 = 成熟）
//  空帧 = sheet 末位那一格（下标 days+1）**画面是空的** —— 「没有苗」和「第 0 阶的苗」是两件事。
//  ⚠ 数组长度必须 = 3 × stride（不是 3 行）：`clampIndex(i, b.frames.length)` 拿**数组长度**夹取，
//    数组短了会把 sown 行夹回 tilled 行的末尾——症状是「播种后反而没苗」这种静默错（不报错、不抛）。
//  ⚠ `busy`（只活在同拍内的瞬态）不在 `states` 表里 ⇒ composeIndex 返回 undefined、**本拍不动**
//    （sprite-binding 刻意的缺件处置：宁可保持上一次长相，也不让格子闪一下错的）。渲染读的是拍后
//    状态（BUSY 拍末必被 settle 抹掉）⇒ 这条路径正常看不到。
function cropEntity(row: number, colIndex: number, crop: CropDef): EntityBlueprint {
  const stride = crop.days + 1; // 每行的列容量 = 该作物的阶数（0..days）
  const blank = crop.days + 1; // 空帧下标（sheet 末位那格）
  return {
    Transform: XF(tileX(colIndex), tileY(row)), // 首拍前的占位位；之后由 hierarchy-resolve 每拍重算
    Hierarchy: { parentId: tileId(row, colIndex), localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 },
    // Shape 是**回退件**：美术未就绪时渲染器画它 —— 尺寸 0×0 ⇒ 屏幕上什么都不多。
    // （若给实尺寸，素坯期会在 36 格上各糊一个作物色方块 = 直接破坏 S4/S5 的既有观感。）
    Shape: box(0, 0),
    Sprite: skin(crop.skin, Z.crop), // 恒为该作物的 sheet（换的是帧，不是贴图）
    Color: col(crop.tint),
    // 初帧 = 空帧：**不依赖 binding 的首次写入** —— 首拍之前（乃至美术未就绪）格上就不该有苗。
    Frame: { index: blank, total: crop.days + 2 },
    SpriteBinding: {
      resourceId: RES.stage,
      fromParent: true, // 读宿主（地块）的 Resource/State
      states: [TILE_STATE.WILD, TILE_STATE.TILLED, TILE_STATE.SOWN],
      stride,
      frames: [
        ...Array<number>(stride).fill(blank),
        ...Array<number>(stride).fill(blank),
        ...Array.from({ length: stride }, (_, k) => k),
      ],
    },
  };
}

// ── 生长条（每格子实体·owner 2026-09-19 裁「撤 Gauge·条走纯帧」）────────────────────
//  条的长势**只由贴图帧**表达：`Frame` + `SpriteBinding{frames}`（4 档 = 0/33/66/100% 的填充比例
//  画在帧里）。`Hierarchy{parentId: 地块}` 让 hierarchy-resolve 每拍解出世界位（父位 + 本地偏移）。
//
//  ⚠ 为什么撤掉 S3 起挂在这条子实体上的 `Gauge`（撤 = owner 2026-09-19 裁决）：
//    gauge 的契约是 `Shape.width = 比例 × width` ∧ `Hierarchy.localX = leftX + Shape.width/2`
//    ⇒ **原点随比例移动**（stage 0 在 −满宽/2，满阶回到 0）。素坯期 Shape 宽 0 ⇒ 位移不可见；
//    S6 上图后 96 宽的贴图按 `anchorX:0.5` 居中画在**那个移动的原点**上 ⇒ 整条左偏半宽，
//    且随生长阶右移最多半宽（owner 实测报「方块下面的黑色横条错位，比方块靠左」）。
//    引擎侧无处可修：渲染器 box **以中心为 pivot**（`components/render.ts:642-646` 明写「锚不了左」）、
//    `Shape` 没有位置偏移字段 ⇒「左端钉死」只能靠移动原点换来，与「固定尺寸贴图」数学上互斥。
//    而 gauge 挂在这里的**唯一目的**就是 R-12/R-13 的宽度反馈 —— 那两条已被 Q2=B 取代（同一次裁决）。
//  ⚠ 代价（报 owner 后经其裁决）：**素坯期（图加载失败）不再有生长条**。土壤六档色、可收/不可收、
//    天数与卖货全部不变；「长到第几阶」的读数在有图时本就由**作物表帧**承担（Q1=C）。
//  ⚠ 子实体**必须同时有 Transform**：`hierarchy-resolve` 查的是 `query('Hierarchy','Transform')`，
//    且父也要有 Transform（地块有）。少了它这条子实体根本不参与解算、会停在世界原点。
//  ⚠ 必须给 Sprite：渲染器的 `zOrder` **只从 Sprite 来**（`renderable.ts:87` `sprite?.zOrder ?? 0`），
//    而拾取排序按 zOrder。没有 Sprite 就与地块并列 0、谁在上只看插入序——那是把语义交给命名。
//    无图时 `chooseRenderMode` 回退 `shape`，而这条的宽恒 0 ⇒ 什么都不画（与作物子实体同款）。
function plantEntity(row: number, colIndex: number, crop: CropDef): EntityBlueprint {
  return {
    Transform: XF(tileX(colIndex), tileY(row) + PLANT.dy), // 首拍前的占位位；之后由 hierarchy-resolve 每拍重算
    Hierarchy: { parentId: tileId(row, colIndex), localX: 0, localY: PLANT.dy, localRotation: 0, localScaleX: 1, localScaleY: 1 },
    // 宽恒 0 ⇒ 无图时什么都不画（有图时贴图覆盖）。撤 Gauge 后**没有任何东西写它**。
    Shape: box(0, PLANT.h),
    Sprite: skin(PLANT.skin, Z.plant),
    // ── S6：条上图（owner 2026-09-19 裁 **B「上图走帧（四档）」**）──────────────────────
    //  同一条 bar 的 sheet 有 4 档（0/33/66/100% 的**填充比例画在帧里**），按生长阶取帧。
    //  取帧轴只此一条：无 states/flagId ⇒ i = 宿主那格的 stage。
    //  `anchorX:0.5`（theme.skin 的缺省）在这里是**对的**：原点恒定格心 ⇒ 贴图恒定居中。
    Frame: { index: 0, total: 4 },
    SpriteBinding: {
      resourceId: RES.stage,
      fromParent: true,
      frames: barFrames(crop.days), // 单轴（无 states/flagId）⇒ i = 宿主那格的 stage
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  动作条按钮（4 工具 + 睡觉 + 卖货）—— **S7 ②b 已从世界里撤出**（见下）
// ═══════════════════════════════════════════════════════════════════════════
// 形态沿革（留档·免得下一个人把「撤掉」读成「漏了」）：
//   S3 曾有**两套生产者**发同一批信号名（逻辑始终只有一份：Effect 按名消费）——
//     ① 世界内可点实体（`buttonEntity()` 产的 `btn-*`·Transform+Shape+Sprite+Clickable）= 指针路径；
//     ② DOM HUD 按钮（hud.ts 的 LayoutNode → mountUI）= action 相位无坐标，靠 KeyBinding 变信号。
//   ①必须存在的理由是**点击门不认 canvas**（owner 2026-08-07 立的判据查活体 DOM）；
//   于是两套并存成了过渡形态（theme.ts 旧注：「合并成一套留给 S4/S5 的真 HUD」）。
//  S7 ②b 合一套：**①整批撤出**，控件只剩 DOM 那套。撤得掉的两个前提都已实测：
//   · S4 走查选工具/睡觉/卖货走的本来就是 **DOM 键**（`scripts/game109-playthrough.mjs:163`
//     「走 DOM 键 = ActionSink 路径」）⇒ 撤画布这批不动它任何一条断言；
//   · 走查里唯一碰画布按钮坐标的那处（`:392-403`）是 **[观察·非断言]** 块（只 `say()`），撤了只会让它
//     记的那条隐患消失——它当年记的正是「世界实体不跟着换屏收起，终局屏上仍有可点的旧按钮」。
// ⚠ **下面这批 KeyBinding（`kb-*`）不能跟着撤**：DOM 键走 `enqueueAction` → keybind → Effect 这条路，
//   撤了 kb 就等于把 DOM 那套也一起废掉（点了没反应且不报错·self-check.md:28 记的病）。
// ⚠ 撤掉 ① 之后，`theme.ts` 的 `BUTTON_BIT` 也随之下线（它只为 ① 而存在）；地块成了场里唯一带 Tag 的东西。

// ═══════════════════════════════════════════════════════════════════════════
//  全局单例（资源 / 旗 / 流程 / 相位）
// ═══════════════════════════════════════════════════════════════════════════
function globals(): Record<string, EntityBlueprint> {
  const g: Record<string, EntityBlueprint> = {
    // 确定性随机源占位（plan §5：本作零随机；带一枚 = 将来接 w1-random 时不改动全局 hash 口径）。
    'farm-rng': { RandomSeed: { seed: FARM.seed, sequence: 0 } },
    // 体力（全局单例·「点某格干活 ∧ 体力≥1」的全局半边读它）。
    wallet: { Resource: { id: RES.energy, current: BALANCE.energyStart, min: 0, max: BALANCE.energyMax } },
    purse: { Resource: { id: RES.gold, current: 0, min: 0, max: BALANCE.goldMax } },
    calendar: { Resource: { id: RES.day, current: BALANCE.dayStart, min: 1, max: 9999 } },
    toolbox: { Resource: { id: RES.tool, current: 0, min: 0, max: BALANCE.toolMax } },
    // 生长相位旗：睡觉置真 → 下一拍各格 Resolve 读到 → 拍末清假（见 sleepEffects 的注）。
    'grow-phase': { Flag: { id: GROW_PHASE_FLAG, active: false } },
    // 终局冻结旗（R-20）：转 won 时由下面的 `onEnter` 置真，干活/睡觉/卖货的门挂「未冻结」。
    frozen: { Flag: { id: FROZEN_FLAG, active: false } },
    // 通关：金币到线即转 won（P5-a 的形态）。
    flow: {
      GameFlow: {
        id: 'main',
        current: 'playing',
        states: [
          { id: 'playing', transitions: [{ when: { kind: 'resource', id: RES.gold, cmp: 'gte', value: BALANCE.goldTarget }, to: 'won' }] },
          // 终局：置冻结旗（R-20）。DOM 侧早就换屏了，这条冻的是 **canvas 侧**——终局屏上那排
          // 世界内按钮此前是活的（点它会推天数）。之后唯一能动的只有 HUD 的「重开」（宿主生命周期）。
          { id: 'won', onEnter: [{ kind: 'set-flag', targetId: FROZEN_FLAG, value: true }] },
        ],
      },
    },
    // 生长相位收尾：相位为真就发 day-end。**level 模式**（不是 edge）——理由见 day-end-phase-fx 的注。
    'day-end-when': {
      EventWhen: { signal: SIGNALS.DAY_END, when: { kind: 'flag', id: GROW_PHASE_FLAG }, mode: 'level' },
    },
  };
  for (const c of CROPS) {
    g[`barn-${c.id}`] = { Resource: { id: c.invRes, current: 0, min: 0, max: BALANCE.invMax } };
  }
  // DOM HUD 的具名动作 → 信号（keybind）：`key` 就是按钮的 data-action（=信号名，一处命名、两条路径同词）。
  // 一动作一个 kb-* 实体（同房屋范式；一实体一组件，多份绑定挤不进一个实体）。
  // **不填 source**：本作这 6 个动作的效果全是全局写（工具下标/相位/体力/日期/金币/背包），
  // 没有一处按「谁出的手」寻址（地块干活那条链才要 source，而它走的是指针路径的 clickable）。填了反而
  // 会把 source 指到 kb 实体上（见 KeyBinding.source 的那条硬抛门）。
  const hudActions: ReadonlyArray<{ id: string; signal: string }> = [
    ...TOOLS.map((t) => ({ id: t.id, signal: t.pickSignal })),
    ...ACTIONS.map((a) => ({ id: a.id, signal: a.signal })),
  ];
  for (const a of hudActions) {
    g[`kb-${a.id}`] = { KeyBinding: { key: a.signal, signal: a.signal } };
  }
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
//  效果层（全部 onSignal + 显式 order）
// ═══════════════════════════════════════════════════════════════════════════
const effect = (fx: Record<string, unknown>): EntityBlueprint => ({ Effect: fx });

/** 工具选择：点工具按钮 → 写全局 RES.tool（一个信号一个效果·order 只需显式）。 */
function pickToolEffects(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (const t of TOOLS) {
    out[`pick-${t.id}-fx`] = effect({
      onSignal: t.pickSignal, kind: 'modify-resource', order: 0,
      targetId: RES.tool, op: 'set', value: t.index,
    });
  }
  return out;
}

/**
 * 干活链（三拍握手 + 浇水/收获的附加拍）。
 *  ①CLAIM 逐动作（self 门 = 前置状态；全局门 = 体力 ∧ 工具）
 *  ②SPEND **全场唯一一个**（门只读 busy，工具是谁与它无关 —— P7 的 b-spend-fx 原形）
 *  ③SETTLE/FOLLOW/CLOSE 逐动作（每一拍都带工具全局门：否则别的工具的落定拍会在同一片 busy 上乱落）
 */
function workEffects(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};

  const claim = (id: string, tool: ToolDef, when: ConditionExpr): void => {
    out[id] = effect({
      onSignal: SIGNALS.WORK, kind: 'set-state', order: BEAT.CLAIM,
      targetId: TILE_FSM, targetEntity: '@signal-source', value: TILE_STATE.BUSY,
      when, whenGlobal: and(hasEnergy, toolIs(tool), notFrozen),
    });
  };
  const settleState = (id: string, tool: ToolDef, value: string): void => {
    out[id] = effect({
      onSignal: SIGNALS.WORK, kind: 'set-state', order: BEAT.SETTLE,
      targetId: TILE_FSM, targetEntity: '@signal-source', value,
      when: atState(TILE_STATE.BUSY), whenGlobal: toolIs(tool),
    });
  };

  // ①认领拍
  claim('till-claim-fx', TOOL_TILL, atState(TILE_STATE.WILD));
  claim('sow-claim-fx', TOOL_SOW, atState(TILE_STATE.TILLED));
  claim('water-claim-fx', TOOL_WATER, and(atState(TILE_STATE.SOWN), notWatered));
  for (const c of CROPS) {
    // 收获的认领**逐作物**（成熟线只在该作物身上找得到·P6-b）。
    claim(`reap-${c.id}-claim-fx`, TOOL_REAP, and(atState(TILE_STATE.SOWN), isRipe(c), isCrop(c.id)));
  }

  // ②扣费拍
  //   门读 busy = 「本次点击已在①被认领」，**不是**「这格已翻土」这个持久事实（P7 注释里的原文要害）。
  //   ⚠ 无 targetEntity ⇒ 语义是「任一源过门即施放一次」→ 同拍点两格只扣一次（P7-d 留档的边界；
  //     一回合一动作的回合制下天然回避：真指针一帧只产一次按下）。
  out['work-spend-fx'] = effect({
    onSignal: SIGNALS.WORK, kind: 'modify-resource', order: BEAT.SPEND,
    targetId: RES.energy, op: 'add', value: -BALANCE.actionCost,
    when: atState(TILE_STATE.BUSY), whenGlobal: hasEnergy,
  });

  // ③落定拍（锄地/播种各一拍到底）
  settleState('till-settle-fx', TOOL_TILL, TOOL_TILL.to);
  settleState('sow-settle-fx', TOOL_SOW, TOOL_SOW.to);

  // 浇水 = 四拍：认领 → 扣费 → 写 Flag（今日已浇）→ 收尾回 sown。
  //   一拍只写一个组件槽（Flag 与 State 是两件），故「标记」与「收尾」拆两拍。
  out['water-mark-fx'] = effect({
    onSignal: SIGNALS.WORK, kind: 'set-flag', order: BEAT.SETTLE,
    targetId: TILE_FLAG, targetEntity: '@signal-source', value: true,
    when: atState(TILE_STATE.BUSY), whenGlobal: toolIs(TOOL_WATER),
  });
  out['water-close-fx'] = effect({
    onSignal: SIGNALS.WORK, kind: 'set-state', order: BEAT.CLOSE,
    targetId: TILE_FSM, targetEntity: '@signal-source', value: TOOL_WATER.to,
    when: atState(TILE_STATE.BUSY), whenGlobal: toolIs(TOOL_WATER),
  });

  // 收获 = 五拍：认领 → 扣费 → 入背包（按作物路由·P6-c：self 门读本格 crop、效果写全局背包）
  //        → 清生长阶（逐源）→ 收尾回 tilled（地还原成可播种）。
  for (const c of CROPS) {
    out[`reap-${c.id}-gain-fx`] = effect({
      onSignal: SIGNALS.WORK, kind: 'modify-resource', order: BEAT.SETTLE,
      targetId: c.invRes, op: 'add', value: 1,
      when: and(atState(TILE_STATE.BUSY), isCrop(c.id)), whenGlobal: toolIs(TOOL_REAP),
    });
  }
  out['reap-reset-fx'] = effect({
    onSignal: SIGNALS.WORK, kind: 'modify-resource', order: BEAT.FOLLOW,
    targetId: RES.stage, targetEntity: '@signal-source', op: 'set', value: 0,
    when: atState(TILE_STATE.BUSY), whenGlobal: toolIs(TOOL_REAP),
  });
  out['reap-close-fx'] = effect({
    onSignal: SIGNALS.WORK, kind: 'set-state', order: BEAT.CLOSE,
    targetId: TILE_FSM, targetEntity: '@signal-source', value: TOOL_REAP.to,
    when: atState(TILE_STATE.BUSY), whenGlobal: toolIs(TOOL_REAP),
  });
  return out;
}

/** 睡觉 + 生长相位收尾（brief：睡觉 → 浇过水的各长一阶 → 清浇水标记 → 体力回满 → 日期+1）。 */
function sleepEffects(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  // 三拍写的互不相干（旗/体力/日期），order 只需显式。
  out['sleep-phase-fx'] = effect({
    onSignal: SIGNALS.SLEEP, kind: 'set-flag', order: 0,
    targetId: GROW_PHASE_FLAG, value: true, whenGlobal: notFrozen,
  });
  out['sleep-refill-fx'] = effect({
    onSignal: SIGNALS.SLEEP, kind: 'modify-resource', order: 1,
    targetId: RES.energy, op: 'set', value: BALANCE.energyRefill, whenGlobal: notFrozen,
  });
  out['sleep-day-fx'] = effect({
    onSignal: SIGNALS.SLEEP, kind: 'modify-resource', order: 2,
    targetId: RES.day, op: 'add', value: 1, whenGlobal: notFrozen,
  });
  // 相位收尾（EventWhen 发的 day-end 信号）：
  //  ⚠ 为什么是 **level** 而不是 edge（实跑推演所得·S3 新发现）：相位旗在「同一拍又被睡觉置真」时
  //  （玩家连点两下睡觉·两拍相邻），edge 的迟滞会让它**再不发第二枪** → 相位旗从此常真 →
  //  之后任何一次浇水都会在下一拍被误判成「生长相位」→ 作物当场长一阶（相位旗卡死的静默故障）。
  //  level 模式没有迟滞：相位为真的每一拍都发，收尾拍无条件清旗 → 自愈，且「一次睡觉=一阶」由
  //  生长 SelfRule 的**自清浇水旗**兜住（同一格不会被长两次）。
  out['day-end-phase-fx'] = effect({
    onSignal: SIGNALS.DAY_END, kind: 'set-flag', order: 0,
    targetId: GROW_PHASE_FLAG, value: false,
  });
  // 清全场「今日已浇」（set-flag-tagged 按 Tag 批量·P2-a 实证）。它是**兜底**：
  // 已播种的格由生长 SelfRule 自清，浇了水但还没播种的格只有这条能清。
  out['day-end-clear-fx'] = effect({
    onSignal: SIGNALS.DAY_END, kind: 'set-flag-tagged', order: 1,
    tagMask: TILE_BIT, targetId: TILE_FLAG, value: false,
  });
  return out;
}

/** 卖货：背包 → 金币（valueFrom = 背包数量 × 卖价·REQ-013；先结账后清零，靠显式 order 分开）。 */
function sellEffects(): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (const c of CROPS) {
    out[`sell-${c.id}-gain-fx`] = effect({
      onSignal: SIGNALS.SELL, kind: 'modify-resource', order: 0,
      targetId: RES.gold, op: 'add', value: 0,
      valueFrom: { resourceId: c.invRes, coeff: c.price }, whenGlobal: notFrozen,
    });
    // 清零必须晚于结账（否则读到的是清零后的背包）。同信号内 order 0 全部先于 order 1。
    out[`sell-${c.id}-clear-fx`] = effect({
      onSignal: SIGNALS.SELL, kind: 'modify-resource', order: 1,
      targetId: c.invRes, op: 'set', value: 0, whenGlobal: notFrozen,
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  蓝图
// ═══════════════════════════════════════════════════════════════════════════
export function buildBlueprint(): WorldBlueprint {
  const entities: Record<string, EntityBlueprint> = {};

  // 36 格（6×6·每列一种作物 → 12/12/12）+ 每格两条子实体（**作物**·S6 + **生长条**）。
  // ⚠ 子实体**在全部地块之后**入表：zOrder 已由 Z.crop/Z.plant 钉死，这里再保一道插入序（双保险，
  //   免得将来有人误删 Sprite 的 zOrder 时靠命名兜底）。
  for (let row = 0; row < FARM.rows; row++) {
    for (let colIndex = 0; colIndex < FARM.cols; colIndex++) {
      entities[tileId(row, colIndex)] = tileEntity(row, colIndex, CROP_BY_ID[FARM.cropByCol[colIndex]]);
    }
  }
  for (let row = 0; row < FARM.rows; row++) {
    for (let colIndex = 0; colIndex < FARM.cols; colIndex++) {
      entities[cropId(row, colIndex)] = cropEntity(row, colIndex, CROP_BY_ID[FARM.cropByCol[colIndex]]);
    }
  }
  for (let row = 0; row < FARM.rows; row++) {
    for (let colIndex = 0; colIndex < FARM.cols; colIndex++) {
      entities[plantId(row, colIndex)] = plantEntity(row, colIndex, CROP_BY_ID[FARM.cropByCol[colIndex]]);
    }
  }
  // 动作条：**S7 ②b 起不在这里**——那 6 枚 `btn-*` 世界实体已整批撤出（理由见本文件「动作条按钮」节），
  //  控件只剩 DOM 那一套（hud.ts 的 `HUD_ID.btn()`）。它们的**信号链一条没动**：同样的信号名、
  //  同样这批 `kb-*` KeyBinding、同样由 Effect 按名消费 —— 变的只是「谁发的」。

  Object.assign(entities, globals(), pickToolEffects(), workEffects(), sleepEffects(), sellEffects());

  return {
    // 能力 = 本蓝图**逐项消费**的引擎件（零新增·零游戏层 system）：
    capabilities: [
      transformCapability, // a1：位置
      shapeCapability, // c1：几何 / 点击命中盒
      spriteCapability, // l1：皮肤槽（未就绪回退 Shape=观感零变）
      colorCapability, // l2：素坯上色
      frameCapability, // l3：精灵帧（S6 新增消费：作物 sheet 取帧 + 生长条四档·此前本作零消费）
      tagCapability, // g1：地块身份位（睡觉批量清浇水标记）
      resourceCapability, // f1：体力/金币/日期/工具下标/生长阶/背包
      flagCapability, // f2：今日已浇 + 生长相位
      stateCapability, // j1：生命周期（含同拍临时态 busy）
      randomCapability, // w1：RandomSeed 占位（本作零随机）
      clickableCapability, // t2：点地块 / 点按钮 → 信号
      keybindCapability, // t2：DOM HUD 的具名动作 → 信号（无 x/y 的 action 相位·clickable 的非空间孪生）
      effectApplyCapability, // t2：信号 → 效果（含 when/whenGlobal 条件门·REQ-G109-002/003）
      selfRuleCapability, // t2：每格自治生长（self 作用域）
      eventWhenCapability, // t2：生长相位 → day-end 信号
      flowCapability, // t3：通关流程
      spriteBindingCapability, // t2：地色 = 生命周期 × 今日已浇（State 行 × Flag 最低位·δ 轴）
      hierarchyResolveCapability, // t1：生长条子实体的世界位 = 父位 + 本地偏移
    ],
    entities,
  };
}

/** 地块 id（命名规则集中一处·测试/宿主查格子用）。 */
export const tileId = (row: number, colIndex: number): string => `tile-r${row}c${colIndex}`;
/** 作物 id（该格的子实体·S6）。 */
export const cropId = (row: number, colIndex: number): string => `${tileId(row, colIndex)}-crop`;
/** 生长条 id（该格的子实体·命名规则同上）。 */
export const plantId = (row: number, colIndex: number): string => `${tileId(row, colIndex)}-plant`;
/** 定尺场景尺寸（宿主建 mountHost 用）。 */
export const VIEW = { w: FIELD_W, h: FIELD_H } as const;
