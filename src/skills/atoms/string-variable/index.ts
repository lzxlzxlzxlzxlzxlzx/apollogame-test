import { defineCapability } from '@engine/core/define-capability.js';
import type { StringVar, StringSet } from '@engine/protocol/components.js';

// string-variable —— 命名字符串容器原子（周期表 X3）。核心原子只有数值(Resource)/布尔(Flag)容器，
// 叙事/换装/结局标识缺一个 string 容器。仿 Resource+ResourceModify+resource-apply 三件套：
//   StringVar{id,value}（持久）+ StringSet{id,value}（一次性写事件）+ string-apply（应用并消费）。
// StringSet 全局按 id 路由（同实体优先，否则全局），与 R11 一致——游戏层"设 story-node=scene_2"不必知道它住哪。
// 纯 POD，structuredClone 友好 → 自动进 world.snapshot()。可被 Condition 的 string 叶子读。
export const stringVariableCapability = defineCapability({
  id: 'x3-string-variable',
  version: '1.0.0',

  describe: {
    name: 'string-variable',
    summary: '命名字符串容器：StringVar{id,value}，经一次性 StringSet 事件修改（全局按 id 路由）。',
    semantic: ['string', 'narrative', 'variable', 'container'],
    whenToUse:
      '需要持久的语义字符串状态时：当前剧情节点 id、玩家取名、结局标识、上次选择。多个并存用多实体。可被 Condition 的 string 叶子门控。',
    examples: [
      '剧情指针：StringVar{ id:"story-node", value:"scene_01" }',
      '推进：StringSet{ id:"story-node", value:"scene_02" }（挂任意实体，按 id 全局路由）',
      '结局标识：StringVar{ id:"ending", value:"" } → 结局判定时 StringSet 写入',
    ],
  },

  components: {
    provides: {
      StringVar: {
        category: 'config',
        describe: '持久字符串值，用 id 区分语义。每实体每 type 唯一，多个用多实体。',
        fields: {
          id: { type: 'string', describe: '语义标识（如 "story-node"、"ending"）' },
          value: { type: 'string', describe: '当前字符串值' },
        },
      },
      StringSet: {
        category: 'event',
        describe: '一次性设置 id 字符串变量的事件，执行后由 World 自动删除。全局按 id 路由。',
        fields: {
          id: { type: 'string', describe: '目标 StringVar 的 id' },
          value: { type: 'string', describe: '要写入的新值' },
          scope: { type: 'string', describe: "寻址作用域：'local'=只改本实体 / 'global'=按 id 全局；缺省本地优先再全局" },
        },
      },
    },
    reads: ['StringVar'],
    writes: ['StringVar'],
    consumes: ['StringSet'],
  },

  config: {
    id: {
      type: 'string',
      default: 'var',
      describe: '字符串变量标识',
      question: '这个字符串变量叫什么？（如 story-node、ending）',
      ui: { control: 'input' },
    },
    value: {
      type: 'string',
      default: '',
      describe: '初始值',
      question: '初始字符串是什么？',
      ui: { control: 'input' },
    },
  },

  systems: [
    {
      id: 'string-apply',
      reads: ['StringVar'],
      writes: ['StringVar'],
      consumes: ['StringSet'],
      execute(world) {
        // scope: 'local'/'global'/缺省 auto（同实体优先→全局）。全局查找用一次性 id 索引，O(1)。
        let index: Map<string, StringVar> | null = null;
        const globalFind = (id: string): StringVar | undefined => {
          if (!index) {
            index = new Map();
            for (const [e] of world.query('StringVar')) {
              const s = world.getComponent<StringVar>(e, 'StringVar');
              if (s && !index.has(s.id)) index.set(s.id, s);
            }
          }
          return index.get(id);
        };

        for (const [entityId] of world.query('StringSet')) {
          const set = world.getComponent<StringSet>(entityId, 'StringSet');
          if (!set) continue;
          const scope = set.scope ?? 'auto';
          let target: StringVar | undefined;
          if (scope !== 'global') {
            const local = world.getComponent<StringVar>(entityId, 'StringVar');
            if (local && local.id === set.id) target = local;
          }
          if (!target && scope !== 'local') target = globalFind(set.id);
          if (!target) continue;
          target.value = set.value;
        }
      },
    },
  ],
});
