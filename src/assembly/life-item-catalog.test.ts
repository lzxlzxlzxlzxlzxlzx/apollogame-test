import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage, compileLifeGamePackage, INVENTORY_CAPABILITY_ID } from './life-package-compile.js';
import { threeSceneLifePackage } from './life-package.fixture.js';
import { validateLifeGamePackage } from './life-package.js';
import { invCount, invHas, type Inventory } from '@skills/tier2/inventory.js';
import { hashSnapshot } from '@net/determinism.js';
import { Engine } from '@runtime/engine.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const withItems = (): any => {
  const pkg = copy(threeSceneLifePackage()) as any;
  pkg.itemCatalog = [
    { id: 'crop.turnip', kind: 'crop', skinKey: 'item:turnip' },
    { id: 'seed.turnip', kind: 'seed', skinKey: 'item:turnip-seed' },
    { id: 'axe', kind: 'tool', skinKey: 'item:axe' },
    { id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' },
    { id: 'tea', kind: 'good', skinKey: 'item:tea' },
    { id: 'letter', kind: 'quest', skinKey: 'item:letter' },
  ];
  pkg.playerInventory = { slots: 4, maxStack: 10, items: [{ itemId: 'seed.turnip', count: 3 }, { itemId: 'seed.turnip', count: 2 }, { itemId: 'axe', count: 1 }] };
  return pkg;
};
const paths = (pkg: unknown) => validateLifeGamePackage(pkg).issues.map((issue) => issue.path);

describe('Life item catalog and starting Inventory', () => {
  it('compiles catalog metadata separately and projects ordered starting stacks through existing Inventory helpers', () => {
    const manifest = compileLifeGamePackage(withItems());
    expect(manifest.capabilities).toContain(INVENTORY_CAPABILITY_ID);
    expect(manifest.entities['life:item-catalog']).toEqual({ LifeItemCatalog: { items: [
      { id: 'axe', kind: 'tool', skinKey: 'item:axe' }, { id: 'crop.turnip', kind: 'crop', skinKey: 'item:turnip' }, { id: 'letter', kind: 'quest', skinKey: 'item:letter' }, { id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }, { id: 'seed.turnip', kind: 'seed', skinKey: 'item:turnip-seed' }, { id: 'tea', kind: 'good', skinKey: 'item:tea' },
    ] } });
    const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(withItems()).blueprint);
    const bag = engine.world.getComponent<Inventory>('life:player', 'Inventory')!;
    expect(bag).toEqual({ type: 'Inventory', id: 'bag:life:player', slots: 4, maxStack: 10, items: [{ kind: 'seed.turnip', count: 3 }, { kind: 'seed.turnip', count: 2 }, { kind: 'axe', count: 1 }] });
    expect(invCount(bag, 'seed.turnip')).toBe(5); expect(invHas(bag, 'axe')).toBe(true);
  });

  it('fails closed with exact paths for invalid item metadata and inventory stacks', () => {
    const cases: Array<[string, (pkg: any) => void, string]> = [
      ['empty id', (p) => { p.itemCatalog[0].id = ''; }, '$.itemCatalog[0].id'], ['duplicate id', (p) => { p.itemCatalog[1].id = p.itemCatalog[0].id; }, '$.itemCatalog[1].id'],
      ['bad kind', (p) => { p.itemCatalog[0].kind = 'magic'; }, '$.itemCatalog[0].kind'], ['path skin', (p) => { p.itemCatalog[0].skinKey = 'assets/x.png'; }, '$.itemCatalog[0].skinKey'], ['url skin', (p) => { p.itemCatalog[0].skinKey = 'https://x/y'; }, '$.itemCatalog[0].skinKey'],
      ['unknown item', (p) => { p.playerInventory.items[0].itemId = 'missing'; }, '$.playerInventory.items[0].itemId'], ['zero count', (p) => { p.playerInventory.items[0].count = 0; }, '$.playerInventory.items[0].count'], ['fraction count', (p) => { p.playerInventory.items[0].count = 1.5; }, '$.playerInventory.items[0].count'], ['over stack', (p) => { p.playerInventory.items[0].count = 11; }, '$.playerInventory.items[0].count'], ['too many stacks', (p) => { p.playerInventory.slots = 2; }, '$.playerInventory.items'],
    ];
    for (const [name, mutate, path] of cases) { const pkg = withItems(); mutate(pkg); expect(paths(pkg), name).toContain(path); }
  });

  it('keeps duplicate item stacks legal, preserves fixture catalog metadata, and hashes deterministically', () => {
    expect(validateLifeGamePackage(withItems())).toEqual({ ok: true, issues: [] });
    const legacy = compileLifeGamePackage(threeSceneLifePackage());
    expect(legacy.entities['life:item-catalog']).toEqual({ LifeItemCatalog: { items: [{ id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }] } });
    expect(legacy.entities['life:player']).toMatchObject({ Inventory: { id: 'bag:life:player', slots: 10, maxStack: 99, items: [] } });
    const run = () => { const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(withItems()).blueprint); return engine; };
    expect(hashSnapshot(run().world.snapshot())).toBe(hashSnapshot(run().world.snapshot()));
  });
});
