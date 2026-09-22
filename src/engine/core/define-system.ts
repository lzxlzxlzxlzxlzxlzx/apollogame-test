import type { EntityId, ComponentType, Component, SystemDeclaration, IWorld } from './types.js';

// ═══════════════════════════════════════════════════════════════
//  defineSystem —— 类型级申报对账（P1a · engine-architecture-review-2026-09-02 §5 P1a）
//
//  SystemView 是运行时门（strict 模式抓未申报访问）；本 helper 是编译期门：系统体收到的世界类型
//  `TypedWorld<R, W>` 只允许对**申报过的组件类型名**做 get/has/query/add/remove——写一个没申报的类型名
//  就是 tsc 错，不用跑测试。`const` 泛型让 `reads: ['Transform', 'Velocity']` 推成字面量联合。
//
//  迁移是渐进的：旧 `{ execute(world: IWorld) }` 形状照旧可用（无类型门·有运行时门）；新系统与被改到的
//  系统用 defineSystem。两者产出同一 SystemDeclaration，调度/视图不分彼此。
// ═══════════════════════════════════════════════════════════════

/** 只暴露申报过的类型名的世界面。R = 可读（reads ∪ writes ∪ consumes），W = 可写（writes ∪ consumes）。 */
export interface TypedWorld<R extends ComponentType, W extends ComponentType, E extends string = never, L extends string = never> {
  createEntity(id: EntityId): void;
  destroyEntity(id: EntityId): void;
  getAllEntities(): EntityId[];
  getVersion(): number;
  getComponent<T extends Component>(entityId: EntityId, type: R | W): T | undefined;
  hasComponent(entityId: EntityId, type: R | W): boolean;
  addComponent<T extends Component & { readonly type: W }>(entityId: EntityId, component: T): void;
  removeComponent(entityId: EntityId, type: W): void;
  query(...types: Array<R | W>): Array<[EntityId, Map<ComponentType, Component>]>;
  queryEntities(...types: Array<R | W>): EntityId[];
  singleton(type: R | W): EntityId | undefined;
  byId(type: R | W, idField: string, id: string): EntityId | undefined;
  emit<Ev>(type: E, event: Ev): void;
  events<Ev>(type: L): readonly Ev[];
  /** 视图的根世界（缓存键用）。 */
  readonly root?: IWorld;
}

export interface TypedSystemSpec<
  R extends readonly ComponentType[],
  W extends readonly ComponentType[],
  C extends readonly ComponentType[],
  Em extends readonly string[] = readonly [],
  Li extends readonly string[] = readonly [],
> {
  id: string;
  reads: R;
  writes: W;
  consumes?: C;
  phase?: number;
  runsAfter?: string[];
  runsBefore?: string[];
  emits?: Em;
  listens?: Li;
  run(world: TypedWorld<R[number] | W[number] | C[number], W[number] | C[number], Em[number], Li[number]>): void;
}

/** 类型级申报对账的系统声明：run 里对未申报类型名的访问 = tsc 错。 */
export function defineSystem<
  const R extends readonly ComponentType[],
  const W extends readonly ComponentType[],
  const C extends readonly ComponentType[] = readonly [],
  const Em extends readonly string[] = readonly [],
  const Li extends readonly string[] = readonly [],
>(spec: TypedSystemSpec<R, W, C, Em, Li>): SystemDeclaration {
  const consumes = (spec.consumes ?? []) as readonly ComponentType[];
  return {
    id: spec.id,
    reads: [...spec.reads],
    writes: [...spec.writes],
    consumes: [...consumes],
    ...(spec.phase !== undefined ? { phase: spec.phase } : {}),
    ...(spec.runsAfter ? { runsAfter: spec.runsAfter } : {}),
    ...(spec.runsBefore ? { runsBefore: spec.runsBefore } : {}),
    ...(spec.emits ? { emits: [...spec.emits] } : {}),
    ...(spec.listens ? { listens: [...spec.listens] } : {}),
    execute(world: IWorld) {
      spec.run(world as unknown as TypedWorld<R[number] | W[number] | C[number], W[number] | C[number], Em[number], Li[number]>);
    },
  };
}
