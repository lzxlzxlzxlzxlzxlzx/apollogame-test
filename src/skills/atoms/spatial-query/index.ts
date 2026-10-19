import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld, EntityId } from '@engine/core/types.js';
import type { SpatialIndex, Transform, Tag } from '@engine/protocol/components.js';
import { cmpStr } from '@engine/math/scalar.js';
import { len2 } from '@engine/math/vec2.js';

export type { SpatialIndex };

// ═══════════════════════════════════════════════════════════════
//  空间索引（PERF·REQ-SPATIAL-QUERY-INDEX）—— 均匀网格哈希，把 nearestByTag/queryRange 从
//  朴素全实体扫 O(N) 每次（→ aggro/steering 整体 O(N²)）降到 O(邻格实体)/O(标签集)。
//
//  缓存键 = world.getVersion()（world.ts 每 tick() 末 +1 → 一 tick 内恒定·跨 tick 递增）。首次查询
//  时按当下全体 Transform 建两张索引，同 tick 后续查询复用；下一 tick 版本变 → 重建。
//    · 位置网格 posGrid：cellKey → 实体项[]，服务 queryRange（只看查询圆 bbox 覆盖的格）。
//    · 标签位索引 byBit：单个 tag 位 → 实体项[]，服务 nearestByTag（targetTag 通常单位·如 PLAYER 只 1 个 →
//      索敌 O(1)，不再每敌扫全场）。
//  结果与旧全扫**完全一致**（同距离比较 + id 升序 tie-break·同一集合）→ 零行为变更（全量测试守）。
//  确定性：纯算术 + id tie-break·与遍历/构建序无关（lockstep/录放安全·同旧实现纪律）。
//  ⚠ 同 tick 内若在位置变动后再查会读到"本 tick 首次查询时"的快照——game-103 热点 aggro/steering 均在
//   motion-apply 之前查（位置未动），与全扫同帧一致；全量测试（含确定性）验证无回归。
// ═══════════════════════════════════════════════════════════════

const CELL = 96; // 网格单元（≈ 常见分离/索敌半径量级·一次查询触及少数格）
interface Ent { id: EntityId; x: number; y: number; flags: number }
interface Cache { version: number; posGrid: Map<number, Ent[]>; byBit: Map<number, Ent[]> }
const caches = new WeakMap<IWorld, Cache>();
const cellKey = (cx: number, cy: number): number => (cx + 16384) * 100000 + (cy + 16384); // 无碰撞整数键（场地远小于此界）

function indexOf(world: IWorld): Cache {
  const v = world.getVersion();
  // 缓存键 = 根世界（P1a：系统拿到的是各自的 SystemView，若按视图键则每个系统各建一份索引、且建索引时刻
  // 随「哪个系统先查」漂移 → 行为分叉；按 root 键则与改造前「一个世界一份、本 tick 首查时建」逐位同义）。
  const key = world.root ?? world;
  const cur = caches.get(key);
  if (cur && cur.version === v) return cur;
  const posGrid = new Map<number, Ent[]>();
  const byBit = new Map<number, Ent[]>();
  for (const [id] of world.query('Transform')) {
    const t = world.getComponent<Transform>(id, 'Transform')!;
    const tag = world.getComponent<Tag>(id, 'Tag');
    const flags = tag ? tag.flags : 0;
    const e: Ent = { id, x: t.x, y: t.y, flags };
    const k = cellKey(Math.floor(t.x / CELL), Math.floor(t.y / CELL));
    let bucket = posGrid.get(k);
    if (!bucket) posGrid.set(k, (bucket = []));
    bucket.push(e);
    let f = flags;
    while (f) { const bit = f & -f; let arr = byBit.get(bit); if (!arr) byBit.set(bit, (arr = [])); arr.push(e); f ^= bit; }
  }
  const c: Cache = { version: v, posGrid, byBit };
  caches.set(key, c);
  return c;
}

// 按阵营自动索敌：返回离 (x,y) 最近、且 Tag.flags 含 tagMask 的实体（tagMask=0 → 不限阵营）。
// opts.excludeId 排除自己；opts.maxRadius>0 限定视野半径。并列距离按 id 升序 tie-break → 确定性。
export function nearestByTag(
  world: IWorld,
  x: number,
  y: number,
  tagMask: number,
  opts?: { excludeId?: EntityId; maxRadius?: number },
): EntityId | undefined {
  const maxR2 = opts?.maxRadius && opts.maxRadius > 0 ? opts.maxRadius * opts.maxRadius : Infinity;
  const consider = (e: Ent): void => {
    if (e.id === opts?.excludeId) return;
    const dx = e.x - x, dy = e.y - y, d2 = len2(dx, dy);
    if (d2 > maxR2) return;
    if (d2 < bestD2 || (d2 === bestD2 && bestId !== undefined && e.id < bestId)) { bestD2 = d2; bestId = e.id; }
  };
  let bestId: EntityId | undefined;
  let bestD2 = Infinity;
  const idx = indexOf(world);
  if (tagMask) {
    // 标签位索引：只看含 tagMask 任一位的实体（如 PLAYER 只 1 个 → O(1)）。多位=各位并起（重复项 id tie-break 幂等·无需去重）。
    let m = tagMask;
    while (m) { const bit = m & -m; const arr = idx.byBit.get(bit); if (arr) for (const e of arr) consider(e); m ^= bit; }
  } else {
    for (const bucket of idx.posGrid.values()) for (const e of bucket) consider(e); // 不限阵营=全体
  }
  return bestId;
}

// 范围查询：返回 (x,y) 半径 radius 内、拥有 Transform 的实体（网格：只扫查询圆 bbox 覆盖的格）。
export function queryRange(world: IWorld, x: number, y: number, radius: number): EntityId[] {
  const r2 = radius * radius;
  const out: EntityId[] = [];
  const idx = indexOf(world);
  const cx0 = Math.floor((x - radius) / CELL), cx1 = Math.floor((x + radius) / CELL);
  const cy0 = Math.floor((y - radius) / CELL), cy1 = Math.floor((y + radius) / CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const bucket = idx.posGrid.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const e of bucket) { const dx = e.x - x, dy = e.y - y; if (len2(dx, dy) <= r2) out.push(e.id); }
    }
  }
  return out;
}

// 最近邻查询：返回离 (x,y) 最近的 count 个实体（按距离升序），可排除某 id。
export function queryNearest(world: IWorld, x: number, y: number, count: number, excludeId?: EntityId): EntityId[] {
  const scored: Array<{ id: EntityId; d2: number }> = [];
  for (const [id] of world.query('Transform')) {
    if (id === excludeId) continue;
    const t = world.getComponent<Transform>(id, 'Transform')!;
    const dx = t.x - x;
    const dy = t.y - y;
    scored.push({ id, d2: len2(dx, dy) });
  }
  // BUG-005：距离相等按 id 升序 tie-break（与 nearestByTag 一致）→ 不依赖实体构建/遍历序，
  // 两端构建序不同（rejoin/快照恢复后追加实体）也选同一组 → lockstep 不分叉。
  scored.sort((a, b) => a.d2 - b.d2 || cmpStr(a.id, b.id));
  return scored.slice(0, count).map((s) => s.id);
}

export const spatialQueryCapability = defineCapability({
  id: 'w2-spatial-query',
  version: '1.0.0',

  describe: {
    name: 'spatial-query',
    summary: '空间查询服务：范围、最近邻（overlap-detect 回答不了的"A 到 B 之间有什么"）。',
    semantic: ['world-service', 'query'],
    whenToUse:
      'AI 视线、自动索敌、范围技能需要"半径内有谁/最近的 N 个是谁"。SpatialIndex 挂在 world 实体声明服务；系统通过 queryRange / queryNearest 查询。当前为暴力实现，cellSize/kind 为后续网格/四叉树加速预留。',
    examples: ['自动索敌：queryNearest(world, x, y, 1, self)', '范围 AOE：queryRange(world, x, y, 100)', 'AI 警戒：queryRange 判断玩家是否进入视野'],
  },

  components: {
    provides: {
      SpatialIndex: {
        category: 'config',
        describe: '空间查询服务配置。cellSize/kind 为加速结构预留；查询经 queryRange/queryNearest 暴露。',
        fields: {
          cellSize: { type: 'number', describe: '网格单元大小（加速结构用）' },
          kind: { type: 'string', describe: "索引类型：'grid' | 'quadtree'" },
        },
      },
    },
    reads: ['Transform'],
    writes: [],
    consumes: [],
  },

  config: {
    cellSize: { type: 'number', default: 64, describe: '网格单元大小', question: '空间网格单元多大？', ui: { control: 'slider', min: 1, max: 1024, step: 1 } },
    kind: { type: 'select', default: 'grid', describe: '索引类型', question: '用哪种空间索引？', ui: { control: 'chips', options: ['grid', 'quadtree'] } },
  },

  systems: [],
});
