// ═══════════════════════════════════════════════════════════════
//  engine/math/geom2 —— 二维几何小件（engine-base-tier-review-2026-09-06 §6 补齐 · owner 2026-09-08「补齐再列」）
//
//  线段相交 / 点在多边形内 / 点到线段距离 / 射线打 AABB / 射线打圆。都是标准工具箱件，此前本仓没有
//  （spatial-query 宣传的射线未实现）。规矩同全库 sim 面：只用 + − × ÷ sqrt 与比较，零 trig，逐位可复现。
//  多边形顶点一律扁平数组 [x0,y0,x1,y1,…]（与 Shape.vertices / Collider3D.verts 同形）。
// ═══════════════════════════════════════════════════════════════

/** 线段 (ax,ay)-(bx,by) 与 (cx,cy)-(dx,dy) 是否相交（含端点·平行共线按重叠判）。 */
export function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (d2 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true;
  if (d3 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (d4 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true;
  return false;
}

/** 线段交点参数：返回 t（沿 a→b 的比例·[0,1]）或 undefined（不交/平行）。交点 = a + (b−a)*t。 */
export function segmentIntersectT(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number | undefined {
  const rx = bx - ax; const ry = by - ay;
  const sx = dx - cx; const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (den === 0) return undefined;
  const qx = cx - ax; const qy = cy - ay;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}

/** 点 (px,py) 是否在多边形内（射线法·边上视为内·顶点扁平 [x0,y0,…]·任意简单多边形）。 */
export function pointInPolygon(px: number, py: number, verts: readonly number[]): boolean {
  const n = verts.length >> 1;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i * 2]; const yi = verts[i * 2 + 1];
    const xj = verts[j * 2]; const yj = verts[j * 2 + 1];
    if (onSegment(xi, yi, xj, yj, px, py) && orient(xi, yi, xj, yj, px, py) === 0) return true;
    if ((yi > py) !== (yj > py)) {
      const x = xi + ((py - yi) * (xj - xi)) / (yj - yi);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

/** 点到线段的最近距离平方（无 sqrt）。 */
export function pointSegmentDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax; const vy = by - ay;
  const wx = px - ax; const wy = py - ay;
  const vv = vx * vx + vy * vy;
  let t = vv === 0 ? 0 : (wx * vx + wy * vy) / vv;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + vx * t - px;
  const cy = ay + vy * t - py;
  return cx * cx + cy * cy;
}

/**
 * 射线打轴对齐盒（slab 法）：起点 (ox,oy)、方向 (dx,dy)（不必单位化）、盒 [minX,maxX]×[minY,maxY]。
 * 返回最近命中的 t（≥0·交点 = o + d*t）；不命中 → undefined。起点在盒内 → 0。
 */
export function raycastAabb(ox: number, oy: number, dx: number, dy: number, minX: number, minY: number, maxX: number, maxY: number): number | undefined {
  let tmin = 0;
  let tmax = Infinity;
  if (dx === 0) { if (ox < minX || ox > maxX) return undefined; } else {
    let t1 = (minX - ox) / dx; let t2 = (maxX - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return undefined;
  }
  if (dy === 0) { if (oy < minY || oy > maxY) return undefined; } else {
    let t1 = (minY - oy) / dy; let t2 = (maxY - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return undefined;
  }
  return tmin;
}

/** 射线打圆：返回最近命中 t（≥0）；不命中 → undefined；起点在圆内 → 0。 */
export function raycastCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number | undefined {
  const fx = ox - cx; const fy = oy - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return undefined;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return undefined;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  if (t1 >= 0) return t1;
  const t2 = (-b + sq) / (2 * a);
  return t2 >= 0 ? t2 : undefined;
}

// ── 内部 ──
function orient(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);
}
