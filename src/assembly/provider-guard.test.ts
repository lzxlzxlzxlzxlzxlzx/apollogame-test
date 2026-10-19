import { describe, it, expect } from 'vitest';
import { COMPONENT_UNIVERSE } from './component-universe.gen.js';
import { COMPONENT_PROVIDERS_ALL } from './capability-registry.js';

// C 治理（engine-base-tier-review-2026-09-06 §3.3）：每个运行时组件要么有能力 provides 它（目录可查·manifest 可推断·
// 字段进 schema 校验），要么在下面的显式白名单里并写明理由。此前 Status / InputQueue / Collider3D / NavMesh /
// PrefabOrigin / Sensor / MergeEvent 七个 sim 组件被系统读写却无任何 provider——目录查不到、推断推不出、字段不校验。
// 新组件不登 provider 也不进白名单 → 本测红并点名。

/** 无 provider 的合法例外：名字 → 理由。 */
const RUNTIME_OR_RENDER_ONLY: Readonly<Record<string, string>> = {
  // 观测横切（不进 hash·不进申报门·见 system-view OBSERVABILITY_COMPONENTS）
  DebugTrace: '观测组件（debug-trace.ts）·opt-in 挂世界·不进 sim hash',
  ScoreTrace: '观测组件（score-trace.ts）·opt-in 挂世界·不进 sim hash',
  Coachmark: '渲染器引导层标注（renderer/coachmark.ts）·render-only',
  // 游戏侧/宿主注入的数据形状（无引擎 writer）
  HeldHand: '牌桌手牌快照（cardboard）·由游戏宿主写入·无引擎 system 读写',
};

/** 3D 渲染线组件（P3D 专职域·`src/renderer/three-*` 消费·NON_DETERMINISTIC 渲染只读）：按名字后缀 3D 归类。 */
const isRender3D = (t: string): boolean => /3D$/.test(t);

describe('协议组件 provider 守卫', () => {
  it('COMPONENT_UNIVERSE 每个类型：有 provider · 或 3D 渲染线 · 或显式白名单', () => {
    const orphans = COMPONENT_UNIVERSE.filter((t) => !COMPONENT_PROVIDERS_ALL.has(t) && !isRender3D(t) && !(t in RUNTIME_OR_RENDER_ONLY));
    expect(orphans, `无 provider 且不在白名单的组件：${orphans.join(', ')}——给它的 writer 能力加 provides，或在本测白名单写明理由`).toEqual([]);
  });

  it('白名单不臃肿：列在白名单里的组件确实没有 provider（有了就从白名单删）', () => {
    const stale = Object.keys(RUNTIME_OR_RENDER_ONLY).filter((t) => COMPONENT_PROVIDERS_ALL.has(t));
    expect(stale).toEqual([]);
  });

  it('评审点名的七个组件如今都有 provider', () => {
    for (const t of ['Status', 'InputQueue', 'Collider3D', 'NavMesh', 'PrefabOrigin', 'Sensor', 'MergeEvent']) {
      expect(COMPONENT_PROVIDERS_ALL.get(t), t).toBeDefined();
    }
    expect(COMPONENT_PROVIDERS_ALL.get('Status')).toEqual(['t2-hitbox']);
    expect(COMPONENT_PROVIDERS_ALL.get('NavMesh')).toEqual(['d2-navmesh-bake']);
  });
});
