import { describe, it, expect } from 'vitest';
import { hexDistance, hexNextStep, HEX_DIRS, type Hex } from './hex.js';

const k = (q: number, r: number, cols: number) => r * cols + q;
const blocked = (cells: [number, number][], cols: number) => new Set(cells.map(([q, r]) => k(q, r, cols)));

describe('hex · 距离 / 邻居', () => {
  it('hexDistance：相邻=1、自身=0、对称', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    for (const d of HEX_DIRS) expect(hexDistance({ q: 0, r: 0 }, d)).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(hexDistance({ q: 3, r: -1 }, { q: 0, r: 0 }));
  });
  it('6 个固定邻居方向（确定性序·钉内容与顺序）', () => {
    // golden（实跑取值）：axial 六向·从东起逆时针。寻路/邻居枚举的确定性序契约，动它=录放不兼容。
    expect(HEX_DIRS).toEqual([
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
    ]);
  });
});

describe('hex · A* hexNextStep', () => {
  it('已相邻 → null（不移动，原地攻击）', () => {
    expect(hexNextStep(8, 8, { q: 0, r: 0 }, { q: 1, r: 0 }, new Set())).toBeNull();
  });
  it('空棋盘：朝目标走一步，且步长缩短 hex 距离', () => {
    const start = { q: 0, r: 0 }, target = { q: 4, r: 0 };
    const step = hexNextStep(8, 8, start, target, new Set())!;
    expect(step).not.toBeNull();
    expect(hexDistance(start, step)).toBe(1); // 是 start 的邻居
    expect(hexDistance(step, target)).toBeLessThan(hexDistance(start, target)); // 更近
  });
  it('到目标相邻格即停（不踏上目标占的格）', () => {
    // target 在 (4,0)（被占）；下一步链最终停在它的相邻格。
    const start = { q: 0, r: 0 }, target = { q: 4, r: 0 };
    const blk = blocked([[4, 0]], 8); // 目标格被占
    let cur: Hex = start;
    for (let i = 0; i < 10; i++) {
      const nx = hexNextStep(8, 8, cur, target, blk);
      if (nx === null) break;
      expect(blk.has(k(nx.q, nx.r, 8))).toBe(false); // 永不踏占格
      cur = nx;
    }
    expect(hexDistance(cur, target)).toBe(1); // 停在相邻格
  });
  it('绕开被占格（直线被堵 → 绕路，仍到达相邻）', () => {
    // start (0,0) → target (4,0)；在中间竖一道占格墙逼它绕。
    const start = { q: 0, r: 0 }, target = { q: 4, r: 0 };
    const wall: [number, number][] = [[2, -1], [2, 0], [2, 1], [4, 0]];
    const blk = blocked(wall, 8);
    let cur: Hex = start; const path: Hex[] = [start];
    for (let i = 0; i < 20; i++) {
      const nx = hexNextStep(8, 8, cur, target, blk);
      if (nx === null) break;
      expect(blk.has(k(nx.q, nx.r, 8))).toBe(false);
      cur = nx; path.push(cur);
    }
    expect(hexDistance(cur, target)).toBe(1); // 绕过墙到达相邻
    expect(path.length).toBeGreaterThan(5); // 确实绕了路
  });
  it('被完全围死 → null（无路）', () => {
    // target 周围 6 格全占 → 无相邻自由格可达。
    const target = { q: 4, r: 4 };
    const ring = HEX_DIRS.map((d) => [target.q + d.q, target.r + d.r] as [number, number]);
    expect(hexNextStep(8, 8, { q: 0, r: 0 }, target, blocked(ring, 8))).toBeNull();
  });
  it('确定性：同输入多次调用 → 同一步（tie-break 稳定）', () => {
    const a = hexNextStep(8, 8, { q: 0, r: 0 }, { q: 4, r: 4 }, new Set());
    const b = hexNextStep(8, 8, { q: 0, r: 0 }, { q: 4, r: 4 }, new Set());
    expect(a).toEqual(b);
  });
  it('边界：不越棋盘范围', () => {
    // start 在角 (0,0)，target 在 (0,3)；路径所有格须 inBounds。
    const blk = new Set<number>();
    let cur: Hex = { q: 0, r: 0 };
    for (let i = 0; i < 6; i++) {
      const nx = hexNextStep(4, 4, cur, { q: 0, r: 3 }, blk);
      if (nx === null) break;
      expect(nx.q).toBeGreaterThanOrEqual(0); expect(nx.q).toBeLessThan(4);
      expect(nx.r).toBeGreaterThanOrEqual(0); expect(nx.r).toBeLessThan(4);
      cur = nx;
    }
    expect(hexDistance(cur, { q: 0, r: 3 })).toBe(1);
  });
});
