// 组件契约映射（Lead 维护）：全部组件【闭集】→ 组件数据形状（去 type）。
// EntityBlueprint 的组件名闭集牙：蓝图里写错/拼错组件名 → 编译期报错
// （数据驱动里最常见、最该拦的错：弱 LLM 容易拼错/编造组件名）。
// 闭集 = protocol/components 全部 + skill 内定义的组件（dialogue 的 3 个；该层级倒挂另案归位）。
// 放此 assembly 层：可同时 import protocol(低层) 与 skills，避免 protocol→skill 倒挂。
// 新增组件 = 在对应域文件/skill 加 interface(extends Component) + 在此登记一行。
import type {
  Acceleration,
  Action,
  Anim3D,
  Pivot3D,
  AnimState,
  AnimState3D,
  Billboard3D,
  BlockGrid,
  BlockTrayPiece,
  BoardCell,
  Bounce,
  Bounds,
  Camera,
  Camera3D,
  CameraTarget,
  CardPile,
  Caster,
  Clickable,
  Coachmark,
  Collider3D,
  Color,
  Controllable,
  CraftRecipe,
  Decal3D,
  DebugTrace,
  DestroyRequest,
  Diegetic3D,
  DicePool,
  Draggable,
  DropZone,
  Effect,
  EventWhen,
  Facing,
  FlowAgent,
  FlowField,
  FaceDir,
  FaceRotate,
  Flag,
  Fog3D,
  Group,
  Frame,
  GameFlow,
  Gauge,
  Glow3D,
  GridMover,
  Grounded,
  GroupCount,
  HeldHand,
  HexBoard,
  HexPos,
  Hierarchy,
  Hitbox,
  Impulse3D,
  InputQueue,
  Joint3D,
  KeyBinding,
  Launch,
  Light3D,
  Line3D,
  Mass,
  MatchBoard,
  Material3D,
  MergeRule,
  MergeDrop,
  Order,
  DeliverDrop,
  Blocker,
  MergeEvent,
  MergeProximity,
  Mesh3D,
  ModifierSource,
  ModifierTotals,
  Model3D,
  Mortal,
  NavAgent,
  NavGraph,
  NavMesh,
  NavPath,
  OverTime,
  Overlap,
  Overlap3D,
  Path3D,
  PerCardRetrigger,
  Pickable3D,
  Post3D,
  Reflector3D,
  PerCardRule,
  PerCardScore,
  Perception,
  PlayedHand,
  PokerHand,
  PrefabLibrary,
  PrefabOrigin,
  RandomSeed,
  RawInput,
  Relation,
  Resource,
  ResourceModify,
  RigidBody3D,
  RolledDice,
  ScoreTrace,
  SelfRule,
  Sensor,
  Shape,
  Signal,
  Sky3D,
  Sound,
  SpatialIndex,
  SpawnRequest,
  Sprite,
  State,
  StateChanged,
  StatBind,
  Stats,
  Status,
  Steering,
  StringSet,
  StringVar,
  Tag,
  Text,
  TextBinding,
  Tilemap,
  Timeline,
  TimelinePlayback,
  Timer,
  TimerDone,
  Transform,
  Transform3D,
  Tray,
  TraySeat,
  Trigger,
  Trail3D,
  Tween,
  Velocity,
  Vfx3D,
  Visibility,
  WeightedSpawn,
  WorldUI3D,
  LineWins,
  Orbit,
  Owner,
  PathFollow,
  PhysicsWorld3D,
  PlaceBlockIntent,
  QueueMember,
  QueueSlots,
  PullAnchor,
  SlotMachine,
  Zone,
} from '@engine/protocol/components.js';
import type { RuntimeComponentName } from './component-universe.gen.js';
import type { DialogueScript, DialogueAdvance, DialogueChoose } from '@skills/tier3/dialogue.js';
import type { DuelMatrix, DuelIntent, DuelOutcome } from '@skills/tier2/matrix-duel.js';
import type { TurnOrder } from '@skills/tier2/turn-order.js';
import type { Cooldowns } from '@skills/tier2/cooldown.js';
import type { DamageTable, Armor } from '@skills/tier2/damage-table.js';
import type { Inventory } from '@skills/tier2/inventory.js';
import type { ConveyorQueue } from '@skills/tier2/conveyor-queue.js';
import type { Memory, MemoryRules } from '@skills/tier2/memory-core.js';
import type { IntentBarrier, IntentInbox } from '@skills/tier2/intent-barrier-core.js';
import type { Vfx2D } from '@atom-skills/vfx2d/index.js';

export interface ComponentDataMap {
  Acceleration: Omit<Acceleration, 'type'>;
  Action: Omit<Action, 'type'>;
  Anim3D: Omit<Anim3D, 'type'>;
  Pivot3D: Omit<Pivot3D, 'type'>;
  AnimState: Omit<AnimState, 'type'>;
  AnimState3D: Omit<AnimState3D, 'type'>;
  Billboard3D: Omit<Billboard3D, 'type'>;
  BoardCell: Omit<BoardCell, 'type'>;
  Bounds: Omit<Bounds, 'type'>;
  Camera: Omit<Camera, 'type'>;
  Camera3D: Omit<Camera3D, 'type'>;
  CameraTarget: Omit<CameraTarget, 'type'>;
  CardPile: Omit<CardPile, 'type'>;
  Caster: Omit<Caster, 'type'>;
  Clickable: Omit<Clickable, 'type'>;
  Coachmark: Omit<Coachmark, 'type'>;
  Collider3D: Omit<Collider3D, 'type'>;
  Color: Omit<Color, 'type'>;
  Controllable: Omit<Controllable, 'type'>;
  CraftRecipe: Omit<CraftRecipe, 'type'>;
  Decal3D: Omit<Decal3D, 'type'>;
  DestroyRequest: Omit<DestroyRequest, 'type'>;
  Diegetic3D: Omit<Diegetic3D, 'type'>;
  DicePool: Omit<DicePool, 'type'>;
  Draggable: Omit<Draggable, 'type'>;
  DropZone: Omit<DropZone, 'type'>;
  Effect: Omit<Effect, 'type'>;
  EventWhen: Omit<EventWhen, 'type'>;
  Facing: Omit<Facing, 'type'>;
  FaceDir: Omit<FaceDir, 'type'>;
  FaceRotate: Omit<FaceRotate, 'type'>;
  Flag: Omit<Flag, 'type'>;
  Fog3D: Omit<Fog3D, 'type'>;
  Frame: Omit<Frame, 'type'>;
  GameFlow: Omit<GameFlow, 'type'>;
  Gauge: Omit<Gauge, 'type'>;
  Glow3D: Omit<Glow3D, 'type'>;
  GridMover: Omit<GridMover, 'type'>;
  Grounded: Omit<Grounded, 'type'>;
  GroupCount: Omit<GroupCount, 'type'>;
  HeldHand: Omit<HeldHand, 'type'>;
  HexBoard: Omit<HexBoard, 'type'>;
  HexPos: Omit<HexPos, 'type'>;
  Hierarchy: Omit<Hierarchy, 'type'>;
  Hitbox: Omit<Hitbox, 'type'>;
  Impulse3D: Omit<Impulse3D, 'type'>;
  InputQueue: Omit<InputQueue, 'type'>;
  Joint3D: Omit<Joint3D, 'type'>;
  KeyBinding: Omit<KeyBinding, 'type'>;
  Launch: Omit<Launch, 'type'>;
  Light3D: Omit<Light3D, 'type'>;
  Line3D: Omit<Line3D, 'type'>;
  Mass: Omit<Mass, 'type'>;
  MatchBoard: Omit<MatchBoard, 'type'>;
  Material3D: Omit<Material3D, 'type'>;
  MergeRule: Omit<MergeRule, 'type'>;
  MergeDrop: Omit<MergeDrop, 'type'>;
  Order: Omit<Order, 'type'>;
  DeliverDrop: Omit<DeliverDrop, 'type'>;
  Blocker: Omit<Blocker, 'type'>;
  MergeEvent: Omit<MergeEvent, 'type'>;
  MergeProximity: Omit<MergeProximity, 'type'>;
  Mesh3D: Omit<Mesh3D, 'type'>;
  ModifierSource: Omit<ModifierSource, 'type'>;
  ModifierTotals: Omit<ModifierTotals, 'type'>;
  Model3D: Omit<Model3D, 'type'>;
  Mortal: Omit<Mortal, 'type'>;
  NavAgent: Omit<NavAgent, 'type'>;
  NavGraph: Omit<NavGraph, 'type'>;
  NavMesh: Omit<NavMesh, 'type'>;
  NavPath: Omit<NavPath, 'type'>;
  OverTime: Omit<OverTime, 'type'>;
  Overlap: Omit<Overlap, 'type'>;
  Overlap3D: Omit<Overlap3D, 'type'>;
  Path3D: Omit<Path3D, 'type'>;
  PerCardRetrigger: Omit<PerCardRetrigger, 'type'>;
  Post3D: Omit<Post3D, 'type'>;
  Pickable3D: Omit<Pickable3D, 'type'>;
  Reflector3D: Omit<Reflector3D, 'type'>;
  PerCardRule: Omit<PerCardRule, 'type'>;
  PerCardScore: Omit<PerCardScore, 'type'>;
  Perception: Omit<Perception, 'type'>;
  PlayedHand: Omit<PlayedHand, 'type'>;
  PokerHand: Omit<PokerHand, 'type'>;
  PrefabLibrary: Omit<PrefabLibrary, 'type'>;
  PrefabOrigin: Omit<PrefabOrigin, 'type'>;
  RandomSeed: Omit<RandomSeed, 'type'>;
  RawInput: Omit<RawInput, 'type'>;
  Relation: Omit<Relation, 'type'>;
  Resource: Omit<Resource, 'type'>;
  ResourceModify: Omit<ResourceModify, 'type'>;
  RigidBody3D: Omit<RigidBody3D, 'type'>;
  RolledDice: Omit<RolledDice, 'type'>;
  ScoreTrace: Omit<ScoreTrace, 'type'>;
  SelfRule: Omit<SelfRule, 'type'>;
  Sensor: Omit<Sensor, 'type'>;
  Shape: Omit<Shape, 'type'>;
  Signal: Omit<Signal, 'type'>;
  Sky3D: Omit<Sky3D, 'type'>;
  Sound: Omit<Sound, 'type'>;
  SpatialIndex: Omit<SpatialIndex, 'type'>;
  SpawnRequest: Omit<SpawnRequest, 'type'>;
  Sprite: Omit<Sprite, 'type'>;
  State: Omit<State, 'type'>;
  StateChanged: Omit<StateChanged, 'type'>;
  StatBind: Omit<StatBind, 'type'>;
  Stats: Omit<Stats, 'type'>;
  Status: Omit<Status, 'type'>;
  Steering: Omit<Steering, 'type'>;
  StringSet: Omit<StringSet, 'type'>;
  StringVar: Omit<StringVar, 'type'>;
  Tag: Omit<Tag, 'type'>;
  Text: Omit<Text, 'type'>;
  TextBinding: Omit<TextBinding, 'type'>;
  Tilemap: Omit<Tilemap, 'type'>;
  Timeline: Omit<Timeline, 'type'>;
  TimelinePlayback: Omit<TimelinePlayback, 'type'>;
  Timer: Omit<Timer, 'type'>;
  TimerDone: Omit<TimerDone, 'type'>;
  Transform: Omit<Transform, 'type'>;
  Transform3D: Omit<Transform3D, 'type'>;
  Tray: Omit<Tray, 'type'>;
  TraySeat: Omit<TraySeat, 'type'>;
  Trigger: Omit<Trigger, 'type'>;
  Trail3D: Omit<Trail3D, 'type'>;
  Tween: Omit<Tween, 'type'>;
  Velocity: Omit<Velocity, 'type'>;
  Vfx3D: Omit<Vfx3D, 'type'>;
  Visibility: Omit<Visibility, 'type'>;
  WeightedSpawn: Omit<WeightedSpawn, 'type'>;
  WorldUI3D: Omit<WorldUI3D, 'type'>;
  Zone: Omit<Zone, 'type'>;
  DialogueScript: Omit<DialogueScript, 'type'>;
  DialogueAdvance: Omit<DialogueAdvance, 'type'>;
  DialogueChoose: Omit<DialogueChoose, 'type'>;
  DuelMatrix: Omit<DuelMatrix, 'type'>;
  DuelIntent: Omit<DuelIntent, 'type'>;
  DuelOutcome: Omit<DuelOutcome, 'type'>;

  // ── 2026-09-14 补登（REQ-111-ENG-04·game111 PE 报，实查发现范围比报的大得多）──────────
  // 报的是 5 个，实查 28 个：本表长期落后于 registry。凡是「能力在 registry 登了、组件却没登进本表」
  // 的，游戏在蓝图里**根本写不出那个组件名**（编译期就被闭集牙咬掉），只能退到宿主层手挂——
  // 数据驱动宣言里最不该出现的形状。为什么一直没人发现：**此前没有任何一道门对这两张表**，
  // 见文件末尾新增的编译期对账。
  Armor: Omit<Armor, 'type'>;
  BlockGrid: Omit<BlockGrid, 'type'>;
  BlockTrayPiece: Omit<BlockTrayPiece, 'type'>;
  Bounce: Omit<Bounce, 'type'>;
  ConveyorQueue: Omit<ConveyorQueue, 'type'>;
  Cooldowns: Omit<Cooldowns, 'type'>;
  DamageTable: Omit<DamageTable, 'type'>;
  DebugTrace: Omit<DebugTrace, 'type'>;
  FlowAgent: Omit<FlowAgent, 'type'>;
  FlowField: Omit<FlowField, 'type'>;
  Group: Omit<Group, 'type'>;
  IntentBarrier: Omit<IntentBarrier, 'type'>;
  IntentInbox: Omit<IntentInbox, 'type'>;
  Inventory: Omit<Inventory, 'type'>;
  LineWins: Omit<LineWins, 'type'>;
  Memory: Omit<Memory, 'type'>;
  MemoryRules: Omit<MemoryRules, 'type'>;
  Orbit: Omit<Orbit, 'type'>;
  Owner: Omit<Owner, 'type'>;
  PathFollow: Omit<PathFollow, 'type'>;
  PhysicsWorld3D: Omit<PhysicsWorld3D, 'type'>;
  PlaceBlockIntent: Omit<PlaceBlockIntent, 'type'>;
  PullAnchor: Omit<PullAnchor, 'type'>;
  QueueMember: Omit<QueueMember, 'type'>;
  QueueSlots: Omit<QueueSlots, 'type'>;
  SlotMachine: Omit<SlotMachine, 'type'>;
  TurnOrder: Omit<TurnOrder, 'type'>;
  Vfx2D: Omit<Vfx2D, 'type'>;
}

// ── 编译期对账：本表 ⇔ 运行时组件全集，双向逐一相等（REQ-111-ENG-04 的**根因半边**）───────
//
// 病史：本表是**手维护**的闭集，而组件全集（component-universe.gen.ts）是从源码**生成**的。
// 两者之间此前**没有任何一道门**——`build-component-map.test.mjs` 只守「生成物 vs 现算」，
// registry 只守「能力 id ↔ loader」，谁都不管「组件进没进本表」。于是每下沉一件带新组件的能力，
// 漏登一次没人知道，攒到 2026-09-14 被 game111 PE 撞上时已经积了 28 个。
// 症状很隐蔽：门禁全绿、能力也真能跑，只是**游戏层在蓝图里写不出那个组件名**，被迫退回宿主层手挂。
//
// 为什么做成类型而不是跑时断言：这张表的价值就在编译期，守它的门也该在编译期——
// 漏登的那一刻 `tsc` 就报错，并把缺的名字**列在错误信息里**，不必等谁去跑某个测试。
// `scoped-gate` 任何一档都跑 tsc，所以这道门天然接在推送路径上。
// 运行时那一半（给出可读清单 + 可撤修验红）在 `component-map.test.ts`。
type MissingFromMap = Exclude<RuntimeComponentName, keyof ComponentDataMap>;
type StaleInMap = Exclude<keyof ComponentDataMap, RuntimeComponentName>;
/** T 必须是 never，否则编译期报错并列出差集。 */
type AssertEmpty<T extends never> = T;
/** 漏登：组件在源码里有、本表没登 → 游戏蓝图写不出它。补一行 `Xxx: Omit<Xxx,'type'>;` 即可。 */
export type _NoMissingComponent = AssertEmpty<MissingFromMap>;
/** 过期：本表登了一个源码里已不存在的组件 → 删掉那一行（组件被删/改名时咬）。 */
export type _NoStaleComponent = AssertEmpty<StaleInMap>;
