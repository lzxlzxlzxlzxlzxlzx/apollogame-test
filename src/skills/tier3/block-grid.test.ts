import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { BlockGrid, BlockShapeDef, PlaceBlockIntent, BoardCell, Color, Flag, Resource, RandomSeed } from '@engine/protocol/components.js';
import { resourceCapability } from '@atom-skills/index.js';
import { blockGridCapability, canPlace, applyPlace, fullLines, clearLines, canPlaceAnywhere, anyTrayPlaceable, bgIndex } from './block-grid.js';

// 形状：单格 / 横 domino / 竖 domino / L 三格。cells=扁平 [dc,dr,…]。
const SINGLE: BlockShapeDef = { id: 'single', cells: [0, 0], tint: 0x111111 };
const DOMINO_H: BlockShapeDef = { id: 'dh', cells: [0, 0, 1, 0], tint: 0x222222 };
const DOMINO_V: BlockShapeDef = { id: 'dv', cells: [0, 0, 0, 1], tint: 0x333333 };
const L3: BlockShapeDef = { id: 'L', cells: [0, 0, 0, 1, 1, 1], tint: 0x444444 };

// ── 纯算法 helper 单测 ──────────────────────────────────────────
describe('block-grid helpers — canPlace', () => {
  const empty3 = () => new Array(9).fill(-1);
  it('界内空位 → 可落', () => {
    expect(canPlace(empty3(), 3, 3, L3.cells, 0, 0)).toBe(true);
  });
  it('越右界 → 不可落', () => {
    expect(canPlace(empty3(), 3, 3, DOMINO_H.cells, 2, 0)).toBe(false); // (2,0)+(3,0) 越界
  });
  it('越下界 → 不可落', () => {
    expect(canPlace(empty3(), 3, 3, DOMINO_V.cells, 0, 2)).toBe(false); // (0,2)+(0,3) 越界
  });
  it('压到已填格 → 不可落', () => {
    const cells = empty3(); cells[bgIndex(1, 0, 3)] = 5;
    expect(canPlace(cells, 3, 3, DOMINO_H.cells, 0, 0)).toBe(false);
  });
  it('空形状 → 不可落', () => {
    expect(canPlace(empty3(), 3, 3, [], 0, 0)).toBe(false);
  });
});

describe('block-grid helpers — applyPlace / fullLines / clearLines', () => {
  it('applyPlace 只填形状格，值=fill', () => {
    const cells = new Array(9).fill(-1);
    applyPlace(cells, 3, L3.cells, 0, 0, 7);
    // L: (0,0)(0,1)(1,1) → idx 0,3,4
    expect(cells).toEqual([7, -1, -1, 7, 7, -1, -1, -1, -1]);
  });
  it('fullLines 找满行满列', () => {
    // 3x3：行0 全满、列2 全满
    const cells = [5, 5, 5, -1, -1, 5, -1, -1, 5];
    const { rows, cols } = fullLines(cells, 3, 3);
    expect(rows).toEqual([0]);
    expect(cols).toEqual([2]);
  });
  it('clearLines 清行列并返回格数（交叉只算一次）', () => {
    const cells = [5, 5, 5, -1, -1, 5, -1, -1, 5];
    const n = clearLines(cells, 3, 3, [0], [2]); // 行0(3格)+列2(3格)，交叉 idx2 算一次 → 5
    expect(n).toBe(5);
    expect(cells).toEqual([-1, -1, -1, -1, -1, -1, -1, -1, -1]);
  });
});

describe('block-grid helpers — 判负基元', () => {
  it('canPlaceAnywhere：满盘 → false，空盘 → true', () => {
    expect(canPlaceAnywhere(new Array(9).fill(0), 3, 3, SINGLE.cells)).toBe(false);
    expect(canPlaceAnywhere(new Array(9).fill(-1), 3, 3, SINGLE.cells)).toBe(true);
  });
  it('anyTrayPlaceable：无相邻空位时 domino 放不下 → false', () => {
    // 棋盘格填成「无两个水平/垂直相邻的空」：填 1,3,5,7，留 0,2,4,6,8 空（互不四邻）
    const cells = [-1, 0, -1, 0, -1, 0, -1, 0, -1];
    expect(anyTrayPlaceable(cells, 3, 3, [DOMINO_H, DOMINO_V], [0, 1])).toBe(false);
    expect(anyTrayPlaceable(cells, 3, 3, [SINGLE], [0])).toBe(true); // 单格还能落孤立空位
  });
});

// ── 相位机 + 集成 ──────────────────────────────────────────────
function loadBG(cells: number[], extra: Partial<BlockGrid> = {}, withResources = false): World {
  const w = new World();
  for (const s of blockGridCapability.systems) w.addSystem(s);
  if (withResources) for (const s of resourceCapability.systems) w.addSystem(s);
  w.createEntity('board');
  w.addComponent('board', {
    type: 'BlockGrid', cols: 3, rows: 3, cells: [...cells],
    shapes: [SINGLE, DOMINO_H, DOMINO_V, L3], tray: [0, 1, 2], traySize: 3,
    scoreResource: 'score', cellScore: 1, lineScore: 10, gameOverFlag: 'over',
    ...extra,
  } as BlockGrid);
  w.addComponent('board', { type: 'RandomSeed', seed: 999, sequence: 0 } as RandomSeed);
  if (withResources) {
    w.createEntity('res:score');
    w.addComponent('res:score', { type: 'Resource', id: 'score', current: 0, min: 0, max: 999999 } as Resource);
  }
  return w;
}
const bg = (w: World): BlockGrid => w.getComponent<BlockGrid>('board', 'BlockGrid')!;
function placeIntent(w: World, slot: number, col: number, row: number): void {
  w.createEntity('intent');
  w.addComponent('intent', { type: 'PlaceBlockIntent', slot, col, row } as PlaceBlockIntent);
}

describe('T3 block-grid — 放置 / 消除 / 计分', () => {
  it('合法放置：落子写 cells、用掉托盘槽、消费意图', () => {
    const w = loadBG(new Array(9).fill(-1), { tray: [3, 0, 1] }); // slot0=L（多槽·不触发补形）
    placeIntent(w, 0, 0, 0);
    w.tick();
    // L 落 (0,0) → idx 0,3,4 = tint(0x444444)
    expect(bg(w).cells[0]).toBe(0x444444);
    expect(bg(w).cells[3]).toBe(0x444444);
    expect(bg(w).cells[4]).toBe(0x444444);
    expect(bg(w).tray[0]).toBe(-1);          // 用掉的槽置空
    expect(bg(w).tray.slice(1)).toEqual([0, 1]); // 其余槽不动（未全空·不补形）
    expect(w.hasComponent('intent', 'PlaceBlockIntent')).toBe(false); // 意图被消费
  });

  it('放置补满整行 → 整行清空 + 计分（走 resource-apply）', () => {
    // 行0 已填 idx0,1；托盘单格落 (2,0) 补满行0 → 清行
    const cells = new Array(9).fill(-1); cells[0] = 8; cells[1] = 8;
    const w = loadBG(cells, { tray: [0, -1, -1] }, true); // slot0=single
    placeIntent(w, 0, 2, 0);
    w.tick(); // 放置 + 消行 + 发 ResourceModify
    expect(bg(w).cells.slice(0, 3)).toEqual([-1, -1, -1]); // 行0 清空
    w.tick(); // resource-apply 结算（一拍延迟）
    // 计分 = 落 1 格*cellScore(1) + 清 1 行*lineScore(10) = 11
    expect(w.getComponent<Resource>('res:score', 'Resource')!.current).toBe(11);
  });

  it('非法放置（越界/压占）→ 整次拒绝，cells/tray 不变，意图仍被消费', () => {
    const cells = new Array(9).fill(-1); cells[bgIndex(1, 0, 3)] = 5;
    const w = loadBG(cells, { tray: [1, -1, -1] }); // slot0=DOMINO_H
    placeIntent(w, 0, 0, 0); // (0,0)+(1,0)，(1,0) 被占 → 拒
    w.tick();
    expect(bg(w).cells[0]).toBe(-1);   // 没落子
    expect(bg(w).tray[0]).toBe(1);     // 槽没消耗
    expect(w.hasComponent('intent', 'PlaceBlockIntent')).toBe(false); // 意图仍清掉（不残留）
  });
});

describe('T3 block-grid — 托盘补形（确定性）/ 判负', () => {
  it('托盘用完 → 按 RandomSeed 确定性补 traySize 个（同种子同结果·异种子分化）', () => {
    const mk = (seed?: number) => {
      const w = loadBG(new Array(9).fill(-1), { tray: [0, -1, -1] });
      if (seed !== undefined) w.getComponent<RandomSeed>('board', 'RandomSeed')!.seed = seed;
      placeIntent(w, 0, 0, 0); w.tick(); return bg(w).tray;
    };
    const t1 = mk();
    const t2 = mk();
    expect(t1.length).toBe(3);            // 补满 traySize
    expect(t1.every((s) => s >= 0)).toBe(true);
    expect(t1).toEqual(t2);               // 确定性：同种子 → 同托盘
    expect(t1).toEqual([3, 2, 1]);        // golden（缺省 seed 999·实跑取值）
    expect(mk(1)).toEqual([2, 0, 2]);     // 换 seed → 托盘不同（实跑取值）——无视种子恒填同值的实现在此转红
    expect(mk(1)).not.toEqual(t1);
  });

  it('托盘所有形状全盘无处可落 → 置 gameOverFlag', () => {
    // 棋盘无相邻空位（0,2,4,6,8 空·互不四邻），托盘只有 domino → 判负
    const cells = [-1, 0, -1, 0, -1, 0, -1, 0, -1];
    const w = loadBG(cells, { tray: [1, 2, -1] }); // DOMINO_H / DOMINO_V
    w.createEntity('flag:over');
    w.addComponent('flag:over', { type: 'Flag', id: 'over', active: false } as Flag);
    w.tick(); // 无放置意图·仅判负扫描
    expect(w.getComponent<Flag>('flag:over', 'Flag')!.active).toBe(true);
  });

  it('还有可落形状 → 不判负', () => {
    const cells = [-1, 0, -1, 0, -1, 0, -1, 0, -1];
    const w = loadBG(cells, { tray: [0, -1, -1] }); // single 还能落孤立空位
    w.createEntity('flag:over');
    w.addComponent('flag:over', { type: 'Flag', id: 'over', active: false } as Flag);
    w.tick();
    expect(w.getComponent<Flag>('flag:over', 'Flag')!.active).toBe(false);
  });
});

describe('T3 block-grid — 视图同步（BoardCell.Color）', () => {
  it('已填格→该格 tint，空格→emptyTint', () => {
    const cells = new Array(9).fill(-1); cells[4] = 0xabcdef;
    const w = loadBG(cells, { emptyTint: 0x000000 });
    for (const idx of [3, 4]) {
      w.createEntity(`cell:${idx}`);
      w.addComponent(`cell:${idx}`, { type: 'BoardCell', boardId: 'board', index: idx } as BoardCell);
      w.addComponent(`cell:${idx}`, { type: 'Color', tint: 0x999999, alpha: 1 } as Color);
    }
    w.tick();
    expect(w.getComponent<Color>('cell:4', 'Color')!.tint).toBe(0xabcdef); // 已填=格值
    expect(w.getComponent<Color>('cell:3', 'Color')!.tint).toBe(0x000000); // 空=emptyTint
  });
});

describe('block-grid — 同拍双意图（2026-08-22 测试大扫除补钉·同拍双消费形状）', () => {
  it('同拍两条 PlaceBlockIntent 抢同一托盘槽 → id 序先者成交·后者拒收·槽只扣一次·双双消费', () => {
    const w = loadBG(new Array(9).fill(-1), { tray: [0, 1, 2] }); // slot0 = SINGLE
    w.createEntity('i1');
    w.addComponent('i1', { type: 'PlaceBlockIntent', slot: 0, col: 0, row: 0 } as PlaceBlockIntent);
    w.createEntity('i2');
    w.addComponent('i2', { type: 'PlaceBlockIntent', slot: 0, col: 2, row: 2 } as PlaceBlockIntent);
    w.tick();
    expect(bg(w).cells[0]).toBe(0x111111); // i1 成交（SINGLE 落 0,0）
    expect(bg(w).cells[8]).toBe(-1); // i2 抢空槽 → 拒收不落子
    expect(w.hasComponent('i1', 'PlaceBlockIntent')).toBe(false); // 双双消费
    expect(w.hasComponent('i2', 'PlaceBlockIntent')).toBe(false);
    expect(bg(w).cells.filter((c) => c !== -1)).toHaveLength(1); // 全盘恰一格·无双花
  });
});
