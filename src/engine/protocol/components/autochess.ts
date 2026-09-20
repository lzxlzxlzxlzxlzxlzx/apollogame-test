// Protocol · 自走棋（六边形棋盘 / 网格移动 + 拖拽 / 托盘 / 落点）─────────────────────────────
// Game F 自走棋的放置 + 移动基底：HexBoard/HexPos/GridMover（A* 网格寻路，SIM 真相住整数 q,r）、
// Draggable/Tray/TraySeat/DropZone（摆子拖拽、备战席落座、出售槽）。布局=数据，寻路算法=引擎(hex.ts)。
import type { Component } from '../../core/types.js';

// ── Draggable（REQ-F-045 摆子拖拽）── 可拖实体标记 + 落点规则。drag-place 系统消费 InputQueue 的
// drag 动作（壳层在 pointerup 时合成 {key:'drag', x:起点世界坐标, values:[终点x,终点y]}）：
// 命中本实体 → 终点落板内（HexBoard）则 snap 六角格写 HexPos+Transform（上场/调位）；落板外则写
// 原始 Transform 并移除 HexPos（回席）。capTagMask/capResource：从板外进板时数「Tag&mask 且带
// HexPos」的在板单位，≥cap 资源值则整次拒绝（场上数≤level 在执行点强制）。onlyFlag：全局 Flag
// 为真才响应（备战期专用门，读上一拍相位——拖拽是人手速操作，一拍不可感知）。
export interface Draggable extends Component {
  readonly type: 'Draggable';
  snap?: 'hex'; // 'hex'=落点吸附棋盘格（写 HexPos+投影 Transform）；缺省=自由落点（只写 Transform）
  onlyFlag?: string; // 全局 Flag id：为真才可拖（如 'in_prep'）
  capTagMask?: number; // 上板限额的计数掩码（与 capResource 成对）
  capResource?: string; // 上板限额资源 id（如 'level'）
  /** Opt-in atomic free deployment. Incompatible with snap. Invalid drops do not write. */
  freePlacement?: {
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    /** Other deployed circles matching this team mask block intersecting drops. Tangency is legal. */
    teamMask: number;
    deployedMask: number;
    /** A drop inside this rectangle withdraws to the instance's fixed bench anchor. */
    bench: { minX: number; maxX: number; minY: number; maxY: number; x: number; y: number };
  };
}

// ── Tray / TraySeat（REQ-F-055 托盘落座）── 「一排槽位」的自动落座/拖拽互换/离座原语。
// 自走棋备战席、手牌排、背包栏的共同形：成员（Tag 含齐 requiredTag 且**无 HexPos**=不在板上）自动
// 落进最小空槽；拖到另一槽=互换（被占）或挪空槽；拖上板（获得 HexPos）=离座让位；落点不在托盘带上
// =弹回原槽（地上不留单位，TFT 语义）。槽位几何 = originX + index*gap（y=originY 一排）。
// TraySeat=运行时落座状态（POD 进 snapshot）；确定性：成员按实体 id 升序处理、空槽取最小下标。
export interface Tray extends Component {
  readonly type: 'Tray';
  originX: number; // 0 号槽世界 x
  originY: number; // 槽排世界 y
  gap: number; // 槽距（px）
  capacity: number; // 槽数（满则新成员顺延排出=已知豁口，入口处由容量资源把门）
  requiredTag: number; // 成员掩码（Tag.flags 含齐；含齐语义同 GroupCount）
}
export interface TraySeat extends Component {
  readonly type: 'TraySeat';
  index: number; // 所在槽下标（0 起）
}

// ── QueueSlots / QueueMember（REQ-POOL-ADVANCE 缺口·compacting 队列）── 与 Tray 的关键区别：Tray
// 只填最小空槽、队首消费后老成员不前移；QueueSlots 每 tick 把当前存活成员**整体压实**成连续 0..N-1
// （队首/中间空出即全体前移，槽间不留空隙——排队叫号/传送带补位的核心形）。位置钉死到槽（瞬时；平滑
// 上浮动画由游戏层 Tween 叠加，不在本能力职责内）。头 headCount 个成员自动挂/摘 Clickable{action}
// （同 Tray 增删 TraySeat 的先例：有则不重加、无则摘）。确定性：成员按既有 QueueMember.index（新成员
// 无则排末尾）+ id 升序 tie-break 稳定排序后重新编号，纯整数运算，无随机无墙钟。
export interface QueueSlots extends Component {
  readonly type: 'QueueSlots';
  memberTag: number; // 成员掩码（Tag.flags 含齐即算成员；语义同 Tray.requiredTag）
  capacity: number; // 声明槽数（当前版本非强制上限——同 Tray 已知豁口注记：真正入队闸门在别处/容量资源把门）
  headCount: number; // 压实后 index < headCount 的成员可点（挂 Clickable），其余摘
  originX: number; // 0 号槽世界 x
  originY: number; // 0 号槽世界 y
  gap: number; // 槽距（px）
  axis?: 'x' | 'y'; // 排布轴向（缺省 'x'：沿 x 展开；'y'：沿 y 展开）
  action: string; // 头部成员 Clickable.action（点击产出的 Signal.name）
}
export interface QueueMember extends Component {
  readonly type: 'QueueMember';
  index: number; // 压实后的槽下标（0 起，系统每 tick 重算写回；POD 进 snapshot）
}

// ── DropZone（REQ-F-058 垃圾桶/出售槽）── 拖放落点区：drag-place 自由落点命中本实体 Shape →
// **替被拖实体"代点"一下**（发 Signal{name: 被拖者 Clickable.action, source: 被拖者}）——
// 「扔进垃圾桶=卖出」零新链路：既有 '@signal-source' 卖出效果原样复用；被拖者无 Clickable 则无事发生。
// 代点绕过 Clickable.onlyFlag 指针门（拖进区=明确意图，与误点防护不冲突）。
export interface DropZone extends Component {
  readonly type: 'DropZone';
}

// ── hex-grid / grid-move（REQ-024）── 六边形棋盘 + 确定性网格寻路（金铲铲/TFT 式自动战斗移动）。
// 棋盘布局/站位 = 数据；寻路算法(A*) = 引擎代码（见 hex.ts 纯函数）。SIM 态住 HexPos(整数 q,r → 进 hash 确定)；
// Transform 由 grid-move 从 HexPos 投影(精确二进制分数 1/2,3/4，跨端无漂移)供渲染/战斗距离(aggro/hitbox 仍读 Transform)。
export interface HexBoard extends Component {
  readonly type: 'HexBoard';
  cols: number; // 棋盘列(0≤q<cols)
  rows: number; // 棋盘行(0≤r<rows)
  tileSize: number; // 每格像素(投影 Transform 用)
  originX: number; // 格(0,0)世界 x
  originY: number;
  // 棋盘布局(REQ-F-027 → REQ-F-037 外审 Q5 升级)。
  // 'axial'(缺省)：矩形区域 0≤q<cols（axial 空间）→ 真投影下呈平行四边形。
  // 'odd-r'(推荐)：错位矩形棋盘——每行 axial q 范围随 −(r>>1) 平移（offset col=q+(r>>1)∈[0,cols)）；
  //   sim 仍严格 axial（距离/邻居/A* 不变），真投影 x=q·ts+r·ts/2 即呈规整矩形+六边形交错，
  //   **几何与拓扑同构**（视觉相邻=逻辑相邻）。摆子用 hex.ts 的 offsetToAxial(col,row) 换算。
  // 'offset'(已废弃)：旧投影错位 (r&1)·ts/2——视觉≠拓扑（每格 6 邻中 1 个投影在 1.5ts 外），
  //   仅为 game-f 迁移窗口保留（inbox F-10），迁完即删。
  // （旧 'offset' 投影错位已随 F-10 迁移完成删除——视觉≠拓扑，外审 Q5。）
  layout?: 'axial' | 'odd-r';
}
// 单位当前所在格(axial 整数)。网格移动的 SIM 真相(进 snapshot/hash)。
export interface HexPos extends Component {
  readonly type: 'HexPos';
  q: number;
  r: number;
}
// 网格移动器：读自身 Relation(target) → A* 求下一格 → 每 period tick 走一格(避被占格、到相邻停)。
// 取代 steering 在网格场景(aggro 仍写目标，grid-move 替算"下一格")。
export interface GridMover extends Component {
  readonly type: 'GridMover';
  period: number; // 每多少 tick 走一格(>=1；控制移动节奏，免每拍瞬移)
  elapsed?: number; // 内部：距上次移动的 tick
  // CC 定身(REQ-F-030，对齐 Steering.haltStatusMask 既有语义)：自身 Status 含这些位 → 本 tick 不走，
  // 且节奏时钟暂停(elapsed 不累计；解控后按剩余节奏恢复，无补步突进)。纯位与，确定性不变。
  haltStatusMask?: number;
  // 射程驻足(REQ-F-060)：与目标 hex 距离 ≤ range 即停走（节奏时钟同 CC 暂停语义）。缺省 1=贴脸
  // （走到相邻，原行为零迁移）。远程/法师=3~4：站在射程外输出，不再贴脸——金铲铲站位语义。
  range?: number;
  // 视觉滑行(REQ-F-034)：设了则 Transform 以恒速 px/tick 逼近 HexPos 格点投影（到点精确贴齐），
  // 缺省不设=逐格瞬移（零迁移）。HexPos 仍是占位/寻路/hash 的 SIM 真相；冻结时滑行一并停（时间静止）。
  glideSpeed?: number;
}
