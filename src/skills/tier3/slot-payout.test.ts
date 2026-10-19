import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { DicePool, DieSpec, RandomSeed, Resource, Signal, SlotMachine, LineWins, RolledDice } from '@engine/protocol/components.js';
import { resourceCapability } from '@atom-skills/index.js';
import { diceRollCapability } from '../tier2/dice-roll.js';
import { slotPayoutCapability, evaluateSlot } from './slot-payout.js';

// t3-slot-payout 系统级测试：经真 World.tick 走完整管线（Signal → dice-roll 掷 RolledDice →
// 同拍 slot-payout 判线记账）。掷轮用单面骰钉死网格（掷必得该值·零随机），经济 golden 全部
// 先实跑真管线取值再钉；确定性面用真 6 面骰 + 同 seed 双世界对拍。
const fixed = (v: number): DieSpec => ({ faces: [{ value: v }] }); // 单面骰：网格钉死
const mixed = (): DieSpec => ({ faces: [0, 1, 0, 1, 8, 9].map((v) => ({ value: v })) });

// 3×3 机器：wild=8、scatter=9；线注倍率 0→5×、1→10×、纯百搭 8→50×；3 分散=2×总注。
const MACHINE: Omit<SlotMachine, 'type'> = {
  source: 'reels', reels: 3, rows: 3,
  lines: [[0, 0, 0], [1, 1, 1], [2, 2, 2]], // 上/中/下三条横线
  pay: { '0': { '3': 5 }, '1': { '3': 10 }, '8': { '3': 50 } },
  wild: 8, scatter: 9, scatterMin: 3, scatterPay: { '3': 2 },
  spinSignal: 'spin', betResource: 'bet', balanceResource: 'balance', winResource: 'win',
};

interface Fixture { w: World; pulse: (name: string) => void }
function slotWorld(dice: DieSpec[], machine: Partial<SlotMachine> = {}, balances: Partial<Record<'bet' | 'balance', number>> = {}, seed = 777): Fixture {
  const w = new World();
  for (const cap of [diceRollCapability, slotPayoutCapability, resourceCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  w.createEntity('rng');
  w.addComponent('rng', { type: 'RandomSeed', seed, sequence: 0 } as RandomSeed);
  w.createEntity('reels');
  w.addComponent('reels', { type: 'DicePool', dice, rollOnSignal: 'spin' } as DicePool);
  w.createEntity('machine');
  w.addComponent('machine', { type: 'SlotMachine', ...MACHINE, ...machine } as SlotMachine);
  const res = (id: string, current: number, min: number, max: number): void => {
    w.createEntity(`res:${id}`);
    w.addComponent(`res:${id}`, { type: 'Resource', id, current, min, max } as Resource);
  };
  res('bet', balances.bet ?? 30, 1, 300);
  res('balance', balances.balance ?? 1000, 0, 100000);
  res('win', 0, 0, 1000000);
  let n = 0;
  const pulse = (name: string): void => { // 单拍信号：进场 → tick → 离场（不跨拍重触发）
    const id = `sig:${n++}`;
    w.createEntity(id);
    w.addComponent(id, { type: 'Signal', name, source: 'test' } as Signal);
    w.tick();
    w.destroyEntity(id);
  };
  return { w, pulse };
}
const cur = (w: World, id: string): number => w.getComponent<Resource>(`res:${id}`, 'Resource')!.current;
const wins = (w: World): LineWins | undefined => w.getComponent<LineWins>('machine', 'LineWins');

// 钉死网格（列优先 reel*rows+row）：reel0=[1,0,9] reel1=[1,0,9] reel2=[8,0,9]
// → 上线 [1,1,8]=符号1×3（百搭代入）、中线 [0,0,0]=符号0×3、下线 [9,9,9]=3 分散（非线赢）。
const GRID_DICE = [1, 0, 9, 1, 0, 9, 8, 0, 9].map(fixed);

describe('t3-slot-payout — metadata 契约', () => {
  it('id / reads / writes / consumes / provides 与申报一致', () => {
    expect(slotPayoutCapability.id).toBe('t3-slot-payout');
    expect(slotPayoutCapability.components.reads).toEqual(['SlotMachine', 'RolledDice', 'Signal', 'Resource']);
    expect(slotPayoutCapability.components.writes).toEqual(['Resource', 'LineWins']);
    expect(slotPayoutCapability.components.consumes).toEqual([]);
    expect(slotPayoutCapability.components.provides.SlotMachine).toBeTruthy();
    expect(slotPayoutCapability.components.provides.LineWins).toBeTruthy();
  });
});

describe('evaluateSlot 纯函数 — 线扫描语义（百搭/分散边角）', () => {
  const PAY = { 0: { 3: 5, 4: 10 }, 1: { 3: 10 }, 8: { 3: 50 } };
  it('前导百搭代入基础符号：[8,1,1] → 符号1 连3', () => {
    const r = evaluateSlot([[8], [1], [1]], [[0, 0, 0]], PAY, 8, 9, 3, {}, 10, 30);
    expect(r.lineWins).toEqual([{ line: 0, symbol: 1, count: 3, pay: 100 }]);
  });
  it('纯百搭连 ≥3 按百搭赔付：[8,8,8] → 符号8 50×线注', () => {
    const r = evaluateSlot([[8], [8], [8]], [[0, 0, 0]], PAY, 8, 9, 3, {}, 10, 30);
    expect(r.lineWins).toEqual([{ line: 0, symbol: 8, count: 3, pay: 500 }]);
  });
  it('纯百搭 vs 基础取较高者：[8,8,8,0] → 百搭3连(500) 胜 符号0四连(100)', () => {
    const r = evaluateSlot([[8], [8], [8], [0]], [[0, 0, 0, 0]], PAY, 8, 9, 3, {}, 10, 30);
    expect(r.lineWins).toEqual([{ line: 0, symbol: 8, count: 3, pay: 500 }]);
  });
  it('分散断连不当基础符号：[9,0,0] → 无线赢，但任意位置计入 scatterCount', () => {
    const r = evaluateSlot([[9], [0], [0]], [[0, 0, 0]], PAY, 8, 9, 3, { 3: 2 }, 10, 30);
    expect(r.lineWins).toEqual([]);
    expect(r.scatterCount).toBe(1);
    expect(r.scatterWin).toBe(0); // 1 < scatterMin
  });
});

describe('t3-slot-payout — 旋转结算 happy path（真管线·golden 实跑钉死）', () => {
  it('SPIN → 同拍掷轮判线记账：扣注 30、线赢 150 + 分散 60、余额/上次赢/LineWins 全对账', () => {
    const { w, pulse } = slotWorld(GRID_DICE);
    pulse('spin');
    // lineBet = floor(30/3)=10：上线 10×10=100、中线 5×10=50；分散 2×30=60 → total 210
    expect(cur(w, 'balance')).toBe(1180); // 1000 - 30 + 210
    expect(cur(w, 'win')).toBe(210);
    expect(cur(w, 'bet')).toBe(30); // 注额本身不动
    const lw = wins(w)!;
    expect(lw.spin).toBe(1);
    expect(lw.total).toBe(210);
    expect(lw.scatterCount).toBe(3);
    expect(lw.triggeredFree).toBe(0); // 未配 freeResource
    expect(lw.wins).toEqual([
      { line: 0, symbol: 1, count: 3, pay: 100 }, // [1,1,8] 百搭代入
      { line: 1, symbol: 0, count: 3, pay: 50 },
    ]);
    // 再旋一拍：spin 序号 +1（prev 原地更新路径）、经济按拍累计
    pulse('spin');
    expect(wins(w)!.spin).toBe(2);
    expect(cur(w, 'balance')).toBe(1360); // 1180 - 30 + 210
  });

  it('免费旋转经济：不扣注、线赢×freeMultiplier、3 分散再赠 freeAward', () => {
    const { w, pulse } = slotWorld(GRID_DICE, { freeResource: 'freespins', freeAward: 5, freeMultiplier: 2 });
    w.createEntity('res:freespins');
    w.addComponent('res:freespins', { type: 'Resource', id: 'freespins', current: 2, min: 0, max: 100 } as Resource);
    pulse('spin');
    expect(cur(w, 'balance')).toBe(1360); // 1000 + (150×2 + 60)，未扣注
    expect(cur(w, 'freespins')).toBe(6); // 2 - 1（本旋消耗）+ 5（3 分散再触发）
    const lw = wins(w)!;
    expect(lw.total).toBe(360);
    expect(lw.triggeredFree).toBe(5);
    expect(cur(w, 'win')).toBe(360);
  });

  it('下注升降：betStep 20 在 [betMin 20, betMax 50] 内钳制，不触发旋转', () => {
    const { w, pulse } = slotWorld(GRID_DICE, { betUpSignal: 'betup', betDownSignal: 'betdown', betStep: 20, betMin: 20, betMax: 50 }, { bet: 40 });
    pulse('betup');
    expect(cur(w, 'bet')).toBe(50); // 40+20 钳上限 50
    pulse('betup');
    expect(cur(w, 'bet')).toBe(50);
    pulse('betdown');
    expect(cur(w, 'bet')).toBe(30);
    pulse('betdown');
    expect(cur(w, 'bet')).toBe(20); // 30-20=10 钳下限 20
    expect(wins(w)).toBeUndefined(); // 没发 spin 信号 → 全程未结算
    expect(cur(w, 'balance')).toBe(1000);
  });
});

describe('t3-slot-payout — 拒绝/边界（「什么都没发生」分支）', () => {
  it('余额不足且非免费 → 不扣不判不写 LineWins', () => {
    const { w, pulse } = slotWorld(GRID_DICE, {}, { balance: 5 }); // 5 < 注 30
    pulse('spin');
    expect(cur(w, 'balance')).toBe(5);
    expect(cur(w, 'win')).toBe(0);
    expect(wins(w)).toBeUndefined();
  });

  it('掷轮结果不足 reels×rows → 本拍不解算（不扣注不记账）', () => {
    const { w, pulse } = slotWorld([1, 0, 9, 1].map(fixed)); // 只 4 颗骰 < 9 格
    pulse('spin');
    expect(w.getComponent<RolledDice>('reels', 'RolledDice')!.results).toHaveLength(4); // 轮确实掷了
    expect(cur(w, 'balance')).toBe(1000); // 但机器整单不动
    expect(wins(w)).toBeUndefined();
  });

  it('无 spin 信号 → 不掷不判（多拍空转零变化）', () => {
    const { w } = slotWorld(GRID_DICE);
    for (let i = 0; i < 3; i++) w.tick();
    expect(w.getComponent('reels', 'RolledDice')).toBeUndefined();
    expect(wins(w)).toBeUndefined();
    expect(cur(w, 'balance')).toBe(1000);
  });
});

describe('t3-slot-payout — 确定性（真随机轮·同 seed 双世界对拍）', () => {
  it('seed=777 两旋：双世界网格/结算/余额逐位一致，且与实跑 golden 相符', () => {
    const run = (): { grids: number[][]; lw: LineWins; balance: number } => {
      const { w, pulse } = slotWorld(Array.from({ length: 9 }, mixed));
      const grids: number[][] = [];
      pulse('spin');
      grids.push(w.getComponent<RolledDice>('reels', 'RolledDice')!.results.map((d) => d.value));
      pulse('spin');
      grids.push(w.getComponent<RolledDice>('reels', 'RolledDice')!.results.map((d) => d.value));
      return { grids, lw: { ...wins(w)! }, balance: cur(w, 'balance') };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b); // lockstep：同 seed 同布置 → 同轨迹
    // golden（实跑真管线取值）：旋1 全空（-30）；旋2 中线 [8,8,1] 百搭代入符号1 ×3 = 100、分散 2 不达标
    expect(a.grids).toEqual([[8, 0, 1, 0, 1, 0, 1, 8, 1], [8, 8, 9, 0, 8, 1, 9, 1, 0]]);
    expect(a.balance).toBe(1040); // 1000 - 30 + 0 - 30 + 100
    expect(a.lw).toMatchObject({ spin: 2, total: 100, scatterCount: 2, triggeredFree: 0, wins: [{ line: 1, symbol: 1, count: 3, pay: 100 }] });
  });
});
