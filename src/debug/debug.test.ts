import { describe, it, expect } from 'vitest';
import { Engine } from '../runtime/engine.js';
import { demoBlueprint } from '../assembly/demo.assembly.js';
import { World } from '@engine/core/world.js';
import { defineCapability } from '@engine/core/define-capability.js';
import { Tracer, Recorder, replay } from './index.js';
import type { Resource } from '@engine/protocol/components.js';

describe('debug · tracer (skill collaboration log)', () => {
  it('captures, per system, exactly which components each skill changed', () => {
    const engine = new Engine();
    engine.load(demoBlueprint);
    const tracer = new Tracer(engine.world).attach();

    for (let i = 0; i < 12; i++) engine.world.tick();

    // timer-advance 写出 TimerDone
    expect(
      tracer.traces.some(
        (t) => t.systemId === 'timer-advance' && t.changes.some((c) => c.type === 'TimerDone' && c.op === 'add'),
      ),
    ).toBe(true);

    // lifetime 读 TimerDone → 写 DestroyRequest（skill 间传递）
    expect(
      tracer.traces.some(
        (t) => t.systemId === 'lifetime' && t.changes.some((c) => c.type === 'DestroyRequest' && c.op === 'add'),
      ),
    ).toBe(true);

    // destroy-apply 移除 bullet 实体（其组件出现在 remove 变更）
    expect(
      tracer.traces.some(
        (t) => t.systemId === 'destroy-apply' && t.changes.some((c) => c.entityId === 'bullet' && c.op === 'remove'),
      ),
    ).toBe(true);
  });
});

describe('debug · record / replay', () => {
  it('replays a deterministic run with zero divergences', () => {
    const engine = new Engine();
    engine.load(demoBlueprint);
    const recorder = new Recorder(engine.world);
    recorder.run(13);

    const result = replay(recorder.recording, demoBlueprint.capabilities);
    expect(result.ticks).toBe(13);
    expect(result.deterministic).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it('detects non-determinism as divergences — replay finds the bug', () => {
    // 故意制造非确定性：每 tick 用 Math.random 改写 Resource.current
    const flaky = defineCapability({
      id: 'test-flaky',
      version: '1.0.0',
      describe: { name: 'flaky', summary: '故意非确定', semantic: ['test'], whenToUse: '', examples: [] },
      components: { provides: {}, reads: ['Resource'], writes: ['Resource'], consumes: [] },
      config: {},
      systems: [
        {
          id: 'flaky',
          reads: ['Resource'],
          writes: ['Resource'],
          consumes: [],
          execute(world) {
            for (const [id] of world.query('Resource')) {
              const r = world.getComponent<Resource>(id, 'Resource')!;
    // eslint-disable-next-line zerocraft/no-unseeded-random -- 故意非确定：被测对象就是「用 Math.random 制造非确定」以验证 Recorder 抓到分叉（原 test-hygiene 白名单）
              r.current = Math.floor(Math.random() * 1000);
            }
          },
        },
      ],
    });

    const world = new World();
    for (const s of flaky.systems) world.addSystem(s);
    world.createEntity('e');
    world.addComponent('e', { type: 'Resource', id: 'hp', current: 100, min: 0, max: 1000 } as Resource);

    const recorder = new Recorder(world);
    recorder.run(4);

    const result = replay(recorder.recording, [flaky]);
    expect(result.deterministic).toBe(false);
    expect(result.divergences.length).toBeGreaterThan(0);
  });
});
