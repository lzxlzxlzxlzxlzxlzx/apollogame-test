import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { stringVariableCapability } from './index.js';
import type { StringVar, StringSet } from '@engine/protocol/components.js';

const system = stringVariableCapability.systems[0];

describe('string-apply system', () => {
  let world: World;
  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('同实体设置字符串值', () => {
    world.createEntity('e1');
    world.addComponent('e1', { type: 'StringVar', id: 'story-node', value: 'scene_01' } as StringVar);
    world.addComponent('e1', { type: 'StringSet', id: 'story-node', value: 'scene_02' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('e1', 'StringVar')!.value).toBe('scene_02');
    expect(world.hasComponent('e1', 'StringSet')).toBe(false); // 被消费
  });

  it('全局按 id 路由：StringSet 挂别的实体也能写到持有者', () => {
    world.createEntity('state');
    world.addComponent('state', { type: 'StringVar', id: 'ending', value: '' } as StringVar);
    world.createEntity('judge');
    world.addComponent('judge', { type: 'StringSet', id: 'ending', value: 'true_end' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('state', 'StringVar')!.value).toBe('true_end');
  });

  it('无匹配 id：不写入但仍消费事件', () => {
    world.createEntity('e1');
    world.addComponent('e1', { type: 'StringVar', id: 'a', value: 'x' } as StringVar);
    world.createEntity('e2');
    world.addComponent('e2', { type: 'StringSet', id: 'nope', value: 'y' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('e1', 'StringVar')!.value).toBe('x');
    expect(world.hasComponent('e2', 'StringSet')).toBe(false);
  });

  // A2 遗留缺口腿：同拍多个 StringSet 同 id 的折叠语义（源码 string-apply 按 query 序=创建序逐条应用）。
  it('同拍多个 StringSet 同 id → 按创建序依次应用、末位胜（last-wins·实测钉死），且全部消费', () => {
    world.createEntity('holder');
    world.addComponent('holder', { type: 'StringVar', id: 'node', value: 'a' } as StringVar);
    world.createEntity('e1');
    world.addComponent('e1', { type: 'StringSet', id: 'node', value: 'from-e1' } as StringSet);
    world.createEntity('e2');
    world.addComponent('e2', { type: 'StringSet', id: 'node', value: 'from-e2' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('holder', 'StringVar')!.value).toBe('from-e2'); // 创建序末位胜
    expect(world.hasComponent('e1', 'StringSet')).toBe(false); // 两条都被消费（不残留下一拍重放）
    expect(world.hasComponent('e2', 'StringSet')).toBe(false);
  });

  it('同拍折叠的胜者随创建序走（反序创建 → 另一条胜）——不是固定实体名，是创建序末位', () => {
    world.createEntity('holder');
    world.addComponent('holder', { type: 'StringVar', id: 'node', value: 'a' } as StringVar);
    world.createEntity('e2'); // 先建 e2
    world.addComponent('e2', { type: 'StringSet', id: 'node', value: 'from-e2' } as StringSet);
    world.createEntity('e1'); // 后建 e1 → 末位
    world.addComponent('e1', { type: 'StringSet', id: 'node', value: 'from-e1' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('holder', 'StringVar')!.value).toBe('from-e1');
  });
});
