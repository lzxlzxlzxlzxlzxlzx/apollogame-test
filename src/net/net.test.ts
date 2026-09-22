import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';
import type { Command } from './commands.js';
import { applyCommands, orderCommands } from './commands.js';
import { hashSnapshot } from './determinism.js';
import { FixedStepClock } from './fixed-step.js';
import { LockstepSession } from './lockstep.js';
import { buildArena as makeArena } from './arena.js';

function step(w: World, cmds: Command[]): void {
  applyCommands(w, cmds);
  w.tick();
}

const moveA = (tick: number, dx: number, dy: number): Command => ({ playerId: 'A', tick, move: { dx, dy } });
const moveB = (tick: number, dx: number, dy: number): Command => ({ playerId: 'B', tick, move: { dx, dy } });

describe('确定性守卫: hashSnapshot', () => {
  it('顺序无关：组件插入顺序不同但状态相同 → 哈希相同', () => {
    const a = new World();
    a.createEntity('e');
    a.addComponent('e', { type: 'Transform', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    a.addComponent('e', { type: 'Velocity', vx: 5, vy: 6, angular: 0 } as Velocity);

    const b = new World();
    b.createEntity('e');
    b.addComponent('e', { type: 'Velocity', vx: 5, vy: 6, angular: 0 } as Velocity); // 反序加入
    b.addComponent('e', { type: 'Transform', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);

    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
  });

  it('敏感：任一字段变化 → 哈希变化', () => {
    const a = makeArena();
    const before = hashSnapshot(a.snapshot());
    step(a, [moveA(1, 1, 0)]); // alice 右移
    expect(hashSnapshot(a.snapshot())).not.toBe(before);
  });

  // ── 表现层组件不进 hash（Mesh3D/Coachmark 曾漏登记，是潜伏 desync 雷） ──
  it('排除表现组件：仅 Coachmark 不同的两世界 → 同 hash', () => {
    const base = { e: { Resource: { type: 'Resource', current: 5 } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    const withCoach = { e: { Resource: { type: 'Resource', current: 5 }, Coachmark: { type: 'Coachmark', anchorId: 'btn', shape: 'rect' } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    expect(hashSnapshot(base)).toBe(hashSnapshot(withCoach));
  });
  it('排除表现组件：仅 Mesh3D 字段不同的两世界 → 同 hash', () => {
    const a = { e: { Mesh3D: { type: 'Mesh3D', kind: 'box' } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    const b = { e: { Mesh3D: { type: 'Mesh3D', kind: 'sphere' } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    expect(hashSnapshot(a)).toBe(hashSnapshot(b));
  });

  // ── 字符串值转义：分隔符不再能伪造结构 → 两个不同状态不碰撞（desync 不漏检） ──
  it('防碰撞：字符串内含分隔符的两个不同状态 → hash 不同', () => {
    const a = { e: { Tag: { type: 'Tag', a: '1,b=2' } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    const b = { e: { Tag: { type: 'Tag', a: '1', b: '2' } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    expect(hashSnapshot(a)).not.toBe(hashSnapshot(b));
  });

  // ── undefined 字段 ≡ 缺席：防「写 field=undefined」的 writer 造成跨端 hash 分裂 ──
  it('undefined 字段等同缺席 → 同 hash', () => {
    const withU = { e: { Resource: { type: 'Resource', current: 5, extra: undefined } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    const without = { e: { Resource: { type: 'Resource', current: 5 } } } as unknown as import('@engine/core/types.js').WorldSnapshot;
    expect(hashSnapshot(withU)).toBe(hashSnapshot(without));
  });
});

describe('固定步长: FixedStepClock', () => {
  it('同样总时长 → 同样步数，与帧如何切分无关（渲染解耦）', () => {
    const run = (frames: number[]): number => {
      const c = new FixedStepClock(50); // stepMs = 20，整除无浮点漂移
      return frames.reduce((sum, f) => sum + c.advance(f), 0);
    };
    const smooth = Array(50).fill(20); // 平滑 50fps，共 1000ms
    const jitter: number[] = []; // 抖动，但同样累计 1000ms
    let remaining = 1000;
    const sizes = [8, 12, 20, 40, 4, 16];
    let i = 0;
    while (remaining > 0) {
      const f = Math.min(sizes[i++ % sizes.length], remaining);
      jitter.push(f);
      remaining -= f;
    }
    expect(run(smooth)).toBe(50);
    expect(run(jitter)).toBe(run(smooth));
  });

  it('单帧超长 → 步数封顶（防死亡螺旋），并钳制超长间隔', () => {
    const c = new FixedStepClock(50, { maxSteps: 5, maxFrameMs: 250 });
    expect(c.advance(100000)).toBe(5); // 钳到 250ms → 12.5 步，但封顶 5
  });

  // ── 2026-08-22 测试大扫除补钉：封顶/负帧/非整除三条边界（此前特意整除回避·丢积压语义零测试）──
  it('封顶清积压：触顶那帧后积压归零——下一帧不补跑欠账（fixed-step.ts 丢弃语义）', () => {
    const c = new FixedStepClock(50, { maxSteps: 5, maxFrameMs: 250 });
    expect(c.advance(100000)).toBe(5);
    expect(c.advance(0)).toBe(0); // 积压已弃：不继续吐步（删掉 acc=0 那行即红）
    expect(c.advance(20)).toBe(1); // 恢复正常节奏
  });

  it('负 frameMs 钳为 0：不产步、不负积累（时钟回拨防线）', () => {
    const c = new FixedStepClock(50);
    expect(c.advance(-500)).toBe(0);
    expect(c.advance(20)).toBe(1); // 负帧没有吃掉后续积累
  });

  it('非整除步长（60Hz·stepMs=16.6̄）长跑 600 帧：总步数与理论值一致（浮点不漂）', () => {
    const c = new FixedStepClock(60);
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += c.advance(16.67);
    expect(steps).toBe(Math.floor((16.67 * 600) / (1000 / 60)));
  });
});

describe('确定性: 独立双世界 + 同输入 → 逐 tick 同哈希', () => {
  it('相同 blueprint + 相同命令脚本，每个 tick 哈希都一致', () => {
    const w1 = makeArena();
    const w2 = makeArena();
    const script: Command[][] = [
      [moveA(1, 1, 0)],
      [moveA(2, 1, 0), moveB(2, 0, 1)],
      [moveB(3, -1, 0)],
      [], // 无人操作 → 都应静止
      [moveA(5, 0, -1), moveB(5, 1, 1)],
    ];
    script.forEach((cmds) => {
      step(w1, cmds);
      step(w2, cmds);
      expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot()));
    });
  });

  it('命令到达顺序无关：正序与反序应用结果相同', () => {
    const w1 = makeArena();
    const w2 = makeArena();
    const cmds = [moveA(1, 1, 0), moveB(1, -1, 1)];
    step(w1, cmds);
    step(w2, [...cmds].reverse());
    expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot()));
    // 全序钉死（2026-08-22 测试大扫除）：按 playerId 升序；同 playerId 保持到达序
    // （Array.sort 稳定性=现契约——「顺序只由内容决定」只到 playerId 粒度，同人多令靠到达序，钉住防漂）
    const mixed = [moveB(1, 0, 1), moveA(1, 1, 0), moveB(1, 1, 0)];
    const ordered = orderCommands(mixed);
    expect(ordered.map((c) => c.playerId)).toEqual(['A', 'B', 'B']);
    expect(ordered[1]).toBe(mixed[0]); // 同 playerId：到达序保持
    expect(ordered[2]).toBe(mixed[2]);
  });
});

describe('Lockstep 双端 + 确定性守卫', () => {
  it('同一组命令派发给所有对端 → 每 tick 都 inSync', () => {
    const session = new LockstepSession([
      { id: 'peerA', world: makeArena() },
      { id: 'peerB', world: makeArena() },
    ]);
    for (let t = 1; t <= 8; t++) {
      const r = session.advance([moveA(t, 1, 0), moveB(t, 0, 1)]);
      expect(r.inSync).toBe(true);
      expect(r.hash).not.toBeNull();
    }
    expect(session.currentTick).toBe(8);
  });

  it('丢包：某对端漏收一条命令 → 守卫在那一 tick 报 desync', () => {
    const session = new LockstepSession([
      { id: 'peerA', world: makeArena() },
      { id: 'peerB', world: makeArena() },
    ]);
    const cmd = [moveA(1, 1, 0)];
    expect(session.advance(cmd).inSync).toBe(true); // tick1 正常
    expect(session.advance(cmd).inSync).toBe(true); // tick2 正常

    // tick3：peerB "丢包"，没收到 A 的命令 → 两端状态分叉
    const r = session.advanceDivergent((peerId) => (peerId === 'peerB' ? [] : cmd));
    expect(r.inSync).toBe(false);
    expect(r.hash).toBeNull();
    const ha = r.peers.find((p) => p.id === 'peerA')!.hash;
    const hb = r.peers.find((p) => p.id === 'peerB')!.hash;
    expect(ha).not.toBe(hb);
  });
});

describe('lockstep hash — 创建序盲区 canary（REQ-NETGAPS③·记档性钉子·非缺陷断言）', () => {
  it('组件内容相同·创建序不同 → hashSnapshot 相等而 query 序不同（lockstep 对此分叉不可见·设计变更前本测钉住现状）', () => {
    // world-restore-order.test 注释点名的「最阴的坑」：canonical 按 id 排序 → 两端内容同、创建序异
    // 时永远 inSync，但 query 序不同、行为可随时间发散。存档线已用 hashWithOrder fail-closed
    // （REQ-SAVEORDER），lockstep 仍纯 hashSnapshot——并 order 入 lockstep hash 属设计变更（另议·
    // REQ-NETGAPS③）。谁把它修了，本测的「相等」断言会红 → 有意识地更新此钉，而非静默改语义。
    const build = (order: 'ab' | 'ba'): World => {
      const w = new World();
      const add = (id: string): void => { w.createEntity(id); w.addComponent(id, { type: 'HexPos', q: id === 'a' ? 1 : 2, r: 0 } as never); };
      if (order === 'ab') { add('a'); add('b'); } else { add('b'); add('a'); }
      return w;
    };
    const w1 = build('ab');
    const w2 = build('ba');
    expect(w1.snapshotOrder()).not.toEqual(w2.snapshotOrder()); // 创建序真的不同（盲区非假设）
    expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot())); // 而 hash 看不见它 = 盲区本体
  });
});
