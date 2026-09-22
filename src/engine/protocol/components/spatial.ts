// Protocol · 时空 / 物理 / 几何 / 碰撞检测 / 世界服务 ─────────────────────────────
// 实体在世界里"在哪、多大、怎么动、碰没碰、占没占区"的物理基底；以及挂在 world 实体上的
// 随机数与空间索引服务。被 motion/collision/spatial-query/trigger-zone/tilemap 等读写。
import type { Component, EntityId } from '../../core/types.js';

// ── A1 transform ── 实体在世界的位置、朝向和大小
export interface Transform extends Component {
  readonly type: 'Transform';
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

// ── B1 velocity ── 实体当前的运动方向、速度和角速度
export interface Velocity extends Component {
  readonly type: 'Velocity';
  vx: number;
  vy: number;
  angular: number;
}

// ── B2 acceleration ── 实体的速度在怎么变
export interface Acceleration extends Component {
  readonly type: 'Acceleration';
  ax: number;
  ay: number;
}

// ── B3 mass ── 实体有多重（0 = 不可移动）
export interface Mass extends Component {
  readonly type: 'Mass';
  value: number;
}

// ── C1 shape ── 碰撞/占位几何形状
export interface Shape extends Component {
  readonly type: 'Shape';
  kind: 'box' | 'circle' | 'polygon';
  width?: number;
  height?: number;
  radius?: number;
  // polygon: 局部空间凸多边形顶点，扁平存 [x0,y0,x1,y1,...]（不含旋转，旋转留待刚体阶段）。
  vertices?: number[];
  // ── REQ-OVERLAP-LAYER：碰撞分层宽相位过滤（Box2D 双向语义位掩码）。缺省 = 全 1（属于/愿碰所有层），
  // 两边都不设 → 与旧行为逐字节一致（零回归）。语义见 overlap-detect 的过滤实现。
  category?: number; // 本碰撞体所属层位掩码
  mask?: number; // 本碰撞体愿与哪些层碰的位掩码
}

// ── bounds-clamp ── 实体允许活动的世界矩形（含边界）。bounds-clamp 据此把 AABB 钳进去。
export interface Bounds extends Component {
  readonly type: 'Bounds';
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ── A2 hierarchy ── 实体挂在谁下面、本地偏移多少
export interface Hierarchy extends Component {
  readonly type: 'Hierarchy';
  parentId: EntityId;
  localX: number;
  localY: number;
  localRotation: number;
  localScaleX: number;
  localScaleY: number;
}

// ── W1 random ── 可控随机数（确定性重放基石），挂在 world 实体
export interface RandomSeed extends Component {
  readonly type: 'RandomSeed';
  seed: number;
  sequence: number;
}

// ── D1 overlap-detect ── 哪两个实体重叠了，法线与穿透深度
export interface Overlap extends Component {
  readonly type: 'Overlap';
  entityA: EntityId;
  entityB: EntityId;
  normalX: number;
  normalY: number;
  depth: number;
}

// ── Collider3D（REQ-3D-Collision · P1）── 3D 逻辑碰撞体（**确定性 sim·进 hash**·非 render-only）。
// 位置：planar 取同实体 2D `Transform`(x→X、y→Z 地面)；垂直/形状全在本组件（baseY/height/radius·进 hash·
// 不依赖 render-only 的 Transform3D）。胶囊限定竖直(Y 轴·角色标准)。trigger=只产重叠事件不推开（触发区/感知）。
export interface Collider3D extends Component {
  readonly type: 'Collider3D';
  kind: 'sphere' | 'box' | 'capsule' | 'hull';
  radius?: number; // sphere / capsule
  halfX?: number; // box 半尺寸
  halfY?: number;
  halfZ?: number;
  height?: number; // capsule 总高（含两端半球·缺省 2*radius）
  // hull（REQ-3D-Collision · P2）：凸多面体 = **预烘焙局部顶点 + 面法线轴**（同 2D `polygon` 套路·
  // 顶点已按需朝向写死成数据·运行时只平移不旋转 → 无 sin/cos·跨机确定）。表达「转过的盒子/斜坡/斜墙」。
  verts?: readonly number[]; // 扁平局部顶点 [x0,y0,z0, x1,y1,z1, …]（绕碰撞体原点·原点= Transform+baseY）
  axes?: readonly number[]; // 扁平**单位**面法线候选分离轴 [nx,ny,nz, …]（盒/OBB=3 轴；运行时再补边叉积轴）
  baseY?: number; // 碰撞体下沿离地高度（缺省 0=坐地）
  offsetX?: number; // planar 相对 Transform 的偏移
  offsetZ?: number;
  trigger?: boolean; // true=触发区（只产 Overlap3D 事件·不参与推开）
}

// ── Overlap3D（REQ-3D-Collision）── 一对重叠的 3D 碰撞体（法线 A→B + 穿透深度）。每帧重算（同 2D Overlap 先例）。
export interface Overlap3D extends Component {
  readonly type: 'Overlap3D';
  entityA: EntityId;
  entityB: EntityId;
  normalX: number;
  normalY: number;
  normalZ: number;
  depth: number;
}

// ── NavMesh（REQ-3D-Nav · owner 2026-06-28 授权 P3D 跨界落·「自动摆放」）── 导航网格**自动烘焙**配置（单例）。
// 摆这个（而非手摆 NavGraph）→ navmesh-bake 能力把范围内 `Collider3D` 障碍栅格化、把可行走格自动织成
// **主程的 `NavGraph`** 喂 `pathfind`。手摆 NavGraph 与自动烘焙**共存**：作者二选一。确定性·NavGraph 进 hash。
// 平面：X=Transform.x、Z=Transform.y（盒庭地面）。作者只填「范围矩形 + 格边长 + 智能体半径」——可走拓扑自动推导。
export interface NavMesh extends Component {
  readonly type: 'NavMesh';
  minX: number; // 烘焙范围（世界 XZ 矩形）
  minZ: number;
  maxX: number;
  maxZ: number;
  cellSize: number; // 栅格边长（越小越精细越慢）
  agentRadius?: number; // 障碍按此膨胀（Minkowski·把智能体当点·缺省 0）
}

// ── ground-sense ── 实体这帧是否站在地面上（marker，存在即着地，每帧由 ground-sense 重算）
export interface Grounded extends Component {
  readonly type: 'Grounded';
}

// ── sensor ── 非实心碰撞体标记（REQ-002）。挂了它的实体仍参与 overlap-detect/trigger-zone（感知），
// 但 collision-resolve **跳过**含它的接触对（不做物理推开）。开关/压力板/触发区 = Sensor，玩家能站进去。
export interface Sensor extends Component {
  readonly type: 'Sensor';
}

// ── trigger-zone ── 触发事件：实体 other 进入了触发区 zone（每帧重算，read-then-consume 或每帧清重标）。
export interface Trigger extends Component {
  readonly type: 'Trigger';
  zone: EntityId;
  other: EntityId;
}

// ── zone-occupancy ── 声明式区域占据目标：区内匹配目标达数量阈值 → 置 outFlag（REQ-006，下沉 coop-goal）。
// 把「胜负/通关/到达/区域占据/收集齐」表达成纯数据，不写游戏专属系统。判实体中心点是否落入世界矩形。
export interface Zone extends Component {
  readonly type: 'Zone';
  outFlag: string; // 满足时置 true、否则 false 的 Flag id（按 id 全局定位）
  minX: number;
  minY: number;
  maxX: number;
  maxY: number; // 世界矩形（含边界）
  requiredTag?: number; // 选择器A：只数 Tag.flags 含此位的实体（位与非零即匹配）
  requiredEntities?: EntityId[]; // 选择器B：指定实体名单（与 requiredTag 二选一；都缺=所有带 Transform 的实体）
  count?: number; // 数量阈值。Tag/全体模式缺省=1；entities 模式缺省=名单长度（全部在内）
}

// ── W2 spatial-query ── 空间查询服务配置，挂在 world 实体
export interface SpatialIndex extends Component {
  readonly type: 'SpatialIndex';
  cellSize: number;
  kind: 'grid' | 'quadtree';
}

// ── tilemap ── 瓦片地图（地图=数据：二维数组 + tileset assetKey；引擎=瓦片碰撞 + 渲染两台通用解释器）。
// 瓦片不是实体、不进 tick；只在碰撞时被查询、被渲染器画。一个 collides 层里**非零**瓦片=实心(mass0 静态体)，
// 0=空/可通行。多层分工：floor(不挡)/walls(挡)/decoration(不挡)。瓦片在世界里的位置：左上角 (originX,originY)，
// 瓦片 (c,r) 覆盖世界 [originX+c*tileSize, +tileSize) × [originY+r*tileSize, +tileSize)。
// 这是 Hades 式拼接的"房间"积木：一份 Tilemap = 一个房间；dungeon 能力(后)按种子拼多份。
export interface TileLayer {
  name: string; // 'floor' | 'walls' | 'decoration' | …
  data: number[]; // 长 cols*rows，row-major，0=空，>0=tileId（tileset 里第几格，1-based）
  collides: boolean; // 该层非零瓦片是否实心（参与瓦片碰撞）
  tileset: string; // 图块集 assetKey（R9；渲染器据 tileId 算源矩形）
}
export interface Tilemap extends Component {
  readonly type: 'Tilemap';
  cols: number; // 横向格数
  rows: number; // 纵向格数
  tileSize: number; // 每格像素
  originX: number; // 瓦片 (0,0) 左上角的世界 x（房间可放任意位置 → Hades 拼接）
  originY: number;
  layers: TileLayer[];
}

// ── pathfind（REQ-寻路·确定性 sim·进 hash）── 连续自由空间寻路：航点图 NavGraph（摆放数据）+ A*（引擎）+ 沿路跟随。
// 与 grid-move（六格离散）对偶：此为**连续坐标自由空间**（2D 现用·维度无关·将来升 3D 加 z 即可）。
// 「航点图 = 摆放并行数据，寻路算法 = 引擎确定性解释器」（宪法对齐·同 hex「站位=数据/A*=代码」）。
// 静态可走性 = 作者只在可走处连边（或对接 tilemap 实心瓦片）；动态避让 = 既有 collision-resolve 在 nav 定速后
// 推开（**正交**·nav 写 Velocity → motion-apply 积分 → overlap/collision-resolve 分离·零新碰撞代码·复用）。
export interface NavGraph extends Component {
  readonly type: 'NavGraph';
  nodes: Array<{ x: number; y: number }>;                 // 航点世界坐标（下标即节点 id）。摆放数据·最弱 LLM 也能填。
  edges: Array<{ a: number; b: number; cost?: number }>;  // 连边（节点下标·无向）；cost 缺省 = 两端 Euclidean 距离。
}

// ── NavAgent ── 沿 NavGraph 走向 Relation(target) 的移动意图（写 Velocity·被 motion-apply 积分·受碰撞介入）。
// 复用 aggro 写的 Relation(target)（同 steering/grid-move 索敌接缝·零新目标概念）。无目标/被 CC → 停。
export interface NavAgent extends Component {
  readonly type: 'NavAgent';
  speed: number;            // 移动速度（写入 Velocity 模长·单位/tick）
  arriveRange: number;      // 到终点此距离内即停
  waypointRange?: number;   // 到当前航点此距离内即推进下一航点（缺省 = max(speed, arriveRange)·防抖/防一拍一停）
  repathPeriod?: number;    // 每多少 tick 强制重算路径（缺省 30）；目标显著移动（> arriveRange）也会触发重算
  haltStatusMask?: number;  // 自身 Status 含这些位时停（冻结/眩晕 CC·同 Steering/GridMover.haltStatusMask）
}

// ── flow-field（REQ-FLOWFIELD·群体流场寻路·确定性 sim·进 hash）──────────────────────
// 与 pathfind（NavGraph+A*·每单位各算一条路）**成本形状相反**：流场把「怎么走」算成**一张全场共享的表**，
// 铺一次服务全部单位。实测（games/game211/pathfind-scale.bench.test.ts）：500 单位/48×48 图，
// A*-per-agent 首拍 534~619ms、稳态 20~23ms/tick；流场铺一次 1.0~1.1ms、千单位查表 0.075ms/tick。
// ⇒ **单位多、目标少、地图开阔** 用流场；**单位少、各走各的** 用 pathfind。两者并存，不互相替代。
//
// 三遍管线在 `t2-flow-field`：cost field → 多源 Dijkstra 积分场（铺满全图·**无局部极小**，
// 凹形障碍不卡死）→ 每格取积分最小邻格得方向。积分全程**整数**（直走 10/斜走 14）以逐位可复现。
export interface FlowField extends Component {
  readonly type: 'FlowField';
  id: string;                     // 场 id（FlowAgent.fieldId 认领·多阵营/多目标可并存多张）
  cellSize: number;               // 格边长（世界单位）
  originX: number;                // 网格左下角世界 x
  originY: number;                // 网格左下角世界 y
  cols: number;                   // 列数
  rows: number;                   // 行数
  blocked?: readonly number[];    // 行主序 0/1·1=不可走（缺省全可走）
  cost?: readonly number[];       // 行主序 ≥1 的地形代价（缺省全 1·公路 1/沼泽 3·非整数向上取整）
  goals: ReadonlyArray<{ x: number; y: number }>;  // **多源**：多个占领点一次铺完，单位各走向最近的那个
  los?: boolean;                  // 视线直指优化（M2·M1 未实现·摆了会在 trace 里留痕）
}

// ── FlowAgent ── 按 fieldId 查流场方向 → 写 Velocity（被 motion-apply 积分·受碰撞/分离介入）。
// ⚠ **与 Steering 同挂时不是"正交叠加"**（首版文档这么写，独立复查实测证伪，现按实况改口）：
// 本系统**绝对写** Velocity（`v.vx = 方向 × speed`），且定序上排在 steering 之后（runsAfter），
// 于是同一实体同挂 FlowAgent + Steering 时，**steering 那一拍的输出会被整段覆盖**（含它的 separation 斥力）。
// M1 的正确用法二选一：① 走位交给流场、拥挤交给别的手段（碰撞/collision-resolve 本来就在 motion 之后介入）；
// ② 要 seek+separation 就别挂 FlowAgent。真正的「流场定基速 + 分离叠加」需要本系统支持"叠加写"语义，
// 那是后续分期的活（已记在 REQ-FLOWFIELD 单里），**别靠同挂碰运气**。
export interface FlowAgent extends Component {
  readonly type: 'FlowAgent';
  fieldId: string;          // 认领哪张 FlowField
  speed: number;            // 移动速度（写入 Velocity 模长·单位/tick·同 Steering.speed 口径）
  arriveRange?: number;     // 到最近 goal 此距离内即停（缺省 0）
  haltStatusMask?: number;  // 自身 Status 含这些位时停（同 Steering/NavAgent.haltStatusMask）
  /**
   * **软分离**（owner 2026-08-24 定方向：「用分离力做·soft force·流场力一定是最重要的」）。
   * 缺省无 = 一个字节不变（零回归）。`weight` = 斥力相对流场的权重，**恒被钳在流场之下**
   * （见 `t2-flow-field` 的 `SEP_MAX_WEIGHT`），所以队伍永远朝目标走、只是互相让开一点。
   *
   * ⚠ 它**不保证不重叠**——那是 `collision-resolve` 在移动之后的活。这里只提供「把堆开的力」，
   * 允许瞬时重叠（owner 原话：「不是说一定它们每一帧都完全不会重叠，而是有一个力会把它们弹开」）。
   * 实测量级：同一个 5v5 迎面对穿场景里最近两心距 0.056~0.128（半径和 0.70）——**软就是这个意思**。
   *
   * ⚠ **只在同一张场内生效**（按 `fieldId` 找邻居）。两队各跟一张场时**互相不推**——
   * 这是 M1 的既有语义；ORCA 落地时曾被顺手改成"按网格几何"，因为那改的是既有世界的轨迹
   * （lockstep / 存档回放会分叉）被独立复查打回，现已逐位复原。要跨阵营互推 → 用 `orca`
   * （它按几何找邻居，跨场可见），或另提工单把这条做成显式开关。
   */
  separation?: {
    weight: number;         // 0..1 建议 0.2~0.5（越大越散·超过 SEP_MAX_WEIGHT 会被钳）
  };
  /**
   * **ORCA 硬避让**（owner 2026-08-24 拍板「可以上」·移植自 RVO2·Apache-2.0）。
   * 与 `separation` 二选一（同时填 → ORCA 优先，另一个被忽略并留痕）：
   * · `separation` = **软**：允许瞬时重叠，靠力弹开，便宜、观感"涌流"。
   * · `orca`       = **强得多**：每单位解一个二维线性规划，取"最接近期望速度的可行速度"。
   * 两者都**不改走位**——流场方向仍是期望速度。
   *
   * ⚠ **别把它当成"保证不碰"**（首版文档这么写，独立复查实测打掉）：那句话的前提是
   * 线性规划**有可行解**，而人一多、迎面对撞时经常没有，落到「最不违反」就是真的压进去。
   * 实测（5v5 迎面对穿·半径和 0.70·整队起始位置扫一族·**中场对撞段**）：
   * 纯流场 0.047~0.100（直接对穿）· 软分离 0.061~0.128 · **ORCA 0.644~0.701**。
   * 即：把穿模从 ~90% 压到**最坏 8%**，不是 0，且最坏点在**中场**（不是终点拥挤）。
   * 要"绝对不许穿模"→ 还得叠 `collision-resolve`。
   *
   * ⚠ **`timeHorizon` 是活旋钮，而且非单调**（三复查实测·别当成固定边界）：同场景扫下来
   * 中场最差 H8 0.644 → H12 0.651 → **H16 0.692** → H20 0.686 → H24 0.682，看着 16 更好；
   * 但**终点段会塌**：H12 只有 0.318、H20 只有 0.169（H8/H16 是 0.700）。
   * 所以调它必须**中场与终点一起量**，且要在你自己的场景上量——缺省 8 是"两段都不塌"的保守选择。
   *
   * **三条降级都会在 DebugTrace 留痕**（挂上 `DebugTrace` 跑一遍就看得到「ORCA 降级：…」）：
   * ① **邻居不还礼**（纯流场/软分离单位）→ 我独自让满，但对方没有半径可言（按 0 计）。
   *    ⚠ 这一档**没有下界**：1v1 慢速迎面实测 0.603（半径和 0.60）看着不错，但 2v2 就 0.505、
   *    3v3 只有 0.187，慢 ORCA 对快纯流场 0.165——对方速度不受任何约束，谈不上保证。
   *    混装部队要干净的不穿模 ⇒ **让双方都开 ORCA**。
   * ② **参数非法**（`radius`/`timeHorizon` ≤0 或 NaN·`maxNeighbors` <1）→ 当作没开 ORCA。
   * ③ **无可行解** → 落 LP3「最不违反」，那一拍就是会压进去（次数会记进 trace）。
   */
  orca?: {
    /**
     * ⚠ **多个单位走向同一个目标点时必须配 `arriveRange`**，且**光配还不够**：不给的话它们会
     * 一直往那个点里挤，线性规划无可行解、落到「尽量少撞」⇒ 真的压进去（实测 5 个单位挤一个点，
     * 最近两心距 0.198 而半径和 0.70）。**配了也只是缓解**——同场景把速度提到 0.8 仍压到 0.180
     * （速度越高，一拍冲进去的距离越大，而 ORCA 只约束速度不约束位置）。
     * **这不是避让算法的锅**：一个点容不下五个人，得给它们一圈能停的地方（`arriveRange` 够大）。
     */
    radius: number;          // 本单位的碰撞半径（世界单位·必须 >0）
    timeHorizon?: number;    // 前瞻多少拍（**缺省 8**·越大越早让、越礼貌·必须 >0）
    maxNeighbors?: number;   // 最多考虑几个邻居（缺省 8·按距离取最近的·必须 ≥1·封顶=最坏情况可算）
  };
}

// ── NavPath ── 引擎写的缓存路径（确定性派生·进 hash）。via=待经节点下标序；gx/gy=规划所据目标点；age=自上次重算 tick。
export interface NavPath extends Component {
  readonly type: 'NavPath';
  via: number[];   // 剩余待经航点（节点下标·按序·整数进 hash）
  gx: number;      // 规划时的目标点 x（检测目标移动 → 触发重算）
  gy: number;      // 规划时的目标点 y
  age: number;     // 自上次重算的 tick 数（配 repathPeriod）
}
