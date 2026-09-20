import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Resource, ResourceModify, PrefabOrigin } from '@engine/protocol/components.js';
import { findSourceResource } from '@engine/core/query.js';

// queueResourceMod —— 对一实体本帧排入一条资源改值，**同实体+同 resourceId+同 scope 则累加**（R14 真修 A）。
// 解"同帧多段伤害"：N 个 hitbox/over-time 打同一敌人 hp → 各自 +amount 累加，不再后写覆盖前者丢伤害。
// add 车道加性=与生产者顺序无关；op:'set' 引入入队序依赖（set 吸收在前的加减·合并规则见函数内）——
// 但生产者序本身由确定性拓扑排序钉死，故两种车道都确定。生产者（hitbox/over-time）用它替代裸 addComponent。
// 已知边界（罕见，战斗不触发）：同实体本帧已有**不同 resourceId/scope** 的 ResourceModify 时退化为覆盖
// （与历史一致，无回归）——引擎一实体一组件，真撞到同帧改多个不同局部资源再上 list 形态。伤害恒为 local 'hp'。
export function queueResourceMod(
  world: IWorld,
  entityId: string,
  resourceId: string,
  amount: number,
  scope?: 'local' | 'global',
  op?: 'set' | 'add',
): void {
  const existing = world.getComponent<ResourceModify>(entityId, 'ResourceModify');
  if (existing && existing.resourceId === resourceId && existing.scope === scope) {
    // op 合并规则（根因①）：事件语义 = 按入队序依次生效折叠成一条。
    //   pending(add x) + add y → add x+y（原行为）；pending(set t) + add y → set t+y（先置后加）
    //   —— 两种情况都是 amount += y。pending(任意) + set t → set t（set 是最后写，吸收在前的一切）。
    if (op === 'set') {
      existing.amount = amount;
      existing.op = 'set';
    } else {
      existing.amount += amount;
    }
    return;
  }
  if (!existing) {
    world.addComponent(entityId, { type: 'ResourceModify', resourceId, amount, scope, ...(op === 'set' ? { op } : {}) } as ResourceModify);
    return;
  }
  // 已知边界：同实体本帧已有不同 (resourceId|scope) 的改值 → 覆盖退化（历史行为，无回归）。
  world.addComponent(entityId, { type: 'ResourceModify', resourceId, amount, scope, ...(op === 'set' ? { op } : {}) } as ResourceModify);
}

export const resourceCapability = defineCapability({
  id: 'f1-resource',
  version: '1.0.0',

  describe: {
    name: 'resource',
    summary: '某种有上下限的数值（hp / mp / stamina / shield / ...），支持通过事件组件修改。',
    semantic: ['numeric', 'clamped', 'stat', 'resource'],
    whenToUse: '当实体需要跟踪任何带上下限的数值时使用，例如生命值、法力值、耐力、护盾等。min 可为非零（如温度下限 -50）。',
    examples: [
      '角色生命值：Resource { id: "hp", current: 100, min: 0, max: 100 }',
      '法力值：Resource { id: "mp", current: 50, min: 0, max: 100 }',
      '温度：Resource { id: "temp", current: 20, min: -50, max: 100 }',
      '受伤（同实体）：ResourceModify { resourceId: "hp", amount: -10 }',
      '全局路由（R11）：把 ResourceModify{ resourceId: "affection_S", amount: 5 } 挂在任意实体（如对话事件实体）→ 自动改到持有该 id 的资源，无需知道它住哪',
      'per-shot 扣发射源（REQ-SPENDONFIRE）：子弹实体带 PrefabOrigin.source=炮台id + ResourceModify{ resourceId: "ammo", amount: -1, scope: "source" } → 只扣该炮台自己的 ammo，与其它炮台的同名资源互不影响',
    ],
  },

  components: {
    provides: {
      Resource: {
        category: 'resource',
        describe: '持久有界数值，用 id 区分语义（hp / mp / ...）。每实体每 type 唯一，一个实体一个 Resource。',
        fields: {
          id: { type: 'string', describe: '资源语义标识（如 "hp"、"mp"、"stamina"）' },
          current: { type: 'number', describe: '当前值，始终保持在 [min, max] 范围内' },
          min: { type: 'number', describe: '允许的最小值，可为非零（如 -50）' },
          max: { type: 'number', describe: '允许的最大值' },
        },
      },
      ResourceModify: {
        category: 'event',
        describe: '请求修改指定 id 资源的一次性事件，执行后由 World 自动删除。',
        fields: {
          resourceId: { type: 'string', describe: '目标资源的 id，与 Resource.id 匹配' },
          amount: { type: 'number', describe: "修改量（op 缺省 'add'：正数增加负数减少）；op:'set' 时为目标值" },
          op: {
            type: 'string',
            describe:
              "运算：'add'（缺省）= current+amount；'set' = 置为 amount（仍钳 [min,max]）。" +
              '清零/置满用 set——写目标值不需要先读当前值，产出方无需加 Resource 读面（根因① C 判）',
          },
          scope: {
            type: 'string',
            describe:
              "寻址作用域：'local'=仅同实体 / 'global'=强制按 id 全局 / 'source'=按本实体 PrefabOrigin.source 找发起者" +
              '（per-shot 扣发射源资源，如子弹耗炮台的 ammo；源缺失/无该资源则静默跳过，不误扣同名全局资源）/ 缺省 auto',
          },
        },
      },
    },
    reads: ['Resource', 'PrefabOrigin'], // PrefabOrigin=scope:'source' 寻发起者（申报对账·根因①）
    writes: ['Resource'],
    consumes: ['ResourceModify'],
  },

  config: {
    id: {
      type: 'string',
      default: 'hp',
      describe: '资源语义标识',
      question: '这个资源代表什么？（如 hp、mp、stamina）',
      ui: { control: 'input' },
    },
    current: {
      type: 'number',
      default: 100,
      describe: '初始当前值',
      question: '初始值是多少？',
      ui: { control: 'slider', min: 0, max: 1000, step: 1 },
    },
    min: {
      type: 'number',
      default: 0,
      describe: '最小值下限',
      question: '最小值是多少？',
      ui: { control: 'input' },
    },
    max: {
      type: 'number',
      default: 100,
      describe: '最大值上限',
      question: '最大值是多少？',
      ui: { control: 'slider', min: 1, max: 10000, step: 1 },
    },
  },

  systems: [
    {
      id: 'resource-apply',
      phase: SystemPhase.Resolve,
      runsAfter: ['hitbox'],
      reads: ['Resource', 'PrefabOrigin'], // PrefabOrigin=scope:'source' 寻发起者（申报对账·根因①）
      writes: ['Resource'],
      consumes: ['ResourceModify'],
      execute(world) {
        // 处理所有 ResourceModify（无论挂在哪个实体）。scope 决定寻址（Gemini Q4 防遮蔽）：
        //   'local'  仅同实体；'global' 强制按 id 全局；缺省 auto=同实体匹配优先，否则全局（R11）。
        // 全局查找用一次性构建的 id→Resource 索引，O(1)（Reviewer #3）。
        // consume 在本系统跑完后删全表，故必须在这一个系统里把所有 ResourceModify 处理完。
        let index: Map<string, Resource> | null = null;
        const globalFind = (id: string): Resource | undefined => {
          if (!index) {
            index = new Map();
            for (const [e] of world.query('Resource')) {
              const r = world.getComponent<Resource>(e, 'Resource');
              if (r && !index.has(r.id)) index.set(r.id, r);
            }
          }
          return index.get(id);
        };

        for (const [entityId] of world.query('ResourceModify')) {
          const modify = world.getComponent<ResourceModify>(entityId, 'ResourceModify');
          if (!modify) continue;
          const scope = modify.scope ?? 'auto';
          let resource: Resource | undefined;
          if (scope === 'source') {
            // REQ-SPENDONFIRE：per-shot 扣发射源（N 炮各自计数，不像 global 那样扣到"第一个同名资源"）。
            // 口径复用 hitbox.findScaleResource 同款查找（engine/core/query.ts findSourceResource：源自身
            // 或其同次展开复合兄弟），但**不回退全局**——本实体无 PrefabOrigin / 无 source / 源已销毁 /
            // 源无该资源，一律 resource 留 undefined → 下方静默跳过（不崩、不误扣别人的同名资源）。
            const origin = world.getComponent<PrefabOrigin>(entityId, 'PrefabOrigin');
            if (origin?.source) resource = findSourceResource(world, origin.source, modify.resourceId);
          } else {
            if (scope !== 'global') {
              const local = world.getComponent<Resource>(entityId, 'Resource');
              if (local && local.id === modify.resourceId) resource = local;
            }
            if (!resource && scope !== 'local') resource = globalFind(modify.resourceId);
          }
          if (!resource) continue;
          // op（根因①·owner 判 C）：'set' 直接置目标值（写方不必先读当前值），缺省 'add' 存量语义。两者同钳 [min,max]。
          const next = modify.op === 'set' ? modify.amount : resource.current + modify.amount;
          resource.current = next < resource.min ? resource.min : next > resource.max ? resource.max : next;
        }
      },
    },
  ],
});
