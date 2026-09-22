import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Group } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  T1 · group-gc —— Group 成员回收：被销毁的实体从所有集合的 members 里摘除（防悬空 id）。
//  相位 Cleanup（destroy-apply 在 Update 已跑完）；只在真有成员失踪时写回（静止世界零写入·不推进版本）。
//  按集合实体 id 升序处理（确定性）；members 内相对顺序保持。
// ═══════════════════════════════════════════════════════════════

export const groupGcCapability = defineCapability({
  id: 't1-group-gc',
  version: '1.0.0',

  describe: {
    name: 'group-gc',
    summary: '实体销毁后从所有 Group.members 里摘除（每拍·Cleanup 相位）。',
    semantic: ['collection', 'cleanup', 'lifecycle'],
    whenToUse: '世界里挂了 Group 就一并装上（否则手牌里会留着已销毁的牌 id）。',
    examples: ['group-gc（无配置）'],
  },

  components: { provides: {}, reads: ['Group'], writes: ['Group'], consumes: [] },
  config: {},

  systems: [
    {
      id: 'group-gc',
      phase: SystemPhase.Cleanup,
      reads: ['Group'],
      writes: ['Group'],
      consumes: [],
      execute(world: IWorld) {
        // 先经 query 的组件表只读探测（不记脏·不推进版本）；只有真要摘除时才经 getComponent 取写（记脏）。
        const rows = world.query('Group').sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        if (rows.length === 0) return;
        let alive: Set<string> | undefined;
        for (const [gid, comps] of rows) {
          const peek = comps.get('Group') as Group | undefined;
          if (!peek || peek.members.length === 0) continue;
          if (!alive) alive = new Set(world.getAllEntities());
          const kept = peek.members.filter((m) => alive!.has(m));
          if (kept.length === peek.members.length) continue;
          const g = world.getComponent<Group>(gid, 'Group');
          if (g) g.members = kept;
        }
      },
    },
  ],
});
