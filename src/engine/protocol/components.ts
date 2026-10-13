// ═══════════════════════════════════════════════════════════════
//  Protocol Layer — 共享组件接口（聚合 barrel）
// ═══════════════════════════════════════════════════════════════
//
//  这里集中导出跨 atom-skill 共享的 Component 接口（TypeScript 形状）。
//  每个原子 skill 拥有自己的组件定义，但需要被多个 skill 读写的组件
//  在此声明，作为它们之间的契约 (protocol)。
//
//  组件语义分类（defineCapability.provides.category 标注）：
//    Resource — 持久数值，{ current, min, max }
//    Event    — 一次性，被 consume 后消失
//    Intent   — 表达"想做某事"的请求
//    Effect   — 临时状态，有字段、有持续时间
//    Marker   — 无字段，存在即有意义
//    Config   — 持久配置
//    Render   — 每帧更新，驱动 UI/渲染层
//
//  约定：World 每个实体每种 type 只存一个组件 (Map<type, Component>)。
//
//  ── 按域分片（2026-06-13；原 1086 行单文件按域拆，本文件转为纯 re-export barrel）──
//  契约由 Lead 维护：**新增/修改组件时直接改对应域文件**（不在本 barrel 追加），
//  各域互不重叠 → 多 session 并行加组件不再撞同一文件（减少合并冲突）。
//  导入端无需改动：`@engine/protocol/components.js` 原样可用，本 barrel 全量透传。
//  按需精读时，直接打开对应域文件（每片 ~80–200 行）而非全量：
//    ./components/spatial.js   — 时空/物理/几何/碰撞检测/世界服务
//        Transform Velocity Acceleration Mass Shape Bounds Hierarchy RandomSeed
//        Overlap Grounded Sensor Trigger Zone SpatialIndex TileLayer Tilemap
//    ./components/logic.js     — 资源/标志/计时/状态 + Condition→Event→Effect + flow/self/group
//        Resource ResourceModify Flag Timer TimerDone State StateChanged
//        CmpOp ConditionExpr EventWhen Signal Effect CraftRecipe StringVar StringSet
//        FlowAction FlowTransition FlowState GameFlow SelfAction SelfRule GroupCount
//        ModifierSource ModifierTotals StatBind
//    ./components/combat.js    — 身份/关系/状态 + 战斗/AI/属性/生命周期
//        Tag Status Relation Hitbox TimedEffect OverTime Perception Steering PathFollow
//        Mortal StatModifier Stats Launch Orbit
//    ./components/spawn.js     — 预制/生成/销毁/合成/施法
//        PrefabTemplate PrefabOrigin PrefabLibrary SpawnOverrides SpawnRequest
//        DestroyRequest MergeRule Caster WeightedSpawn
//    ./components/render.js    — 表现层：可见/精灵/颜色/帧/血条/动画/朝向/音/相机/文字/缓动
//        Visibility Sprite Color Frame Gauge AnimClip AnimState Facing Sound
//        Camera CameraTarget Text TweenTarget TweenEasing TweenLoop Tween TextBinding
//    ./components/input.js     — 输入：原始信号/动作/队列/键位/点击/操控
//        RawInput Action RawInputData InputQueue KeyBinding Clickable Controllable
//    ./components/autochess.js — 自走棋：六边形棋盘/网格移动 + 拖拽/托盘/落点/压实队列
//        Draggable Tray TraySeat DropZone HexBoard HexPos GridMover QueueSlots QueueMember
//    ./components/cardboard.js — 牌与棋盘算法（Tier3 解释器）：三消/扑克/逐张计分/计分trace/牌库/骰池
//        MatchBoard BoardCell Card PlayedHand PokerHand PerCardWhen PerCardScore
//        PerCardRule PerCardRetrigger ScoreEvent ScoreTrace CardPile
//        DiceFace DieSpec RolledDie DicePool RolledDice
//
//  参见 wiki/atom-skill-periodic-table.md
// ═══════════════════════════════════════════════════════════════

export type * from './components/spatial.js';
export type * from './components/logic.js';
export type * from './components/combat.js';
export type * from './components/spawn.js';
export type * from './components/render.js';
export type * from './components/input.js';
export type * from './components/autochess.js';
export type * from './components/cardboard.js';
export type * from './components/life-world.js';
export type * from './components/life-navigation.js';
export type * from './components/life-activity.js';
export type * from './components/life-action.js';
export type * from './components/life-construction.js';
export type * from './components/life-farming.js';
export type * from './components/life-planting.js';
