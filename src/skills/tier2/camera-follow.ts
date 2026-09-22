import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { Transform, Camera, Bounds } from '@engine/protocol/components.js';
import { clamp } from '@engine/math/scalar.js';

// camera-follow —— 合作跟随相机（涌现系统：读组件→写组件，产出纯数据，不碰像素）。
//
// 读所有带 CameraTarget 标记的实体的 Transform → 取其 AABB 中点写入 Camera.offsetX/offsetY
// （= 相机在世界里看向的中心点）；按需把所有目标"装进视口"算出贴合 zoom；若相机实体上有 Bounds
// （关卡矩形）则把相机框钳在关卡内（不露界外）。真正的"卷动屏幕"是渲染器读 Camera 施加投影（表现层）。
//
// 确定性：只做 IEEE +/-/*÷ 与 min/max（与物理同类），产出 Camera 这一纯数据组件；offset/zoom
// 不被 Condition 读，无 1 ULP 阈值隐患。相机实体 = 一个挂 Camera(+可选 Bounds) 的实体。
//
// 配置常量：边距与缩放区间。fit zoom = min(viewportW/(w+margin), viewportH/(h+margin))，钳进 [min,max]。
const MARGIN = 80; // 目标包围盒四周留白（世界单位）
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1;

interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function targetsAABB(world: IWorld): AABB | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const [e] of world.query('CameraTarget', 'Transform')) {
    const t = world.getComponent<Transform>(e, 'Transform')!;
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x > maxX) maxX = t.x;
    if (t.y > maxY) maxY = t.y;
    found = true;
  }
  return found ? { minX, minY, maxX, maxY } : null;
}

export const cameraFollowCapability = defineCapability({
  id: 't2-camera-follow',
  version: '1.0.0',

  describe: {
    name: 'camera-follow',
    summary: '读 CameraTarget 标记实体的 Transform → 写 Camera.offset(中点) + zoom(贴合)，可按 Bounds 钳关卡内。',
    semantic: ['tier2', 'camera', 'view'],
    whenToUse:
      '需要相机跟随一个或多个目标（合作相机取中点+动态缩放）时。给目标挂 CameraTarget，给相机实体挂 Camera(+可选 Bounds=关卡矩形)。渲染器据 Camera 做世界→屏幕投影。',
    examples: [
      '双人合作：两角色挂 CameraTarget → 相机取中点、缩放保证都在画面内',
      '单主角跟随：一个 CameraTarget → 相机居中到它',
      '关卡边界：相机实体挂 Bounds → 相机框钳在关卡内不露黑边',
    ],
  },

  components: {
    provides: {
      CameraTarget: {
        category: 'marker',
        describe: '标记该实体为相机跟随目标。存在即被 camera-follow 纳入 AABB 计算。',
        fields: {},
      },
    },
    reads: ['CameraTarget', 'Transform', 'Bounds'],
    writes: ['Camera'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'camera-follow',
      reads: ['CameraTarget', 'Transform', 'Bounds'],
      writes: ['Camera'],
      consumes: [],
      execute(world) {
        const box = targetsAABB(world);
        if (!box) return; // 无目标 → 相机不动

        const cx = (box.minX + box.maxX) / 2;
        const cy = (box.minY + box.maxY) / 2;
        const spanX = box.maxX - box.minX + MARGIN;
        const spanY = box.maxY - box.minY + MARGIN;

        for (const [e] of world.query('Camera')) {
          const cam = world.getComponent<Camera>(e, 'Camera')!;
          // 贴合缩放：让目标包围盒（含留白）装进视口。
          const fit = Math.min(cam.viewportW / spanX, cam.viewportH / spanY);
          const zoom = clamp(fit, MIN_ZOOM, MAX_ZOOM);

          let camX = cx;
          let camY = cy;
          // 若相机实体声明了关卡 Bounds，则把可视框钳进关卡内（视口比关卡小时才钳）。
          const bounds = world.getComponent<Bounds>(e, 'Bounds');
          if (bounds) {
            const halfW = cam.viewportW / (2 * zoom);
            const halfH = cam.viewportH / (2 * zoom);
            if (bounds.maxX - bounds.minX > 2 * halfW) {
              camX = clamp(camX, bounds.minX + halfW, bounds.maxX - halfW);
            } else {
              camX = (bounds.minX + bounds.maxX) / 2;
            }
            if (bounds.maxY - bounds.minY > 2 * halfH) {
              camY = clamp(camY, bounds.minY + halfH, bounds.maxY - halfH);
            } else {
              camY = (bounds.minY + bounds.maxY) / 2;
            }
          }

          cam.zoom = zoom;
          cam.offsetX = camX;
          cam.offsetY = camY;
        }
      },
    },
  ],
});
