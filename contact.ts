import type { Transform, Shape } from '@engine/protocol/components.js';
import type { Aabb } from './aabb-tree.js';
import { capsuleOf, capsuleContact } from './capsule.js';

// 接触几何：两形状的分离法线与穿透深度（法线从 A 指向 B）。无重叠返回 null。
// overlap-detect（检测）与 collision-resolve（迭代解算）共用同一份几何，确保检测与解算一致。
// box/circle 走解析式（逐位不变）；polygon（含 box 当多边形）走 SAT 分离轴。
// 全部只用 +−×÷/sqrt/min/max（IEEE 确定）—— 不含 hypot/sin/cos，跨机器确定（无旋转）。

export interface Contact {
  nx: number;
  ny: number;
  depth: number;
}
interface Vec {
  x: number;
  y: number;
}

export function halfExtents(s: Shape): { hw: number; hh: number } {
  if (s.kind === 'circle') {
    const r = s.radius ?? 0;
    return { hw: r, hh: r };
  }
  return { hw: (s.width ?? 0) / 2, hh: (s.height ?? 0) / 2 };
}

// 形状的世界顶点（box→4 角；polygon→局部顶点 + 平移）。circle 不走此函数。
function worldVertices(t: Transform, s: Shape): Vec[] {
  if (s.kind === 'cone') {
    const r = s.radius ?? 0, half = (s.angle ?? Math.PI / 3) / 2, n = 12;
    const out: Vec[] = [{ x: t.x, y: t.y }];
    for (let i = 0; i <= n; i++) { const a = t.rotation + -half + (2 * half * i / n); out.push({ x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r }); }
    return out;
  }
  if (s.kind === 'polygon') {
    const v = s.vertices ?? [];
    const out: Vec[] = [];
    for (let i = 0; i + 1 < v.length; i += 2) out.push({ x: t.x + v[i], y: t.y + v[i + 1] });
    return out;
  }
  const { hw, hh } = halfExtents(s);
  return [
    { x: t.x - hw, y: t.y - hh },
    { x: t.x + hw, y: t.y - hh },
    { x: t.x + hw, y: t.y + hh },
    { x: t.x - hw, y: t.y + hh },
  ];
}

// 实体的轴对齐包围盒（宽相位树用，形状无关）。
export function aabbOf(t: Transform, s: Shape): Aabb {
  if (s.kind === 'capsule') {
    const c = capsuleOf(t,s), r=c.radius;
    return { minX:Math.min(c.a.x,c.b.x)-r,minY:Math.min(c.a.y,c.b.y)-r,maxX:Math.max(c.a.x,c.b.x)+r,maxY:Math.max(c.a.y,c.b.y)+r };
  }
  if (s.kind === 'polygon') {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of worldVertices(t, s)) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }
  if (s.kind === 'cone') {
    const v = worldVertices(t, s); let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const p of v) { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
    return {minX,minY,maxX,maxY};
  }
  const { hw, hh } = halfExtents(s);
  return { minX: t.x - hw, minY: t.y - hh, maxX: t.x + hw, maxY: t.y + hh };
}

// ── SAT 辅助 ──
function edgeNormals(verts: Vec[]): Vec[] {
  const out: Vec[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len === 0) continue;
    out.push({ x: ey / len, y: -ex / len }); // 边的单位法线
  }
  return out;
}
function projectVerts(verts: Vec[], ax: Vec): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of verts) {
    const d = v.x * ax.x + v.y * ax.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}
function centroid(verts: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const v of verts) {
    x += v.x;
    y += v.y;
  }
  return { x: x / verts.length, y: y / verts.length };
}

// 两凸多边形 SAT：返回最小穿透轴法线（定向 A→B）+ 深度；存在分离轴则 null。
function satPolyPoly(va: Vec[], vb: Vec[]): Contact | null {
  let minOverlap = Infinity;
  let nx = 0;
  let ny = 0;
  for (const ax of [...edgeNormals(va), ...edgeNormals(vb)]) {
    const pa = projectVerts(va, ax);
    const pb = projectVerts(vb, ax);
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (overlap <= 0) return null; // 分离轴 → 不重叠
    if (overlap < minOverlap) {
      minOverlap = overlap;
      nx = ax.x;
      ny = ax.y;
    }
  }
  const ca = centroid(va);
  const cb = centroid(vb);
  if (nx * (cb.x - ca.x) + ny * (cb.y - ca.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny, depth: minOverlap };
}

// 凸多边形 vs 圆：轴 = 多边形边法线 + (最近顶点→圆心)。返回法线 polygon→circle + 深度。
function satPolyCircle(verts: Vec[], cx: number, cy: number, r: number): Contact | null {
  const axes = edgeNormals(verts);
  let closest = verts[0];
  let bestD2 = Infinity;
  for (const v of verts) {
    const dx = cx - v.x;
    const dy = cy - v.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      closest = v;
    }
  }
  const a0x = cx - closest.x;
  const a0y = cy - closest.y;
  const len = Math.sqrt(a0x * a0x + a0y * a0y);
  if (len > 0) axes.push({ x: a0x / len, y: a0y / len });

  let minOverlap = Infinity;
  let nx = 0;
  let ny = 0;
  for (const ax of axes) {
    const pp = projectVerts(verts, ax);
    const c = cx * ax.x + cy * ax.y;
    const overlap = Math.min(pp.max, c + r) - Math.max(pp.min, c - r);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      nx = ax.x;
      ny = ax.y;
    }
  }
  const cen = centroid(verts);
  if (nx * (cx - cen.x) + ny * (cy - cen.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny, depth: minOverlap };
}

// 原有解析接触（box-box / circle-circle / box-circle），保持逐位不变。
function analyticContact(at: Transform, as: Shape, bt: Transform, bs: Shape): Contact | null {
  const dx = bt.x - at.x;
  const dy = bt.y - at.y;

  if (as.kind === 'box' && bs.kind === 'box') {
    const a = halfExtents(as);
    const b = halfExtents(bs);
    const ox = a.hw + b.hw - Math.abs(dx);
    const oy = a.hh + b.hh - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return null;
    if (ox < oy) return { nx: dx < 0 ? -1 : 1, ny: 0, depth: ox };
    return { nx: 0, ny: dy < 0 ? -1 : 1, depth: oy };
  }

  if (as.kind === 'circle' && bs.kind === 'circle') {
    const ar = as.radius ?? 0;
    const br = bs.radius ?? 0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const pen = ar + br - dist;
    if (pen <= 0) return null;
    if (dist === 0) return { nx: 1, ny: 0, depth: pen };
    return { nx: dx / dist, ny: dy / dist, depth: pen };
  }

  // box vs circle（任意顺序）；sign 把法线统一回 A→B
  const aIsBox = as.kind === 'box';
  const boxT = aIsBox ? at : bt;
  const boxS = aIsBox ? as : bs;
  const cirT = aIsBox ? bt : at;
  const cirS = aIsBox ? bs : as;
  const sign = aIsBox ? 1 : -1;

  const bh = halfExtents(boxS);
  const r = cirS.radius ?? 0;
  const cdx = cirT.x - boxT.x;
  const cdy = cirT.y - boxT.y;
  const closestX = Math.max(-bh.hw, Math.min(cdx, bh.hw));
  const closestY = Math.max(-bh.hh, Math.min(cdy, bh.hh));
  const ddx = cdx - closestX;
  const ddy = cdy - closestY;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy);
  const pen = r - dist;
  if (pen <= 0) return null;
  if (dist === 0) return { nx: sign, ny: 0, depth: pen };
  return { nx: (ddx / dist) * sign, ny: (ddy / dist) * sign, depth: pen };
}

export function contactBetween(at: Transform, as: Shape, bt: Transform, bs: Shape): Contact | null {
  if (as.kind === 'capsule' || bs.kind === 'capsule') {
    const first=as.kind==='capsule', ct=first?at:bt, cs=first?as:bs, ot=first?bt:at, os=first?bs:as;
    const other=os.kind==='capsule'?capsuleOf(ot,os):os.kind==='circle'?{a:{x:ot.x,y:ot.y},b:{x:ot.x,y:ot.y},radius:os.radius??0}:worldVertices(ot,os);
    const c=capsuleContact(capsuleOf(ct,cs),other);
    return !c||first?c:{nx:-c.nx,ny:-c.ny,depth:c.depth};
  }
  const aPoly = as.kind === 'polygon' || as.kind === 'cone';
  const bPoly = bs.kind === 'polygon' || bs.kind === 'cone';

  // 无多边形 → 原解析路径，逐位不变。
  if (!aPoly && !bPoly) return analyticContact(at, as, bt, bs);

  // 至少一方多边形：
  if (as.kind === 'circle' || bs.kind === 'circle') {
    const polyIsA = aPoly;
    const polyT = polyIsA ? at : bt;
    const polyS = polyIsA ? as : bs;
    const cirT = polyIsA ? bt : at;
    const cirS = polyIsA ? bs : as;
    const c = satPolyCircle(worldVertices(polyT, polyS), cirT.x, cirT.y, cirS.radius ?? 0); // polygon→circle
    if (!c) return null;
    return polyIsA ? c : { nx: -c.nx, ny: -c.ny, depth: c.depth }; // 统一成 A→B
  }
  // 多边形 vs 多边形/盒（box 当 4 顶点多边形）
  return satPolyPoly(worldVertices(at, as), worldVertices(bt, bs));
}
