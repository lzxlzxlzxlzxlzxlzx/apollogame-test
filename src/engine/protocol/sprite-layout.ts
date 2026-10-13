import type { Sprite } from './components/render.js';

// Sprite 原生尺寸、锚点与 cover/contain 的纯数据投影；渲染和玩法命中共同消费。
export function spriteAnchorOffset(sprite: Sprite | undefined, sw: number, sh: number): { dx: number; dy: number } {
  const ax = Number.isFinite(sprite?.anchorX) ? sprite!.anchorX : 0.5;
  const ay = Number.isFinite(sprite?.anchorY) ? sprite!.anchorY : 0.5;
  return { dx: -sw * ax, dy: -sh * ay };
}

export interface SpriteDrawPlan {
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly destination: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export function planSpriteDraw(
  sprite: Sprite | undefined,
  source: { readonly sx: number; readonly sy: number; readonly sw: number; readonly sh: number },
): SpriteDrawPlan {
  const native = {
    source: { x: source.sx, y: source.sy, width: source.sw, height: source.sh },
    destination: (() => {
      const anchor = spriteAnchorOffset(sprite, source.sw, source.sh);
      return { x: anchor.dx, y: anchor.dy, width: source.sw, height: source.sh };
    })(),
  };
  if (!sprite || sprite.width === undefined || sprite.height === undefined || sprite.fit === undefined) return native;

  const targetW = sprite.width;
  const targetH = sprite.height;
  const anchor = spriteAnchorOffset(sprite, targetW, targetH);
  if (sprite.fit === 'cover') {
    const sourceAspect = source.sw / source.sh;
    const targetAspect = targetW / targetH;
    const width = sourceAspect > targetAspect ? source.sh * targetAspect : source.sw;
    const height = sourceAspect > targetAspect ? source.sh : source.sw / targetAspect;
    return {
      source: { x: source.sx + (source.sw - width) / 2, y: source.sy + (source.sh - height) / 2, width, height },
      destination: { x: anchor.dx, y: anchor.dy, width: targetW, height: targetH },
    };
  }
  const scale = Math.min(targetW / source.sw, targetH / source.sh);
  const width = source.sw * scale;
  const height = source.sh * scale;
  return {
    source: { x: source.sx, y: source.sy, width: source.sw, height: source.sh },
    destination: { x: anchor.dx + (targetW - width) / 2, y: anchor.dy + (targetH - height) / 2, width, height },
  };
}
