import type { WorldSnapshot } from '@engine/core/types.js';

// ═══════════════════════════════════════════════════════════════
//  确定性守卫 — 世界状态指纹
// ═══════════════════════════════════════════════════════════════
//
//  对快照做"规范化序列化"(实体id/组件类型/字段名全部排序) 再求 FNV-1a 哈希。
//  关键性质：状态相同 → 哈希必然相同，**与插入顺序无关**。因此可以安全地
//  比较两个各自独立构建的对端世界——这正是 lockstep 检测 desync 的基础。
// ═══════════════════════════════════════════════════════════════

export function hashSnapshot(snap: WorldSnapshot): string {
  return fnv1a(canonical(snap));
}

// 存档指纹（REQ-SAVEORDER）：order（实体创建序 = restore 后的 query 序，见 World.snapshotOrder）
// 并入指纹。order 缺席时**严格退化为 hashSnapshot**——旧档的 hash 语义原样保留（兼容）；
// order 在场时任何篡改（改序/增删/整段剥除）都使指纹不符 → fail-closed。
// 为什么并入而不旁挂独立 order 指纹：旁挂的挡不住「连 order 带旁挂指纹一起删」的剥除攻击
// ——那会静默退回键序语义（正是 snapshotOrder 注释里那个极难定位的 desync 源）；
// 并入唯一被无条件校验的主 hash，剥除本身就成为可检出的篡改。
export function hashWithOrder(snap: WorldSnapshot, order: readonly string[] | undefined): string {
  if (order === undefined) return hashSnapshot(snap);
  // 分隔段里 order 项走 JSON.stringify：id 内含分隔符也伪造不出结构（同 stableValue 对字符串的口径）。
  return fnv1a(`${canonical(snap)};;order=${order.map((id) => JSON.stringify(id)).join(',')}`);
}

// 纯表现/可由表现层重算的组件不进哈希：它们含浮点（zoom/offset），跨端 JIT/FMA 可能 1 ULP 漂移，
// 若纳入校验会误判 desync（Gemini Q2）。Camera 即此类——逻辑不读它，渲染期每帧由 camera-follow 重算。
// 名单靠手维护，拼错一个名字即静默失效（多算→误报 desync，少算→假绿）。
// determinism.test.ts 用运行时组件全集（component-universe.gen.ts·build-component-map.mjs 生成）
// 对账，保证每一项都是真实组件名。
// Mesh3D/Coachmark 的组件契约（render.ts）明写「绝不进 hash」，故必须在此排除——
// 二者曾漏登记，是潜伏雷：任何人按契约在渲染侧改它们，lockstep 立刻误报 desync。
// IntentInbox（t2-intent-barrier·REQ-111-AINPC）同理但理由更硬：它装的是「哪个 NPC 的异步回包先到」，
// 即纯粹的**本地网络事实**。进 hash 等于把网络抖动焊进指纹，两端必然分叉；而门的确定性产出
// （IntentBarrier.resolved·按 npcId 升序）照常进 hash，该被校验的一点没少。
export const NON_DETERMINISTIC = new Set<string>(['Camera','Camera3D', 'Mesh3D', 'Coachmark', 'Transform3D', 'Sky3D', 'Model3D', 'AnimState3D', 'Anim3D', 'Pivot3D', 'Light3D', 'Post3D', 'Fog3D', 'Material3D', 'Vfx3D', 'Trail3D', 'Line3D', 'Decal3D', 'Path3D', 'Billboard3D', 'WorldUI3D', 'Diegetic3D', 'RigidBody3D', 'Impulse3D', 'Joint3D', 'Glow3D', 'Pickable3D', 'ScoreTrace', 'DebugTrace', 'PhysicsWorld3D', 'Reflector3D', 'Vfx2D', 'IntentInbox']);

// 键位转义（2026-08-22 测试大扫除实证修复）：实体id/组件名/字段名/嵌套键此前裸拼进 canonical——
// id 含分隔符即可伪造结构 → 两个不同状态同 hash（desync/存档篡改假绿·实证碰撞见 determinism.test.ts
// 「键位转义」回归钉；SAVEORDER 当年记档的「裸拼碰撞面」即此，数据驱动世界里 id 由数据侧生成，
// 分隔符入 id 属可达事故而非攻击）。修法=键**含该层结构字符才** JSON.stringify：干净键原样 →
// 全库既有数据 canonical 逐字节不变（prefab id 的 #/: 不在平层触发集内）·旧档 hash 兼容（golden 锚在测）；
// 引号起头的歧义由触发集含 " 封死——raw 键永不含引号、escaped 键必以引号起头，两空间不相交。
const FLAT_KEY_UNSAFE = /["\\|;,=]/; //  平层结构字符：| ; , = （+ " \ 封引号/转义歧义）
const NESTED_KEY_UNSAFE = /["\\:,{}[\]]/; // 嵌套层结构字符：: , { } [ ]
const escFlat = (s: string): string => (FLAT_KEY_UNSAFE.test(s) ? JSON.stringify(s) : s);
const escNested = (s: string): string => (NESTED_KEY_UNSAFE.test(s) ? JSON.stringify(s) : s);

function canonical(snap: WorldSnapshot): string {
  const parts: string[] = [];
  for (const entityId of Object.keys(snap).sort()) {
    const frag = canonicalEntity(entityId, Object.entries(snap[entityId]));
    if (frag) parts.push(frag);
  }
  return parts.join(';');
}

/**
 * 一个实体的规范片段（P2c 增量 hash 的缓存单元）：组件按类型名升序、字段升序、跳过 NON_DETERMINISTIC 与 undefined。
 * 全世界的 canonical = 各实体片段按实体 id 升序用 ';' 相连（空片段跳过）——与旧全量实现**逐字节相同**。
 * 接受 `[type, comp]` 迭代（快照对象或 World 活 Map 皆可·不克隆）。
 */
export function canonicalEntity(entityId: string, comps: Iterable<[string, unknown]>): string {
  const types: Array<[string, Record<string, unknown>]> = [];
  for (const [type, comp] of comps) if (!NON_DETERMINISTIC.has(type)) types.push([type, comp as Record<string, unknown>]);
  types.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const parts: string[] = [];
  for (const [type, comp] of types) {
    const fields = Object.keys(comp)
      .filter((k) => comp[k] !== undefined) // undefined 字段 ≡ 缺席：不进 hash，防「写 field=undefined」的 writer 跨端分裂
      .sort()
      .map((k) => `${escFlat(k)}=${stableValue(comp[k])}`);
    parts.push(`${escFlat(entityId)}|${escFlat(type)}|${fields.join(',')}`);
  }
  return parts.join(';');
}

/** FNV-1a 32 位（导出给增量 hasher·同一实现）。 */
export function fnv1aHex(str: string): string {
  return fnv1a(str);
}

function stableValue(v: unknown): string {
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v); // -0 与 0 视为同
  if (typeof v === 'string') return JSON.stringify(v); // 加引号+转义：值内的分隔符(, = | ; { })不再能伪造结构 → 防两个不同状态 hash 碰撞（desync 假绿）
  if (v === null || typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.map(stableValue).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${escNested(k)}:${stableValue(o[k])}`)
    .join(',')}}`;
}

// FNV-1a 32-bit → 8 位十六进制。纯整数运算，跨机一致。
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
