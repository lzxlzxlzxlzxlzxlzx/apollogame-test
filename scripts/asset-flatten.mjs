// asset-flatten —— 把透明底精灵 PNG 压成**不透明** albedo（3D 贴面用）。
// 缘起：透明底字形/精灵直接作 Material3D.map，opaque 材质无 alpha 路→透明像素渲黑
// （见 renderer buildPbrMaterial）。此工具 = asset-matte 的**反操作**（matte:去背→透明；flatten:透明→压不透明底）。
// 纯 Node·零依赖（复用 asset-matte 的 PNG 编解码）；确定性（同输入逐字节一致）。
//
// 合成顺序（source-over）：纯色底 bg → 叠可选 base 图（如象牙牌面 front.png）→ 叠 glyph → 全不透明。
// 用法：
//   单张   node scripts/asset-flatten.mjs <in.png> [--base <base.png>] [--bg '#faf4e4'] [--out <out.png>] [--json]
//   批目录 node scripts/asset-flatten.mjs --batch-dir <dir> --base <base.png> [--bg '#faf4e4'] [--keep a.png,b.png] [--reindex assets/index.json] [--dry]
//          （批模式：目录内**透明**PNG 逐张压底覆写；base 自身与 --keep 名单跳过；不透明图跳过。--reindex 给了则回填对应条目 provenance.flattened）
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePngRGBA } from './asset-matte.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// 透明像素占比（alpha<128）——判「需不需要压底」。
export function transparentPct(img) {
  let t = 0;
  for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] < 128) t++;
  return t / (img.rgba.length / 4);
}

// source-over：把 src 叠到 dst（dst 视为已不透明底·输出全不透明）。同尺寸。就地写 dst 返回之。
export function compositeOver(dst, src) {
  if (dst.w !== src.w || dst.h !== src.h) throw new Error(`尺寸不一致: ${dst.w}x${dst.h} vs ${src.w}x${src.h}`);
  const D = dst.rgba, S = src.rgba;
  for (let i = 0; i < D.length; i += 4) {
    const a = S[i + 3] / 255;
    D[i] = Math.round(S[i] * a + D[i] * (1 - a));
    D[i + 1] = Math.round(S[i + 1] * a + D[i + 1] * (1 - a));
    D[i + 2] = Math.round(S[i + 2] * a + D[i + 2] * (1 - a));
    D[i + 3] = 255;
  }
  return dst;
}

// 造纯色不透明底。
export function solidCanvas(w, h, rgb) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = rgb[0]; rgba[i + 1] = rgb[1]; rgba[i + 2] = rgb[2]; rgba[i + 3] = 255; }
  return { w, h, rgba };
}

// glyph（透明底）→ 不透明 albedo：纯色底 → [base 图] → glyph。
export function flatten(glyph, { base = null, bg = [250, 244, 228] } = {}) {
  const canvas = solidCanvas(glyph.w, glyph.h, bg);
  if (base) compositeOver(canvas, base);
  compositeOver(canvas, glyph);
  return canvas;
}

export function flattenFile(inPath, { basePath = null, bg = '#faf4e4', outPath = null } = {}) {
  const glyph = decodePng(readFileSync(inPath));
  const before = transparentPct(glyph);
  const base = basePath ? decodePng(readFileSync(basePath)) : null;
  const out = flatten(glyph, { base, bg: hexToRgb(bg) });
  const dest = outPath ?? inPath;
  writeFileSync(dest, encodePngRGBA(out.w, out.h, out.rgba));
  return { out: dest, w: out.w, h: out.h, transparentBefore: +before.toFixed(4), transparentAfter: +transparentPct(out).toFixed(4), base: basePath ? basename(basePath) : null, bg };
}

function main() {
  const a = process.argv.slice(2);
  const flag = (n, d = null) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const bg = flag('--bg', '#faf4e4');
  const basePath = flag('--base');
  const json = a.includes('--json');
  const dry = a.includes('--dry');
  const batchDir = flag('--batch-dir');

  if (batchDir) {
    const dir = join(ROOT, batchDir).startsWith(ROOT) && existsSync(batchDir) ? batchDir : join(ROOT, batchDir);
    const keep = new Set((flag('--keep', '') || '').split(',').filter(Boolean));
    if (basePath) keep.add(basename(basePath));
    const reindex = flag('--reindex');
    const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
    const done = [];
    for (const f of files) {
      if (keep.has(f)) continue;
      const img = decodePng(readFileSync(join(dir, f)));
      if (transparentPct(img) < 0.1) continue; // 已不透明→跳过（幂等）
      if (dry) { done.push(f); continue; }
      const r = flattenFile(join(dir, f), { basePath, bg });
      done.push(f); if (!json) console.log(`  ✓ ${f}  透明 ${(r.transparentBefore * 100).toFixed(0)}%→${(r.transparentAfter * 100).toFixed(0)}%`);
    }
    if (reindex && !dry) {
      const idxFile = join(ROOT, reindex);
      const idx = JSON.parse(readFileSync(idxFile, 'utf8'));
      const doneBases = new Set(done.map((f) => f));
      let n = 0;
      for (const e of idx.assets) {
        if (e.path && doneBases.has(basename(e.path))) {
          e.provenance = { ...(e.provenance || {}), flattened: `composited over ${basename(basePath)} → opaque albedo (bg ${bg})` };
          n++;
        }
      }
      writeFileSync(idxFile, JSON.stringify(idx, null, 2) + '\n');
      if (!json) console.log(`  ↳ 索引回填 provenance.flattened ×${n} → ${reindex}`);
    }
    if (json) console.log(JSON.stringify({ dir: batchDir, base: basePath ? basename(basePath) : null, flattened: done.length, files: done }));
    else console.log(`asset-flatten: 批处理 ${batchDir} · 压底 ${done.length} 张${dry ? '（dry）' : ''}`);
    return;
  }

  const inPath = a.find((x) => !x.startsWith('--') && x.endsWith('.png'));
  if (!inPath) { console.error('用法：asset-flatten.mjs <in.png> [--base b.png] [--bg #hex] [--out o.png] | --batch-dir <dir> --base <b.png>'); process.exit(2); }
  const r = flattenFile(inPath, { basePath, bg, outPath: flag('--out') });
  console.log(json ? JSON.stringify(r) : `✓ ${r.out}  透明 ${(r.transparentBefore * 100).toFixed(1)}%→${(r.transparentAfter * 100).toFixed(1)}%（base=${r.base ?? '无'}·bg=${r.bg}）`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) main();
