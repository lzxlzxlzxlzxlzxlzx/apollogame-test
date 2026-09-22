import { defineCapability } from '@engine/core/define-capability.js';
import type { SpawnRequest } from '@engine/protocol/components.js';

export type { SpawnRequest };

export const spawnCapability = defineCapability({
  id: 'k1-spawn',
  version: '1.0.0',

  describe: {
    name: 'spawn',
    summary: '需要创建一个新实体。',
    semantic: ['lifecycle', 'intent'],
    whenToUse:
      '发射子弹、刷怪、产生特效时发出 SpawnRequest。模板（templateId → 组件集合）展开由 assembly/runtime 的 spawner 负责，因为它依赖模板注册表；本原子定义请求契约。',
    examples: ['开火：SpawnRequest{templateId:"bullet", x, y}', '刷怪：SpawnRequest{templateId:"slime", x, y}', '爆炸特效：SpawnRequest{templateId:"boom", x, y}'],
  },

  components: {
    provides: {
      SpawnRequest: {
        category: 'intent',
        describe: '在 (x,y) 实例化模板 templateId 的请求。由 spawner（assembly 层）消费。',
        fields: {
          templateId: { type: 'string', describe: '要实例化的模板 id' },
          x: { type: 'number', describe: '生成位置 X' },
          y: { type: 'number', describe: '生成位置 Y' },
          source: { type: 'EntityId', describe: '发起者实体（可选）：展开后写进 PrefabOrigin.source，供 scope:source 的资源寻址' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    templateId: { type: 'string', default: '', describe: '模板 id', question: '生成哪个模板？', ui: { control: 'input' } },
    x: { type: 'number', default: 0, describe: '生成 X', question: '生成位置 X？', ui: { control: 'slider', min: -2000, max: 2000, step: 1 } },
    y: { type: 'number', default: 0, describe: '生成 Y', question: '生成位置 Y？', ui: { control: 'slider', min: -2000, max: 2000, step: 1 } },
  },

  systems: [],
});
