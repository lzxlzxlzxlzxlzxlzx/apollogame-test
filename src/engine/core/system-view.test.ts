import { describe, it, expect } from 'vitest';
import { World } from './world.js';
import { SystemView, StrictAccessError } from './system-view.js';
import { defineSystem } from './define-system.js';
import type { SystemDeclaration, Component, IWorld } from './types.js';

// P1a · SystemView / 写入通道 / defineSystem（engine-architecture-review-2026-09-02 §5 P1a）
// 三组：① 严格模式申报门（未申报读/写/查/摘 → 抛·点名系统与组件·只读深冻结）② 脏跟踪（生产模式也开）
// ③ 行为零变（非严格模式视图 = 透传·query 序/返回对象同一）。撤掉 world.ts 里 `execute(this.viewOf(system))`
// 一行 → ①② 全红（锚点）。

interface Pos extends Component { readonly type: 'Pos'; x: number; tags: number[] }
interface Vel extends Component { readonly type: 'Vel'; vx: number }
interface Other extends Component { readonly type: 'Other'; n: number }

function seed(w: World): void {
  w.createEntity('a');
  w.addComponent<Pos>('a', { type: 'Pos', x: 0, tags: [1] });
  w.addComponent<Vel>('a', { type: 'Vel', vx: 2 });
  w.addComponent<Other>('a', { type: 'Other', n: 0 });
}
const sys = (partial: Partial<SystemDeclaration> & { execute: SystemDeclaration['execute'] }): SystemDeclaration => ({
  id: 'probe', reads: [], writes: [], consumes: [], ...partial,
});

describe('SystemView · 严格模式申报门', () => {
  it('未申报的 get / has / query / add / remove 各自抛 StrictAccessError（点名系统 + 组件）', () => {
    const w = new World({ strict: true });
    seed(w);
    const v = new SystemView(w, sys({ id: 'mover', reads: ['Vel'], writes: ['Pos'], execute() {} }), true);
    expect(() => v.getComponent('a', 'Other')).toThrow(/系统 "mover" 读取 组件 "Other"/);
    expect(() => v.hasComponent('a', 'Other')).toThrow(StrictAccessError);
    expect(() => v.query('Pos', 'Other')).toThrow(/按类型查询 组件 "Other"/);
    expect(() => v.addComponent<Other>('a', { type: 'Other', n: 1 })).toThrow(/挂上 组件 "Other"/);
    expect(() => v.removeComponent('a', 'Other')).toThrow(/摘掉 组件 "Other"/);
    // 只申报 reads 的类型：add/remove 也算写 → 抛，且提示「只申报了 reads」
    expect(() => v.addComponent<Vel>('a', { type: 'Vel', vx: 0 })).toThrow(/只申报了 reads/);
  });

  it('只申报 reads 的组件是深只读：改字段 / push 数组 / 删字段 都抛；writes 的组件是活对象', () => {
    const w = new World({ strict: true });
    seed(w);
    const v = new SystemView(w, sys({ id: 'mover', reads: ['Vel', 'Pos'], writes: [], execute() {} }), true);
    const p = v.getComponent<Pos>('a', 'Pos')!;
    expect(() => { p.x = 5; }).toThrow(/改写了只读组件 "Pos"（字段 x）/);
    expect(() => { p.tags.push(2); }).toThrow(StrictAccessError);
    expect(() => { delete (p as Partial<Pos>).x; }).toThrow(StrictAccessError);
    expect(p.x).toBe(0); // 读照常
    const v2 = new SystemView(w, sys({ id: 'mover', reads: [], writes: ['Pos'], execute() {} }), true);
    const live = v2.getComponent<Pos>('a', 'Pos')!;
    live.x = 7;
    expect(w.getComponent<Pos>('a', 'Pos')!.x).toBe(7);
  });

  it('query 结果里的组件 Map 也受检：comps.get(未申报) 抛·comps.get(reads) 只读·comps.get(writes) 活', () => {
    const w = new World({ strict: true });
    seed(w);
    const v = new SystemView(w, sys({ id: 'q', reads: ['Vel'], writes: ['Pos'], execute() {} }), true);
    const [[, comps]] = v.query('Pos', 'Vel');
    expect(() => comps.get('Other')).toThrow(/经 query 结果读取 组件 "Other"/);
    expect(() => { (comps.get('Vel') as Vel).vx = 9; }).toThrow(StrictAccessError);
    (comps.get('Pos') as Pos).x = 3;
    expect(w.getComponent<Pos>('a', 'Pos')!.x).toBe(3);
    expect(comps.has('Pos')).toBe(true);
    expect(comps.size).toBe(3); // 其余 Map 面透传
  });

  it('tick 走视图：申报撒谎的系统在严格世界里一跑就炸（撤 world.ts 的 viewOf 接线 → 本断言红）', () => {
    const w = new World({ strict: true });
    seed(w);
    w.addSystem(sys({
      id: 'liar', reads: ['Pos'], writes: [], // 说只读 Pos
      execute(world) { world.getComponent<Pos>('a', 'Pos')!.x += 1; }, // 却改
    }));
    expect(() => w.tick()).toThrow(/系统 "liar" 改写了只读组件 "Pos"/);
    const w2 = new World({ strict: false });
    seed(w2);
    w2.addSystem(sys({ id: 'liar', reads: ['Pos'], writes: [], execute(world) { world.getComponent<Pos>('a', 'Pos')!.x += 1; } }));
    expect(() => w2.tick()).not.toThrow(); // 生产模式不设门（零开销）
  });

  it('本次 execute 内新建的实体：挂任何组件不受写门约束（生成≠改共享态）；下一次 execute 起它就是既有实体', () => {
    const w = new World({ strict: true });
    seed(w);
    let round = 0;
    w.addSystem(sys({
      id: 'spawner', reads: [], writes: [],
      execute(world) {
        round++;
        if (round === 1) { world.createEntity('n'); world.addComponent<Other>('n', { type: 'Other', n: 1 }); }
        else world.addComponent<Other>('n', { type: 'Other', n: 2 }); // 第二拍：n 已是既有实体 → 写门生效
      },
    }));
    expect(() => w.tick()).not.toThrow();
    expect(() => w.tick()).toThrow(/系统 "spawner" 挂上 组件 "Other"/);
  });

  it('横切观测组件 DebugTrace / ScoreTrace：不受申报门·不记脏', () => {
    const w = new World({ strict: true });
    seed(w);
    w.createEntity('t');
    w.addComponent('t', { type: 'DebugTrace', entries: [] } as Component);
    w.drainDirty();
    const v = new SystemView(w, sys({ id: 'x', reads: [], writes: [], execute() {} }), true);
    expect(() => v.query('DebugTrace')).not.toThrow();
    expect(() => v.getComponent('t', 'DebugTrace')).not.toThrow();
    expect(() => { (v.getComponent('t', 'DebugTrace') as unknown as { entries: number[] }).entries.push(1); }).not.toThrow();
    expect(w.dirtyCount).toBe(0);
  });

  it("report 模式：不抛·同类只 warn 一次·照常执行（盘点用）", () => {
    const w = new World({ strict: 'report' });
    seed(w);
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (m: string) => { warns.push(String(m)); };
    try {
      w.addSystem(sys({ id: 'liar-r', reads: ['Pos'], writes: [], execute(world) { world.getComponent<Pos>('a', 'Pos')!.x += 1; } }));
      w.tick(); w.tick();
    } finally { console.warn = orig; }
    expect(w.getComponent<Pos>('a', 'Pos')!.x).toBe(2); // 照改
    expect(warns.filter((m) => m.includes('"liar-r"')).length).toBe(1); // 只报一次
  });

  it('createEntity / destroyEntity 不受申报约束（销毁 = 写全部类型·无法逐一申报）', () => {
    const w = new World({ strict: true });
    seed(w);
    const v = new SystemView(w, sys({ id: 'gc', reads: [], writes: [], execute() {} }), true);
    expect(() => { v.createEntity('b'); v.destroyEntity('a'); }).not.toThrow();
    expect(w.getAllEntities()).toEqual(['b']);
  });
});

describe('World · 脏跟踪（写入通道·生产模式也开）', () => {
  it('create/add/remove/destroy/consume/restore 记脏；视图取 writes 组件记脏、取 reads 组件不记', () => {
    const w = new World({ strict: false });
    seed(w);
    expect(w.drainDirty()).toEqual(['a']);
    expect(w.dirtyCount).toBe(0);
    const reader = new SystemView(w, sys({ id: 'r', reads: ['Pos'], writes: [], execute() {} }), false);
    reader.getComponent('a', 'Pos');
    expect(w.dirtyCount).toBe(0);
    const writer = new SystemView(w, sys({ id: 'w', reads: [], writes: ['Pos'], execute() {} }), false);
    writer.getComponent('a', 'Pos');
    expect(w.drainDirty()).toEqual(['a']);
    writer.removeComponent('a', 'Pos');
    expect(w.drainDirty()).toEqual(['a']);
    w.createEntity('b');
    w.destroyEntity('b');
    expect(w.drainDirty()).toEqual(['b']);
  });

  it('tick 里 consume 清掉的实体记脏；restore 后全部实体皆脏', () => {
    const w = new World({ strict: false });
    seed(w);
    w.createEntity('z');
    w.addComponent<Other>('z', { type: 'Other', n: 1 });
    w.drainDirty();
    w.addSystem(sys({ id: 'eat', reads: ['Other'], writes: [], consumes: ['Other'], execute() {} }));
    w.tick();
    expect(w.drainDirty().sort()).toEqual(['a', 'z']);
    const snap = w.snapshot();
    const w2 = new World({ strict: false });
    w2.restore(snap, w.snapshotOrder());
    expect(w2.drainDirty().sort()).toEqual(['a', 'z']);
  });
});

describe('行为零变 · 非严格视图 = 透传', () => {
  it('视图与根返回同一组件对象·query 序逐位同·root 指回 World', () => {
    const w = new World({ strict: false });
    for (let i = 0; i < 5; i++) { w.createEntity(`e${i}`); w.addComponent<Pos>(`e${i}`, { type: 'Pos', x: i, tags: [] }); }
    const v = w.viewOf(sys({ id: 'p', reads: ['Pos'], writes: [], execute() {} }));
    expect(v.getComponent('e2', 'Pos')).toBe(w.getComponent('e2', 'Pos'));
    expect(v.query('Pos').map(([id]) => id)).toEqual(w.query('Pos').map(([id]) => id));
    expect(v.query('Pos')[1][1]).toBe(w.query('Pos')[1][1]);
    expect((v as IWorld).root).toBe(w);
    expect(w.root).toBe(w);
  });

  it('defineSystem：类型级申报对账——run 收到的世界只认申报过的类型名（tsc 门）·运行时与旧形状等价', () => {
    const mover = defineSystem({
      id: 'mover', reads: ['Vel'], writes: ['Pos'],
      run(world) {
        for (const [id] of world.query('Pos', 'Vel')) {
          const p = world.getComponent<Pos>(id, 'Pos')!;
          const v = world.getComponent<Vel>(id, 'Vel')!;
          p.x += v.vx;
          // @ts-expect-error 未申报的类型名 = 编译错（P1a 类型门）
          world.getComponent(id, 'Other');
        }
      },
    });
    expect(mover.reads).toEqual(['Vel']);
    expect(mover.writes).toEqual(['Pos']);
    expect(mover.consumes).toEqual([]);
    const w = new World({ strict: true });
    seed(w);
    w.addSystem(mover);
    // 严格模式下 run 里那句 @ts-expect-error 的未申报读会在运行时抛——这正是双门一致的证明
    expect(() => w.tick()).toThrow(/系统 "mover" 读取 组件 "Other"/);
  });
});

describe('P1b · tick 内事件总线 + 黑板单例', () => {
  it('emit/events：多读者·每实体多条·发出序·tick 末清空·不进快照', () => {
    const w = new World({ strict: true });
    seed(w);
    const seen: string[] = [];
    w.addSystem(sys({ id: 'producer', emits: ['hit'], execute(world) { world.emit('hit', { who: 'a', dmg: 1 }); world.emit('hit', { who: 'a', dmg: 2 }); } }));
    w.addSystem(sys({ id: 'listener-1', listens: ['hit'], execute(world) { seen.push(...world.events<{ dmg: number }>('hit').map((e) => `1:${e.dmg}`)); } }));
    w.addSystem(sys({ id: 'listener-2', listens: ['hit'], execute(world) { seen.push(...world.events<{ dmg: number }>('hit').map((e) => `2:${e.dmg}`)); } }));
    w.tick();
    expect(seen).toEqual(['1:1', '1:2', '2:1', '2:2']); // 两个读者都读到全部两条·发出序
    expect(w.events('hit')).toEqual([]); // tick 末清空
    expect(JSON.stringify(w.snapshot())).not.toContain('dmg'); // 不进快照
    // 拓扑：emitter → listener 推断边（listener 声明在 producer 之前也排在它后面）
    const w2 = new World({ strict: true });
    const order: string[] = [];
    w2.addSystem(sys({ id: 'L', listens: ['ev'], execute() { order.push('L'); } }));
    w2.addSystem(sys({ id: 'P', emits: ['ev'], execute(world) { order.push('P'); world.emit('ev', 1); } }));
    w2.tick();
    expect(order).toEqual(['P', 'L']);
  });

  it('严格模式：未申报 emits 的 emit / 未申报 listens 的 events 抛错点名', () => {
    const w = new World({ strict: true });
    w.addSystem(sys({ id: 'sneaky', execute(world) { world.emit('x', 1); } }));
    expect(() => w.tick()).toThrow(/系统 "sneaky" emit 事件 "x"，但没申报 emits/);
    const w2 = new World({ strict: true });
    w2.addSystem(sys({ id: 'peek', execute(world) { world.events('x'); } }));
    expect(() => w2.tick()).toThrow(/系统 "peek" 读事件 "x"，但没申报 listens/);
  });

  it('singleton：0 个 → undefined；1 个 → 该 id；>1 个严格模式抛、生产按创建序取首个（= 旧 query 取首个语义）', () => {
    const w = new World({ strict: true });
    expect(w.singleton('Pos')).toBeUndefined();
    w.createEntity('s1'); w.addComponent<Pos>('s1', { type: 'Pos', x: 1, tags: [] });
    expect(w.singleton('Pos')).toBe('s1');
    w.createEntity('s0'); w.addComponent<Pos>('s0', { type: 'Pos', x: 0, tags: [] });
    expect(() => w.singleton('Pos')).toThrow(/singleton\("Pos"\) 有 2 个持有者/);
    const prod = new World({ strict: false });
    prod.createEntity('later'); prod.createEntity('earlier');
    prod.addComponent<Pos>('later', { type: 'Pos', x: 1, tags: [] });
    prod.addComponent<Pos>('earlier', { type: 'Pos', x: 0, tags: [] });
    // later 先创建 → 创建序首个 = later（与 query('Pos') 首个一致）
    expect(prod.singleton('Pos')).toBe('later');
    expect(prod.query('Pos')[0][0]).toBe('later');
    // 视图：取单例受读申报门约束
    const v = new SystemView(w, sys({ id: 'nosee', execute() {} }), true);
    expect(() => v.singleton('Pos')).toThrow(/取单例 组件 "Pos"/);
  });
});
