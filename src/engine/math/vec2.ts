// ═══════════════════════════════════════════════════════════════
//  engine/math/vec2 —— 二维向量（engine-base-tier-review-2026-09-06 §3.2 B-1）
//
//  实证：`Math.sqrt(dx*dx+dy*dy)` 在 tier2/3 写了 27 遍（13 文件），normalize 内联 6 文件，dot/absSq 只在 orca 具名。
//  形态：**分量式**（传 dx,dy 不传对象）为主——热路径零分配、且与既有内联式逐字同序；对象式只给 orca 这类
//  本就用 {x,y} 的算法。规矩同 scalar：只用 + − × ÷ sqrt（IEEE 确定）；**不含 hypot/atan2/sin/cos**。
// ═══════════════════════════════════════════════════════════════

/** 长度平方 dx*dx + dy*dy。 */
export function len2(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

/** 长度 sqrt(dx*dx + dy*dy)（与全库内联式同序·非 hypot）。 */
export function len(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** 两点距离平方。 */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** 两点距离。 */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 点积。 */
export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

/** 二维叉积（行列式）ax*by − ay*bx：正 = b 在 a 逆时针侧。 */
export function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** 单位化：把 (dx,dy) 除以其长度写进 out（长度为 0 → out 置 0,0 并返回 false）。out 复用避免热路径分配。 */
export function normalizeInto(dx: number, dy: number, out: { x: number; y: number }): boolean {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) { out.x = 0; out.y = 0; return false; }
  out.x = dx / d;
  out.y = dy / d;
  return true;
}

/** 单位化（分配一个对象）。零向量 → {0,0}。 */
export function normalize(dx: number, dy: number): { x: number; y: number } {
  const out = { x: 0, y: 0 };
  normalizeInto(dx, dy, out);
  return out;
}

/** 点是否落在以 (cx,cy) 为圆心、r 为半径的圆内（含边）——`dx*dx+dy*dy <= r*r`，无 sqrt。 */
export function inCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 点是否落在以 (cx,cy) 为中心、半宽 hw 半高 hh 的轴对齐盒内（含边）。 */
export function inBox(px: number, py: number, cx: number, cy: number, hw: number, hh: number): boolean {
  return Math.abs(px - cx) <= hw && Math.abs(py - cy) <= hh;
}
