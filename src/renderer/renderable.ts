import type { IWorld } from '@engine/core/types.js';
export { spriteAnchorOffset, planSpriteDraw } from '@engine/protocol/sprite-layout.js';
export type { SpriteDrawPlan } from '@engine/protocol/sprite-layout.js';
import type { Transform, Transform3D, Shape, Color, Sprite, Text, Visibility, Frame, Mesh3D, Model3D, Material3D, FaceDir } from '@engine/protocol/components.js';

// 相机视图与世界↔屏幕投影已下沉为共享契约（renderer 正向投影 + clickable 逆向命中的单一真相）。
// 此处重导出，保持既有 `@renderer/renderable` 消费者（canvas-renderer / 测试）的 import 不变。
export type { CameraView } from '@engine/protocol/camera-view.js';
export { getCameraView, screenToWorld } from '@engine/protocol/camera-view.js';

// 引擎无关的渲染数据。任何后端（Ascii / Canvas / Phaser / AI 视频）都消费同一份。
export interface Renderable {
  entityId: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  zOrder: number;
  shape?: Shape;
  color?: Color;
  sprite?: Sprite;
  frame?: Frame; // 当前帧索引（序列帧/命名动画用；渲染器据此 resolve(textureKey, frame.index)）
  faceDir?: FaceDir; // 可选「表现层朝向」（REQ-FACE-ROTATE，sim 写的单位方向向量·零 trig）：2D 后端据此算 atan2
  // 覆盖视觉旋转角，见 `resolveRotation2D`；3D 后端不读此字段（不受影响，r.rotation 仍作翻面角原样使用）。
  text?: Text;
  mesh3d?: Mesh3D; // 可选「3D 物件」描述：3D 后端渲成有体积/双面/可翻的 box/plane；2D 后端画其正面（per-object opt-in 3D）
  model3d?: Model3D; // 可选「导入式 3D 模型」(glTF)：3D 后端据 modelKey 取资产解析显示；2D 后端无视（圆润模型，opt-in）
  transform3d?: Transform3D; // 可选「真三维位姿」：3D 后端据此把物体放进 XZ 地面 + Y 高度（盒庭）；2D 后端退化用 x,y 画正面
  material3d?: Material3D; // 可选 PBR 材质预设（TA Phase 5）：3D 后端据此用物理材质渲 Mesh3D；2D 后端无视
}

// 实体绘制模式选择（REQ-005）：**优先 Sprite** —— 有贴图且资产就绪即画贴图（给可碰撞实体"穿皮"，
// 盖过 Shape 几何）；否则退化为 Shape 几何（碰撞体可视化）；仅有 Sprite 但资产未就绪 → 占位方块；都没有 → 不画。
// 抽成纯函数：渲染优先级（曾经 Shape 排在 Sprite 前 → 可碰撞实体显示不了美术皮）可在无 DOM 的 node 环境单测，
// 真正的 drawImage/fillRect 只是后端薄胶水。文本实体仍优先文本（与原行为一致）。
export type RenderMode = 'text' | 'sprite' | 'shape' | 'placeholder' | 'none';
export function chooseRenderMode(r: Renderable, spriteReady: boolean): RenderMode {
  if (r.text) return 'text';
  if (r.sprite && spriteReady) return 'sprite';
  if (r.shape) return 'shape';
  if (r.sprite) return 'placeholder';
  return 'none';
}

// FaceDir → 视觉旋转角（REQ-FACE-ROTATE，**2D 渲染路径专用、render-only**）：sim 侧只写单位方向向量
// （sqrt 归一·零 trig·可安全进 hash，见 skills/tier2/face-rotate.ts）；atan2 跨机不保证逐位一致，绝不能
// 进 sim/hash——这里是它唯一允许出现的地方：每帧重算、不进快照。无 FaceDir → 照旧用 Transform.rotation
// （零回归）。**只供 2D 后端**（CanvasRenderer 等）调用；three-projection/three-renderer 仍直接读
// `r.rotation` 做 Mesh3D 翻面语义，不调用本函数、不受影响（P3D 域零改动）。

// Sprite 锚点 → 绘制偏移（**2D 渲染路径专用、纯函数**·同 resolveRotation2D 的"薄胶水外置"纪律）。
// 锚点语义（能力卡 `a-sprite` 明写「anchorX/Y 是 0~1 锚点·渲染层读取此组件绘制」）：贴图上与实体
// 位置重合的那个点——0.5/0.5=中心（缺省）·0/0=左上·0.5/1=底部中心（角色"脚踩地面"的常用值）。
// 背景：2D 后端曾把偏移写死 `-sw/2, -sh/2`（永远居中），anchorX/Y 从未被消费 → **契约承诺了却静默
// 失效**，按文档写 anchorY:1 画面纹丝不动且零报错（engine-review-2026-08-04 §5「2D 渲染」P1）。
// 缺省 0.5 时结果与旧式 `-sw/2` 逐位等价 → 现有游戏零回归；非有限值（坏数据/NaN）退回 0.5，
// 不让脏数据把贴图甩出画面。
export function resolveRotation2D(r: Renderable): number {
  return r.faceDir ? Math.atan2(r.faceDir.y, r.faceDir.x) : r.rotation;
}

// 从世界提取可渲染项：所有挂 Transform 且未被 Visibility 隐藏的实体，按 zOrder 排序。
// 另收「纯 3D 实体」（只挂 Transform3D·无 2D Transform）：盒庭场景的物体不必再背一个冗余 2D Transform。
export function collectRenderables(world: IWorld): Renderable[] {
  const out: Renderable[] = [];
  const seen = new Set<string>();
  for (const [id] of world.query('Transform')) {
    const visibility = world.getComponent<Visibility>(id, 'Visibility');
    if (visibility && !visibility.visible) continue;
    const t = world.getComponent<Transform>(id, 'Transform')!;
    const sprite = world.getComponent<Sprite>(id, 'Sprite');
    seen.add(id);
    out.push({
      entityId: id,
      x: t.x,
      y: t.y,
      rotation: t.rotation,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      zOrder: sprite?.zOrder ?? 0,
      shape: world.getComponent<Shape>(id, 'Shape'),
      color: world.getComponent<Color>(id, 'Color'),
      sprite,
      frame: world.getComponent<Frame>(id, 'Frame'),
      faceDir: world.getComponent<FaceDir>(id, 'FaceDir'),
      text: world.getComponent<Text>(id, 'Text'),
      mesh3d: world.getComponent<Mesh3D>(id, 'Mesh3D'),
      material3d: world.getComponent<Material3D>(id, 'Material3D'),
      model3d: world.getComponent<Model3D>(id, 'Model3D'),
      transform3d: world.getComponent<Transform3D>(id, 'Transform3D'),
    });
  }
  // 纯 3D 实体（有 Transform3D、无 Transform）：x,y 取 3D 的 (x,y) 作 2D 后端退化位（3D 后端走 transform3d 真位姿）。
  for (const [id] of world.query('Transform3D')) {
    if (seen.has(id)) continue;
    const visibility = world.getComponent<Visibility>(id, 'Visibility');
    if (visibility && !visibility.visible) continue;
    const t3 = world.getComponent<Transform3D>(id, 'Transform3D')!;
    out.push({
      entityId: id,
      x: t3.x,
      y: t3.y,
      rotation: 0,
      scaleX: t3.scale ?? 1,
      scaleY: t3.scale ?? 1,
      zOrder: 0,
      color: world.getComponent<Color>(id, 'Color'),
      mesh3d: world.getComponent<Mesh3D>(id, 'Mesh3D'),
      material3d: world.getComponent<Material3D>(id, 'Material3D'),
      model3d: world.getComponent<Model3D>(id, 'Model3D'),
      transform3d: t3,
    });
  }
  out.sort((a, b) => a.zOrder - b.zOrder);
  return out;
}
