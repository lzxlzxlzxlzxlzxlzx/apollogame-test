import { expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { EntityId, IWorld } from '@engine/core/types.js';
import type { Flag, EventWhen, Resource } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/determinism.js';

// ═══════════════════════════════════════════════════════════════
//  test-kit —— capability 语义测试的共用夹具（owner 2026-09-10「从测试角度设计更好的 case」）
//
//  全库 6 处手写「for (c of caps) for (s of c.systems) w.addSystem(s)」、4 份 tickN、3 份「Flag+EventWhen 当按钮」、
//  7 处「两个世界各跑一遍比 hash」——同形散落 = 每份都可能少一个边界。收成一处，写 capability 测试只写语义：
//    · worldWith(...caps)         装系统
//    · button / press              真实信号源（event-when 每拍先清全场 Signal 再产出——直接 addComponent Signal 会被清掉）
//    · tickN                       推进
//    · expectDeterministic         同构建同驱动两世界 → 终态 hash 相等（lockstep 契约）
//    · expectRestoreContinues      跑到一半 snapshot+restore 到新世界，两边继续跑 → hash 相等（存档契约·顺序一起存）
//    · expectQuiescent             无输入连跑 N 拍 hash 不变（「静止世界零写入」·防每拍记脏/自激）
//  三条 expect* 是每个带运行态组件的 capability 都该有的「契约三件套」。
// ═══════════════════════════════════════════════════════════════

/** 新世界 + 装上这些能力的全部 system。 */
export function worldWith(...caps: readonly CapabilityDefinition[]): World {
  const w = new World();
  for (const c of caps) for (const s of c.systems) w.addSystem(s);
  return w;
}

export function tickN(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.tick();
}

/** 在实体 id 上装一个「按钮」：Flag{id:flagId} 为真的拍产出 Signal{name:signal}（level 模式）。返回 flagId。 */
export function button(w: IWorld, id: EntityId, signal: string, flagId = `${id}:press`): string {
  if (!w.hasComponent(id, 'Flag') && !w.getAllEntities().includes(id)) w.createEntity(id);
  w.addComponent<Flag>(id, { type: 'Flag', id: flagId, active: false });
  w.addComponent<EventWhen>(id, { type: 'EventWhen', signal, when: { kind: 'flag', id: flagId }, mode: 'level' } as EventWhen);
  return flagId;
}

/** 按住一拍：置 Flag 真 → tick → 复原。多个按钮同拍按 = 传多个 id。 */
export function press(w: World, ...ids: EntityId[]): void {
  const flags = ids.map((id) => w.getComponent<Flag>(id, 'Flag')!);
  for (const f of flags) f.active = true;
  w.tick();
  for (const f of flags) f.active = false;
}

export function resourceOf(w: IWorld, eid: EntityId): number {
  return w.getComponent<Resource>(eid, 'Resource')?.current ?? NaN;
}

/** 同构建 + 同驱动的两个世界终态 hash 相等（lockstep/回放契约）。 */
export function expectDeterministic(build: () => World, drive: (w: World) => void): void {
  const a = build(); const b = build();
  drive(a); drive(b);
  expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
}

/**
 * 存档契约：世界 A 跑完 before 段 → snapshot（连创建序）→ restore 进新建世界 B；A、B 再各跑 after 段 → hash 相等。
 * 抓的是「运行态没进组件 / 私藏在闭包或 Map 里」这一类 bug（restore 后行为分叉）。
 */
export function expectRestoreContinues(build: () => World, before: (w: World) => void, after: (w: World) => void): void {
  const a = build();
  before(a);
  const snap = JSON.parse(JSON.stringify(a.snapshot()));
  const order = a.getAllEntities();
  const b = build();
  b.restore(snap, order);
  expect(hashSnapshot(b.snapshot())).toBe(hashSnapshot(a.snapshot()));
  after(a); after(b);
  expect(hashSnapshot(b.snapshot())).toBe(hashSnapshot(a.snapshot()));
}

/** 静止契约：无输入连跑 n 拍，世界 hash 逐拍不变（允许 settle 拍先把瞬态跑掉）。 */
export function expectQuiescent(w: World, n = 5, settle = 0): void {
  tickN(w, settle);
  const h0 = hashSnapshot(w.snapshot());
  for (let i = 0; i < n; i++) { w.tick(); expect(hashSnapshot(w.snapshot()), `第 ${i + 1} 拍世界变了`).toBe(h0); }
}
