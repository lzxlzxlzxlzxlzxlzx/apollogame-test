import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Tilemap, Transform, Shape, Velocity } from '@engine/protocol/components.js';
import { index, cellFloor } from '@engine/math/grid.js';
import { signOr1 } from '@engine/math/scalar.js';

// ═══════════════════════════════════════════════════════════════
//  tilemap —— 瓦片地图：地图=数据（Tilemap 组件：二维数组 + tileset），引擎只加两台通用解释器——
//  本能力的 **tile-collision 系统**（实体 vs 实心瓦片，把动态体推出墙）+ 渲染器画瓦片（在 canvas-renderer）。
//
//  动态体(Transform+Shape(box)+Velocity)每帧被推出所有重叠的实心瓦片（collides 层里非零格 = mass0 静态体）：
//  按最小穿透轴推出 + 清掉撞墙方向的速度。→ 英雄/怪被墙框在房内，战斗发生在真房间而非空地。
//
//  定序：Resolve 相位、runsAfter collision-resolve（实体先互相解算，再统一被墙推出——墙是硬约束，最后赢）。
//    与 collision-resolve 都 RMW Transform/Velocity，显式 runsAfter 打破 RMW 伪环。
//  确定性：整数网格定位 + IEEE 推出（与 collision-resolve 同类），按实体 id、瓦片 (r,c) 序处理 → 录放一致、进 hash。
// ═══════════════════════════════════════════════════════════════

// 取地图单例。
export function findTilemap(world: IWorld): Tilemap | undefined {
  for (const [e] of world.query('Tilemap')) return world.getComponent<Tilemap>(e, 'Tilemap');
  return undefined;
}

// (c,r) 是否实心：任一 collides 层在该格非零即实心。越界视为可通行（靠边界墙瓦片围合）。
export function isSolidTile(tm: Tilemap, c: number, r: number): boolean {
  if (c < 0 || c >= tm.cols || r < 0 || r >= tm.rows) return false;
  const idx = index(c, r, tm.cols);
  for (const layer of tm.layers) {
    if (layer.collides && (layer.data[idx] ?? 0) > 0) return true;
  }
  return false;
}

export const tilemapCapability = defineCapability({
  id: 't2-tilemap',
  version: '1.0.0',

  describe: {
    name: 'tilemap',
    summary: '瓦片地图：Tilemap 组件(数据=二维数组+tileset)；tile-collision 系统把动态体推出实心瓦片(墙)。地图=数据，引擎=通用解释器。',
    semantic: ['tier2', 'tilemap', 'collision', 'level'],
    whenToUse:
      '需要用瓦片搭关卡/房间、且实体不能穿墙时。挂单例 Tilemap{cols,rows,tileSize,originX,originY,layers:[{name,data,collides,tileset}]}；动态体(Transform+Shape+Velocity)自动被实心瓦片挡住。渲染器画瓦片。',
    examples: [
      '地牢房间：floor 层(不挡) + walls 层(border 实心) → 英雄被墙框在房内',
      'Hades 拼接：一份 Tilemap = 一个房间，dungeon 能力按种子拼多份',
      '平台关卡：collides 层画地面/平台瓦片',
    ],
  },

  components: {
    provides: {
      Tilemap: {
        category: 'config',
        describe: '瓦片地图(单例)：cols/rows/tileSize/originX/originY + layers。layer.collides 层非零瓦片=实心。瓦片非实体。',
        fields: {
          cols: { type: 'number', describe: '横向格数' },
          rows: { type: 'number', describe: '纵向格数' },
          tileSize: { type: 'number', describe: '每格像素' },
          originX: { type: 'number', describe: '瓦片(0,0)左上角世界 x' },
          originY: { type: 'number', describe: '瓦片(0,0)左上角世界 y' },
          layers: { type: 'string', describe: 'TileLayer[]（复杂对象数组：{name,data:number[],collides,tileset}）' },
        },
      },
    },
    reads: ['Tilemap', 'Transform', 'Shape', 'Velocity'],
    writes: ['Transform', 'Velocity'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'tile-collision',
      phase: SystemPhase.Resolve,
      runsAfter: ['collision-resolve'],
      reads: ['Tilemap', 'Transform', 'Shape', 'Velocity'],
      writes: ['Transform', 'Velocity'],
      consumes: [],
      execute(world: IWorld) {
        const tm = findTilemap(world);
        if (!tm) return;
        const ts = tm.tileSize;
        const half = ts / 2;

        const ids = sortedIds(world, 'Transform', 'Shape', 'Velocity');
        for (const id of ids) {
          const t = world.getComponent<Transform>(id, 'Transform')!;
          const s = world.getComponent<Shape>(id, 'Shape')!;
          if (s.kind !== 'box') continue; // 暂只解算 box 体
          const v = world.getComponent<Velocity>(id, 'Velocity')!;
          const hw = ((s.width ?? 0) / 2) * Math.abs(t.scaleX);
          const hh = ((s.height ?? 0) / 2) * Math.abs(t.scaleY);

          // 两遍迭代（墙角稳定）。
          for (let iter = 0; iter < 2; iter++) {
            const lo = cellFloor(t.x - hw, t.y - hh, tm.originX, tm.originY, ts);
            const hi = cellFloor(t.x + hw, t.y + hh, tm.originX, tm.originY, ts);
            const minC = lo.col;
            const maxC = hi.col;
            const minR = lo.row;
            const maxR = hi.row;
            for (let r = minR; r <= maxR; r++) {
              for (let c = minC; c <= maxC; c++) {
                if (!isSolidTile(tm, c, r)) continue;
                const tcx = tm.originX + c * ts + half;
                const tcy = tm.originY + r * ts + half;
                const dx = t.x - tcx;
                const dy = t.y - tcy;
                const ox = hw + half - Math.abs(dx);
                const oy = hh + half - Math.abs(dy);
                if (ox <= 0 || oy <= 0) continue; // 未真重叠
                // 沿最小穿透轴推出 + 清撞墙方向速度。
                if (ox < oy) {
                  t.x += signOr1(dx) * ox;
                  if (v.vx * signOr1(dx) < 0) v.vx = 0;
                } else {
                  t.y += signOr1(dy) * oy;
                  if (v.vy * signOr1(dy) < 0) v.vy = 0;
                }
              }
            }
          }
        }
      },
    },
  ],
});
