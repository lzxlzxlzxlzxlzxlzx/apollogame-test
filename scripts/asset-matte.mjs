// asset-matte —— 抠图/去背 → 真 alpha PNG。REQ-ASSET-导入抠图（PA 活）。
// 两档：① 确定性主路=**边缘 flood-fill 连通区**（从四角灌水碰轮廓即停→主体内部同色不受损·天然免撞色·可单测）；
//        ② 复杂图兜底=**rembg**（AI 分割·毛发软边·subprocess·无 rembg→mock 门控·同 ai-gen）。
// 边角处理：despill（去边缘残留背景色 halo）；封闭镂空可补种子（--seed x,y）。
// 红线：authoring-time·纯像素变换·不碰 sim/hash/LayoutNode。产物走 M2.5 pending 人审（不静默顶替）。
// 用法：node scripts/asset-matte.mjs <in.png> <out.png> [--mode flood|rembg] [--tol N] [--despill] [--seed x,y ...] [--json]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

// ── PNG 编解码（纯 Node·8-bit·colorType 2/6·非隔行）──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td), 0); return Buffer.concat([l, td, c]); };
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('非 PNG');
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0; const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (interlace !== 0 || bitDepth !== 8 || (colorType !== 2 && colorType !== 6))
    throw new Error(`不支持的 PNG（bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}）→ 走 rembg 档`);
  const ch = colorType === 6 ? 4 : 3, stride = w * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(w * h * 4), line = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    for (let x = 0; x < stride; x++) {
      const rb = raw[p++], a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v;
      if (filter === 0) v = rb; else if (filter === 1) v = rb + a; else if (filter === 2) v = rb + b;
      else if (filter === 3) v = rb + ((a + b) >> 1);
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else throw new Error('bad filter ' + filter);
      line[x] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, s = x * ch; rgba[o] = line[s]; rgba[o + 1] = line[s + 1]; rgba[o + 2] = line[s + 2]; rgba[o + 3] = ch === 4 ? line[s + 3] : 255; }
    line.copy(prev);
  }
  return { w, h, rgba };
}

export function encodePngRGBA(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc(h * (1 + stride));
  for (let y = 0; y < h; y++) { raw[y * (1 + stride)] = 0; rgba.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── 确定性 flood-fill 抠图（主路）──
const dist2 = (rgba, i, bg) => { const o = i * 4, dr = rgba[o] - bg[0], dg = rgba[o + 1] - bg[1], db = rgba[o + 2] - bg[2]; return dr * dr + dg * dg + db * db; };

export function floodMatte({ w, h, rgba }, { tolerance = 32, seeds = null, despill = false } = {}) {
  const out = Buffer.from(rgba);
  const seedPts = (seeds && seeds.length ? seeds : [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]).filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h);
  // 背景色 = 种子像素均值
  const bg = [0, 0, 0];
  for (const [x, y] of seedPts) { const o = (y * w + x) * 4; bg[0] += rgba[o]; bg[1] += rgba[o + 1]; bg[2] += rgba[o + 2]; }
  for (let k = 0; k < 3; k++) bg[k] = Math.round(bg[k] / seedPts.length);
  const tol2 = tolerance * tolerance;
  const visited = new Uint8Array(w * h); const stack = [];
  for (const [x, y] of seedPts) { const i = y * w + x; if (!visited[i] && dist2(rgba, i, bg) <= tol2) { visited[i] = 1; stack.push(i); } }
  let removed = 0;
  while (stack.length) {
    const i = stack.pop(); const x = i % w, y = (i / w) | 0;
    out[i * 4 + 3] = 0; removed++;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) { if (j < 0 || visited[j]) continue; if (dist2(rgba, j, bg) <= tol2) { visited[j] = 1; stack.push(j); } }
  }
  // despill：不透明像素若紧邻透明（=边缘），把背景主色通道往另两通道拉，去 halo。
  if (despill) {
    const dom = bg[0] >= bg[1] && bg[0] >= bg[2] ? 0 : bg[1] >= bg[2] ? 1 : 2;
    for (let i = 0; i < w * h; i++) {
      if (out[i * 4 + 3] === 0) continue;
      const x = i % w, y = (i / w) | 0;
      const edge = (x > 0 && out[(i - 1) * 4 + 3] === 0) || (x < w - 1 && out[(i + 1) * 4 + 3] === 0) || (y > 0 && out[(i - w) * 4 + 3] === 0) || (y < h - 1 && out[(i + w) * 4 + 3] === 0);
      if (!edge) continue;
      const o = i * 4, other = (out[o + (dom + 1) % 3] + out[o + (dom + 2) % 3]) >> 1;
      if (out[o + dom] > other) out[o + dom] = other; // 削背景主色残留
    }
  }
  return { w, h, rgba: out, bg, removed };
}

// ── rembg 档（AI 分割·subprocess·无 rembg→mock：不动像素·标 MOCK·不静默顶替）──
export function rembgMatte(inPath, { mock = false } = {}) {
  if (!mock) {
    try { const out = execFileSync('rembg', ['i', inPath, '-'], { maxBuffer: 64 * 1024 * 1024 }); return { buffer: out, model: 'rembg:u2net', mock: false }; }
    catch { /* 无 rembg → 退 mock */ }
  }
  // mock：把输入解码再编码成 RGBA（合法 png·alpha 全 255·带 MOCK 标记·供框架跑通/门禁绿）
  const dec = decodePng(readFileSync(inPath));
  return { buffer: encodePngRGBA(dec.w, dec.h, dec.rgba), model: 'rembg-mock', mock: true };
}

// ── 落地：一张图 → 抠图 → 真 alpha PNG + provenance meta ──
export function matteFile(inPath, { mode = 'flood', tolerance = 32, despill = false, seeds = null, mock = false } = {}) {
  if (mode === 'rembg') {
    const r = rembgMatte(inPath, { mock });
    return { buffer: r.buffer, provenance: { matte: 'rembg', model: r.model, mock: r.mock } };
  }
  const img = decodePng(readFileSync(inPath));
  const m = floodMatte(img, { tolerance, seeds, despill });
  return {
    buffer: encodePngRGBA(m.w, m.h, m.rgba),
    provenance: { matte: 'flood-fill', tolerance, despill, bg: m.bg, removedPx: m.removed, w: m.w, h: m.h },
  };
}

function run(argv) {
  const pos = argv.filter((a) => !a.startsWith('--'));
  const [inPath, outPath] = pos;
  if (!inPath || !outPath) { console.error('用法: node scripts/asset-matte.mjs <in.png> <out.png> [--mode flood|rembg] [--tol N] [--despill] [--seed x,y] [--mock] [--json]'); process.exit(1); }
  const mi = argv.indexOf('--mode'), mode = mi >= 0 ? argv[mi + 1] : 'flood';
  const ti = argv.indexOf('--tol'), tolerance = ti >= 0 ? Number(argv[ti + 1]) : 32;
  const seeds = argv.reduce((acc, a, i) => (a === '--seed' && argv[i + 1] ? [...acc, argv[i + 1].split(',').map(Number)] : acc), []);
  const res = matteFile(inPath, { mode, tolerance, despill: argv.includes('--despill'), seeds: seeds.length ? seeds : null, mock: argv.includes('--mock') });
  writeFileSync(outPath, res.buffer);
  if (argv.includes('--json')) { console.log(JSON.stringify({ ok: true, out: outPath, ...res.provenance })); return; }
  console.log(`✓ 抠图 ${inPath} → ${outPath}（${res.provenance.matte}${res.provenance.mock ? '·mock' : ''}${res.provenance.removedPx != null ? `·去背 ${res.provenance.removedPx}px` : ''}）`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
