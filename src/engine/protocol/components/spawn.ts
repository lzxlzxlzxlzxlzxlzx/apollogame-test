// Protocol · 预制 / 生成 / 销毁 / 合成 / 施法 ─────────────────────────────
// 数据级 prefab 模板与其运行时实例化：SpawnRequest→prefab 展开、DestroyRequest 回收、MergeRule 升星合成、
// Caster 把信号变成算好坐标的生成请求。"AI 写高层数据、引擎确定性展开"，无自由代码。
import type { Component, EntityId } from '../../core/types.js';

// ── Prefab ── 数据级预制模板（T4 授权层，反 YAML 编译器）。模板 = 一组实体的组件蓝图（纯数据）。
// AI/数据产出 SpawnRequest{templateId,x,y}（复用 spawn 原子的请求契约）→ prefab 能力查库、确定性展开为
// 实体+组件（唯一 id、Transform 偏移到 x,y、深拷贝隔离）。"AI 写高层数据、引擎确定性展开"，无自由代码。
// 内部引用（REQ-F-033）：模板里指「同一次展开的兄弟实体」的字段（Hierarchy.parentId / Caster.originEntity
// / Zone.requiredEntities…任意组件任意深度）一律写 '@local:<localId>'，展开时重写为兄弟实例 id——
// 复合预制（单位+名牌+血条、炮塔+炮管、母体+子弹）整体生灭跟随的标配语义。口诀：指兄弟就写 @local:。
export interface PrefabTemplate {
  // localId → { 组件类型 → 组件数据（不含 type 字段，与 manifest 约定一致） }
  entities: Record<string, Record<string, Record<string, unknown>>>;
}
// ── PrefabOrigin（REQ-F-046/048①）── 实例出身戳：prefab 展开时盖在每个实体上（Unity prefab link 同款语义）。
// 同模板计数（升星）靠 templateId、入场顺序（超员逆序卖）靠 seq——运行时实例的两把数据钥匙，免解析 id 字符串。
export interface PrefabOrigin extends Component {
  readonly type: 'PrefabOrigin';
  templateId: string; // 出自哪个模板
  seq: number; // 第几次展开（PrefabLibrary.seq，全局单调=入场顺序）
  localId: string; // 模板内 localId
  source?: EntityId; // 生成它的施法者/源实体（REQ-F-065：hitbox 据此读施法者本地资源做 per-caster 异质缩放）
}

export interface PrefabLibrary extends Component {
  readonly type: 'PrefabLibrary';
  templates: Record<string, PrefabTemplate>; // 模板库（数据）
  seq: number; // 实例计数器 → 确定性唯一 id（进 snapshot 可重放）
}

// ── K1 spawn ── 创建新实体的请求（模板展开由 assembly 层负责）
// 实例参数覆盖（REQ-F-032）：localId → 组件类型 → 字段补丁。prefab 深拷贝模板后逐字段合并——
// 同一模板展开异构实例（每棋子各自 HexPos/Tag/星级数值）全靠它，闭语法纯数据、无自由代码。
// 组件级字符串=哨兵（REQ-F-049：HexPos:'@origin-hex' 以请求的出身格代入）；其余字符串补丁不展开（typo 防御）。
export type SpawnOverrides = Record<string, Record<string, Record<string, unknown> | string>>;
export interface SpawnRequest extends Component {
  projectileShot?:import('./combat.js').ProjectileShot;
  readonly type: 'SpawnRequest';
  /** Explicit late-frame spawn; omitted retains the ordinary Update consumer. */
  spawnPhase?: 'resolve';
  templateId: string;
  x: number;
  y: number;
  overrides?: SpawnOverrides; // 可选：按模板 localId 定点覆盖组件字段
  // 出身格（REQ-F-049）：发起者所在棋盘格（POD 整数，写者各自盖章：caster=锚点 HexPos、merge-rule=最老
  // 实例锚点 HexPos）。overrides 里某 localId 写 `HexPos: '@origin-hex'` 哨兵 → prefab 以此值代入；
  // 模板缺 HexPos 组件时**仅哨兵路径**允许补建（值恒完整 {q,r}；通用补丁不建缺件——半截组件的
  // undefined 字段会进 snapshot/hash）。缺 originHex → 哨兵补丁整条跳过（发起者不在板上=实例不上板）。
  originHex?: { q: number; r: number };
  // 发起者实体（REQ-F-065）：caster/self-rule 盖章自身 → prefab 转记到每个展开实体的 PrefabOrigin.source，
  // 供 hitbox 的 scaleByResource 先查"施法者本地（源 + 同次展开的复合兄弟）"资源、未命中再回退全局。
  source?: EntityId;
  // Optional committed entity position: prefab resolves its current Transform
  // when consuming the request, preserving entity identity across a delayed spawn.
  targetEntity?: EntityId;
  /** Orthogonal contact identity; does not change release placement. */
  onlyHitTarget?: EntityId;
  /** Captured normalized direction, applied to Launch and capsule geometry. */
  aim?: { x: number; y: number };
  followSource?: boolean;
}

// ── K2 destroy ── 移除实体的请求（read-then-consume）
export interface DestroyRequest extends Component {
  readonly type: 'DestroyRequest';
  entityId: EntityId;
}

// ── MergeRule（REQ-F-046 升星合成）── 「N 换 1」声明式合成规则（卡牌/合成品类通用）。
// merge-rule 系统每拍：数 PrefabOrigin.templateId===template 的**存活实例数**（按 distinct seq）；
// ≥need → 取 seq 最小的 need 个（最老先合，确定性），其全部实体发 DestroyRequest（挂件随 cascade），
// 并在最老实例的锚点 Transform 处发 SpawnRequest{into, intoOverrides}；while 连锁直至 <need。
// 跨级连锁（into 模板自己的 MergeRule）次拍接力。
export interface MergeRule extends Component {
  readonly type: 'MergeRule';
  template: string; // 监视的模板 id（如 'guanyu_1star'）
  need: number; // 凑几换一（金铲铲=3）
  into: string; // 替换成的模板 id（如 'guanyu_2star'）
  intoOverrides?: SpawnOverrides; // 新实例的参数补丁（@local:/槽位语义同 F-032/033 管道）
}

// ── MergeDrop（拖放合并意图·REQ-MERGE-ON-PLACE）── merge-on-place 消费：把「拖 from 落到 to 格」的
// 一次性拖放意图交给引擎裁决——同模板且有 MergeRule → 合成次级于 to 处；异模板 → 交换位置；空格 → 移动 from。
// 由宿主层拖拽手势合成（host 解析源实体 from + 落格占用者 to·纯坐标 x/y=落点），事件式、消费后即清。
// 区别 MergeRule（自动合并·不看位置）：本件是**玩家拖拽触发**的位置感知合并（Gossip Harbor 合并手感）。
export interface MergeDrop extends Component {
  readonly type: 'MergeDrop';
  from: EntityId; // 被拖的物品实例（带 PrefabOrigin+Transform）
  to?: EntityId; // 落格占用的物品实例（host 解析·空格则缺省）
  x: number; // 落点世界坐标（空格移动时 from 落此处）
  y: number;
}

// ── Order（多槽交付订单·REQ-101-07/order-fulfill）── 「集齐 N 个指定模板成品 → 发奖」的声明式订单。
// 顾客点单/任务收集/合成台通用：needItems=各 slot 要的模板 id（最多 N）·filled=各 slot 是否已交付（等长）·
// reward=集齐后发的资源增量表（数据·非硬编码）。order-fulfill 消费 DeliverDrop 时按模板匹配未满 slot 落格。
//
// 订单轮换（REQ-ORDERROT）：pool 非空时，集齐发奖后**从 pool 取下一单**写回 needItems/reward + 清 filled，
// 而非停在原地重复同一单——「顾客换下一样需求」的续单循环（可逐级升级 food_2→food_3…）。rotateMode 选
// 'sequence'（按 cursor 顺序环回，缺省）还是 'weighted'（按 pool 项 weight 用世界 RandomSeed 加权抽·
// 缺 weight 视为等权）。空 pool = 完全退化回旧行为（resetOnComplete 决定是否清 filled·逐字节零回归）。
export interface Order extends Component {
  readonly type: 'Order';
  orderId: string;
  needItems: string[]; // 各 slot 需要的模板 id（顺序即 slot 序·长度=slot 数·最多 N）
  filled: boolean[]; // 各 slot 是否已交付（与 needItems 等长·初始全 false）
  reward: { resourceId: string; amount: number }[]; // 全 slot 集齐后一次性发的资源增量（钳进各资源 min/max）
  resetOnComplete?: boolean; // 集齐发奖后是否清空 filled 重新接单（缺省 true·顾客走了换新单）；pool 非空时此字段被轮换逻辑接管（见下）
  // 续单池（REQ-ORDERROT）：集齐发奖后取下一单的候选表。每项是完整的 needItems/reward 替换（+可选 weight，
  // 仅 rotateMode:'weighted' 用；缺省视为等权 1）。空数组/未设 = 无池，退化回 resetOnComplete 旧行为。
  pool?: { needItems: string[]; reward: { resourceId: string; amount: number }[]; weight?: number }[];
  rotateMode?: 'sequence' | 'weighted'; // pool 取下一单的方式：sequence=按 cursor 顺序环回（缺省）；weighted=世界 RandomSeed 加权抽
  cursor?: number; // sequence 模式下一次要取的 pool 下标（缺省 0）；每次轮换后 (cursor+1)%pool.length 环回
}

// ── DeliverDrop（交付意图·order-fulfill 消费）── 把「拖成品 item 去交给订单 order」的一次性意图交给引擎裁决：
// item 的 PrefabOrigin.templateId 命中 order 某个未满 slot 的 needItem → 销毁 item + 该 slot 置满；全满则发奖（+可重置）。
// 由宿主拖拽手势合成（host 解析被拖成品 item + 落点顾客卡对应的 order 实体），事件式、消费后即清。
export interface DeliverDrop extends Component {
  readonly type: 'DeliverDrop';
  item: EntityId; // 被拖去交付的成品实例（带 PrefabOrigin）
  order: EntityId; // 目标订单实体（带 Order）
}

// ── Blocker（挖掘阻碍层·REQ-101-08/merge-proximity-clear）── 盖住某格的阻碍层：layers>0=不可拖/不可落子；
// 邻近二消每次给 layers −dec；layers 归零 → 清层（DestroyRequest 自身）+ 按 reveal 露出内容
// （spawn=SpawnRequest 该模板 / resource=给某资源 +amount）。挖掘式区域解锁·空间即奖励（Gossip Harbor 同型·纯数据）。
export interface Blocker extends Component {
  readonly type: 'Blocker';
  layers: number; // 剩余阻碍层数（>0=盖住·不可用）
  reveal: { kind: 'spawn' | 'resource'; templateId?: string; resourceId?: string; amount?: number }; // 归零露出物
}

// ── MergeEvent（合并事件·merge-on-place 产·read-then-consume）── 「某处刚发生一次二消合并」的一次性事件：
// merge-on-place 每次合成在合并落点发一条 MergeEvent{x,y}。下游（merge-proximity-clear/juice/统计）读它响应·消费即清。
export interface MergeEvent extends Component {
  readonly type: 'MergeEvent';
  x: number; // 合并落点世界坐标
  y: number;
}

// ── MergeProximity（邻格清阻碍配置·单例·merge-proximity-clear 读）── 「合并→邻格 Blocker 减层」的空间参数：
// cellSize=格边长（世界像素·把 radius 格数换成世界距离）·radius=影响半径（格·1=3×3）·dec=每次二消减层数。
export interface MergeProximity extends Component {
  readonly type: 'MergeProximity';
  cellSize: number;
  radius: number; // 单位=格（Chebyshev·1→3×3）
  dec: number; // 每次合并给邻格 Blocker.layers 减多少
}

// ── Caster ── 信号→生成桥（D-002）：把"按键/点地/条件成立"的 Signal 变成一条算好坐标的 SpawnRequest，
// 由 prefab 能力展开成技能/陷阱/召唤/掉落。补上 prefab 缺的"运行时释放"入口（REQ-008 显式延后的那块）。
// at 决定生成位置：'self'=施法者自身、'pointer'=光标世界坐标(screenToWorld 逆投影)、'target'=最近的 targetTag 阵营。
// 确定性：只读 Signal/InputQueue/Transform/Tag + 几何比较；按施法者 id 升序结算；坐标取整前为 IEEE 算术（不喂 Condition）。
export interface Caster extends Component {
  /** Optional private ordered-skill state. It advances only after this Caster
   * has accepted a real release and created its request/plan. */
  cycleStateEntity?: EntityId;
  cycleOwner?: EntityId;
  cycleCandidates?: readonly string[];
  volleyCount?: number;
  volleyIntervalTicks?: number;
  volleySpread?: { kind: 'none' } | { kind: 'seeded-uniform'; halfAngleRadians: number };
  volleySpeed?: number;
  volleyMaxDistance?: number;
  /** Forward the successful-start shot snapshot to an independent projectile. */
  projectile?:boolean;
  // Opt-in committed cast. Uses only this GameFlow.targetSnapshot; never reselects.
  targetFlow?: EntityId;
  /** Source-only skills can opt into the same post-damage release checks. */
  releasePhase?: 'resolve';
  /** Default true for legacy at:target committed casts; false fixes a world point. */
  alignToTarget?: boolean;
  onlyHitTarget?: boolean;
  /** Requires a Flow-captured aim; never reselects on release. */
  useCapturedAim?: boolean;
  followSource?: boolean;
  targetCheck?: import('./logic.js').EntityCheck;
  sourceCheck?: import('./logic.js').EntityCheck;
  readonly type: 'Caster';
  onSignal: string; // 收到此名 Signal 时释放（来自 clickable / event-when / keybind 输入绑定）
  template: string; // PrefabLibrary 里的模板 id
  at: 'self' | 'pointer' | 'target'; // 生成位置来源
  targetTag?: number; // at:'target' 时找最近的 Tag.flags 含此位的实体（缺省找最近任意实体）
  // 锚点实体（缺省=施法者自身）：at:'self' 在它身上生成、at:'target' 以它为索敌原点并复用它的 Relation(target)。
  // 让独立的"技能绑定"实体把锚点/索敌委托给英雄，绕过"一实体一 Caster"对多技能的限制，无需 hierarchy。
  originEntity?: EntityId;
  // 实例参数覆盖（REQ-F-032）：原样透传进产出的 SpawnRequest.overrides。
  // 「阵容槽位实体 = Caster{onSignal:'deploy', template:英雄, overrides:{该棋子的 HexPos/Tag/数值}}」——
  // N 槽各自展开自己的棋子 = 回合制备战重展开，纯重组、零新系统。
  overrides?: SpawnOverrides;
  // 部署门（REQ-F-049）：true=锚点实体（originEntity ?? 自身）**无 HexPos 组件则收信号不展开**。
  // 「在板=部署源、离板=静默」——拖上板/拖回席（drag-place 写/删 HexPos）即天然开关，零新输入。
  // HexPos=板上身份是引擎既定语义（grid-move 的 SIM 真相），故收窄为专字段而非通用 requireComponent
  // （动态组件名读无法静态申报给调度器，未申报读违确定性纪律——评审记录见 requests.md F-049）。
  requireHexPos?: boolean;
}

// ── WeightedSpawn（加权掉落生成桥·REQ-TAPSPAWN）── 信号→按权重表抽一个模板生成，可选原子扣资源
// （不足整单不动，同 craft-recipe 口径）。挂"生成器"实体：收到 onSignal 时，若声明 cost 则先做
// afford 检查+扣（自身 Resource.current，钳 min），再消费世界 RandomSeed 单例按 table 权重抽一个
// templateId，最终在自身 Transform 处发 SpawnRequest。table 空/权重全 0 → 静默不 spawn（不崩）。
// 与 Caster（onSignal→固定 template）的区别：Caster 产出恒定，本组件按权重表**随机**选产出，
// 且原生带"可选原子扣资源"闸门——点一下生成器、够体力才扣、扣了按权重吐一个随机物件的通用底座
// （game101《海港绯闻》生成器缺口：此前只能 craft-recipe+caster 拼出"固定产出"，见 game101/blueprint.ts）。
export interface WeightedSpawn extends Component {
  readonly type: 'WeightedSpawn';
  onSignal: string; // 收到此信号名才触发（clickable/event-when 等产出的 Signal.name）
  cost?: { id: string; amount: number }; // 可选：原子扣自身 Resource（current<amount 整单不动·不扣不 spawn，同 craft-recipe；扣后钳进 min）
  table: { templateId: string; weight: number }[]; // 加权掉落表（weightedPick 按权重抽一个；空表/权重全 0 = 不 spawn、不崩）
}

/** One-shot alignment of a committed hit region before its first overlap query. */
export interface CommittedContact extends Component {
  readonly type: "CommittedContact";
  targetEntity: EntityId;
  offsetX: number;
  offsetY: number;
  /** Follow the source before collision until lifetime/source cleanup. */
  persistent?: boolean;
}
