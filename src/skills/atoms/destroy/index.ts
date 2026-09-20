import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { DestroyRequest } from '@engine/protocol/components.js';

export const destroyCapability = defineCapability({
  id: 'k2-destroy',
  version: '1.0.0',

  describe: {
    name: 'destroy',
    summary: '需要移除一个实体。',
    semantic: ['lifecycle', 'intent'],
    whenToUse:
      '子弹出界、敌人死亡、特效播完时发出 DestroyRequest{entityId}。destroy-apply 系统消费请求并移除目标实体。lifetime（Tier 1）= timer done → DestroyRequest。',
    examples: ['死亡：DestroyRequest{entityId:"enemy-3"}', '子弹出界：自身挂 DestroyRequest{entityId: self}', '特效结束：DestroyRequest{entityId:"boom-7"}'],
  },

  components: {
    provides: {
      DestroyRequest: {
        category: 'intent',
        describe: '移除指定实体的请求。destroy-apply 执行后由 World 消费该请求。',
        fields: {
          entityId: { type: 'EntityId', describe: '要移除的实体 id' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: ['DestroyRequest'],
  },

  config: {},

  systems: [
    {
      id: 'destroy-apply',
      phase: SystemPhase.Resolve,
      runsAfter: ['mortal'],
      reads: [],
      writes: [],
      consumes: ['DestroyRequest'],
      execute(world) {
        for (const [holderId] of world.query('DestroyRequest')) {
          const req = world.getComponent<DestroyRequest>(holderId, 'DestroyRequest');
          if (req) world.destroyEntity(req.entityId);
        }
      },
    },
  ],
});
