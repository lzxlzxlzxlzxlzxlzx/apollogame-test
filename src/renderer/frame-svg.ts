import type { IWorld } from '@engine/core/types.js';
import { capsuleOf } from '@engine/spatial/capsule.js';
import { collectRenderables, getCameraView, chooseRenderMode } from './renderable.js';
import { faceDown } from './three-projection.js';

// ═══════════════════════════════════════════════════════════════
//  frame-svg —— 把世界投影成一帧 SVG 的「无头截图」（复用纯函数 collectRenderables，无 DOM/GL）。
//
//  为什么 SVG 不 PNG：node 无 GL 上下文跑不了真 WebGL/canvas 截图；SVG 投影则**确定、可版本控制、
//  浏览器直接看、可文本 diff**——天然适合无头视觉回归。game-d/f/g 各自的 render-frame 脚本本是这段
//  投影的重复，此处收敛为引擎级单一实现（可视作 ascii/canvas/three 之外的「SVG 后端」）。
//
//  坐标取 2 位小数（跨端 1-ULP 漂移被吸收，golden 不抖）。游戏可选传 resolveSprite 把贴图换成内嵌矢量。
// ═══════════════════════════════════════════════════════════════

export interface FrameSvgOptions {
  width?: number;
  height?: number;
  background?: string;
  title?: string;
  // sprite → SVG 片段（如内嵌矢量立绘）；缺省/返回 undefined → 占位方块。
  resolveSprite?: (textureKey: string, frameIndex?: number) => string | undefined;
}

const hex = (tint: number): string => `#${(tint & 0xffffff).toString(16).padStart(6, '0')}`;
const esc = (s: string): string => s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
const n = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const placeholder = (x: number, y: number): string =>
  `<rect x="${n(x - 8)}" y="${n(y - 8)}" width="16" height="16" rx="3" fill="#566" stroke="#9ab"/>`;

export function frameSvg(world: IWorld, opts: FrameSvgOptions = {}): string {
  const W = opts.width ?? 1280;
  const H = opts.height ?? 720;
  const bg = opts.background ?? '#0c0a08';
  const cam = getCameraView(world);
  const cx = cam?.centerX ?? 0;
  const cy = cam?.centerY ?? 0;
  const zoom = cam?.zoom ?? 1;

  let body = '';
  for (const r of collectRenderables(world)) {
    // 3D 物件（Mesh3D）：无头看帧用正交投影——画朝镜头那面（翻面感知：rotation 过临界则反面色），golden 可 diff。
    if (r.mesh3d) {
      const m = r.mesh3d;
      const face = faceDown(r.rotation) ? m.backTint ?? m.frontTint : m.frontTint;
      body += `<rect x="${n(r.x - m.width / 2)}" y="${n(r.y - m.height / 2)}" width="${n(m.width)}" height="${n(m.height)}" rx="2" fill="${hex(face)}" stroke="${hex(m.edgeTint ?? 0x1f2937)}"/>`;
      continue;
    }
    const fill = r.color ? hex(r.color.tint) : '#e2e8f0';
    const snip = r.sprite && opts.resolveSprite ? opts.resolveSprite(r.sprite.textureKey, r.frame?.index) : undefined;
    const mode = chooseRenderMode(r, !!snip);
    if (mode === 'text' && r.text) {
      const tx = r.text;
      tx.content.split('\n').forEach((ln, i) => {
        body += `<text x="${n(r.x)}" y="${n(r.y + i * (tx.fontSize + 1))}" font-family="sans-serif" font-size="${tx.fontSize}" fill="${fill}" text-anchor="middle">${esc(ln)}</text>`;
      });
    } else if (mode === 'sprite') {
      body += `<g transform="translate(${n(r.x)},${n(r.y)})">${snip}</g>`;
    } else if (mode === 'shape' && r.shape?.kind === 'capsule') {
      const c=capsuleOf(r,r.shape);
      body += `<line x1="${n(c.a.x)}" y1="${n(c.a.y)}" x2="${n(c.b.x)}" y2="${n(c.b.y)}" stroke="${fill}" stroke-width="${n(c.radius*2)}" stroke-linecap="round"/>`;
    } else if (mode === 'shape' && r.shape?.kind === 'circle') {
      body += `<circle cx="${n(r.x)}" cy="${n(r.y)}" r="${n(r.shape.radius ?? 4)}" fill="${fill}"/>`;
    } else if (mode === 'shape' && r.shape?.kind === 'box') {
      const w = r.shape.width ?? 8;
      const h = r.shape.height ?? 8;
      body += `<rect x="${n(r.x - w / 2)}" y="${n(r.y - h / 2)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`;
    } else if (mode === 'shape' && r.shape?.kind === 'polygon' && r.shape.vertices) {
      const v = r.shape.vertices;
      const pts: string[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push(`${n(r.x + v[i])},${n(r.y + v[i + 1])}`);
      body += `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
    } else if (mode === 'placeholder') {
      body += placeholder(r.x, r.y);
    }
  }

  const titleEl = opts.title
    ? `<text x="12" y="24" font-family="system-ui" font-size="13" fill="#cbd5e1">${esc(opts.title)}</text>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${bg}"/>` +
    `<g transform="translate(${W / 2},${H / 2}) scale(${n(zoom)}) translate(${n(-cx)},${n(-cy)})">${body}</g>` +
    titleEl +
    `</svg>`
  );
}
