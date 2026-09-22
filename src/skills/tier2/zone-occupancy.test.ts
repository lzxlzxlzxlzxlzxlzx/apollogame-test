import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Tag, Flag, Zone } from '@engine/protocol/components.js';
import { zoneOccupancyCapability } from './zone-occupancy.js';

function worldWithZone(): World {
  const w = new World();
  for (const s of zoneOccupancyCapability.systems) w.addSystem(s);
  return w;
}
function at(w: World, eid: string, x: number, y: number, tagFlags?: number): void {
  if (!w.hasComponent(eid, 'Transform')) w.createEntity(eid);
  w.addComponent(eid, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  if (tagFlags !== undefined) w.addComponent(eid, { type: 'Tag', flags: tagFlags } as Tag);
}
function flag(w: World, id: string): void {
  const e = `flag:${id}`;
  if (!w.hasComponent(e, 'Flag')) w.createEntity(e);
  w.addComponent(e, { type: 'Flag', id, active: false } as Flag);
}
function zone(w: World, eid: string, z: Omit<Zone, 'type'>): void {
  if (!w.hasComponent(eid, 'Zone')) w.createEntity(eid);
  w.addComponent(eid, { type: 'Zone', ...z } as Zone);
}
function flagOn(w: World, id: string): boolean {
  return w.getComponent<Flag>(`flag:${id}`, 'Flag')!.active;
}

const RECT = { minX: 100, minY: 100, maxX: 200, maxY: 200 };

describe('T2 zone-occupancy — metadata', () => {
  it('id / 读写契约', () => {
    expect(zoneOccupancyCapability.id).toBe('t2-zone-occupancy');
    expect(zoneOccupancyCapability.components.writes).toEqual(['Flag']);
  });
});

describe('T2 zone-occupancy — 实体名单模式（coop-goal 语义）', () => {
  it('名单全部在内 → outFlag true；缺一 → false', () => {
    const w = worldWithZone();
    flag(w, 'coop-clear');
    zone(w, 'z', { outFlag: 'coop-clear', ...RECT, requiredEntities: ['pA', 'pB'] });
    at(w, 'pA', 150, 150);
    at(w, 'pB', 10, 10); // 区外
    w.tick();
    expect(flagOn(w, 'coop-clear')).toBe(false); // 缺一不可

    at(w, 'pB', 160, 160); // 进区
    w.tick();
    expect(flagOn(w, 'coop-clear')).toBe(true);

    at(w, 'pA', 0, 0); // A 离开
    w.tick();
    expect(flagOn(w, 'coop-clear')).toBe(false); // 离则灭（level 语义）
  });
});

describe('T2 zone-occupancy — Tag + count 模式', () => {
  it('区内带 Tag 的实体达到 count → true', () => {
    const w = worldWithZone();
    flag(w, 'plate_on');
    zone(w, 'z', { outFlag: 'plate_on', ...RECT, requiredTag: 0b01, count: 2 });
    at(w, 'p1', 120, 120, 0b01);
    at(w, 'p2', 180, 180, 0b01);
    at(w, 'box', 150, 150, 0b10); // 别的 Tag，不计
    w.tick();
    expect(flagOn(w, 'plate_on')).toBe(true); // 2 个 PLAYER 位实体在内

    at(w, 'p2', 0, 0); // 走掉一个 → 只剩 1 < 2
    w.tick();
    expect(flagOn(w, 'plate_on')).toBe(false);
  });
});

describe('T2 zone-occupancy — 边界 / 缺省阈值', () => {
  it('矩形边界含等号（恰在边上算在内）', () => {
    const w = worldWithZone();
    flag(w, 'reached');
    zone(w, 'z', { outFlag: 'reached', ...RECT, requiredEntities: ['hero'] });
    at(w, 'hero', 100, 200); // 恰在 minX/maxY 边上
    w.tick();
    expect(flagOn(w, 'reached')).toBe(true);
  });

  it('Tag 模式 count 缺省=1', () => {
    const w = worldWithZone();
    flag(w, 'occupied');
    zone(w, 'z', { outFlag: 'occupied', ...RECT, requiredTag: 0b01 });
    at(w, 'p1', 150, 150, 0b01);
    w.tick();
    expect(flagOn(w, 'occupied')).toBe(true); // 1 个即满足
  });
});

// ── A2 遗留缺口腿：两个 Zone 镜像同一 outFlag、判定一真一假 ──
// 实测（钉现状·非期望背书）：系统按 query 序（=创建序）逐 Zone 覆写 flag.active → **创建序末位 Zone 胜**。
// 创建序是世界数据的一部分（World.snapshotOrder 唯一真相），同数据双端仍逐字节一致 → lockstep 不破；
// 但「镜像双 Zone 共享一个 outFlag」的数据写法拿不到或/与语义，反序创建即翻终值——真语义是 last-wins。
// 想表达「任一/全部区域满足」：各 Zone 用独立 outFlag，再经 condition/event-when 组合。上报见评审报告。
describe('T2 zone-occupancy — 同 outFlag 双 Zone 冲突（last-wins·实测钉现状）', () => {
  const build = (reversed: boolean): World => {
    const w = worldWithZone();
    flag(w, 'out');
    at(w, 'hero', 150, 150);
    const zTrue = { outFlag: 'out', ...RECT, requiredEntities: ['hero'] };                    // hero 在内 → true
    const zFalse = { outFlag: 'out', minX: 0, minY: 0, maxX: 50, maxY: 50, requiredEntities: ['hero'] }; // hero 在外 → false
    const [first, second] = reversed ? [zFalse, zTrue] : [zTrue, zFalse];
    zone(w, 'zA', first);
    zone(w, 'zB', second);
    w.tick();
    return w;
  };
  it('真区先建·假区后建 → 末位（假）胜 → false（实测）', () => {
    expect(flagOn(build(false), 'out')).toBe(false);
  });
  it('反序创建（假先真后）→ 末位（真）胜 → true：终值确随创建序翻转（实测钉死 last-wins）', () => {
    expect(flagOn(build(true), 'out')).toBe(true);
  });
});
