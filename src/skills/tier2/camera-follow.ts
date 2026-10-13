import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { Transform, Camera, Bounds, DebugTrace } from '@engine/protocol/components.js';
import { clamp } from '@engine/math/scalar.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

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

function recordCameraTrace(
  trace: DebugTrace,
  tick: number,
  traceCount: number,
  subject: string,
  kind: 'decision' | 'commit' | 'reject',
  detail: string,
  why?: string,
): number {
  if (traceCount >= 3) return traceCount;
  const what = `${subject} ${detail}`;
  if (kind !== 'commit') {
    for (let i = trace.events.length - 1; i >= 0; i -= 1) {
      const previous = trace.events[i]!;
      if (previous.system !== 'camera-follow' || !previous.what.startsWith(`${subject} `) || previous.kind === 'commit') continue;
      if (previous.kind === kind && previous.what === what && previous.why === why) return traceCount;
      break;
    }
  }
  appendTrace(trace, tick, 'camera-follow', kind, what, why);
  return traceCount + 1;
}

export const cameraFollowCapability = defineCapability({
  id: 't2-camera-follow',
  version: '1.1.0',

  describe: {
    name: 'camera-follow',
    summary: '读 CameraTarget 的 Transform → 写 Camera.offset + fit zoom；可选逐轴屏幕安全区，最终按 Bounds 钳在关卡内。',
    semantic: ['tier2', 'camera', 'view'],
    whenToUse:
      '需要相机跟随一个或多个目标（合作相机取中点+动态缩放）时。给目标挂 CameraTarget，给相机实体挂 Camera(+可选 Bounds=关卡矩形)。followDeadZone 用视口比例声明安全区；省略时保持逐帧居中。渲染器据 Camera 做世界→屏幕投影。',
    examples: [
      '双人合作：两角色挂 CameraTarget → 相机取中点、缩放保证都在画面内',
      '单主角跟随：一个 CameraTarget → 相机居中到它',
      '安全区跟随：followDeadZone={left:0.3,right:0.3,top:0.3,bottom:0.3} → 区内保持、越界逐轴追到边缘',
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
        const trace = findDebugTrace(world);
        let traceCount = 0;
        if (!box) {
          if (trace) recordCameraTrace(trace, trace.tick ?? world.getVersion(), traceCount, '$targets', 'reject', 'camera hold', 'no CameraTarget with Transform');
          return;
        }

        for (const [e] of world.query('Camera')) {
          const cam = world.getComponent<Camera>(e, 'Camera')!;
          const margin = cam.followMargin ?? MARGIN;
          const minZoom = cam.followMinZoom ?? MIN_ZOOM;
          const maxZoom = cam.followMaxZoom ?? MAX_ZOOM;
          const cx = (box.minX + box.maxX) / 2 + (cam.followOffsetX ?? 0);
          const cy = (box.minY + box.maxY) / 2 + (cam.followOffsetY ?? 0);
          const spanX = box.maxX - box.minX + margin;
          const spanY = box.maxY - box.minY + margin;
          // 贴合缩放：让目标包围盒（含留白）装进视口。
          const fit = Math.min(cam.viewportW / spanX, cam.viewportH / spanY);
          const zoom = clamp(fit, minZoom, maxZoom);

          const beforeX = cam.offsetX;
          const beforeY = cam.offsetY;
          const beforeZoom = cam.zoom;
          let camX = cx;
          let camY = cy;
          let xDecision = 'center';
          let yDecision = 'center';
          const deadZone = cam.followDeadZone;
          if (deadZone) {
            const visibleW = cam.viewportW / zoom;
            const visibleH = cam.viewportH / zoom;
            const safeLeft = cam.offsetX - visibleW / 2 + visibleW * deadZone.left;
            const safeRight = cam.offsetX + visibleW / 2 - visibleW * deadZone.right;
            const safeTop = cam.offsetY - visibleH / 2 + visibleH * deadZone.top;
            const safeBottom = cam.offsetY + visibleH / 2 - visibleH * deadZone.bottom;
            if (cx < safeLeft) { camX = cam.offsetX + cx - safeLeft; xDecision = 'left'; }
            else if (cx > safeRight) { camX = cam.offsetX + cx - safeRight; xDecision = 'right'; }
            else { camX = cam.offsetX; xDecision = 'hold'; }
            if (cy < safeTop) { camY = cam.offsetY + cy - safeTop; yDecision = 'top'; }
            else if (cy > safeBottom) { camY = cam.offsetY + cy - safeBottom; yDecision = 'bottom'; }
            else { camY = cam.offsetY; yDecision = 'hold'; }
          }
          let boundsDecision = 'none';
          // 若相机实体声明了关卡 Bounds，则把可视框钳进关卡内（视口比关卡小时才钳）。
          const bounds = world.getComponent<Bounds>(e, 'Bounds');
          if (bounds) {
            const proposedX = camX;
            const proposedY = camY;
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
            const axes = `${camX === proposedX ? '' : 'x'}${camY === proposedY ? '' : 'y'}`;
            if (axes) boundsDecision = axes;
          }

          cam.zoom = zoom;
          cam.offsetX = camX;
          cam.offsetY = camY;
          if (deadZone && trace) {
            const tick = trace.tick ?? world.getVersion();
            if (xDecision !== 'hold' || yDecision !== 'hold' || boundsDecision !== 'none' || beforeZoom !== zoom) {
              traceCount = recordCameraTrace(trace, tick, traceCount, e, 'decision', `dead-zone x=${xDecision} y=${yDecision}`, `focus=${cx},${cy}; bounds=${boundsDecision}`);
            } else if (cx !== beforeX || cy !== beforeY) {
              traceCount = recordCameraTrace(trace, tick, traceCount, e, 'reject', 'camera movement held', `focus=${cx},${cy} remains inside dead-zone`);
            }
            if (beforeX !== camX || beforeY !== camY || beforeZoom !== zoom) {
              traceCount = recordCameraTrace(trace, tick, traceCount, e, 'commit', `Camera=${camX},${camY}@${zoom}`, `was=${beforeX},${beforeY}@${beforeZoom}`);
            }
          }
        }
      },
    },
  ],
});
