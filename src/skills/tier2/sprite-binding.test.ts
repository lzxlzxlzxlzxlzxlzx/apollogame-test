import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { SpriteBinding, Resource, Hierarchy, Sprite, Color, Frame, State, Flag } from '@engine/protocol/components.js';
import { spriteBindingCapability } from './sprite-binding.js';
import { resourceCapability } from '@atom-skills/resource/index.js';

type Cap = { systems: ReadonlyArray<Parameters<World['addSystem']>[0]> };
function mk(...extra: Cap[]): World {
  const w = new World();
  for (const cap of [spriteBindingCapability as unknown as Cap, ...extra]) for (const s of cap.systems) w.addSystem(s);
  return w;
}

/** 挂一个"长得像地块"的实体：Sprite + Color + Frame + SpriteBinding。st/fl 给两轴用。 */
function tile(
  w: World, id: string, b: Omit<SpriteBinding, 'type'>,
  slots: { sprite?: boolean; color?: boolean; frame?: boolean; st?: string; fl?: { id: string; active: boolean } } = {},
): void {
  w.createEntity(id);
  if (slots.sprite !== false) w.addComponent(id, { type: 'Sprite', textureKey: 'base', anchorX: 0.5, anchorY: 0.5, zOrder: 0 } as Sprite);
  if (slots.color !== false) w.addComponent(id, { type: 'Color', tint: 0x111111, alpha: 1 } as Color);
  if (slots.frame) w.addComponent(id, { type: 'Frame', index: 0, total: 4 } as Frame);
  if (slots.st !== undefined) w.addComponent(id, { type: 'State', fsmId: 'tile', current: slots.st, previous: slots.st } as State);
  if (slots.fl) w.addComponent(id, { type: 'Flag', id: slots.fl.id, active: slots.fl.active } as Flag);
  w.addComponent(id, { type: 'SpriteBinding', ...b } as SpriteBinding);
}
/** 建一个全局资源（R11 auto 路由用）。 */
function res(w: World, id: string, value: number, max = 9): void {
  w.createEntity(`res_${id}`); w.addComponent(`res_${id}`, { type: 'Resource', id, current: value, min: 0, max } as Resource);
}
const key = (w: World, id: string) => w.getComponent<Sprite>(id, 'Sprite')!.textureKey;
const tint = (w: World, id: string) => w.getComponent<Color>(id, 'Color')!.tint;
const fidx = (w: World, id: string) => w.getComponent<Frame>(id, 'Frame')!.index;

describe('T2 sprite-binding（Resource→外观投影，REQ-G109-004）', () => {
  it('契约：PostResolve 终态投影 / 读 SpriteBinding+Resource+Hierarchy+State+Flag / 写 Sprite+Color+Frame', () => {
    expect(spriteBindingCapability.components.reads).toEqual(['SpriteBinding', 'Resource', 'Hierarchy', 'State', 'Flag']);
    expect(spriteBindingCapability.components.writes).toEqual(['Sprite', 'Color', 'Frame']);
    expect(spriteBindingCapability.systems[0].phase).toBe(SystemPhase.PostResolve);
    // 系统的读面必须与组件读面一致（漏申报 = 定序器看不见这条边 ⇒ 静默乱序）。
    expect(spriteBindingCapability.systems[0].reads).toEqual(spriteBindingCapability.components.reads);
  });

  // ── 本件存在的理由：渲染器早在读 Frame.index（canvas-renderer:87 → assets.resolve(key,frame)），
  //    但从来没人写它。这条断言钉死"那条路现在有生产者了"。
  it('生长阶三支同时投影：skins→Sprite.textureKey / tints→Color.tint / frames→Frame.index', () => {
    const w = mk();
    res(w, 'stage', 0);
    tile(w, 't', { resourceId: 'stage', skins: ['crop/0', 'crop/1', 'crop/2'], tints: [0x6b4b2a, 0x8a6a45, 0xd97a3a], frames: [0, 1, 2] }, { frame: true });
    w.tick();
    expect([key(w, 't'), tint(w, 't'), fidx(w, 't')]).toEqual(['crop/0', 0x6b4b2a, 0]); // 荒地阶
    w.getComponent<Resource>('res_stage', 'Resource')!.current = 2;
    w.tick();
    expect([key(w, 't'), tint(w, 't'), fidx(w, 't')]).toEqual(['crop/2', 0xd97a3a, 2]); // 成熟阶 —— 同一格，长相全变
  });

  it('夹取：负数饱和到 0、超长饱和到 len-1（越界数据不外溢成越界下标）', () => {
    const w = mk();
    res(w, 'stage', 0);
    tile(w, 't', { resourceId: 'stage', tints: [0xaaaaaa, 0xbbbbbb] });
    w.getComponent<Resource>('res_stage', 'Resource')!.current = -5; w.tick();
    expect(tint(w, 't')).toBe(0xaaaaaa);
    w.getComponent<Resource>('res_stage', 'Resource')!.current = 99; w.tick();
    expect(tint(w, 't')).toBe(0xbbbbbb);
  });

  // ── 三支**各自独立可选**（这是刻意的：S6 上真图时往往只补 skins，不动别支）。
  it('三支互不牵连：只给 tints → Sprite.textureKey / Frame.index 一动不动', () => {
    const w = mk();
    res(w, 'stage', 1);
    tile(w, 't', { resourceId: 'stage', tints: [0x1, 0x2] }, { frame: true });
    w.tick();
    expect(tint(w, 't')).toBe(0x2);
    expect(key(w, 't')).toBe('base'); // 未被碰
    expect(fidx(w, 't')).toBe(0); // 未被碰
  });

  it('三支长度各自独立：skins 2 支 / tints 3 支，各按自己的长度夹取', () => {
    const w = mk();
    res(w, 'stage', 0);
    tile(w, 't', { resourceId: 'stage', skins: ['a', 'b'], tints: [0x1, 0x2, 0x3] });
    w.getComponent<Resource>('res_stage', 'Resource')!.current = 2; w.tick();
    expect(key(w, 't')).toBe('b'); // 夹到 skins[1]
    expect(tint(w, 't')).toBe(0x3); // tints[2] 恰好存在
  });

  it('fromParent：每格各持一份同名 stage 时读宿主（同 gauge/text-binding 寻址）', () => {
    const w = mk();
    w.createEntity('host');
    w.addComponent('host', { type: 'Resource', id: 'stage', current: 2, min: 0, max: 3 } as Resource);
    tile(w, 'skin', { resourceId: 'stage', fromParent: true, tints: [0x1, 0x2, 0x3] });
    w.addComponent('skin', { type: 'Hierarchy', parentId: 'host', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);
    w.tick();
    expect(tint(w, 'skin')).toBe(0x3);
  });

  it('健壮：资源缺失/对不上 → 本拍不动；三支落点全缺 → 不抛', () => {
    const w = mk();
    tile(w, 'orphan', { resourceId: 'nope', tints: [0x99] });
    tile(w, 'noSlots', { resourceId: 'nope' }, { sprite: false, color: false });
    expect(() => w.tick()).not.toThrow();
    expect(tint(w, 'orphan')).toBe(0x111111); // 原样
  });

  it('健壮：给了 frames 但实体没有 Frame 组件 → 跳过该支，不抛、不擅自造组件', () => {
    const w = mk();
    res(w, 'stage', 1);
    tile(w, 't', { resourceId: 'stage', frames: [7, 8] }); // 没给 frame 槽
    expect(() => w.tick()).not.toThrow();
    expect(w.getComponent<Frame>('t', 'Frame')).toBeUndefined();
  });

  it('PostResolve 终态：同帧资源结算后再投影（与本拍最终 Resource 同帧见终值）', () => {
    const w = mk(resourceCapability as Cap);
    res(w, 'stage', 0);
    tile(w, 't', { resourceId: 'stage', tints: [0xaaaaaa, 0xbbbbbb, 0xcccccc] });
    w.tick();
    expect(tint(w, 't')).toBe(0xaaaaaa);
    w.addComponent('res_stage', { type: 'ResourceModify', resourceId: 'stage', amount: 2 } as never);
    w.tick();
    expect(tint(w, 't')).toBe(0xcccccc); // Update 落账 → PostResolve 投影，同帧
  });

  it('确定性：同数据两次跑同外观（本件写的值进 hash·须纯函数）', () => {
    const run = () => {
      const w = mk();
      res(w, 'stage', 1);
      tile(w, 't', { resourceId: 'stage', skins: ['a', 'b', 'c'], tints: [1, 2, 3], frames: [4, 5, 6] }, { frame: true });
      w.tick(); w.tick();
      return `${key(w, 't')}|${tint(w, 't')}|${fidx(w, 't')}`;
    };
    expect(run()).toBe(run());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  δ 轴（owner 2026-09-18 裁「δ 全轴」）：下标从单轴扩成**行×列合成**。
//  为什么要这一轴：一实体一类组件只有一个槽——「生命周期」在 State、「今日已浇」在 Flag、
//  「生长阶」在 Resource，三个事实三个槽。一格地要同时表达「荒/翻/播 × 浇没浇 × 第几阶」，
//  单轴下标表达不了（会变成「不知道谁是谁」的错色）。合成下标让作者按二维表填 tints 即可。
// ═══════════════════════════════════════════════════════════════════════════
describe('T2 sprite-binding · δ 轴（State 行 × Flag 最低位 × Resource 列）', () => {
  const SIX = [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]; // 6 行表：荒干/荒湿/翻干/翻湿/播干/播湿

  it('行轴（states）：State→行号，同一格换状态即换色', () => {
    const w = mk();
    tile(w, 't', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], tints: [0xa0, 0xa1, 0xa2] }, { st: 'wild' });
    w.tick();
    expect(tint(w, 't')).toBe(0xa0);
    w.getComponent<State>('t', 'State')!.current = 'sown';
    w.tick();
    expect(tint(w, 't')).toBe(0xa2);
  });

  it('最低位轴（flagId）：行号 = 行*2 + (Flag.active?1:0) —— 一格一色不撞车', () => {
    const w = mk();
    tile(w, 't', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], flagId: 'watered', tints: SIX },
      { st: 'sown', fl: { id: 'watered', active: false } });
    w.tick();
    expect(tint(w, 't')).toBe(0xa4); // sown 行 2 → 2*2+0 = 4
    w.getComponent<Flag>('t', 'Flag')!.active = true;
    w.tick();
    expect(tint(w, 't')).toBe(0xa5); // 2*2+1 = 5（浇过的播格）
    w.getComponent<State>('t', 'State')!.current = 'tilled';
    w.tick();
    expect(tint(w, 't')).toBe(0xa3); // 1*2+1 = 3（浇过的翻格·现实中不可达，但表要自洽）
  });

  it('两轴（states + stride）：下标 = 行*stride + clamp(生长阶) —— 生命周期 × 生长阶', () => {
    const w = mk();
    res(w, 'stage', 0);
    // 3 行（荒/翻/播）× 4 列（0..3 阶）= 12 格表
    const T12 = Array.from({ length: 12 }, (_, i) => 0x100 + i);
    tile(w, 't', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], stride: 4, tints: T12 }, { st: 'sown' });
    w.tick();
    expect(tint(w, 't')).toBe(0x100 + 8); // 行 2 → 2*4 + 0
    w.getComponent<Resource>('res_stage', 'Resource')!.current = 3;
    w.tick();
    expect(tint(w, 't')).toBe(0x100 + 11); // 2*4 + 3 = 成熟阶
    w.getComponent<Resource>('res_stage', 'Resource')!.current = 99; // 越界 → 夹到列上界（不许溢进下一行）
    w.tick();
    expect(tint(w, 't')).toBe(0x100 + 11);
  });

  it('三轴叠加（states + flagId + stride）：行*2+湿 再乘列容量', () => {
    const w = mk();
    res(w, 'stage', 1);
    const T24 = Array.from({ length: 24 }, (_, i) => 0x200 + i);
    tile(w, 't', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], flagId: 'watered', stride: 4, tints: T24 },
      { st: 'sown', fl: { id: 'watered', active: true } });
    w.tick();
    expect(tint(w, 't')).toBe(0x200 + 21); // 行 (2*2+1)=5，列 stage=1 ⇒ 5*4 + 1 = 21
  });

  it('缺件·状态不在表里（瞬态 busy）→ 本拍不动，保持上一次长相', () => {
    const w = mk();
    tile(w, 't', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], tints: [0xa0, 0xa1, 0xa2] }, { st: 'sown' });
    w.tick();
    expect(tint(w, 't')).toBe(0xa2);
    w.getComponent<State>('t', 'State')!.current = 'busy'; // 只活在单拍内的瞬态
    w.tick();
    expect(tint(w, 't')).toBe(0xa2); // **不**退化成第 0 行——宁可不变，也不闪一下错的颜色
  });

  it('缺件·找不到对应 Flag → 本拍不动（与「资源缺失/对不上」同一条纪律）', () => {
    const w = mk();
    tile(w, 't', { resourceId: 'stage', states: ['wild'], flagId: 'nope', tints: [0xa0, 0xa1] }, { st: 'wild' });
    expect(() => w.tick()).not.toThrow();
    expect(tint(w, 't')).toBe(0x111111); // 原样（夹具初值）
  });

  it('stride≤1（只按行着色）→ 不读资源：实体没有 Resource 组件也能着色', () => {
    const w = mk();
    tile(w, 't', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], tints: [0xa0, 0xa1, 0xa2] }, { st: 'tilled' });
    expect(() => w.tick()).not.toThrow();
    expect(tint(w, 't')).toBe(0xa1); // 本实体无 Resource，仍按行着色（单轴时这里会被卡住）
  });

  it('合成模式的寻址也认 fromParent：读宿主那格的 State/Flag', () => {
    const w = mk();
    w.createEntity('host');
    w.addComponent('host', { type: 'State', fsmId: 'tile', current: 'sown', previous: 'tilled' } as State);
    w.addComponent('host', { type: 'Flag', id: 'watered', active: true } as Flag);
    tile(w, 'skin', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], flagId: 'watered', tints: SIX, fromParent: true });
    w.addComponent('skin', { type: 'Hierarchy', parentId: 'host', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);
    w.tick();
    expect(tint(w, 'skin')).toBe(0xa5); // 宿主：sown + 已浇 = 行 5
  });

  it('确定性：合成下标也是纯查表（两次跑同值）', () => {
    const run = () => {
      const w = mk();
      res(w, 'stage', 2);
      tile(w, 't', { resourceId: 'stage', states: ['wild', 'tilled', 'sown'], flagId: 'watered', stride: 4, tints: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] },
        { st: 'sown', fl: { id: 'watered', active: true } });
      w.tick(); w.tick();
      return tint(w, 't');
    };
    expect(run()).toBe(run());
  });
});
