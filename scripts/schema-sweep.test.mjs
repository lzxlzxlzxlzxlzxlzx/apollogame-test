// scripts/schema-sweep.test.mjs —— P1c 组合子 schema 对**真实游戏蓝图**全量扫（零误报律）
//
// defineComponent 迁移过的组件（EventWhen/Signal/Effect/SelfRule/GameFlow…）在装载期走递归校验。
// 它抓的是 LLM 产的坏数据；但校验器若比真实数据严（schema 写错），会把好游戏拦在装载期。
// 故：把仓内所有 TS 蓝图跑一遍 validateComponentData —— error 必须为 0；warning（未知字段）逐条列出供人看。
// 同时对账：defineComponent 的 sim:false ⇔ NON_DETERMINISTIC（两处漂移即红）。
import { describe, it, expect } from 'vitest';
import { validateComponentData } from '../src/assembly/validate-manifest.ts';
import { ALL_CAPABILITIES } from '../src/assembly/capability-registry.ts';
import { COMPONENT_DEFS } from '../src/engine/core/define-component.ts';
import { NON_DETERMINISTIC } from '../src/net/determinism.ts';

const BLUEPRINTS = [
  ['game108', async () => (await import('../games/game108/blueprint.ts')).buildBlueprint('parrot')],
  ['game-a', async () => (await import('../games/game-a/blueprint.ts')).buildTableBlueprint({ seed: 42 })],
  ['game-103', async () => (await import('../games/game-103/blueprint.ts')).buildBlueprint()],
  ['game101', async () => (await import('../games/game101/blueprint.ts')).buildBlueprint()],
  ['game102', async () => (await import('../games/game102/blueprint.ts')).buildBlueprint()],
  ['game-e', async () => (await import('../games/game-e/blueprint.ts')).buildGameEBlueprint()],
  ['game-f', async () => (await import('../games/game-f/blueprint.ts')).buildGameFBlueprint()],
];

describe('P1c schema sweep · 真实蓝图零 error', () => {
  for (const [name, load] of BLUEPRINTS) {
    it(`${name}：迁移组件的递归校验对现成蓝图零 error`, async () => {
      let bp;
      try { bp = await load(); } catch (e) { throw new Error(`${name} 蓝图装不出来：${e?.message ?? e}`); }
      const rep = validateComponentData(bp.capabilities ?? ALL_CAPABILITIES, bp.entities);
      const errs = rep.errors.map((e) => `${e.entity}.${e.component}: ${e.message}`);
      expect(errs, errs.join('\n')).toEqual([]);
    });
  }
});

describe('P1c 对账 · defineComponent.sim ⇔ NON_DETERMINISTIC', () => {
  it('sim:false 的组件必在 NON_DETERMINISTIC；已迁移的 sim:true 组件必不在', () => {
    void ALL_CAPABILITIES; // 触发全部能力模块加载 → defineComponent 注册
    const bad = [];
    for (const [type, def] of COMPONENT_DEFS) {
      if (type.startsWith('__')) continue; // 测试探针
      if (def.sim === NON_DETERMINISTIC.has(type)) bad.push(`${type}: sim=${def.sim} vs NON_DETERMINISTIC.has=${NON_DETERMINISTIC.has(type)}`);
    }
    expect(bad).toEqual([]);
    expect(COMPONENT_DEFS.size).toBeGreaterThanOrEqual(5);
  });
});
