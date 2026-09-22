import type { EntityId, ComponentType, Component, SystemDeclaration, IWorld } from './types.js';

// ═══════════════════════════════════════════════════════════════
//  SystemView —— 系统视图：系统只透过它碰世界（P1a · engine-architecture-review-2026-09-02 §5 P1a · D1/D2）
//
//  病：`World.tick()` 此前把整个 World 递给 `execute(world)`，系统拿到可变对象就地改字段——World 对写入完全
//  不可见（增量 hash / 脏渲染 / delta 快照 / 廉价回滚全被封死），而 `reads/writes/consumes` 申报的唯一消费者是
//  排序器：申报错 = 静默换序（ENG-02 接缝静默失效的结构根因），没有任何门。
//
//  现在：每个系统在装载期得到一份按**它自己的申报**构造的视图，`execute(view)`。视图做两件事：
//   ① 脏标（永远开）：凡透过视图取到 **writes 申报**的组件、add/remove 组件，都把该实体记进 World 的脏集
//      （保守：读 writes 类型也算写——系统拿到的是活对象，无法知道它改没改；零迁移即得全库脏跟踪）。
//   ② 严格模式（`new World({ strict: true })` 或环境变量 `ZEROCRAFT_STRICT=1`·测试/门禁用·生产关）：
//      · 访问未申报的组件类型（get/has/query/add/remove）→ 抛 `[strict] …`，点名系统 + 组件 + 该补哪项申报；
//      · 只申报 reads 的组件返回**深只读代理**：改字段/push 数组即抛——「读改写却只报 reads」再也躲不过；
//      · `query()` 返回的组件 Map 也包成受检 Map（`comps.get('未申报')` 同样抛）。
//      生产模式零代理零检查，只多一次 Set.add。
//  不管的：createEntity / destroyEntity 不受申报约束（销毁 = 写全部组件类型·无法逐一申报）；
//  **本次 execute 内由本系统新建的实体**，往上挂任何组件都不受写门约束——那是「生成」（prefab-spawn 按模板
//  填组件·类型装载期不可知），不是改共享状态；只有被别的系统读的**既有**实体才有定序意义。
//  横切观测组件（DebugTrace / ScoreTrace：opt-in 追踪·NON_DETERMINISTIC·不进 hash）不受申报约束也不记脏：
//  它们若进申报就进拓扑（人人都写 → 全库互为前驱成环），而它们本就在确定性域外。
//  模式：'off'（生产·零检查）· 'throw'（测试/门禁·首处即抛）· 'report'（盘点·同类只 warn 一次·不抛）。
//  `root` 指回 World 本体——按世界身份做缓存的能力（spatial-query）用它当键，保证多个视图共享一份缓存
//  （否则每个系统各建一份索引·且建索引时刻随系统而异 → 行为漂移）。
// ═══════════════════════════════════════════════════════════════

export type ViewRoot = IWorld & { markDirty(id: EntityId, type?: ComponentType): void; peek<T extends Component>(id: EntityId, type: ComponentType): T | undefined };
export type StrictMode = 'off' | 'throw' | 'report';

/** 横切观测组件：申报门与脏标都不管（见文件头）。 */
export const OBSERVABILITY_COMPONENTS: ReadonlySet<ComponentType> = new Set(['DebugTrace', 'ScoreTrace']);

const reported = new Set<string>();

export class StrictAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrictAccessError';
  }
}

export class SystemView implements IWorld {
  readonly root: ViewRoot;
  private readonly sysId: string;
  private readonly reads: ReadonlySet<ComponentType>;
  private readonly writes: ReadonlySet<ComponentType>; // writes ∪ consumes
  private readonly readable: ReadonlySet<ComponentType>; // reads ∪ writes ∪ consumes
  private readonly emits: ReadonlySet<string>;
  private readonly listens: ReadonlySet<string>;
  private readonly strict: boolean; // throw 或 report 都为 true（走检查路径）
  private readonly mode: StrictMode;
  private readonly frozen = new WeakMap<object, object>();
  private created = new Set<EntityId>(); // 本次 execute 内新建的实体（写门豁免）

  constructor(root: ViewRoot, system: SystemDeclaration, strict: boolean | StrictMode) {
    this.root = root;
    this.sysId = system.id;
    this.reads = new Set(system.reads);
    this.writes = new Set([...system.writes, ...system.consumes]);
    this.readable = new Set([...system.reads, ...system.writes, ...system.consumes]);
    this.emits = new Set(system.emits ?? []);
    this.listens = new Set(system.listens ?? []);
    this.mode = strict === true ? 'throw' : strict === false ? 'off' : strict;
    this.strict = this.mode !== 'off';
  }

  /** 每次 execute 前由 World.tick 调：清「本次新建实体」集。 */
  beginRun(): void {
    if (this.created.size) this.created = new Set();
  }

  // ── 申报门 ──

  private violation(key: string, message: string): void {
    if (this.mode === 'throw') throw new StrictAccessError(message);
    if (!reported.has(key)) {
      reported.add(key);
      console.warn(message);
    }
  }
  private assertReadable(type: ComponentType, op: string): void {
    if (this.readable.has(type) || OBSERVABILITY_COMPONENTS.has(type)) return;
    this.violation(`r:${this.sysId}:${type}`,
      `[strict] 系统 "${this.sysId}" ${op} 组件 "${type}"，但 reads/writes/consumes 都没申报它——补进 reads（只读）或 writes（要改）。` +
        `申报错 = 定序错（拓扑按申报排）。`);
  }
  private assertWritable(type: ComponentType, op: string, entityId?: EntityId): void {
    if (this.writes.has(type) || OBSERVABILITY_COMPONENTS.has(type)) return;
    if (entityId !== undefined && this.created.has(entityId)) return; // 本次新建的实体：生成不是改共享态
    this.violation(`w:${this.sysId}:${type}`,
      `[strict] 系统 "${this.sysId}" ${op} 组件 "${type}"，但没申报 writes（${this.reads.has(type) ? '只申报了 reads' : '完全未申报'}）——补进 writes。`);
  }

  // ── 深只读代理（strict 专用·按对象缓存·同一组件多次取得同一代理） ──

  private readonly(obj: object, type: ComponentType): object {
    const cached = this.frozen.get(obj);
    if (cached) return cached;
    const sysId = this.sysId;
    const wrap = (o: object): object => new Proxy(o, {
      get: (t, k, r) => {
        const v = Reflect.get(t, k, r);
        return v !== null && typeof v === 'object' ? this.readonly(v, type) : v;
      },
      set: (t, k, v) => {
        this.violation(`m:${sysId}:${type}`,
          `[strict] 系统 "${sysId}" 改写了只读组件 "${type}"（字段 ${String(k)}）——它只申报了 reads；要改就申报 writes（并检查是否与别的 writer 形成读改写环）。`);
        return Reflect.set(t, k, v); // 仅 report 模式到得了这里：记下后照改（盘点不改行为）
      },
      deleteProperty: (t, k) => {
        this.violation(`m:${sysId}:${type}`, `[strict] 系统 "${sysId}" 删除了只读组件 "${type}" 的字段 ${String(k)}——申报 writes。`);
        return Reflect.deleteProperty(t, k);
      },
    });
    const p = wrap(obj);
    this.frozen.set(obj, p);
    return p;
  }

  private checkedComps(comps: Map<ComponentType, Component>): Map<ComponentType, Component> {
    const view = this;
    return new Proxy(comps, {
      get(t, k) {
        if (k === 'get') {
          return (type: ComponentType) => {
            view.assertReadable(type, '经 query 结果读取');
            const c = t.get(type);
            if (c === undefined) return undefined;
            return view.writes.has(type) || OBSERVABILITY_COMPONENTS.has(type) ? c : view.readonly(c, type);
          };
        }
        if (k === 'has') {
          return (type: ComponentType) => { view.assertReadable(type, '经 query 结果判有无'); return t.has(type); };
        }
        const v = Reflect.get(t, k);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  }

  // ── IWorld ──

  createEntity(id: EntityId): void {
    this.root.createEntity(id);
    if (this.strict) this.created.add(id);
  }
  destroyEntity(id: EntityId): void { this.root.destroyEntity(id); }
  getAllEntities(): EntityId[] { return this.root.getAllEntities(); }
  getVersion(): number { return this.root.getVersion(); }

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    if (this.strict) this.assertWritable(component.type, '挂上', entityId);
    this.root.addComponent(entityId, component);
  }

  removeComponent(entityId: EntityId, type: ComponentType): void {
    if (this.strict) this.assertWritable(type, '摘掉', entityId);
    this.root.removeComponent(entityId, type);
  }

  getComponent<T extends Component>(entityId: EntityId, type: ComponentType): T | undefined {
    if (this.strict) this.assertReadable(type, '读取');
    // 经 peek 取（不记脏）：只读申报的取不该推进版本；写申报的取由下面显式记脏——本体 getComponent 的保守记脏只给
    // 「绕过视图的直改者」（applyCommands / 宿主 / 测试）用。
    const c = this.root.peek<T>(entityId, type);
    if (c === undefined) return undefined;
    if (this.writes.has(type)) {
      this.root.markDirty(entityId, type);
      return c;
    }
    if (!this.strict || OBSERVABILITY_COMPONENTS.has(type) || this.created.has(entityId)) return c;
    return this.readonly(c, type) as T;
  }

  hasComponent(entityId: EntityId, type: ComponentType): boolean {
    if (this.strict) this.assertReadable(type, '判有无');
    return this.root.hasComponent(entityId, type);
  }

  query(...types: ComponentType[]): Array<[EntityId, Map<ComponentType, Component>]> {
    if (this.strict) {
      for (const t of types) this.assertReadable(t, '按类型查询');
      return this.root.query(...types).map(([id, comps]) => [id, this.checkedComps(comps)]);
    }
    return this.root.query(...types);
  }

  queryEntities(...types: ComponentType[]): EntityId[] {
    if (this.strict) for (const t of types) this.assertReadable(t, '按类型查询');
    return this.root.queryEntities(...types);
  }

  // ── tick 内事件总线（P1b）──

  emit<E>(type: string, event: E): void {
    if (this.strict && !this.emits.has(type)) {
      this.violation(`e:${this.sysId}:${type}`, `[strict] 系统 "${this.sysId}" emit 事件 "${type}"，但没申报 emits——补进 emits（拓扑据此排 emitter→listener）。`);
    }
    this.root.emit(type, event);
  }

  events<E>(type: string): readonly E[] {
    if (this.strict && !this.listens.has(type)) {
      this.violation(`l:${this.sysId}:${type}`, `[strict] 系统 "${this.sysId}" 读事件 "${type}"，但没申报 listens——补进 listens。`);
    }
    return this.root.events<E>(type);
  }

  singleton(type: ComponentType): EntityId | undefined {
    if (this.strict) this.assertReadable(type, '取单例');
    return this.root.singleton(type);
  }

  byId(type: ComponentType, idField: string, id: string): EntityId | undefined {
    if (this.strict) this.assertReadable(type, '按 id 找实体');
    return this.root.byId(type, idField, id);
  }
}

/** 严格模式缺省：环境变量 `ZEROCRAFT_STRICT=1`（throw·vitest/门禁）或 `=report`（盘点）；浏览器无 process → off。 */
export function strictByEnv(): StrictMode {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const v = env?.ZEROCRAFT_STRICT;
  return v === '1' || v === 'throw' ? 'throw' : v === 'report' ? 'report' : 'off';
}
