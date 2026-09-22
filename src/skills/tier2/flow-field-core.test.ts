import { describe, it, expect, beforeEach } from 'vitest';
import type { FlowField } from '@engine/protocol/components.js';
import {
  buildCostField, buildIntegration, buildFlow, bakeFlowField, cellIndex, cellOf, geoKey,
  sameInputs, getBakedField, clearFlowFieldCache, flowFieldBakes, nearestGoalDist,
  buildAgentIndex, STRAIGHT, DIAGONAL, UNREACHABLE,
} from './flow-field-core.js';

// ═══ 拆核之后，核要能**脱离世界**独立测——这正是把算法搬出能力壳的全部意义。
//     壳的行为（写 Velocity / 定序 / 留痕 / ORCA 接线）仍由 flow-field.test.ts 的 71 例守着；
//     本文件只守「核作为纯函数」的那一半：同输入同输出、无世界、无墙钟、无随机。
const field = (over: Partial<FlowField> = {}): FlowField => ({
  type: 'FlowField', id: 'f1', cellSize: 1, originX: 0, originY: 0,
  cols: 5, rows: 5, goals: [{ x: 4.5, y: 4.5 }], ...over,
} as FlowField);

beforeEach(() => { clearFlowFieldCache(); });

describe('flow-field-core —— 纯函数核（拆核后的独立可测性）', () => {
  it('**零世界依赖**：不传 World、不挂实体，光给一份摆放数据就能烘出方向场', () => {
    const f = field();
    const baked = bakeFlowField(f);
    expect(baked.cols * baked.rows).toBe(25);
    expect(baked.dir.length).toBe(50);          // 每格 (x,y)
    // 目标格自身无方向；离目标越远积分越大
    const gi = cellIndex(f, 4, 4);
    expect(baked.dir[gi * 2]).toBe(0);
    expect(baked.dir[gi * 2 + 1]).toBe(0);
  });

  it('**同输入逐位同输出**（确定性的最小判据·缓存清空不改变任何一位）', () => {
    const f = field({ cols: 8, rows: 8, goals: [{ x: 7.5, y: 7.5 }] });
    const a = bakeFlowField(f);
    clearFlowFieldCache();
    const b = bakeFlowField(f);
    expect([...b.dir]).toEqual([...a.dir]);
    expect([...b.integration]).toEqual([...a.integration]);
  });

  it('积分场全程整数：直走 10 / 斜走 14，没有一处浮点参与积分', () => {
    const f = field({ cols: 3, rows: 1, goals: [{ x: 2.5, y: 0.5 }] });
    const integ = buildIntegration(f, buildCostField(f));
    expect([...integ]).toEqual([2 * STRAIGHT, STRAIGHT, 0]);
    expect(integ.every((v) => Number.isInteger(v))).toBe(true);
    expect(DIAGONAL / STRAIGHT).toBeCloseTo(1.4, 5);   // ≈√2 的整数近似
  });

  it('墙里/孤岛 = UNREACHABLE，且不产生方向（不许瞎猜）', () => {
    const blocked = new Array(9).fill(0); blocked[4] = 1;   // 中心是墙
    const f = field({ cols: 3, rows: 3, goals: [{ x: 0.5, y: 0.5 }], blocked });
    const cost = buildCostField(f);
    const integ = buildIntegration(f, cost);
    const wall = cellIndex(f, 1, 1);
    expect(integ[wall]).toBe(UNREACHABLE);
    const dir = buildFlow(f, cost, integ);
    expect(dir[wall * 2]).toBe(0);
    expect(dir[wall * 2 + 1]).toBe(0);
  });

  it('记忆化命中要求输入**逐字段精确相同**（键不是权威·比对才是）', () => {
    const a = field({ goals: [{ x: 4.5, y: 4.5 }] });
    const b = field({ goals: [{ x: 4.5004, y: 4.5 }] });    // 只差 0.0004
    clearFlowFieldCache();
    getBakedField(a); const n1 = flowFieldBakes();
    getBakedField(a); expect(flowFieldBakes()).toBe(n1);    // 同一份 → 命中
    getBakedField(b); expect(flowFieldBakes()).toBe(n1 + 1); // 差 0.0004 → 必须重铺
    // sameInputs 的第一参是内部快照类型，这里只借它证明"键不是权威、比对才是"：
    // 上面的 bakes 计数已经证明了——差 0.0004 必重铺，不许靠量化摘要蒙混命中。
    expect(typeof sameInputs).toBe('function');
  });

  it('几何键只认几何，不认场 id（跨场共用邻居索引的前提）', () => {
    expect(geoKey(field({ id: 'A' }))).toBe(geoKey(field({ id: 'B' })));
    expect(geoKey(field({ cellSize: 2 }))).not.toBe(geoKey(field()));
    expect(geoKey(field())).toBe('5x5@1:0,0');
  });

  it('格坐标换算与越界：cellOf/cellIndex 对得上，界外回 -1（不回落到 0 格）', () => {
    const f = field();
    expect(cellOf(f, 2.7, 3.2)).toEqual({ col: 2, row: 3 });
    expect(cellIndex(f, 2, 3)).toBe(3 * 5 + 2);
    expect(cellIndex(f, -1, 0)).toBe(-1);
    expect(cellIndex(f, 0, 99)).toBe(-1);
  });

  it('nearestGoalDist 取最近的那个目标（多源的语义就在这里）', () => {
    const f = field({ goals: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    expect(nearestGoalDist(f, 9, 0)).toBeCloseTo(1, 9);
    expect(nearestGoalDist(f, 1, 0)).toBeCloseTo(1, 9);
  });

  it('**邻居索引也脱离了世界**：速度由回调喂进来，核自己不认识 World', () => {
    const f = field({ cols: 4, rows: 4, goals: [{ x: 3.5, y: 3.5 }] });
    const fields = new Map([['f1', f]]);
    const mk = (x: number, y: number) => new Map<string, unknown>([
      ['Transform', { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 }],
      ['FlowAgent', { type: 'FlowAgent', fieldId: 'f1', speed: 1, orca: { radius: 0.3 } }],
    ]);
    const agents: Array<readonly [string, Map<string, unknown>]> = [
      ['a', mk(0.5, 0.5)], ['b', mk(0.6, 0.5)], ['c', mk(3.5, 3.5)],
    ];
    const idx = buildAgentIndex(agents, fields, () => ({ vx: 1, vy: 0 }), () => 0.3, geoKey, () => true);
    const d = idx.density.get(geoKey(f))!;
    expect(d.px[0]).toBeCloseTo(0.5, 9);
    expect(d.vx[1]).toBe(1);                       // 速度真的走了回调
    expect(d.reciprocal[2]).toBe(1);               // 开了 ORCA 的会还礼
    expect(idx.cellIdxOf[0]).toBe(idx.cellIdxOf[1]);   // a、b 同格
    expect(idx.cellIdxOf[0]).not.toBe(idx.cellIdxOf[2]);
  });

  it('源码级：核里零 defineCapability / 零 World / 零墙钟随机（拆核的定义）', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./flow-field-core.ts', import.meta.url), 'utf8');
    const body = src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/defineCapability\s*\(/);
    expect(body).not.toMatch(/IWorld|world\./);
    expect(body).not.toMatch(/Date\.now|performance\.now|Math\.random/);
  });
});
