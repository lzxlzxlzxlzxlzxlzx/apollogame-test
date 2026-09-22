import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { damageMultiplier, multiplierAgainst, damageTableCapability, type DamageTable, type Armor } from './damage-table.js';
import { hitboxCapability } from './hitbox.js';
import { triggerZoneCapability, ZONE_FLAG } from './trigger-zone.js';
import { resourceCapability } from '@atom-skills/resource/index.js';
import { overlapDetectCapability } from '@atom-skills/overlap-detect/index.js';
import type { Transform, Shape, Tag, Resource, Hitbox, Sensor } from '@engine/protocol/components.js';

// t2-damage-table：倍率查表（缺任一 ×1）；hitbox 接线：有 damageType+Armor+表 → 乘；无 → 逐字旧行为。

const TABLE: DamageTable = { type: 'DamageTable', rows: { pierce: { light: 1.5, heavy: 0.5 }, blunt: { heavy: 2 } } };

describe('damageMultiplier', () => {
  it('查表·行缺/列缺/表缺/非数 → 1', () => {
    expect(damageMultiplier(TABLE, 'pierce', 'light')).toBe(1.5);
    expect(damageMultiplier(TABLE, 'pierce', 'heavy')).toBe(0.5);
    expect(damageMultiplier(TABLE, 'blunt', 'light')).toBe(1);
    expect(damageMultiplier(TABLE, 'magic', 'light')).toBe(1);
    expect(damageMultiplier(undefined, 'pierce', 'light')).toBe(1);
    expect(damageMultiplier(TABLE, undefined, 'light')).toBe(1);
    expect(damageMultiplier({ type: 'DamageTable', rows: { a: { b: NaN } } }, 'a', 'b')).toBe(1);
  });
});

function arena(damageType?: string, armor?: string, withTable = true): World {
  const w = new World();
  for (const c of [resourceCapability, overlapDetectCapability, triggerZoneCapability, hitboxCapability, damageTableCapability]) for (const s of c.systems) w.addSystem(s);
  if (withTable) { w.createEntity('world'); w.addComponent<DamageTable>('world', TABLE); }
  w.createEntity('victim');
  w.addComponent<Transform>('victim', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  w.addComponent<Shape>('victim', { type: 'Shape', kind: 'circle', radius: 8 });
  w.addComponent<Tag>('victim', { type: 'Tag', flags: 2 });
  w.addComponent<Resource>('victim', { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 });
  if (armor) w.addComponent<Armor>('victim', { type: 'Armor', kind: armor });
  w.createEntity('blade');
  w.addComponent<Transform>('blade', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  w.addComponent<Shape>('blade', { type: 'Shape', kind: 'circle', radius: 8 });
  w.addComponent<Tag>('blade', { type: 'Tag', flags: ZONE_FLAG });
  w.addComponent<Sensor>('blade', { type: 'Sensor' });
  w.addComponent<Hitbox>('blade', { type: 'Hitbox', resource: 'hp', amount: 10, targetMask: 2, ...(damageType ? { damageType } : {}) } as Hitbox);
  return w;
}
const hp = (w: World) => w.getComponent<Resource>('victim', 'Resource')!.current;
function settle(w: World): void { for (let i = 0; i < 4; i++) w.tick(); }

describe('hitbox × damage-table', () => {
  it('pierce 打 heavy ×0.5 / 打 light ×1.5；无 damageType / 无 Armor / 无表 → 逐字旧伤害', () => {
    // 同一布置下命中次数由 hitbox 既有节奏决定（每拍持续命中）；以「无 damageType」为基线算每次命中的伤害倍率。
    const plain = arena(undefined, 'heavy'); settle(plain);
    const hits = (100 - hp(plain)) / 10;
    expect(hits).toBeGreaterThan(0);
    let w = arena('pierce', 'heavy'); settle(w); expect(100 - hp(w)).toBe(hits * 5);
    w = arena('pierce', 'light'); settle(w); expect(100 - hp(w)).toBe(hits * 15);
    w = arena('pierce', undefined); settle(w); expect(100 - hp(w)).toBe(hits * 10);
    w = arena('pierce', 'heavy', false); settle(w); expect(100 - hp(w)).toBe(hits * 10);
    expect(multiplierAgainst(arena('pierce', 'heavy'), 'pierce', 'victim')).toBe(0.5);
  });
});
