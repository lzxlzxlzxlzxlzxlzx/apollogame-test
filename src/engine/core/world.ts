import type { EntityId, ComponentType, Component, SystemDeclaration, IWorld, TickObserver, WorldSnapshot, WorldDelta } from './types.js';
import { topologicalSort } from './topological-sort.js';
import { SystemView, strictByEnv, type StrictMode } from './system-view.js';

const EMPTY: readonly never[] = Object.freeze([]);
const singletonReported = new Set<string>();

export interface WorldOptions {
  /** 严格模式：系统视图对未申报访问抛错、只读组件深冻结（测试/门禁用·缺省读环境变量 ZEROCRAFT_STRICT=1|report）。
   *  true='throw'·false='off'·'report'=盘点（同类只 warn 一次·不抛不改行为）。 */
  strict?: boolean | StrictMode;
}

export class World implements IWorld {
  private entities = new Map<EntityId, Map<ComponentType, Component>>();
  private systems: SystemDeclaration[] = [];
  private sorted: SystemDeclaration[] = [];
  private needsSort = false;
  private version = 0;
  private observer?: TickObserver;

  // ── 写入通道（P1a）──
  // 系统只透过 SystemView 碰世界（tick 里 execute(view)）：视图按申报做脏标 + 严格模式校验（见 system-view.ts）。
  // dirty = 自上次 drainDirty() 以来「可能被改过」的实体集（保守：取到 writes 申报的组件即算）。
  // 增量 hash / 脏渲染 / delta 快照（P2c）以它为输入。
  readonly root: IWorld = this;
  readonly strict: StrictMode;
  private views = new Map<SystemDeclaration, SystemView>();
  private dirty = new Set<EntityId>();
  // ── 版本号（P2c）──：每次「可能改了」推进一次全局写序号，并记到实体 / 组件类型上。
  // 增量 hash（net/world-hash）按实体版本判缓存命中；渲染器/服务按类型版本跳过未变桶；delta 快照按序号取变更。
  private writeSeq = 0;
  private entityVer = new Map<EntityId, number>();
  private typeVer = new Map<ComponentType, number>();
  private tombstones = new Map<EntityId, number>(); // 被销毁实体 → 销毁时的写序号（delta 的 removed 用）
  // ── tick 内事件总线（P1b）──：type → 本 tick 发出的事件（发出序）。tick 末清空·不进快照。
  private bus = new Map<string, unknown[]>();

  constructor(options: WorldOptions = {}) {
    const s = options.strict ?? strictByEnv();
    this.strict = s === true ? 'throw' : s === false ? 'off' : s;
  }

  // ── 倒排组件索引（query-perf-plan 方案 A）──
  // typeIndex: 组件类型 → 持有它的实体集（add/remove/destroy/consume 同步维护）。
  // creationSeq: 实体创建序号——query 候选按它排序，与旧实现"entities 插入序全扫"**逐字节同序**
  // （确定性铁律：lockstep/录放依赖 query 顺序稳定；hash 自身 canonical 排序不受影响）。
  private typeIndex = new Map<ComponentType, Set<EntityId>>();
  private creationSeq = new Map<EntityId, number>();
  private nextSeq = 0;

  // ── Entity operations ──

  createEntity(id: EntityId): void {
    if (this.entities.has(id)) throw new Error(`Entity "${id}" already exists`);
    this.entities.set(id, new Map());
    this.creationSeq.set(id, this.nextSeq++);
    this.tombstones.delete(id);
    this.touch(id);
  }

  destroyEntity(id: EntityId): void {
    const comps = this.entities.get(id);
    if (comps) {
      for (const type of comps.keys()) { this.typeIndex.get(type)?.delete(id); this.touchType(type); }
    }
    this.entities.delete(id);
    this.creationSeq.delete(id);
    this.entityVer.delete(id);
    this.dirty.add(id);
    this.tombstones.set(id, ++this.writeSeq);
  }

  // ── 脏跟踪 / 版本号（P2c）──

  private touch(id: EntityId, type?: ComponentType): void {
    this.dirty.add(id);
    this.entityVer.set(id, ++this.writeSeq);
    if (type !== undefined) this.typeVer.set(type, this.writeSeq);
  }
  private touchType(type: ComponentType): void {
    this.typeVer.set(type, ++this.writeSeq);
  }

  /** 记一个实体为脏（视图取到 writes 申报组件 / add / remove / create / destroy 时调；type 给了同时推进该类型版本）。 */
  markDirty(id: EntityId, type?: ComponentType): void {
    this.touch(id, type);
  }

  /** 实体版本：最后一次「可能被改」的全局写序号（不存在 → 0）。增量 hash 的缓存键。 */
  entityVersion(id: EntityId): number {
    return this.entityVer.get(id) ?? 0;
  }
  /** 组件类型版本：该类型最后一次 add/remove/consume/写取 的全局写序号（从未 → 0）。渲染器按它跳过未变桶。 */
  typeVersion(type: ComponentType): number {
    return this.typeVer.get(type) ?? 0;
  }
  /** 当前全局写序号（delta 基准）。 */
  get writeSequence(): number {
    return this.writeSeq;
  }

  /** 只读取组件：**不记脏**（渲染器/服务/hash 用；改它返回的对象 = 绕过版本号·调用方自负）。 */
  peek<T extends Component>(entityId: EntityId, type: ComponentType): T | undefined {
    return this.entities.get(entityId)?.get(type) as T | undefined;
  }
  /** 实体的组件表（活对象·只读契约·hash/渲染提取用）。 */
  componentsOf(entityId: EntityId): ReadonlyMap<ComponentType, Component> | undefined {
    return this.entities.get(entityId);
  }

  /** 只读视图：get/has/query/singleton 透传且**不记脏**——给渲染器/每帧服务用，它们的读不该把整个世界标脏
   *  （否则增量 hash 在真宿主里退化成全量）。写操作仍透到本体（并记脏）。 */
  readView(): IWorld {
    if (!this.readOnlyView) {
      const w = this;
      this.readOnlyView = {
        root: w,
        createEntity: (id) => w.createEntity(id),
        destroyEntity: (id) => w.destroyEntity(id),
        getAllEntities: () => w.getAllEntities(),
        addComponent: (id, c) => w.addComponent(id, c),
        removeComponent: (id, t) => w.removeComponent(id, t),
        getComponent: <T extends Component>(id: EntityId, t: ComponentType) => w.peek<T>(id, t),
        hasComponent: (id, t) => w.hasComponent(id, t),
        query: (...types) => w.query(...types),
        queryEntities: (...types) => w.queryEntities(...types),
        singleton: (t) => w.singleton(t),
        byId: (t, f, id) => w.byId(t, f, id),
        emit: (t, e) => w.emit(t, e),
        events: (t) => w.events(t),
        getVersion: () => w.getVersion(),
      };
    }
    return this.readOnlyView;
  }
  private readOnlyView: IWorld | undefined;

  // ── delta 快照（P2c）──

  /** 自写序号 base 以来的变更：changed = 版本 > base 的实体全量组件；removed = base 之后被销毁的实体。 */
  snapshotDelta(base: number): WorldDelta {
    const changed: WorldSnapshot = {};
    for (const [id, comps] of this.entities) {
      if ((this.entityVer.get(id) ?? 0) <= base) continue;
      const components: Record<ComponentType, Component> = {};
      for (const [type, comp] of comps) components[type] = structuredClone(comp);
      changed[id] = components;
    }
    const removed: EntityId[] = [];
    for (const [id, seq] of this.tombstones) if (seq > base && !this.entities.has(id)) removed.push(id);
    return { base, seq: this.writeSeq, changed, removed };
  }

  /** 套用 delta：removed 销毁、changed 整实体替换（新实体按 changed 键序创建）。 */
  applyDelta(delta: WorldDelta): void {
    for (const id of delta.removed) if (this.entities.has(id)) this.destroyEntity(id);
    for (const [id, comps] of Object.entries(delta.changed)) {
      if (!this.entities.has(id)) this.createEntity(id);
      const cur = this.entities.get(id)!;
      for (const type of [...cur.keys()]) if (!(type in comps)) this.removeComponent(id, type);
      for (const [type, comp] of Object.entries(comps)) this.addComponent(id, structuredClone(comp));
    }
  }

  /** 取走并清空脏集（按记入序）。消费方：增量 hash / 渲染 / delta（P2c）。 */
  drainDirty(): EntityId[] {
    const out = [...this.dirty];
    this.dirty.clear();
    return out;
  }

  /** 当前脏实体数（测试/观测用·不清）。 */
  get dirtyCount(): number {
    return this.dirty.size;
  }

  // ── tick 内事件总线（P1b）──

  emit<E>(type: string, event: E): void {
    let q = this.bus.get(type);
    if (!q) {
      q = [];
      this.bus.set(type, q);
    }
    q.push(event);
  }

  events<E>(type: string): readonly E[] {
    return (this.bus.get(type) as E[] | undefined) ?? EMPTY;
  }

  /** 清空总线（tick 末自动调；宿主在 tick 外 emit 的事件会活到下一 tick 末）。 */
  clearEvents(): void {
    if (this.bus.size) this.bus.clear();
  }

  // ── 黑板单例 ──

  singleton(type: ComponentType): EntityId | undefined {
    const owners = this.typeIndex.get(type);
    if (!owners || owners.size === 0) return undefined;
    if (owners.size > 1 && this.strict !== 'off') {
      const msg = `[strict] singleton("${type}") 有 ${owners.size} 个持有者（${[...owners].join(', ')}）——黑板单例组件每个世界只能有一份；多份是数据错。`;
      if (this.strict === 'throw') throw new Error(msg);
      if (!singletonReported.has(type)) { singletonReported.add(type); console.warn(msg); }
    }
    // 生产：按创建序取首个（= 旧「query 取首个 break」语义·query 候选序即创建序）。
    let best: EntityId | undefined;
    let bestSeq = Infinity;
    for (const id of owners) {
      const seq = this.creationSeq.get(id)!;
      if (seq < bestSeq) { bestSeq = seq; best = id; }
    }
    return best;
  }

  getAllEntities(): EntityId[] {
    return Array.from(this.entities.keys());
  }

  // ── Component operations ──

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity "${entityId}" not found`);
    entity.set(component.type, component);
    this.touch(entityId, component.type);
    let owners = this.typeIndex.get(component.type);
    if (!owners) {
      owners = new Set();
      this.typeIndex.set(component.type, owners);
    }
    owners.add(entityId);
  }

  removeComponent(entityId: EntityId, type: ComponentType): void {
    if (this.entities.get(entityId)?.delete(type)) {
      this.typeIndex.get(type)?.delete(entityId);
      this.touch(entityId, type);
    }
  }

  getComponent<T extends Component>(entityId: EntityId, type: ComponentType): T | undefined {
    const c = this.entities.get(entityId)?.get(type) as T | undefined;
    // 本体上的取组件视为「可能要改」（applyCommands / 宿主 / 测试直接改活对象·无从得知）→ 记脏推进版本，
    // 增量 hash 才不会读到陈旧缓存。纯读方（渲染器/服务/hash）走 peek() 或 readView()，系统走 SystemView。
    if (c !== undefined) this.touch(entityId, type);
    return c;
  }

  hasComponent(entityId: EntityId, type: ComponentType): boolean {
    return this.entities.get(entityId)?.has(type) ?? false;
  }

  // ── 语义 id 索引（B-3）──：(type, idField) → { 建索引时的类型版本, id 值 → 创建序首个实体 }。
  // 类型版本在 add/remove/consume/destroy/restore 与本体 getComponent（可能改字段）时推进 → 索引按需重建；
  // 只读路径（peek/readView/SystemView 只读申报）不推进版本，索引不失效——它们也改不了 id 字段。
  private idIndex = new Map<string, { ver: number; map: Map<string, EntityId> }>();

  byId(type: ComponentType, idField: string, id: string): EntityId | undefined {
    const key = `${type}\u0000${idField}`;
    const ver = this.typeVersion(type);
    let entry = this.idIndex.get(key);
    if (!entry || entry.ver !== ver) {
      const map = new Map<string, EntityId>();
      // 候选按创建序（= query 序）→ 同 id 多份时取首个，与旧线性扫 / buildIdLookup 的 `!has` 语义逐字一致。
      for (const e of this.queryEntities(type)) {
        const v = (this.entities.get(e)!.get(type) as unknown as Record<string, unknown>)[idField];
        if (typeof v === 'string' && !map.has(v)) map.set(v, e);
      }
      entry = { ver, map };
      this.idIndex.set(key, entry);
    }
    return entry.map.get(id);
  }

  // ── Queries ──

  // 倒排索引剪枝：取**最稀有 type** 的实体集做候选，再过滤其余 type；候选按 creationSeq 排序
  // → 返回序与旧"全表插入序扫描"逐字节一致（行为零变）。O(k log k + k×|types|)，k=最稀有集大小。
  query(...types: ComponentType[]): Array<[EntityId, Map<ComponentType, Component>]> {
    const results: Array<[EntityId, Map<ComponentType, Component>]> = [];
    if (types.length === 0) {
      // 退化：无条件 → 全量（保持旧 every([])≡true 行为，插入序）。
      for (const [id, comps] of this.entities) results.push([id, comps]);
      return results;
    }

    let rarest: Set<EntityId> | undefined;
    for (const t of types) {
      const owners = this.typeIndex.get(t);
      if (!owners || owners.size === 0) return []; // 某 type 无人持有 → 必空
      if (!rarest || owners.size < rarest.size) rarest = owners;
    }

    // 稠密退化（候选过半）：索引剪不动 → 直接按 entities 插入序全扫（=旧实现，天然旧序，
    // 免 per-candidate 双重 Map.get 与排序开销）。索引只在稀有查询时发挥剪枝价值。
    if (rarest!.size * 2 > this.entities.size) {
      for (const [id, comps] of this.entities) {
        if (types.every(t => comps.has(t))) results.push([id, comps]);
      }
      return results;
    }

    let prevSeq = -1;
    let monotonic = true;
    for (const id of rarest!) {
      const comps = this.entities.get(id);
      if (comps && types.every(t => comps.has(t))) {
        const seq = this.creationSeq.get(id)!;
        if (seq < prevSeq) monotonic = false;
        prevSeq = seq;
        results.push([id, comps]);
      }
    }
    // Set 迭代序=加入序。组件从未被增删的常见情形下它就是创建序（单调）→ 免排序；
    // 被 remove→re-add 过的实体会排到集尾 → 仅此时按创建序重排，保证与旧全扫描逐字节同序。
    if (!monotonic) {
      results.sort((a, b) => this.creationSeq.get(a[0])! - this.creationSeq.get(b[0])!);
    }
    return results;
  }

  queryEntities(...types: ComponentType[]): EntityId[] {
    return this.query(...types).map(([id]) => id);
  }

  // ── System management ──

  addSystem(system: SystemDeclaration): void {
    this.systems.push(system);
    this.views.set(system, new SystemView(this, system, this.strict));
    this.needsSort = true;
  }

  /** 某系统的视图（tick 用；测试可拿来单独跑一个系统）。未 addSystem 的系统临时建一份。 */
  viewOf(system: SystemDeclaration): IWorld {
    return this.systemView(system);
  }
  private systemView(system: SystemDeclaration): SystemView {
    let v = this.views.get(system);
    if (!v) {
      v = new SystemView(this, system, this.strict);
      this.views.set(system, v);
    }
    return v;
  }

  private ensureSorted(): void {
    if (this.needsSort) {
      this.sorted = topologicalSort(this.systems, { softCycle: this.strict === 'off' ? 'warn' : 'throw' }); // P2d：严格模式软环即抛
      this.needsSort = false;
    }
  }

  // ── Debug instrumentation ──

  setObserver(observer?: TickObserver): void {
    this.observer = observer;
  }

  // ── Game loop ──

  tick(): void {
    this.ensureSorted();
    this.observer?.onTickStart?.(this.version + 1);

    for (const system of this.sorted) {
      this.observer?.onSystemStart?.(system);
      const view = this.systemView(system);
      view.beginRun();
      system.execute(view); // 系统只透过视图碰世界（P1a：脏标 + 严格模式申报门）

      // Consume: remove components marked as consumed（走倒排索引，O(持有者数)；并保持索引一致）
      for (const consumeType of system.consumes) {
        const owners = this.typeIndex.get(consumeType);
        if (!owners || owners.size === 0) continue;
        for (const entityId of owners) {
          this.entities.get(entityId)?.delete(consumeType);
          this.touch(entityId, consumeType);
        }
        owners.clear();
      }

      this.observer?.onSystemEnd?.(system);
    }

    this.clearEvents(); // tick 内事件总线：tick 末清空（P1b）
    this.version++;
    this.observer?.onTickEnd?.(this.version);
  }

  getVersion(): number {
    return this.version;
  }

  getSortedSystems(): readonly SystemDeclaration[] {
    this.ensureSorted();
    return this.sorted;
  }

  // ── Snapshot / restore (record / replay / time-travel) ──

  snapshot(): WorldSnapshot {
    const snap: WorldSnapshot = {};
    for (const [id, comps] of this.entities) {
      const components: Record<ComponentType, Component> = {};
      for (const [type, comp] of comps) {
        components[type] = structuredClone(comp);
      }
      snap[id] = components;
    }
    return snap;
  }

  /** 创建序 = query 序的唯一真相。
   *
   *  必须显式带出来的理由（engine-review-2026-08-04 §3.3 · owner 2026-08-05 拍板修）：
   *  `snapshot()` 返回的是普通对象，而 JS 对**数字样 id**（"1"/"42"）强制按**数值升序**枚举、
   *  且排在字符串键之前——即快照的键序**不等于**创建序。实测：创建序 `10,2,hero,1`
   *  → 枚举序 `1,2,10,hero`。旧 `restore()` 拿键序当创建序重建，于是读档/回滚/回放后
   *  query 序静默改变 → 谁先动、谁先被打中全变。最阴的是**读档瞬间 hash 校验是通过的**
   *  （组件内容一样），之后才逐步偏离 → 联机莫名 desync、回放对不上，极难定位。
   *  想跨 restore 保住 query 序的调用方，必须把本数组和快照一起存/一起传。 */
  snapshotOrder(): EntityId[] {
    return [...this.entities.keys()]; // Map 保序 = 真创建序
  }

  /** @param order 可选·创建序（见 snapshotOrder）。不给则退回「按快照键序」的旧行为——
   *  对全字符串 id 的世界二者等价；含数字样 id 时才有差别。 */
  restore(snapshot: WorldSnapshot, order?: readonly EntityId[]): void {
    this.entities.clear();
    this.typeIndex.clear();
    this.creationSeq.clear();
    this.nextSeq = 0;
    this.dirty.clear();
    this.entityVer.clear();
    this.typeVer.clear();
    this.tombstones.clear();
    // 有 order 就按它排（只认快照里真存在的 id）；order 未覆盖到的键按枚举序补在后面，
    // 保证「order 残缺/过期」时不丢实体（宁可顺序退化，不可丢数据）。
    const keys = Object.keys(snapshot);
    const ids = order
      ? [...order.filter((id) => Object.prototype.hasOwnProperty.call(snapshot, id)),
        ...keys.filter((id) => !order.includes(id))]
      : keys;
    for (const id of ids) {
      const comps = snapshot[id]!;
      const m = new Map<ComponentType, Component>();
      this.creationSeq.set(id, this.nextSeq++);
      for (const [type, comp] of Object.entries(comps)) {
        m.set(type, structuredClone(comp));
        let owners = this.typeIndex.get(type);
        if (!owners) {
          owners = new Set();
          this.typeIndex.set(type, owners);
        }
        owners.add(id);
      }
      this.entities.set(id, m);
      this.touch(id); // restore 换了整个世界 → 全部实体皆脏·版本全新
      for (const type of m.keys()) this.typeVer.set(type, this.writeSeq);
    }
    // restore 换了整个世界内容：单调推进 version，作废一切以 version 为键的派生缓存
    // （如 spatial-query 索引）。否则读档/回滚后缓存命中 restore 前的陈旧索引 → 返回
    // 已销毁实体或旧位置 → lockstep 分叉。version 只增不减，同 tick() 语义。
    this.version++;
  }
}
