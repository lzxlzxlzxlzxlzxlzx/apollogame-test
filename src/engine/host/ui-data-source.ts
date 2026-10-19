import type { IWorld, EntityId } from '@engine/core/types.js';
import type { Resource, Flag, StringVar, Tag } from '@engine/protocol/components.js';
import type { UIDataSource, UIListItem } from '@ui/components/bindings.js';

// ═══════════════════════════════════════════════════════════════
//  createWorldDataSource —— 标准的「世界 → UI 数据源」投影（P2b · engine-architecture-review-2026-09-02 D8 / §1.4）
//
//  此前每个游戏手写一份 UIDataSource（game108/game-i 各一套 query 循环），而集合类 UI（手牌/背包/榜单）没有任何
//  数据通道，只能 TS builder 每帧整树重建。现在：
//   · resource / value / flag：按语义 id 全局路由（同 id 多份取创建序首份 = 与各家手写循环同义）；
//   · list：按 **纯数据** UIListSpec 从 ECS 投影成条目数组——查哪些组件 / 按 Tag 掩码过滤 / 每项取哪些字段 / 按哪个字段排序，
//     全是最弱 LLM 能填的数据；条目顺序确定（创建序·或按 sortBy 稳定排序）。配合 LayoutNode.repeat，手牌区 = 一段 JSON。
//  引擎侧只 import ui 的**类型**（结构面·零运行时依赖·层向围栏放行）。
// ═══════════════════════════════════════════════════════════════

/** 列表投影规格（纯数据）。 */
export interface UIListSpec {
  /** 必须同时持有的组件类型（world.query 参数）。 */
  query: readonly string[];
  /** 只取 Tag.flags 与此掩码相交的实体（可选）。 */
  tag?: number;
  /** 条目字段表：字段名 → 从哪个组件的哪个键取标量。缺组件/非标量 → 该字段缺席（模板代入为空串）。 */
  fields: Readonly<Record<string, { comp: string; key: string }>>;
  /** 按哪个条目字段排序（稳定·缺省创建序）。 */
  sortBy?: string;
  desc?: boolean;
}

function scalar(v: unknown): string | number | boolean | undefined {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
}

/** 按规格投影一张列表（每项恒含 `id` = 实体 id）。 */
export function projectList(world: IWorld, spec: UIListSpec): UIListItem[] {
  const out: Array<UIListItem & { id: EntityId }> = [];
  for (const [eid] of world.query(...spec.query)) {
    if (spec.tag !== undefined) {
      const tg = world.getComponent<Tag>(eid, 'Tag');
      if (!tg || (tg.flags & spec.tag) === 0) continue;
    }
    const item: Record<string, string | number | boolean> = { id: eid };
    for (const [name, src] of Object.entries(spec.fields)) {
      const comp = world.getComponent(eid, src.comp) as (Record<string, unknown> | undefined);
      const v = scalar(comp?.[src.key]);
      if (v !== undefined) item[name] = v;
    }
    out.push(item as UIListItem & { id: EntityId });
  }
  if (spec.sortBy) {
    const k = spec.sortBy;
    const dir = spec.desc ? -1 : 1;
    out.sort((a, b) => {
      const x = a[k]; const y = b[k];
      if (x === y || x === undefined || y === undefined) return 0; // 稳定排序：相等/缺席保持创建序
      return (x < y ? -1 : 1) * dir;
    });
  }
  return out;
}

/** 标准世界数据源。lists = 列表 id → 投影规格（纯数据·可来自 manifest）。 */
export function createWorldDataSource(world: IWorld, lists: Readonly<Record<string, UIListSpec>> = {}): UIDataSource {
  const first = <T extends { id: string }>(type: string, id: string): T | undefined => {
    for (const [e] of world.query(type)) {
      const c = world.getComponent<T & { readonly type: string }>(e, type);
      if (c && c.id === id) return c;
    }
    return undefined;
  };
  return {
    resource: (id) => {
      const r = first<Resource>('Resource', id);
      return r ? { current: r.current, ...(r.max !== undefined ? { max: r.max } : {}) } : undefined;
    },
    value: (id) => first<StringVar>('StringVar', id)?.value,
    flag: (id) => first<Flag>('Flag', id)?.active,
    list: (id) => {
      const spec = lists[id];
      return spec ? projectList(world, spec) : undefined;
    },
  };
}
