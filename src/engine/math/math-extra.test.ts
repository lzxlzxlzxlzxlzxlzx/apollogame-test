import { describe, it, expect } from 'vitest';
import * as g from './grid.js';
import { segmentsIntersect, segmentIntersectT, pointInPolygon, pointSegmentDist2, raycastAabb, raycastCircle } from './geom2.js';
import { ease, easeIn, easeOut, easeInOut, easeOutBack } from './ease.js';
import { fnv1a32, hashInts, fnvMixInt, FNV_OFFSET } from './hash.js';
import { advanceTimer, everyN, remaining, progress } from './tick.js';

// §6 补齐件：Bresenham/视线/泛洪/连通域 · 线段/多边形/射线 · 缓动 · 哈希 · 计时步进。全部确定性、零 trig。

describe('grid · 直线/视线/泛洪', () => {
  it('bresenhamLine 含两端·对称方向同格集·斜线格数 = max(|dx|,|dy|)+1', () => {
    const a = g.bresenhamLine(0, 0, 5, 2);
    expect(a[0]).toEqual([0, 0]);
    expect(a[a.length - 1]).toEqual([5, 2]);
    expect(a).toHaveLength(6);
    expect(g.bresenhamLine(3, 3, 3, 3)).toEqual([[3, 3]]);
    expect(g.bresenhamLine(0, 0, 0, 4)).toHaveLength(5);
  });

  it('lineOfSight：路径上任一格阻挡即假；起点不算', () => {
    const wall = (c: number, r: number) => c === 2 && r === 1;
    expect(g.lineOfSight(0, 0, 5, 2, wall)).toBe(false);
    expect(g.lineOfSight(0, 0, 5, 0, wall)).toBe(true);
    expect(g.lineOfSight(2, 1, 4, 1, wall)).toBe(true); // 起点是墙也不算
  });

  it('floodFill 四邻确定序·不可通行起点 → 空；connectedComponents 计数', () => {
    // 3x3：中列是墙
    const wall = new Set([1, 4, 7]);
    const pass = (i: number) => !wall.has(i);
    expect(g.floodFill(0, 3, 3, pass)).toEqual([0, 3, 6]);
    expect(g.floodFill(1, 3, 3, pass)).toEqual([]);
    const cc = g.connectedComponents(3, 3, pass);
    expect(cc.count).toBe(2);
    expect(Array.from(cc.label)).toEqual([0, -1, 1, 0, -1, 1, 0, -1, 1]);
    expect(g.floodFill(0, 3, 3, () => true, g.NEIGHBORS8)).toHaveLength(9);
  });
});

describe('geom2', () => {
  it('线段相交：交叉/端点相触/共线重叠为真；平行不交为假；segmentIntersectT 给比例', () => {
    expect(segmentsIntersect(0, 0, 4, 4, 0, 4, 4, 0)).toBe(true);
    expect(segmentsIntersect(0, 0, 2, 2, 2, 2, 4, 0)).toBe(true);
    expect(segmentsIntersect(0, 0, 4, 0, 2, 0, 6, 0)).toBe(true);
    expect(segmentsIntersect(0, 0, 4, 0, 0, 1, 4, 1)).toBe(false);
    expect(segmentIntersectT(0, 0, 4, 4, 0, 4, 4, 0)).toBe(0.5);
    expect(segmentIntersectT(0, 0, 4, 0, 0, 1, 4, 1)).toBeUndefined();
  });

  it('pointInPolygon：内/外/边上/凹多边形', () => {
    const sq = [0, 0, 4, 0, 4, 4, 0, 4];
    expect(pointInPolygon(2, 2, sq)).toBe(true);
    expect(pointInPolygon(5, 2, sq)).toBe(false);
    expect(pointInPolygon(4, 2, sq)).toBe(true); // 边上
    const concave = [0, 0, 6, 0, 6, 6, 3, 2, 0, 6];
    expect(pointInPolygon(3, 5, concave)).toBe(false); // 凹口
    expect(pointInPolygon(1, 1, concave)).toBe(true);
    expect(pointInPolygon(1, 1, [0, 0, 1, 1])).toBe(false); // 退化
  });

  it('pointSegmentDist2：投影在段内/段外端点', () => {
    expect(pointSegmentDist2(2, 3, 0, 0, 4, 0)).toBe(9);
    expect(pointSegmentDist2(6, 0, 0, 0, 4, 0)).toBe(4);
    expect(pointSegmentDist2(1, 1, 2, 2, 2, 2)).toBe(2); // 零长段
  });

  it('raycastAabb / raycastCircle：命中 t·不命中 undefined·起点在内 0', () => {
    expect(raycastAabb(-2, 0.5, 1, 0, 0, 0, 1, 1)).toBe(2);
    expect(raycastAabb(-2, 5, 1, 0, 0, 0, 1, 1)).toBeUndefined();
    expect(raycastAabb(0.5, 0.5, 1, 0, 0, 0, 1, 1)).toBe(0);
    expect(raycastAabb(2, 0.5, 1, 0, 0, 0, 1, 1)).toBeUndefined(); // 背后
    expect(raycastCircle(-5, 0, 1, 0, 0, 0, 1)).toBe(4);
    expect(raycastCircle(-5, 3, 1, 0, 0, 0, 1)).toBeUndefined();
    expect(raycastCircle(0, 0, 1, 0, 0, 0, 1)).toBe(0);
    expect(raycastCircle(5, 0, 1, 0, 0, 0, 1)).toBeUndefined();
  });
});

describe('ease / hash / tick', () => {
  it('ease 与 tween 旧 switch 逐字同值；端点 0/1；easeOutBack 过冲后归 1', () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(ease('easeIn', x)).toBe(x * x);
      expect(ease('easeOut', x)).toBe(x * (2 - x));
      expect(ease('easeInOut', x)).toBe(x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) * (-2 * x + 2)) / 2);
      expect(ease('linear', x)).toBe(x);
    }
    expect([easeIn(1), easeOut(1), easeInOut(1), easeOutBack(1)]).toEqual([1, 1, 1, 1]);
    expect(easeOutBack(0.6)).toBeGreaterThan(1);
  });

  it('fnv1a32 与 net/determinism 同参数；hashInts 与 flow-field 旧 mix 逐位同值', () => {
    expect(fnv1a32('')).toBe(FNV_OFFSET);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    let h = 0x811c9dc5;
    for (const n of [3, 4, 1000]) { h ^= n | 0; h = Math.imul(h, 0x01000193) >>> 0; }
    expect(hashInts([3, 4, 1000])).toBe(h);
    expect(fnvMixInt(fnvMixInt(FNV_OFFSET, 3), 4)).toBe(hashInts([3, 4]));
  });

  it('advanceTimer 与 timer-advance 同语义：到点触发·非 loop 停表·loop 归零；everyN/remaining/progress', () => {
    const t = { elapsed: 0, duration: 2, loop: false };
    expect(advanceTimer(t)).toBe(false);
    expect(advanceTimer(t)).toBe(true);
    expect(advanceTimer(t)).toBe(false); // 停表
    expect(t.elapsed).toBe(2);
    const l = { elapsed: 0, duration: 2, loop: true };
    expect([advanceTimer(l), advanceTimer(l), l.elapsed, advanceTimer(l)]).toEqual([false, true, 0, false]);
    const e = { elapsed: 0 };
    expect([everyN(e, 3), everyN(e, 3), everyN(e, 3)]).toEqual([false, false, true]);
    expect(remaining({ elapsed: 5, duration: 3 })).toBe(0);
    expect(progress({ elapsed: 1, duration: 4 })).toBe(0.25);
    expect(progress({ elapsed: 1, duration: 0 })).toBe(1);
  });
});
