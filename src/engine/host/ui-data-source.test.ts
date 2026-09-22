import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { createWorldDataSource, projectList } from './ui-data-source.js';
import { resolveBindings } from '@ui/components/bindings.js';
import type { LayoutNode } from '@ui/components/types.js';

// P2b · 标准世界数据源：resource/value/flag 按 id 首份；list 按纯数据 UIListSpec 投影（query/tag/fields/sortBy）。
// 端到端：世界里的 5 张牌 + 一段 JSON（repeat）→ 手牌区 LayoutNode（game-a hud.ts 手写 builder 的数据形态）。

function cards(): World {
  const w = new World({ strict: false });
  w.createEntity('deck'); w.addComponent('deck', { type: 'Resource', id: 'gold', current: 12, min: 0, max: 99 } as never);
  w.addComponent('deck', { type: 'StringVar', id: 'turn', value: 'p1' } as never);
  w.addComponent('deck', { type: 'Flag', id: 'my-turn', active: true } as never);
  const specs: Array<[string, string, number, number]> = [['c1', 'A♠', 14, 1], ['c2', '7♥', 7, 1], ['c3', 'K♦', 13, 2], ['c4', '2♣', 2, 1]];
  for (const [id, face, power, tag] of specs) {
    w.createEntity(id);
    w.addComponent(id, { type: 'Text', text: face } as never);
    w.addComponent(id, { type: 'Resource', id: `pw-${id}`, current: power, min: 0, max: 20 } as never);
    w.addComponent(id, { type: 'Tag', flags: tag } as never);
  }
  return w;
}

describe('createWorldDataSource', () => {
  it('resource/value/flag 按语义 id 全局路由', () => {
    const ds = createWorldDataSource(cards());
    expect(ds.resource!('gold')).toEqual({ current: 12, max: 99 });
    expect(ds.value!('turn')).toBe('p1');
    expect(ds.flag!('my-turn')).toBe(true);
    expect(ds.resource!('nope')).toBeUndefined();
  });

  it('list：按 query 取实体·tag 掩码过滤·fields 取标量·sortBy 稳定排序·每项恒含 id', () => {
    const w = cards();
    const all = projectList(w, { query: ['Text', 'Resource'], fields: { face: { comp: 'Text', key: 'text' }, power: { comp: 'Resource', key: 'current' } } });
    expect(all.map((i) => i.id)).toEqual(['c1', 'c2', 'c3', 'c4']); // 创建序
    const mine = projectList(w, { query: ['Text'], tag: 1, fields: { face: { comp: 'Text', key: 'text' }, power: { comp: 'Resource', key: 'current' } }, sortBy: 'power', desc: true });
    expect(mine.map((i) => `${i.face}:${i.power}`)).toEqual(['A♠:14', '7♥:7', '2♣:2']); // c3 tag=2 被滤掉
    const missing = projectList(w, { query: ['Text'], fields: { z: { comp: 'Nope', key: 'x' } } });
    expect(missing[0]).toEqual({ id: 'c1' }); // 缺组件 → 字段缺席
  });

  it('端到端：手牌区 = 世界 + 一段 JSON（repeat）——无 TS builder', () => {
    const w = cards();
    const ds = createWorldDataSource(w, {
      hand: { query: ['Text', 'Resource'], tag: 1, fields: { face: { comp: 'Text', key: 'text' }, power: { comp: 'Resource', key: 'current' } }, sortBy: 'power', desc: true },
    });
    const handArea: LayoutNode = {
      type: 'Panel', id: 'hand', props: {},
      repeat: {
        source: 'hand', key: 'id',
        template: { type: 'Button', id: 'card', props: { label: '{{item.face}}', action: 'play', actionArg: '{{item.id}}' } as never },
      },
    };
    const out = resolveBindings(handArea, ds);
    expect(out.children!.map((c) => c.id)).toEqual(['card#c1', 'card#c2', 'card#c4']);
    expect(out.children!.map((c) => (c.props as { label: string }).label)).toEqual(['A♠', '7♥', '2♣']);
    // 世界一变（打出 c1）→ 同一段 JSON 重解析即新树：不需要任何游戏代码
    w.destroyEntity('c1');
    expect(resolveBindings(handArea, ds).children!.map((c) => c.id)).toEqual(['card#c2', 'card#c4']);
  });
});
