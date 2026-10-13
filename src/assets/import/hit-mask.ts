import { decodePng } from './png-decode.js';
import { parseHitMaskSpec, type HitMaskSpec } from '@engine/protocol/hit-mask.js';

/** Authoring-only PNG→玩法二值遮罩烘焙；输出可直接放入 AssetIndex hit-mask.spec。 */
export function bakeHitMaskFromPng(bytes: Uint8Array, sourceTextureKey: string, threshold: number): HitMaskSpec {
  const image = decodePng(bytes);
  return bakeHitMaskFromRgba(image.w, image.h, image.px, sourceTextureKey, threshold);
}

/** 无 I/O 版本，供导入管线和单测复用。alpha >= threshold 视为实心。 */
export function bakeHitMaskFromRgba(
  width: number, height: number, rgba: Uint8Array, sourceTextureKey: string, threshold: number,
): HitMaskSpec {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > 4096 || height > 4096 || width * height > 1_000_000
    || rgba.length !== width * height * 4 || !Number.isInteger(threshold) || threshold < 1 || threshold > 255)
    throw new Error('hit-mask bake: 尺寸、RGBA 长度或阈值非法');
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) row += rgba[(y * width + x) * 4 + 3] >= threshold ? '1' : '0';
    rows.push(row);
  }
  const mask = parseHitMaskSpec({ version: 1, width, height, threshold, sourceTextureKey, rows });
  if (!mask) throw new Error('hit-mask bake: 产物不合合同');
  return mask;
}
