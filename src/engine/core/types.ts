export type EntityId = string;
export type ComponentType = string;

export interface Component {
  readonly type: ComponentType;
}

export interface SystemDeclaration {
  readonly id: string;
  readonly reads: ComponentType[];
  readonly writes: ComponentType[];
  readonly consumes: ComponentType[];
  // 执行阶段。跨阶段按阶段号升序定序，阶段内仍按组件依赖拓扑排序。缺省 = Update(0)。
  // 用于表达纯组件拓扑无法表达的"读后改"管线（如 collision-resolve 写 Transform
  // 而 overlap-detect 读 Transform，在组件图上互为前驱会判成环）。
  readonly phase?: number;
  // 显式定序（按系统 id，仅在同一 phase 内生效）。用于纯组件拓扑无法/不该表达的顺序，
  // 尤其是「两个系统都 read-modify-write 同一组件」——组件图会判成环（互为前驱），
  // 声明 runsAfter/runsBefore 即可打破：显式边会**覆盖相反方向的组件推断边**。
  // 跨 phase 的先后仍由 phase 号决定；引用了不在本 phase 的 id 会被忽略。
  readonly runsAfter?: string[]; // 本系统排在这些系统之后
  readonly runsBefore?: string[]; // 本系统排在这些系统之前
  // tick 内事件总线申报（P1b）：emits = 本系统会 world.emit 的事件类型；listens = 会 world.events 读的事件类型。
  // 拓扑：emitter → listener 推断边（软边·与组件推断边同等对待）。严格模式下未申报的 emit/events 抛错。
  readonly emits?: readonly string[];
  readonly listens?: readonly string[];
  execute(world: IWorld): void;
}

// 系统执行阶段（数值越小越早）。绝大多数系统留缺省 Update，靠组件拓扑自动定序；
// 只有"读完本帧状态后再修正同一状态"的系统（碰撞解算、约束）才排到更后的阶段。
export const SystemPhase = {
  // ── P2d 具名阶段（engine-architecture-review-2026-09-02 D2c）：固定管线 Input → Intent → Simulate → Resolve → Commit → Cleanup。
  // 旧数字键（Update/Rotate/PostResolve）原样保留为别名/兼容档：改它们的数值 = 改全库定序。Rotate 是「缺字段级写粒度」
  // 的历史补丁（rotation-apply 与 motion-apply 都 RMW Transform），新系统勿再用；Cleanup 供只做清扫/回收的系统。
  Input: -20,      // 输入落地：把外部命令翻成世界组件（applyCommands 的系统化落点·P3c）
  Intent: -10,     // 意图：读输入/条件产意图组件（尚不改物理态）
  Simulate: 0,     // = Update：积分 / 检测 / 计时 / 生命周期……（组件拓扑自动定序）
  Update: 0,       // 默认：积分 / 检测 / 计时 / 生命周期……（组件拓扑自动定序）
  Rotate: 4,       // 角度积分：rotation-apply 与 motion-apply 同为 Transform 读改写，须各占一阶段
  Resolve: 10,     // 解算：读完位置后再修正位置/速度（碰撞推开）
  PostResolve: 14, // 解算后：基于已解算结果再改 Transform/Velocity（层级跟随=改T、摩擦=改V，可同阶段）
  Commit: 20,      // 提交：基于解算结果的最终写入（跳跃=改V、边界钳制=改T）
  Cleanup: 30,     // 清扫：回收瞬时实体 / 清事件（本身不产语义写入）
} as const;

export interface IWorld {
  createEntity(id: EntityId): void;
  destroyEntity(id: EntityId): void;
  getAllEntities(): EntityId[];

  addComponent<T extends Component>(entityId: EntityId, component: T): void;
  removeComponent(entityId: EntityId, type: ComponentType): void;
  getComponent<T extends Component>(entityId: EntityId, type: ComponentType): T | undefined;
  hasComponent(entityId: EntityId, type: ComponentType): boolean;

  query(...types: ComponentType[]): Array<[EntityId, Map<ComponentType, Component>]>;
  queryEntities(...types: ComponentType[]): EntityId[];

  getVersion(): number;

  // ── tick 内事件总线（P1b · engine-architecture-review-2026-09-02 §5 P1b · D3）──
  // 与「事件当组件」的区别：多读者（谁 listens 谁读·不独占不清扫）、每实体多条（数组·不受 Map 按 type 键限制）、
  // 按发出序稳定、**tick 末清空、不进快照/hash**。故只适合「同一 tick 内发出→消费」的瞬时事件；
  // 要跨 tick 挂起等消费的（如 ResourceModify 队列）仍用组件 + consumes。
  emit<E>(type: string, event: E): void;
  events<E>(type: string): readonly E[];

  /** 黑板单例：持有该组件的唯一实体 id。0 个 → undefined；>1 个 → 严格模式抛（真实数据错）·生产按创建序取首个
   *  （= 此前各能力「query 取首个 break」的事实语义·零回归）。取代 9 处手写的 for…break。 */
  singleton(type: ComponentType): EntityId | undefined;

  /** 按语义 id 找实体（B-3 · engine-base-tier-review-2026-09-06 §3.2）：持有 `type` 且其 `idField` 字段 === `id` 的
   *  **创建序首个**实体（= 此前 findByComponentId / buildIdLookup 「首个匹配」语义·零回归）。World 内建索引、
   *  按类型版本失效——O(1) 取代 8 文件 14 处的线性扫与 7 处手写循环。纯读·不记脏。 */
  byId(type: ComponentType, idField: string, id: string): EntityId | undefined;

  /** 视图的根世界（World 本体 = 自身；SystemView = 它包的 World）。按世界身份做缓存的能力（spatial-query）
   *  用它当键——多个系统视图共享同一份缓存，建索引时刻不随「哪个系统先查」漂移。 */
  readonly root?: IWorld;
}

/**
 * 渲染后端拿到的「挂载面」。**core 不认识 DOM**（P3a 机器围栏 `tsconfig.sim.json` 逼出来的）：
 * sim 面要能在 Node / Worker 里不带 dom lib 编译，而 `HTMLElement` 写死在这里时它过不去。
 * 浏览器后端照旧声明 `RendererBackend<HTMLElement>`，一个字不用改；将来的 Worker / Ascii /
 * 离屏后端各自填自己的面——**后端知道自己挂在什么上，core 不需要知道**。
 */
export type RenderSurface = unknown;

export interface RendererBackend<S = RenderSurface> {
  init(surface: S): void;
  sync(world: IWorld): void;
  destroy(): void;
}

// 完整世界状态快照（组件皆 POD，可 JSON 序列化）—— record/replay 与时间旅行调试用
export type WorldSnapshot = Record<EntityId, Record<ComponentType, Component>>;

/** 增量快照（P2c）：自写序号 base 起的变更。changed 是整实体（按实体粒度·不做字段级 diff）。 */
export interface WorldDelta {
  readonly base: number;
  readonly seq: number;
  readonly changed: WorldSnapshot;
  readonly removed: EntityId[];
}

// tick 期间的观测钩子 —— Debug 体系据此观察各系统(skill)之间的协作
export interface TickObserver {
  onTickStart?(tick: number): void;
  onSystemStart?(system: SystemDeclaration): void;
  onSystemEnd?(system: SystemDeclaration): void;
  onTickEnd?(tick: number): void;
}
