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
  execute(world: IWorld): void;
}

// 系统执行阶段（数值越小越早）。绝大多数系统留缺省 Update，靠组件拓扑自动定序；
// 只有"读完本帧状态后再修正同一状态"的系统（碰撞解算、约束）才排到更后的阶段。
export const SystemPhase = {
  Update: 0,       // 默认：积分 / 检测 / 计时 / 生命周期……（组件拓扑自动定序）
  Rotate: 4,       // 角度积分：rotation-apply 与 motion-apply 同为 Transform 读改写，须各占一阶段
  Resolve: 10,     // 解算：读完位置后再修正位置/速度（碰撞推开）
  Materialize: 12, // 结算后的实体物化；新碰撞体从下一拍参与接触，不反向影响本拍伤害
  PostResolve: 14, // 解算后：基于已解算结果再改 Transform/Velocity（层级跟随=改T、摩擦=改V，可同阶段）
  Commit: 20,      // 提交：基于解算结果的最终写入（跳跃=改V、边界钳制=改T）
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
}

export interface RendererBackend {
  init(container: HTMLElement): void;
  sync(world: IWorld): void;
  destroy(): void;
}

// 完整世界状态快照（组件皆 POD，可 JSON 序列化）—— record/replay 与时间旅行调试用
export type WorldSnapshot = Record<EntityId, Record<ComponentType, Component>>;

// tick 期间的观测钩子 —— Debug 体系据此观察各系统(skill)之间的协作
export interface TickObserver {
  onTickStart?(tick: number): void;
  onSystemStart?(system: SystemDeclaration): void;
  onSystemEnd?(system: SystemDeclaration): void;
  onTickEnd?(tick: number): void;
}
