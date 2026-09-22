import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { MatchBoard, BoardCell, Signal, Resource, RandomSeed, Sprite } from '@engine/protocol/components.js';
import { resourceCapability } from '@atom-skills/index.js';
import {
  match3BoardCapability,
  findMatches,
  applyGravity,
  refillEmpty,
  adjacent,
  makeCell,
  cellColor,
  cellSpecial,
  classifySpawns,
  effectCells,
  resolveClear,
  computeSwapComboClear,
  isSwapCombo,
  DEFAULT_COMBO_TABLE,
  NONE,
  STRIPED_H,
  STRIPED_V,
  WRAPPED,
  COLORBOMB,
  COLORLESS,
} from './match3-board.js';

// ── 纯算法 helper 单测 ──────────────────────────────────────────
describe('match3 helpers — findMatches', () => {
  it('横向 3 连', () => {
    const m = findMatches([0, 0, 0, 1, 2, 1, 2, 1, 2], 3, 3);
    expect([...m].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });
  it('纵向 3 连', () => {
    const m = findMatches([0, 1, 2, 0, 2, 1, 0, 1, 2], 3, 3);
    expect([...m].sort((a, b) => a - b)).toEqual([0, 3, 6]);
  });
  it('无连线 → 空', () => {
    expect(findMatches([0, 1, 2, 1, 2, 0, 2, 0, 1], 3, 3).size).toBe(0);
  });
  it('空格 -1 不参与连线', () => {
    expect(findMatches([-1, -1, -1, 0, 1, 2, 0, 1, 2], 3, 3).size).toBe(0);
  });
});

describe('match3 helpers — applyGravity / adjacent', () => {
  it('每列非空块下沉到底，上方补 -1', () => {
    const cells = [0, 1, 2, -1, -1, 5, -1, 7, 8]; // 3x3
    applyGravity(cells, 3, 3);
    // col0: [0,-1,-1] → 底部 0：[-1,-1,0]；col1:[1,-1,7]→[-1,1,7]；col2:[2,5,8]→不变
    expect(cells).toEqual([-1, -1, 2, -1, 1, 5, 0, 7, 8]);
  });
  it('相邻判定（四邻）', () => {
    expect(adjacent(0, 1, 3)).toBe(true); // 同行相邻
    expect(adjacent(0, 3, 3)).toBe(true); // 同列相邻
    expect(adjacent(0, 2, 3)).toBe(false); // 同行隔一
    expect(adjacent(2, 3, 3)).toBe(false); // 跨行不相邻
  });
});

// ── 相位机 + 集成 ──────────────────────────────────────────────
function loadBoard(cells: number[], extra: Partial<MatchBoard> = {}, withResources = false): World {
  const w = new World();
  for (const s of match3BoardCapability.systems) w.addSystem(s);
  if (withResources) for (const s of resourceCapability.systems) w.addSystem(s);
  w.createEntity('board');
  w.addComponent('board', {
    type: 'MatchBoard', cols: 3, rows: 3, kindCount: 3, cells: [...cells],
    kindResource: ['red', 'grn', 'blu'], matAmount: 1, coinResource: 'coin', coinPerTile: 1,
    kindTint: [0xff0000, 0x00ff00, 0x0000ff], kindLabel: ['R', 'G', 'B'],
    phase: 'idle', selIndex: -1, swapA: -1, swapB: -1, stepTimer: 0, stepDelay: 0, selectAction: 'cell',
    ...extra,
  } as MatchBoard);
  w.addComponent('board', { type: 'RandomSeed', seed: 12345, sequence: 0 } as RandomSeed);
  if (withResources) for (const id of ['red', 'grn', 'blu', 'coin']) {
    w.createEntity(`res:${id}`);
    w.addComponent(`res:${id}`, { type: 'Resource', id, current: 0, min: 0, max: 9999 } as Resource);
  }
  return w;
}
const board = (w: World): MatchBoard => w.getComponent<MatchBoard>('board', 'MatchBoard')!;
const resVal = (w: World, id: string): number => w.getComponent<Resource>(`res:${id}`, 'Resource')!.current;

describe('T3 match3-board — 消除产料（接 resource-apply → 升级链）', () => {
  it('clear 按 kindResource 产料+币，被消格置 -1', () => {
    // row0 三个 0（red），无其它连线
    const w = loadBoard([0, 0, 0, 1, 2, 1, 2, 1, 2], { phase: 'match' }, true);
    w.tick(); // match → clear
    w.tick(); // clear：发 ResourceModify + 置 -1 → fall
    expect(board(w).cells.slice(0, 3)).toEqual([-1, -1, -1]);
    expect(board(w).phase).toBe('fall');
    w.tick(); // 下一拍 resource-apply 结算（R10 修订：一拍延迟·断四系统环）
    expect(resVal(w, 'red')).toBe(3); // 三格 red 各 +matAmount(1)
    expect(resVal(w, 'coin')).toBe(3); // 三格各 +coinPerTile(1)
  });
});

describe('T3 match3-board — 交换接受 / 回退', () => {
  it('交换后有连线 → 进 clear（接受）', () => {
    const w = loadBoard([0, 0, 0, 1, 2, 1, 2, 1, 2], { phase: 'swapped', swapA: 2, swapB: 5 });
    w.tick();
    expect(board(w).phase).toBe('clear');
  });
  it('交换后无连线 → 回退交换并回 idle（非法步）', () => {
    const w = loadBoard([0, 1, 2, 1, 2, 0, 2, 0, 1], { phase: 'swapped', swapA: 0, swapB: 1 });
    w.tick();
    expect(board(w).phase).toBe('idle');
    expect(board(w).cells.slice(0, 2)).toEqual([1, 0]); // 交换被撤回
    expect(board(w).swapA).toBe(-1);
  });
});

describe('T3 match3-board — 点击选格驱动交换', () => {
  it('两次点相邻格 → 发起交换（idle 选→换→swapped）', () => {
    const w = loadBoard([0, 1, 2, 1, 2, 0, 2, 0, 1]);
    w.createEntity('bc0');
    w.addComponent('bc0', { type: 'BoardCell', boardId: 'board', index: 0 } as BoardCell);
    w.createEntity('bc1');
    w.addComponent('bc1', { type: 'BoardCell', boardId: 'board', index: 1 } as BoardCell);

    // tick1：点 bc0（idx0）→ 选中
    w.addComponent('bc0', { type: 'Signal', name: 'cell', source: 'bc0' } as Signal);
    w.tick();
    expect(board(w).selIndex).toBe(0);

    // tick2：点 bc1（idx1，与 0 相邻）→ 交换、转 swapped
    w.removeComponent('bc0', 'Signal');
    w.addComponent('bc1', { type: 'Signal', name: 'cell', source: 'bc1' } as Signal);
    w.tick();
    expect(board(w).phase).toBe('swapped');
    expect(board(w).swapA).toBe(0);
    expect(board(w).swapB).toBe(1);
    expect(board(w).cells.slice(0, 2)).toEqual([1, 0]); // 0/1 已交换
  });
});

describe('T3 match3-board — 全流程终止 + 确定性', () => {
  function runToIdle(w: World): MatchBoard {
    for (let i = 0; i < 100 && board(w).phase !== 'idle'; i++) w.tick();
    return board(w);
  }
  it('连锁结算最终回到 idle，棋盘无空格、无残留连线', () => {
    const w = loadBoard([0, 0, 0, 1, 2, 1, 2, 1, 2], { phase: 'match' });
    const b = runToIdle(w);
    expect(b.phase).toBe('idle');
    expect(b.cells.includes(-1)).toBe(false); // 全部补满
    expect(findMatches(b.cells, b.cols, b.rows).size).toBe(0); // 稳定
  });
  it('同种子 → 补块结果完全一致（确定性/录放安全）；换种子 → 分化', () => {
    const run = (seed?: number): number[] => {
      const w = loadBoard([0, 0, 0, 1, 2, 1, 2, 1, 2], { phase: 'match' });
      if (seed !== undefined) w.getComponent<RandomSeed>('board', 'RandomSeed')!.seed = seed;
      for (let i = 0; i < 100 && board(w).phase !== 'idle'; i++) w.tick();
      return board(w).cells;
    };
    expect(run()).toEqual(run());
    expect(run()).toEqual([2, 0, 1, 1, 2, 1, 2, 1, 2]);      // golden（缺省 seed 12345·实跑取值）
    expect(run(54321)).toEqual([1, 1, 0, 1, 2, 1, 2, 1, 2]); // 换 seed → 补块不同（实跑取值）
    expect(run(54321)).not.toEqual(run());                   // 异 seed 分化：无视种子恒填同值的实现在此转红
  });
});

describe('T3 match3-board — game-j 扩展（movesResource + kindSkinEntities·可选缺省关）', () => {
  it('合法交换（产生连线）扣 1 步；非法步弹回不扣', () => {
    const w = loadBoard([0, 0, 0, 1, 2, 1, 2, 1, 2], { phase: 'swapped', swapA: 2, swapB: 5, movesResource: 'moves' }, true);
    w.createEntity('res:moves');
    w.addComponent('res:moves', { type: 'Resource', id: 'moves', current: 20, min: 0, max: 99 } as Resource);
    w.tick(); // swapped→clear：合法步发 -1
    w.tick(); // 下一拍结算（一拍延迟）
    expect(w.getComponent<Resource>('res:moves', 'Resource')!.current).toBe(19);
    // 非法步：换回 idle·不扣
    const w2 = loadBoard([0, 1, 2, 1, 2, 0, 2, 0, 1], { phase: 'swapped', swapA: 0, swapB: 1, movesResource: 'moves' }, true);
    w2.createEntity('res:moves');
    w2.addComponent('res:moves', { type: 'Resource', id: 'moves', current: 20, min: 0, max: 99 } as Resource);
    w2.tick();
    w2.tick();
    expect(w2.getComponent<Resource>('res:moves', 'Resource')!.current).toBe(20);
  });
  it('kindSkinEntities：BoardCell 的 Sprite.textureKey 按种类同步自皮肤定义实体（空格清空）', () => {
    const w = loadBoard([1, 0, 2, 0, 2, 1, 2, 1, 0], { kindSkinEntities: ['def0', 'def1', 'def2'] });
    for (const [i, key] of [['def0', 'skin/red'], ['def1', 'skin/green'], ['def2', 'skin/blue']] as Array<[string, string]>) {
      w.createEntity(i);
      w.addComponent(i, { type: 'Sprite', textureKey: key, anchorX: 0.5, anchorY: 0.5, zOrder: 0 } as Sprite);
    }
    w.createEntity('bc0');
    w.addComponent('bc0', { type: 'BoardCell', boardId: 'board', index: 0 } as BoardCell);
    w.addComponent('bc0', { type: 'Sprite', textureKey: '', anchorX: 0.5, anchorY: 0.5, zOrder: 0 } as Sprite);
    w.tick();
    expect(w.getComponent<Sprite>('bc0', 'Sprite')!.textureKey).toBe('skin/green'); // cells[0]=1 → def1
    board(w).cells[0] = -1; // 置空 → 清 key（回退 Shape 观感）
    w.tick();
    expect(w.getComponent<Sprite>('bc0', 'Sprite')!.textureKey).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════
//  REQ-M3-三消二期：特殊糖 + 格层 + 目标接线
// ═══════════════════════════════════════════════════════════════

describe('T3 match3 二期 — 格编码 helper（纯整数位运算）', () => {
  it('makeCell/cellColor/cellSpecial 往返；旧纯色 0..N 编码=自身（一期数据逐字节兼容）', () => {
    expect(cellColor(makeCell(3, STRIPED_H))).toBe(3);
    expect(cellSpecial(makeCell(3, STRIPED_H))).toBe(STRIPED_H);
    expect(cellSpecial(makeCell(5, WRAPPED))).toBe(WRAPPED);
    // 彩球=无色哨值
    expect(cellColor(makeCell(COLORLESS, COLORBOMB))).toBe(COLORLESS);
    expect(cellSpecial(makeCell(COLORLESS, COLORBOMB))).toBe(COLORBOMB);
    // 旧纯色值编码后=自身
    for (const c of [0, 1, 2, 5, 7]) expect(makeCell(c, NONE)).toBe(c);
    // 空格透传
    expect(cellColor(-1)).toBe(-1);
    expect(cellSpecial(-1)).toBe(NONE);
  });
});

describe('T3 match3 二期 — 特殊糖生成（按 run 形状）', () => {
  it('横 4 连 → perpendicular=竖纹 / parallel=横纹 / 缺省=perpendicular', () => {
    const cells = [0, 0, 0, 0, 1, 2, 1, 2]; // cols4 rows2，row0 四连横
    expect(classifySpawns(cells, 4, 2, -1, -1, 'perpendicular')[0].special).toBe(STRIPED_V);
    expect(classifySpawns(cells, 4, 2, -1, -1, 'parallel')[0].special).toBe(STRIPED_H);
    expect(classifySpawns(cells, 4, 2, -1, -1)[0].special).toBe(STRIPED_V); // 缺省
    expect(classifySpawns(cells, 4, 2, -1, -1).length).toBe(1);
  });
  it('竖 4 连 → perpendicular=横纹 / parallel=竖纹', () => {
    const cells = [0, 1, 0, 2, 0, 1, 0, 2]; // cols2 rows4，col0 四连竖
    expect(classifySpawns(cells, 2, 4, -1, -1, 'perpendicular')[0].special).toBe(STRIPED_H);
    expect(classifySpawns(cells, 2, 4, -1, -1, 'parallel')[0].special).toBe(STRIPED_V);
  });
  it('生成位：玩家交换格优先，无交换取 run 中点', () => {
    const cells = [0, 0, 0, 0, 1, 2, 1, 2];
    expect(classifySpawns(cells, 4, 2, 1, -1)[0].index).toBe(1); // 交换格 1 在 run 内 → 优先
    expect(classifySpawns(cells, 4, 2, -1, -1)[0].index).toBe(2); // 无交换 → run [0,1,2,3] 中点=2
  });
  it('L/T 交叉 → 包装糖', () => {
    const cells = [0, 0, 0, 0, 2, 1, 0, 1, 2]; // row0 三连 + col0 三连，交于 idx0
    const sp = classifySpawns(cells, 3, 3, -1, -1);
    expect(sp.length).toBe(1);
    expect(sp[0].special).toBe(WRAPPED);
    expect(classifySpawns(cells, 3, 3, 0, -1)[0].index).toBe(0); // 交换在交叉角 → 生成于角
  });
  it('直线 5 连 → 彩球（无色）', () => {
    const cells = [0, 0, 0, 0, 0]; // 5x1
    const sp = classifySpawns(cells, 5, 1, -1, -1);
    expect(sp[0].special).toBe(COLORBOMB);
    expect(sp[0].color).toBe(COLORLESS);
  });
});

describe('T3 match3 二期 — 触发效果清除集', () => {
  it('条纹 = 整行 / 整列', () => {
    const cells = new Array(12).fill(0); // cols4 rows3
    expect(effectCells(cells, 4, 3, 5, STRIPED_H).sort((a, b) => a - b)).toEqual([4, 5, 6, 7]); // 横纹清 row1
    expect(effectCells(cells, 4, 3, 5, STRIPED_V).sort((a, b) => a - b)).toEqual([1, 5, 9]); // 竖纹清 col1
  });
  it('包装 = 3×3（角落裁边）', () => {
    const cells = new Array(9).fill(0);
    expect(effectCells(cells, 3, 3, 4, WRAPPED).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(effectCells(cells, 3, 3, 0, WRAPPED).sort((a, b) => a - b)).toEqual([0, 1, 3, 4]);
  });
  it('彩球（连锁引爆）= 全盘最多色', () => {
    const cells = [0, 1, 0, 1, 0, 1, 0, 0, 0]; // 色0 计 6（主导）
    expect(effectCells(cells, 3, 3, 4, COLORBOMB).sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 7, 8]);
  });
});

describe('T3 match3 二期 — 特殊糖组合（comboTable 4 条 + 彩球换普通）', () => {
  const base = () => new Array(9).fill(0);
  it('纹+纹 = 十字（行∪列）', () => {
    const cells = base();
    cells[4] = makeCell(0, STRIPED_H);
    cells[5] = makeCell(0, STRIPED_V);
    const s = computeSwapComboClear(cells, 3, 3, 4, 5, DEFAULT_COMBO_TABLE);
    expect([...s].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 7]); // row1{3,4,5}∪col1{1,4,7}
  });
  it('纹+包 = 3 行 3 列（3x3 全覆盖）', () => {
    const cells = base();
    cells[4] = makeCell(0, STRIPED_H);
    cells[5] = makeCell(0, WRAPPED);
    expect(computeSwapComboClear(cells, 3, 3, 4, 5, DEFAULT_COMBO_TABLE).size).toBe(9);
  });
  it('包+包 = 5×5（3x3 全覆盖）', () => {
    const cells = base();
    cells[4] = makeCell(0, WRAPPED);
    cells[5] = makeCell(0, WRAPPED);
    expect(computeSwapComboClear(cells, 3, 3, 4, 5, DEFAULT_COMBO_TABLE).size).toBe(9);
  });
  it('球+球 = 全盘', () => {
    const cells = base();
    cells[0] = makeCell(COLORLESS, COLORBOMB);
    cells[1] = makeCell(COLORLESS, COLORBOMB);
    expect(computeSwapComboClear(cells, 3, 3, 0, 1, DEFAULT_COMBO_TABLE).size).toBe(9);
  });
  it('彩球 + 普通 = 清全盘该色', () => {
    const cells = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    cells[0] = makeCell(COLORLESS, COLORBOMB); // idx0 彩球，与 idx1（色1）交换
    const s = computeSwapComboClear(cells, 3, 3, 0, 1, DEFAULT_COMBO_TABLE);
    expect([...s].sort((a, b) => a - b)).toEqual([0, 1, 3, 5, 7]); // 球+被换格 + 全部色1{1,3,5,7}
  });
  it('isSwapCombo：双特殊糖 / 含彩球=组合；单特殊糖+普通=非组合', () => {
    const c1 = [makeCell(0, STRIPED_H), makeCell(0, STRIPED_V)];
    expect(isSwapCombo(c1, 0, 1)).toBe(true);
    const c2 = [makeCell(COLORLESS, COLORBOMB), 1];
    expect(isSwapCombo(c2, 0, 1)).toBe(true);
    const c3 = [makeCell(0, STRIPED_H), 1];
    expect(isSwapCombo(c3, 0, 1)).toBe(false); // 单纹+普通 → 需同色连线才合法
  });
});

describe('T3 match3 二期 — 连锁引爆有界（互指条纹环不无界递归）', () => {
  it('同列多条竖纹互指 → 有界终止 + 正确清除集', () => {
    const cells = new Array(9).fill(0);
    cells[0] = makeCell(0, STRIPED_V);
    cells[3] = makeCell(0, STRIPED_V);
    cells[6] = makeCell(0, STRIPED_V); // col0 三条竖纹互指同列
    const s = resolveClear(cells, 3, 3, [0]);
    expect([...s].sort((a, b) => a - b)).toEqual([0, 3, 6]); // 有界收敛，非死循环
  });
  it('条纹十字链 → 有界并覆盖三条线', () => {
    const cells = new Array(9).fill(0);
    cells[0] = makeCell(0, STRIPED_V); // col0 {0,3,6}
    cells[3] = makeCell(0, STRIPED_H); // row1 {3,4,5}
    cells[5] = makeCell(0, STRIPED_V); // col2 {2,5,8}
    const s = resolveClear(cells, 3, 3, [0]);
    expect([...s].sort((a, b) => a - b)).toEqual([0, 2, 3, 4, 5, 6, 8]);
  });
});

describe('T3 match3 二期 — 格层：果冻减层', () => {
  it('参与消除的果冻格减 1，计数写 jellyResource', () => {
    const w = loadBoard(
      [0, 0, 0, 1, 2, 1, 2, 1, 2],
      { phase: 'match', jelly: [1, 1, 1, 0, 0, 0, 0, 0, 0], jellyResource: 'jel' },
      true,
    );
    w.createEntity('res:jel');
    w.addComponent('res:jel', { type: 'Resource', id: 'jel', current: 0, min: 0, max: 99 } as Resource);
    w.tick(); // match → clear
    w.tick(); // clear：清 row0 → jelly[0..2] 1→0，发 jel +3 → fall
    expect(board(w).jelly).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    w.tick(); // 下一拍 resource-apply 结算
    expect(resVal(w, 'jel')).toBe(3);
  });
});

describe('T3 match3 二期 — 格层：障碍减 hp / 石块不动不补 / 重力绕石块', () => {
  it('邻接消除损障碍 hp，计数写 blockerResource', () => {
    const w = loadBoard(
      [0, 0, 0, 1, 2, 1, 2, 1, 2],
      { phase: 'match', blockers: [0, 0, 0, 2, 0, 0, 0, 0, 0], blockerResource: 'blk' },
      true,
    );
    w.createEntity('res:blk');
    w.addComponent('res:blk', { type: 'Resource', id: 'blk', current: 0, min: 0, max: 99 } as Resource);
    w.tick(); // match → clear
    w.tick(); // clear：清 row0 → idx3 障碍（与 idx0 四邻）hp 2→1，发 blk +1 → fall
    expect(board(w).blockers![3]).toBe(1);
    w.tick(); // resource-apply
    expect(resVal(w, 'blk')).toBe(1);
  });
  it('重力绕石块：候选块只落到石块上方（不穿石块）', () => {
    // cols3 rows4，石块在 col0 row2（idx6）。col0 顶部一块糖应落到石块正上方（idx3），下方糖不动。
    const cells = [7, 0, 0, -1, 0, 0, 9, 0, 0, 8, 0, 0];
    const blockers = [0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0];
    applyGravity(cells, 3, 4, blockers);
    expect(cells[0]).toBe(-1); // 顶空
    expect(cells[3]).toBe(7); // 糖落到石块上方一格
    expect(cells[6]).toBe(9); // 石块本体不动
    expect(cells[9]).toBe(8); // 石块下方糖不动
  });
  it('石块不补：refill 跳过 blockers===-1 的格', () => {
    const cells = [-1, -1, -1, -1, -1, -1];
    const blockers = [0, -1, 0, 0, 0, 0];
    const seed = { type: 'RandomSeed', seed: 1, sequence: 0 } as RandomSeed;
    refillEmpty(cells, 3, seed, blockers);
    expect(cells[1]).toBe(-1); // 石块位不补
    expect(cells[0]).toBeGreaterThanOrEqual(0); // 其余补满
    expect(cells[2]).toBeGreaterThanOrEqual(0);
  });
});

describe('T3 match3 二期 — 目标：步数（组合交换扣步）+ 确定性复现', () => {
  it('特殊糖组合交换 = 合法步扣 1', () => {
    const cells = [1, 2, 1, 2, 1, 2, 1, 2, 1];
    cells[0] = makeCell(COLORLESS, COLORBOMB);
    cells[1] = makeCell(COLORLESS, COLORBOMB); // 球+球（无同色连线也算合法组合步）
    const w = loadBoard(cells, { phase: 'swapped', swapA: 0, swapB: 1, movesResource: 'moves' }, true);
    w.createEntity('res:moves');
    w.addComponent('res:moves', { type: 'Resource', id: 'moves', current: 20, min: 0, max: 99 } as Resource);
    w.tick(); // swapped：isSwapCombo → 发 moves -1 → clear
    w.tick(); // 下一拍结算
    expect(w.getComponent<Resource>('res:moves', 'Resource')!.current).toBe(19);
  });
  it('同 seed → 特殊糖 + 格层全程逐字节复现（录放安全）；异 seed → 分化', () => {
    const run = (seed?: number): { cells: number[]; jelly: number[] | undefined } => {
      const w = loadBoard(
        [0, 0, 0, 0, 1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2],
        { cols: 4, rows: 4, kindCount: 3, phase: 'match', stripedOrientation: 'perpendicular', jelly: new Array(16).fill(1), jellyResource: 'jel' },
        true,
      );
      if (seed !== undefined) w.getComponent<RandomSeed>('board', 'RandomSeed')!.seed = seed;
      w.createEntity('res:jel');
      w.addComponent('res:jel', { type: 'Resource', id: 'jel', current: 0, min: 0, max: 999 } as Resource);
      for (let i = 0; i < 200 && board(w).phase !== 'idle'; i++) w.tick();
      return { cells: [...board(w).cells], jelly: board(w).jelly ? [...board(w).jelly!] : undefined };
    };
    expect(run()).toEqual(run());
    // 换 seed → 补块分化（实跑：cells 头两格由 [2,0,…] 变 [1,1,…]）——无视种子的实现在此转红。
    expect(run(54321)).not.toEqual(run());
  });
});
