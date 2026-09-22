import { describe, it, expect } from 'vitest';
import { clamp, clamp01, lerp, invLerp, remap, smoothstep, sign, signOr1, cmpNum, cmpStr, wrap } from './scalar.js';
import { len, len2, dist, dist2, dot, cross, normalize, normalizeInto, inCircle, inBox } from './vec2.js';
import * as grid from './grid.js';

// B-1/B-2 · 底层数学库：① 与被替换的内联式**逐位同值**（迁移零行为变化的依据）② 分叉处分名（sign/signOr1·cellFloor/cellNearest）
// ③ 边界（零向量·NaN·负坐标·越界）。

describe('scalar', () => {
  it('clamp 与两种旧惯用法逐位同值（含 NaN 透传）', () => {
    const samples = [-5, -0, 0, 0.5, 1, 7.25, 99, Infinity, -Infinity, NaN];
    for (const v of samples) {
      const idiomA = Math.max(0, Math.min(10, v));
      const idiomB = v < 0 ? 0 : v > 10 ? 10 : v;
      expect(Object.is(clamp(v, 0, 10), idiomB)).toBe(true);
      // Math.max/min 惯用法把 -0 归一成 +0，三元保留 -0；两者数值相等（规范化 JSON 都写 0·hash 不受影响）。
      if (!Number.isNaN(v)) expect(clamp(v, 0, 10) === idiomA).toBe(true);
    }
    expect(Number.isNaN(clamp(NaN, 0, 1))).toBe(true);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.1)).toBe(0);
  });

  it('lerp 与 tween 内联式同序；invLerp/remap/smoothstep 端点', () => {
    const [a, b, t] = [3.1, 7.9, 0.37];
    expect(lerp(a, b, t)).toBe(a + (b - a) * t);
    expect(invLerp(0, 10, 2.5)).toBe(0.25);
    expect(invLerp(5, 5, 5)).toBe(0);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(2)).toBe(1);
  });

  it('sign = Math.sign；signOr1 对 0 返回 1（tilemap 旧变体·分名不分家）', () => {
    for (const v of [-3, -0, 0, 4, NaN]) expect(sign(v)).toBe(Number.isNaN(v) ? 0 : Math.sign(v) + 0);
    expect(signOr1(0)).toBe(1);
    expect(signOr1(-0.001)).toBe(-1);
    expect(signOr1(2)).toBe(1);
  });

  it('cmpNum/cmpStr 稳定升序；cmpStr 按码点不受 locale 影响；wrap 负数环绕', () => {
    expect([3, 1, 2].sort(cmpNum)).toEqual([1, 2, 3]);
    expect(['b', 'a', 'B'].sort(cmpStr)).toEqual(['B', 'a', 'b']);
    expect(wrap(-1, 5)).toBe(4);
    expect(wrap(7, 5)).toBe(2);
    expect(wrap(5, 5)).toBe(0);
  });
});

describe('vec2', () => {
  it('len/len2/dist/dist2/dot/cross 与内联式逐位同值', () => {
    const [dx, dy] = [3.3, -4.4];
    expect(len(dx, dy)).toBe(Math.sqrt(dx * dx + dy * dy));
    expect(len2(dx, dy)).toBe(dx * dx + dy * dy);
    expect(dist(1, 2, 4, 6)).toBe(5);
    expect(dist2(1, 2, 4, 6)).toBe(25);
    expect(dot(1, 2, 3, 4)).toBe(11);
    expect(cross(1, 0, 0, 1)).toBe(1);
    expect(cross(0, 1, 1, 0)).toBe(-1);
  });

  it('normalize 与内联 (dx/d, dy/d) 同值；零向量 → (0,0) 且返回 false', () => {
    const [dx, dy] = [0.3, 0.4];
    const d = Math.sqrt(dx * dx + dy * dy);
    expect(normalize(dx, dy)).toEqual({ x: dx / d, y: dy / d });
    const out = { x: 9, y: 9 };
    expect(normalizeInto(0, 0, out)).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
    expect(normalizeInto(dx, dy, out)).toBe(true);
    expect(out.x).toBe(dx / d);
  });

  it('inCircle/inBox 含边界·无 sqrt', () => {
    expect(inCircle(3, 4, 0, 0, 5)).toBe(true);
    expect(inCircle(3, 4.01, 0, 0, 5)).toBe(false);
    expect(inBox(2, -1, 0, 0, 2, 1)).toBe(true);
    expect(inBox(2.01, 0, 0, 0, 2, 1)).toBe(false);
  });
});

describe('grid', () => {
  it('index/colOf/rowOf 互逆；indexOrNeg 越界 -1；inBounds', () => {
    for (let i = 0; i < 12; i++) expect(grid.index(grid.colOf(i, 4), grid.rowOf(i, 4), 4)).toBe(i);
    expect(grid.indexOrNeg(3, 2, 4, 3)).toBe(11);
    expect(grid.indexOrNeg(4, 0, 4, 3)).toBe(-1);
    expect(grid.indexOrNeg(0, -1, 4, 3)).toBe(-1);
    expect(grid.inBounds(3, 2, 4, 3)).toBe(true);
    expect(grid.inBounds(4, 2, 4, 3)).toBe(false);
  });

  it('adjacent4 只认四邻（不认斜邻·不跨行绕）', () => {
    expect(grid.adjacent4(5, 6, 4)).toBe(true); // 同行
    expect(grid.adjacent4(5, 9, 4)).toBe(true); // 同列
    expect(grid.adjacent4(5, 10, 4)).toBe(false); // 斜
    expect(grid.adjacent4(3, 4, 4)).toBe(false); // 行尾→下行首：下标相邻但不四邻
  });

  it('cellFloor（origin=左上角·负坐标）与 cellNearest（origin=中心）分名分义', () => {
    expect(grid.cellFloor(-0.5, 31.9, 0, 0, 16)).toEqual({ col: -1, row: 1 });
    expect(grid.cellNearest(-0.5, 31.9, 0, 0, 16)).toEqual({ col: -0, row: 2 });
    // 与旧内联式逐位同值
    const [x, y, ox, oy, s] = [123.7, -45.2, 8, 3, 24];
    expect(grid.cellFloor(x, y, ox, oy, s)).toEqual({ col: Math.floor((x - ox) / s), row: Math.floor((y - oy) / s) });
    expect(grid.cellNearest(x, y, ox, oy, s)).toEqual({ col: Math.round((x - ox) / s), row: Math.round((y - oy) / s) });
  });

  it('cellCenter ↔ cellFloor 互逆；cellOrigin ↔ cellNearest 互逆', () => {
    const c = grid.cellCenter(3, 2, 10, 20, 8);
    expect(grid.cellFloor(c.x, c.y, 10, 20, 8)).toEqual({ col: 3, row: 2 });
    const o = grid.cellOrigin(3, 2, 10, 20, 8);
    expect(grid.cellNearest(o.x, o.y, 10, 20, 8)).toEqual({ col: 3, row: 2 });
  });

  it('forEachNeighbor 越界跳过·顺序确定·可提前终止', () => {
    const seen: number[] = [];
    grid.forEachNeighbor(0, 0, 3, 3, (_c, _r, i) => { seen.push(i); });
    expect(seen).toEqual([1, 3]); // 右、下（左上越界）
    const seen8: number[] = [];
    grid.forEachNeighbor(1, 1, 3, 3, (_c, _r, i) => { seen8.push(i); }, grid.NEIGHBORS8);
    expect(seen8).toEqual([5, 7, 3, 1, 8, 6, 0, 2]);
    const early: number[] = [];
    grid.forEachNeighbor(1, 1, 3, 3, (_c, _r, i) => { early.push(i); return false; });
    expect(early).toEqual([5]);
  });
});
