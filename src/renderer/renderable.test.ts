import { describe, it, expect } from 'vitest';
import { screenToWorld, chooseRenderMode, resolveRotation2D, spriteAnchorOffset, planSpriteDraw } from './renderable.js';
import type { CameraView, Renderable } from './renderable.js';
import type { Shape, Sprite, Text, FaceDir } from '@engine/protocol/components.js';

describe('screenToWorld — 屏幕→世界逆投影（Q5）', () => {
  const cam: CameraView = { centerX: 100, centerY: 50, zoom: 2 };
  const W = 640;
  const H = 400;

  it('视口中心 → 相机中心', () => {
    expect(screenToWorld(W / 2, H / 2, cam, W, H)).toEqual({ x: 100, y: 50 });
  });

  it('是渲染投影的逆：world→screen→world 还原', () => {
    const wx = 220;
    const wy = -30;
    // 正向投影（与 CanvasRenderer 一致）：screen = (world-center)*zoom + 画布中心
    const sx = (wx - cam.centerX) * cam.zoom + W / 2;
    const sy = (wy - cam.centerY) * cam.zoom + H / 2;
    expect(screenToWorld(sx, sy, cam, W, H)).toEqual({ x: wx, y: wy });
  });

  it('无相机 → 屏幕即世界', () => {
    expect(screenToWorld(12, 34, null, W, H)).toEqual({ x: 12, y: 34 });
  });
});

describe('chooseRenderMode — Sprite 优先盖过 Shape（REQ-005）', () => {
  const base: Renderable = { entityId: 'e', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, zOrder: 0 };
  const shape: Shape = { type: 'Shape', kind: 'box', width: 30, height: 30 };
  const sprite: Sprite = { type: 'Sprite', textureKey: 'hero', anchorX: 0.5, anchorY: 0.5, zOrder: 0 };
  const text: Text = { type: 'Text', content: 'hi', fontSize: 16, fontFamily: 'serif', anchor: 'left', lineSpacing: 4 };

  it('可碰撞实体（Shape+Sprite）贴图就绪 → 画 Sprite（穿皮，不再被 Shape 盖）', () => {
    expect(chooseRenderMode({ ...base, shape, sprite }, true)).toBe('sprite');
  });

  it('Shape+Sprite 但贴图未就绪 → 退化画 Shape 几何（碰撞体可视化）', () => {
    expect(chooseRenderMode({ ...base, shape, sprite }, false)).toBe('shape');
  });

  it('仅 Sprite 且未就绪 → 占位方块', () => {
    expect(chooseRenderMode({ ...base, sprite }, false)).toBe('placeholder');
  });

  it('仅 Shape → 几何；文本实体 → 文本优先；空 → none', () => {
    expect(chooseRenderMode({ ...base, shape }, false)).toBe('shape');
    expect(chooseRenderMode({ ...base, text, shape }, false)).toBe('text');
    expect(chooseRenderMode({ ...base }, false)).toBe('none');
  });
});

describe('resolveRotation2D — FaceDir → 视觉旋转角（REQ-FACE-ROTATE，2D 渲染路径，render-only atan2）', () => {
  const base: Renderable = { entityId: 'e', x: 0, y: 0, rotation: 0.42, scaleX: 1, scaleY: 1, zOrder: 0 };

  it('无 FaceDir → 照旧用 Transform.rotation（零回归）', () => {
    expect(resolveRotation2D(base)).toBe(0.42);
  });

  it('有 FaceDir → atan2(y,x)，覆盖 Transform.rotation', () => {
    const diag: FaceDir = { type: 'FaceDir', x: Math.SQRT1_2, y: Math.SQRT1_2 }; // 斜 45°
    expect(resolveRotation2D({ ...base, faceDir: diag })).toBeCloseTo(Math.PI / 4, 9);
  });

  it('FaceDir 指向左(-1,0) → atan2 = π（不是被 Transform.rotation 顶替）', () => {
    const left: FaceDir = { type: 'FaceDir', x: -1, y: 0 };
    expect(resolveRotation2D({ ...base, faceDir: left })).toBeCloseTo(Math.PI, 9);
  });
});

// ── 回归（engine-review-2026-08-04 §5「2D 渲染」P1 · owner 2026-08-05 派工 item④）──────────
// `a-sprite` 能力卡明写「anchorX/Y 是 0~1 锚点·渲染层读取此组件绘制」，但 2D 后端曾把绘制偏移
// 写死 `-sw/2, -sh/2`（永远居中）、anchorX/Y 从未被消费 → **按文档写了却静默失效**：
// 作者写 anchorY:1 想让角色脚踩地面，画面纹丝不动且零报错。
describe('spriteAnchorOffset — Sprite 锚点真被消费（契约兑现）', () => {
  const spr = (anchorX: number, anchorY: number): Sprite =>
    ({ type: 'Sprite', textureKey: 't', anchorX, anchorY, zOrder: 0 } as Sprite);

  it('缺省 0.5/0.5 = 居中，与旧式 -sw/2 逐位等价（现有游戏零回归）', () => {
    expect(spriteAnchorOffset(spr(0.5, 0.5), 32, 48)).toEqual({ dx: -16, dy: -24 });
    expect(spriteAnchorOffset(undefined, 32, 48)).toEqual({ dx: -16, dy: -24 });
  });

  it('anchorY=1 → 贴图底边对齐实体位置（角色"脚踩地面"·最常用的非缺省值）', () => {
    expect(spriteAnchorOffset(spr(0.5, 1), 32, 48)).toEqual({ dx: -16, dy: -48 });
  });

  it('anchor 0/0 → 左上角对齐实体位置', () => {
    expect(spriteAnchorOffset(spr(0, 0), 32, 48)).toEqual({ dx: -0, dy: -0 });
  });

  it('坏数据（NaN/undefined 字段）退回 0.5，不把贴图甩出画面', () => {
    expect(spriteAnchorOffset(spr(NaN, NaN), 32, 48)).toEqual({ dx: -16, dy: -24 });
  });
});

describe('planSpriteDraw — 通用 Sprite 目标框等比投影', () => {
  const sprite = (extra: Partial<Sprite>): Sprite => ({ type: 'Sprite', textureKey: 't', anchorX: 0.5, anchorY: 0.5, zOrder: 0, ...extra });

  it('新字段全省略 → 原生 source/destination 与旧路径逐参数一致', () => {
    expect(planSpriteDraw(sprite({}), { sx: 7, sy: 11, sw: 80, sh: 120 })).toEqual({
      source: { x: 7, y: 11, width: 80, height: 120 },
      destination: { x: -40, y: -60, width: 80, height: 120 },
    });
  });

  it('横图进竖框 cover：居中裁左右并铺满目标框', () => {
    expect(planSpriteDraw(sprite({ width: 100, height: 200, fit: 'cover' }), { sx: 10, sy: 20, sw: 400, sh: 200 })).toEqual({
      source: { x: 160, y: 20, width: 100, height: 200 },
      destination: { x: -50, y: -100, width: 100, height: 200 },
    });
  });

  it('竖图进竖框 cover：同宽高比时保留完整源图', () => {
    expect(planSpriteDraw(sprite({ width: 100, height: 200, fit: 'cover' }), { sx: 10, sy: 20, sw: 100, sh: 200 })).toEqual({
      source: { x: 10, y: 20, width: 100, height: 200 },
      destination: { x: -50, y: -100, width: 100, height: 200 },
    });
  });

  it('contain：完整源图在目标框居中，剩余区域保持透明', () => {
    expect(planSpriteDraw(sprite({ width: 100, height: 200, fit: 'contain' }), { sx: 0, sy: 0, sw: 400, sh: 200 })).toEqual({
      source: { x: 0, y: 0, width: 400, height: 200 },
      destination: { x: -50, y: -25, width: 100, height: 50 },
    });
  });

  it('非中心 anchor 锚定最终目标框，而非 contain 后的图像尺寸', () => {
    expect(planSpriteDraw(sprite({ anchorX: 1, anchorY: 1, width: 100, height: 200, fit: 'contain' }), { sx: 0, sy: 0, sw: 400, sh: 200 }).destination)
      .toEqual({ x: -100, y: -125, width: 100, height: 50 });
  });

  it('atlas Frame source rect 是 cover/contain 的唯一采样边界', () => {
    const source = { sx: 100, sy: 50, sw: 400, sh: 200 };
    expect(planSpriteDraw(sprite({ width: 100, height: 200, fit: 'cover' }), source).source).toEqual({ x: 250, y: 50, width: 100, height: 200 });
    expect(planSpriteDraw(sprite({ width: 100, height: 200, fit: 'contain' }), source).source).toEqual({ x: 100, y: 50, width: 400, height: 200 });
  });

  it('多实例只返回新 plan，不共享可变 source/destination 状态', () => {
    const first = planSpriteDraw(sprite({ width: 100, height: 200, fit: 'cover' }), { sx: 0, sy: 0, sw: 400, sh: 200 });
    const second = planSpriteDraw(sprite({ width: 200, height: 100, fit: 'contain' }), { sx: 20, sy: 30, sw: 100, sh: 400 });
    expect(first).not.toBe(second);
    expect(first.source).not.toBe(second.source);
    expect(first.destination).not.toBe(second.destination);
    expect(first).toEqual({ source: { x: 150, y: 0, width: 100, height: 200 }, destination: { x: -50, y: -100, width: 100, height: 200 } });
  });
});
