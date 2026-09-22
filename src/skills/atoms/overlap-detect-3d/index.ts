import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { Transform, Collider3D, Overlap3D } from '@engine/protocol/components.js';
import { aabb3dOf, aabb3Overlap, contact3d, type Aabb3 } from '@engine/spatial/contact3d.js';

export type { Overlap3D };

// ═══════════════════════════════════════════════════════════════
//  overlap-detect-3d（REQ-3D-Collision · P1）—— 3D 逻辑碰撞检测（确定性 sim·进 hash·rollback 安全）。
//  镜像 2D overlap-detect：每帧重建宽相位 + 精确窄相位 → 为重叠对产 `Overlap3D`（法线 + 深度）。
//  宽相位 P1 用**暴力 N² AABB 剔除**（轻量盒庭几十碰撞体足够·确定性·按 id 升序）；升维 AABB 树是 scale 路。
//  响应（推开/触发处理）是消费者，归组合层（同 2D collision-resolve / trigger 先例）。
// ═══════════════════════════════════════════════════════════════

export const overlapDetect3dCapability = defineCapability({
  id: 'd1-overlap-detect-3d',
  version: '1.0.0',

  describe: {
    name: 'overlap-detect-3d',
    summary: '3D 逻辑碰撞：哪两个 Collider3D 重叠了？法线和穿透深度？（暴力 AABB 宽相位 + 解析窄相位）',
    semantic: ['collision', 'detection', '3d'],
    whenToUse:
      '需要 3D 碰撞事实时（角色 vs 关卡 / 触发区 / 重叠）。每帧从 Transform(2D·进 hash)+Collider3D 重建，为重叠对产 Overlap3D。位置 planar 取 Transform、垂直取 Collider3D（不碰 render-only Transform3D）。每帧重建 → rollback 安全。胶囊限竖直。',
    examples: ['角色撞墙：Overlap3D{A:player,B:wall,法线,深度}', '进触发区：trigger 消费 Overlap3D + Collider3D.trigger', '命中：逻辑读 Overlap3D'],
  },

  config: {},

  components: {
    provides: {
      // C 治理：Collider3D 此前无 provider——本原子是它的读方与契约归属（同 2D overlap-detect 之于 Shape）。
      Collider3D: {
        category: 'config',
        describe: '3D 碰撞体（sphere/box/capsule/hull·胶囊限竖直·hull=预烘焙局部顶点+分离轴·运行时只平移不旋转）。平面位置取 2D Transform，竖直取 baseY。',
        fields: {
          kind: { type: 'string', describe: "'sphere' / 'box' / 'capsule' / 'hull'" },
          radius: { type: 'number', describe: 'sphere / capsule 半径' },
          halfX: { type: 'number', describe: 'box 半尺寸 X' },
          halfY: { type: 'number', describe: 'box 半尺寸 Y' },
          halfZ: { type: 'number', describe: 'box 半尺寸 Z' },
          height: { type: 'number', describe: 'capsule 总高（含两端半球·缺省 2*radius）' },
          verts: { type: 'number[]', describe: 'hull：扁平局部顶点 [x0,y0,z0,…]' },
          axes: { type: 'number[]', describe: 'hull：扁平单位面法线分离轴 [nx,ny,nz,…]' },
          baseY: { type: 'number', describe: '碰撞体下沿离地高度（缺省 0）' },
          offsetX: { type: 'number', describe: '相对 Transform 的平面偏移 X' },
          offsetZ: { type: 'number', describe: '相对 Transform 的平面偏移 Z' },
          trigger: { type: 'boolean', describe: 'true=触发区：只产 Overlap3D 事件·不参与推开' },
        },
      },
      Overlap3D: {
        category: 'event',
        describe: '一对重叠 3D 碰撞体的事实。法线从 A 指向 B，depth 为穿透深度。每帧重算（挂在 overlap3d:<a>:<b>·a<b）。',
        fields: {
          entityA: { type: 'EntityId', describe: '重叠对第一个实体（id 较小）' },
          entityB: { type: 'EntityId', describe: '重叠对第二个实体（id 较大）' },
          normalX: { type: 'number', describe: '分离法线 X（A→B）' },
          normalY: { type: 'number', describe: '分离法线 Y（A→B）' },
          normalZ: { type: 'number', describe: '分离法线 Z（A→B）' },
          depth: { type: 'number', describe: '穿透深度' },
        },
      },
    },
    reads: ['Transform', 'Collider3D'],
    writes: ['Overlap3D'],
    consumes: [],
  },

  systems: [
    {
      id: 'overlap-detect-3d',
      reads: ['Transform', 'Collider3D'],
      writes: ['Overlap3D'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('Overlap3D')) world.destroyEntity(id);

        // 按 id 升序收集（确定性、rollback 安全），预算各自 AABB（宽相位）。
        const ids = sortedIds(world, 'Transform', 'Collider3D');
        const boxes: Aabb3[] = [];
        for (const id of ids) {
          const t = world.getComponent<Transform>(id, 'Transform')!;
          const c = world.getComponent<Collider3D>(id, 'Collider3D')!;
          boxes.push(aabb3dOf(t, c));
        }

        // 宽相位：暴力 N² AABB 剔除（i<j → aId<bId 确定有序）；命中再做精确窄相位。
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            if (!aabb3Overlap(boxes[i]!, boxes[j]!)) continue;
            const aId = ids[i]!, bId = ids[j]!;
            const at = world.getComponent<Transform>(aId, 'Transform')!;
            const ac = world.getComponent<Collider3D>(aId, 'Collider3D')!;
            const bt = world.getComponent<Transform>(bId, 'Transform')!;
            const bc = world.getComponent<Collider3D>(bId, 'Collider3D')!;
            const hit = contact3d(at, ac, bt, bc);
            if (!hit) continue;
            const oid = `overlap3d:${aId}:${bId}`;
            world.createEntity(oid);
            const overlap: Overlap3D = {
              type: 'Overlap3D', entityA: aId, entityB: bId,
              normalX: hit.nx, normalY: hit.ny, normalZ: hit.nz, depth: hit.depth,
            };
            world.addComponent(oid, overlap);
          }
        }
      },
    },
  ],
});
