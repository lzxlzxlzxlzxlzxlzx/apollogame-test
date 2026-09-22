import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { OverTime, TimedEffect, Status, Resource } from '@engine/protocol/components.js';
import { overTimeCapability, addTimedEffect } from './over-time.js';
import { resourceCapability } from '@atom-skills/index.js';

const FROZEN = 1 << 0;
const BURNING = 1 << 1;
const hp = (w: World, e: string): number => w.getComponent<Resource>(e, 'Resource')!.current;
const status = (w: World, e: string): number => w.getComponent<Status>(e, 'Status')?.flags ?? 0;
const ot = (w: World, e: string): OverTime | undefined => w.getComponent<OverTime>(e, 'OverTime');

// over-time 产局部 ResourceModify → resource-apply 结算。两系统即可（无需空间层）。
function world(): World {
  const w = new World();
  for (const s of overTimeCapability.systems) w.addSystem(s);
  for (const s of resourceCapability.systems) w.addSystem(s);
  return w;
}
function mob(w: World, id: string, effects: TimedEffect[], opts?: { hp?: number; statusFlags?: number }): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Resource', id: 'hp', current: opts?.hp ?? 100, min: 0, max: 100 } as Resource);
  if (opts?.statusFlags !== undefined) w.addComponent(id, { type: 'Status', flags: opts.statusFlags } as Status);
  w.addComponent(id, { type: 'OverTime', effects } as OverTime);
}

describe('over-time — 元数据 / 定序', () => {
  it('id 正确 + runsBefore resource-apply', () => {
    expect(overTimeCapability.id).toBe('t2-over-time');
    expect(overTimeCapability.systems[0].runsBefore).toContain('resource-apply');
  });
});

describe('over-time — DoT（中毒/燃烧）', () => {
  it('每 period tick 掉血，到期移除该效果、列表空则自销毁组件', () => {
    const w = world();
    mob(w, 'm1', [{ resource: 'hp', amountPerTick: -5, period: 2, duration: 6, elapsed: 0 }]);
    for (let i = 0; i < 6; i++) w.tick();
    expect(hp(w, 'm1')).toBe(85); // -5 ×3（elapsed 2/4/6）
    expect(ot(w, 'm1')).toBeUndefined(); // 列表空 → 自销毁
    w.tick();
    expect(hp(w, 'm1')).toBe(85);
  });

  it('DoT 受 Resource 下限钳制', () => {
    const w = world();
    mob(w, 'm1', [{ resource: 'hp', amountPerTick: -100, period: 1, duration: 3, elapsed: 0 }], { hp: 50 });
    for (let i = 0; i < 3; i++) w.tick();
    expect(hp(w, 'm1')).toBe(0);
  });
});

describe('over-time — 定时状态（冻结到期自动解除）', () => {
  it('duration 到点清 clearStatusOnEnd 位', () => {
    const w = world();
    mob(w, 'm1', [{ period: 1, duration: 3, elapsed: 0, clearStatusOnEnd: FROZEN }], { statusFlags: FROZEN });
    w.tick();
    w.tick();
    expect(status(w, 'm1') & FROZEN).toBe(FROZEN);
    w.tick();
    expect(status(w, 'm1') & FROZEN).toBe(0);
    expect(ot(w, 'm1')).toBeUndefined();
  });
});

describe('over-time — regen（永久）', () => {
  it('duration<=0 永久回复并钳上限，不自销毁', () => {
    const w = world();
    mob(w, 'm1', [{ resource: 'hp', amountPerTick: 10, period: 1, duration: 0, elapsed: 0 }], { hp: 50 });
    for (let i = 0; i < 6; i++) w.tick();
    expect(hp(w, 'm1')).toBe(100);
    expect(ot(w, 'm1')).toBeDefined();
  });
});

describe('over-time — R14 真修 B：多效果并存', () => {
  it('燃烧 + 冰冻同时存在，各自计时/到期', () => {
    const w = world();
    mob(
      w,
      'm1',
      [
        { id: 'burn', resource: 'hp', amountPerTick: -5, period: 1, duration: 3, elapsed: 0 },
        { id: 'frozen', period: 1, duration: 2, elapsed: 0, clearStatusOnEnd: FROZEN },
      ],
      { hp: 100, statusFlags: FROZEN | BURNING },
    );
    w.tick(); // burn -5 → 95；frozen elapsed1
    w.tick(); // burn -5 → 90；frozen elapsed2 到期 → 解冻
    expect(hp(w, 'm1')).toBe(90);
    expect(status(w, 'm1') & FROZEN).toBe(0); // 冰冻到期解除
    expect(ot(w, 'm1')?.effects.length).toBe(1); // burn 仍在
    w.tick(); // burn elapsed3 到期：-5 → 85 后移除，列表空
    expect(hp(w, 'm1')).toBe(85);
    expect(ot(w, 'm1')).toBeUndefined();
  });
});

describe('over-time — R14 真修 A：多 DoT 累加（不互相覆盖）', () => {
  it('同一实体两条 DoT 同帧各扣血 → 累加', () => {
    const w = world();
    mob(w, 'm1', [
      { resource: 'hp', amountPerTick: -3, period: 1, duration: 5, elapsed: 0 },
      { resource: 'hp', amountPerTick: -2, period: 1, duration: 5, elapsed: 0 },
    ]);
    w.tick();
    expect(hp(w, 'm1')).toBe(95); // -3 + -2 = -5（若覆盖只会 -2 或 -3）
    for (let i = 0; i < 3; i++) w.tick();
    expect(hp(w, 'm1')).toBe(80); // 4 tick × -5
  });
});

describe('over-time — addTimedEffect 助手', () => {
  it('无 OverTime → 新建；同 id → 刷新而非叠加；不同 id → 共存', () => {
    const w = new World();
    w.createEntity('m1');
    addTimedEffect(w, 'm1', { id: 'burn', resource: 'hp', amountPerTick: -5, period: 1, duration: 100, elapsed: 30 });
    expect(ot(w, 'm1')!.effects.length).toBe(1);
    addTimedEffect(w, 'm1', { id: 'burn', resource: 'hp', amountPerTick: -5, period: 1, duration: 100, elapsed: 0 }); // 刷新
    expect(ot(w, 'm1')!.effects.length).toBe(1);
    expect(ot(w, 'm1')!.effects[0].elapsed).toBe(0); // 重置
    addTimedEffect(w, 'm1', { id: 'frozen', period: 1, duration: 50, elapsed: 0, clearStatusOnEnd: FROZEN }); // 共存
    expect(ot(w, 'm1')!.effects.length).toBe(2);
  });
});

// A2 遗留缺口腿：period=0 / 负数边界（「什么都没发生」分支·实测钉现状）。
// 源码 over-time.ts:91 的 `ef.period >= 1` 门：非法 period 不做 elapsed % period → 无除零/NaN 风险，
// 资源脉冲整段停摆；duration 计时与到期清理**不受影响**。非 bug——按现状钉死。
describe('over-time — TimedEffect period=0 / 负数边界', () => {
  it('period=0 → 资源脉冲永不触发（不除零不 NaN），duration 照走到期自清', () => {
    const w = world();
    mob(w, 'm1', [{ resource: 'hp', amountPerTick: -5, period: 0, duration: 4, elapsed: 0 }]);
    expect(() => { for (let i = 0; i < 8; i++) w.tick(); }).not.toThrow(); // 不崩不死循环
    expect(hp(w, 'm1')).toBe(100);                 // 一滴血未掉（脉冲被 period>=1 门拒收）
    expect(Number.isNaN(hp(w, 'm1'))).toBe(false); // 无 NaN 污染
    expect(ot(w, 'm1')).toBeUndefined();           // elapsed 到 duration 仍正常过期 → 组件自清
  });

  it('period 负数 → 同 period=0：停摆不结算，到期自清（实测）', () => {
    const w = world();
    mob(w, 'm1', [{ resource: 'hp', amountPerTick: -5, period: -2, duration: 4, elapsed: 0 }]);
    expect(() => { for (let i = 0; i < 8; i++) w.tick(); }).not.toThrow();
    expect(hp(w, 'm1')).toBe(100);
    expect(ot(w, 'm1')).toBeUndefined();
  });
});

describe('over-time — 确定性', () => {
  it('同初值重跑一致', () => {
    const run = (): string => {
      const w = world();
      mob(w, 'm1', [{ resource: 'hp', amountPerTick: -3, period: 2, duration: 10, elapsed: 0 }]);
      mob(w, 'm2', [{ resource: 'hp', amountPerTick: 7, period: 3, duration: 0, elapsed: 0 }], { hp: 40 });
      for (let i = 0; i < 8; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});
