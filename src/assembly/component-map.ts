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
  BoardCell,
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
  DestroyRequest,
  Diegetic3D,
  DicePool,
  Draggable,
  DropZone,
  Effect,
  EventWhen,
  Facing,
  FaceDir,
  FaceRotate,
  Flag,
  Fog3D,
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
  Hitbox, DamageReceiver, DamageRequest, KnockbackRequest, LastDamage, DeathConversion, DeathConverted,
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
  PhysicsWorld3D,
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
  SpriteBinding,
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
  Zone,
} from '@engine/protocol/components.js';
import type { DialogueScript, DialogueAdvance, DialogueChoose } from '@skills/tier3/dialogue.js';
import type { DuelMatrix, DuelIntent, DuelOutcome } from '@skills/tier2/matrix-duel.js';

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
  DamageReceiver: Omit<DamageReceiver,'type'>;
  DamageRequest: Omit<DamageRequest,'type'>;
  KnockbackRequest: Omit<KnockbackRequest,'type'>;
  LastDamage: Omit<LastDamage,'type'>;
  DeathConversion: Omit<DeathConversion,'type'>;
  DeathConverted: Omit<DeathConverted,'type'>;
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
  PhysicsWorld3D: Omit<PhysicsWorld3D, 'type'>;
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
  SpriteBinding: Omit<SpriteBinding, 'type'>;
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
}
