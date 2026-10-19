import { describe, expect, it, vi } from 'vitest';
import { compileAndParseLifeGamePackage } from '../../assembly/life-package-compile.js';
import { threeSceneLifePackage } from '../../assembly/life-package.fixture.js';
import { seasideMarketHostDescriptorFixture } from '../../authoring/life-host-descriptor.fixture.js';
import type { LifeHostDescriptorV1 } from '../../authoring/life-host-descriptor.js';
import { Engine } from '../../runtime/engine.js';
import type { DebugTrace, LifeContinuousMotion, LifePosition, Transform, Velocity } from '../protocol/components.js';
import type { Inventory } from '../../skills/tier2/inventory.js';
import { hashSnapshot, hashWithOrder } from '../../net/index.js';
import { MemoryStoragePort, type SaveGame, type SaveMeta, type StoragePort } from '../../services/storage/index.js';
import { validateLayoutNode } from '../../ui/components/index.js';
import { buildLifeStandardUi } from '../../assembly/life-host/life-hud.js';
import { buildLifeInteractionOptions, LifeInteractionController } from '../../assembly/life-host/life-interaction.js';
import { selectLifeHostView } from '../../assembly/life-host/life-presenter.js';
import {
  LIFE_HOST_SAVE_SCHEMA, LifeHostAutosave, LifeHostSaveAdapter, deriveLifeHostSaveSlot,
  lifeHostCommitSignature, lifeHostPersistentHash,
} from '../../assembly/life-host/life-save.js';

class CountingPort implements StoragePort {
  readonly memory = new MemoryStoragePort();
  saves = 0;
  async save(slot: string, data: SaveGame): Promise<void> { this.saves++; await this.memory.save(slot, data); }
  load(slot: string): Promise<SaveGame | null> { return this.memory.load(slot); }
  list(): Promise<SaveMeta[]> { return this.memory.list(); }
  delete(slot: string): Promise<void> { return this.memory.delete(slot); }
}

function createWorld(): Engine {
  const engine = new Engine();
  engine.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint);
  engine.world.tick();
  return engine;
}

function alternateDescriptor(): LifeHostDescriptorV1 {
  const base = seasideMarketHostDescriptorFixture();
  return {
    ...base, slug: 'game-sky-market', artSlug: 'game-sky-market',
    save: { ...base.save, namespace: 'life:game-sky-market:v1' },
  };
}

async function rewrite(port: MemoryStoragePort, slot: string, edit: (save: SaveGame) => void): Promise<void> {
  const save = (await port.load(slot))!;
  edit(save);
  await port.save(slot, save);
}

describe('LifeHostSavePolicy v1', () => {
  it.each([false, true])('keeps direct-adapter legacy saves compatible across render-only calendar names (legacy skin %s)', async (withLegacySkin) => {
    const port = new MemoryStoragePort();
    const base = seasideMarketHostDescriptorFixture();
    const descriptor: LifeHostDescriptorV1 = { ...base, ...(withLegacySkin ? { uiSkin: { id: 'legacy-skin', slots: {} } } : {}) };
    const source = createWorld().world;
    source.getComponent<Inventory>('life:player', 'Inventory')!.items.push({ kind: 'berry', count: 4 });
    const original = new LifeHostSaveAdapter(descriptor, source, port);
    expect(await original.save(source)).toBe(true);
    const stored = (await port.load(original.slot))!;
    const legacyFingerprint = hashSnapshot({ descriptor: { LifeHostDescriptor: { type: 'LifeHostDescriptor', ...descriptor } } });
    expect(JSON.parse(stored.meta.label!).descriptorHash).toBe(legacyFingerprint);
    for (const calendarLabels of [{ seasons: { spring: '春季' } }, { seasons: { spring: '风铃季' }, slots: {} }, {}, undefined]) {
      const target = createWorld().world;
      const configured = { ...descriptor, hud: { ...descriptor.hud, ...(calendarLabels ? { calendarLabels } : {}) } };
      const beforeDescriptor = JSON.stringify(configured);
      const adapter = new LifeHostSaveAdapter(configured, target, port);
      expect(await adapter.list()).toHaveLength(1);
      expect(await adapter.restore(target)).toBe('restored');
      expect(lifeHostPersistentHash(target)).toBe(stored.meta.hash);
      expect(await adapter.save(target)).toBe(true);
      const next = (await port.load(adapter.slot))!;
      expect(next.meta.label).toBe(stored.meta.label);
      expect(next.snapshot).toEqual(stored.snapshot);
      expect(JSON.stringify(configured)).toBe(beforeDescriptor);
    }
  });

  it('derives slots only from descriptor namespace and isolates two games on one port', async () => {
    const port = new MemoryStoragePort();
    const a = seasideMarketHostDescriptorFixture(); const b = alternateDescriptor();
    const worldA = createWorld().world; const worldB = createWorld().world;
    const adapterA = new LifeHostSaveAdapter(a, worldA, port); const adapterB = new LifeHostSaveAdapter(b, worldB, port);
    expect(adapterA.slot).toBe('life:game-seaside-market:slot-1');
    expect(adapterB.slot).toBe('life:game-sky-market:slot-1');
    worldA.getComponent<Inventory>('life:player', 'Inventory')!.items.push({ kind: 'berry', count: 2 });
    worldB.getComponent<Inventory>('life:player', 'Inventory')!.items.push({ kind: 'berry', count: 7 });
    expect(await adapterA.save(worldA)).toBe(true); expect(await adapterB.save(worldB)).toBe(true);
    expect((await port.list()).map((meta) => meta.slot).sort()).toEqual([adapterA.slot, adapterB.slot].sort());
    expect(await adapterA.list()).toHaveLength(1); expect(await adapterB.list()).toHaveLength(1);
  });

  it('round-trips authority while excluding and resetting transient host state', async () => {
    const port = new MemoryStoragePort(); const descriptor = seasideMarketHostDescriptorFixture();
    const source = createWorld().world; const adapter = new LifeHostSaveAdapter(descriptor, source, port);
    source.getComponent<Inventory>('life:player', 'Inventory')!.items.push({ kind: 'berry', count: 4 });
    source.getComponent<LifePosition>('life:player', 'LifePosition')!.sceneId = 'farm';
    source.getComponent<LifePosition>('life:player', 'LifePosition')!.x = 6;
    source.getComponent<Transform>('life:player', 'Transform')!.x = 6;
    const motion = source.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!; motion.sceneId = 'farm'; motion.right = true;
    source.getComponent<Velocity>('life:player', 'Velocity')!.vx = 3;
    source.addComponent('life:player', { type: 'LifeMoveRequest', direction: 'right' } as never);
    expect(await adapter.save(source)).toBe(true);
    const stored = (await port.load(adapter.slot))!;
    const allTypes = Object.values(stored.snapshot).flatMap((components) => Object.keys(components));
    expect(allTypes).not.toEqual(expect.arrayContaining(['Camera', 'Velocity', 'LifeContinuousMotion', 'LifeMoveRequest', 'WorldUI2D', 'DebugTrace']));
    for (const components of Object.values(stored.snapshot)) {
      const placement = components.LifePlacement as unknown as Record<string, unknown> | undefined;
      if (placement) expect(placement).not.toEqual(expect.objectContaining({ skinKey: expect.anything(), prefabRef: expect.anything() }));
    }
    expect(stored.snapshot['life:player']!.Inventory).not.toEqual(expect.objectContaining({ id: expect.anything(), slots: expect.anything(), maxStack: expect.anything() }));
    expect(hashWithOrder(stored.snapshot, stored.order)).toBe(stored.meta.hash);

    const target = createWorld().world;
    expect(await adapter.restore(target)).toBe('restored');
    expect(target.getComponent<Inventory>('life:player', 'Inventory')!.items).toContainEqual({ kind: 'berry', count: 4 });
    expect(target.getComponent<LifePosition>('life:player', 'LifePosition')!.sceneId).toBe('farm');
    expect(target.getComponent<LifePosition>('life:player', 'LifePosition')!.x).toBe(6);
    expect(target.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ sceneId: 'farm', up: false, down: false, left: false, right: false });
    expect(target.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0, vy: 0 });
    expect(target.hasComponent('life:player', 'LifeMoveRequest')).toBe(false);
    expect(lifeHostPersistentHash(target)).toBe(stored.meta.hash);
  });

  it('rejects cross-slot, schema/descriptor/package/hash/order and missing authority without mutating active world', async () => {
    const descriptor = seasideMarketHostDescriptorFixture();
    const cases: Array<[string, (save: SaveGame) => void]> = [
      ['schema', (save) => { const label = JSON.parse(save.meta.label!); label.schema = 'zerocraft.life-host-save.v2'; save.meta.label = JSON.stringify(label); }],
      ['descriptor', (save) => { const label = JSON.parse(save.meta.label!); label.descriptorHash = 'other'; save.meta.label = JSON.stringify(label); }],
      ['package', (save) => { const label = JSON.parse(save.meta.label!); label.packageHash = 'other'; save.meta.label = JSON.stringify(label); }],
      ['hash', (save) => { save.meta.hash = 'tampered'; }],
      ['order', (save) => { save.order = save.order!.slice(1); save.meta.hash = hashWithOrder(save.snapshot, save.order); }],
      ['player', (save) => { delete save.snapshot['life:player']; save.order = save.order!.filter((id) => id !== 'life:player'); save.meta.hash = hashWithOrder(save.snapshot, save.order); }],
      ['calendar', (save) => { delete save.snapshot['life:calendar']; save.order = save.order!.filter((id) => id !== 'life:calendar'); save.meta.hash = hashWithOrder(save.snapshot, save.order); }],
    ];
    for (const [, corrupt] of cases) {
      const port = new MemoryStoragePort(); const source = createWorld().world;
      const adapter = new LifeHostSaveAdapter(descriptor, source, port); await adapter.save(source);
      await rewrite(port, adapter.slot, corrupt);
      const target = createWorld().world; const before = hashWithOrder(target.snapshot(), target.snapshotOrder());
      expect(await adapter.restore(target)).not.toBe('restored');
      expect(hashWithOrder(target.snapshot(), target.snapshotOrder())).toBe(before);
    }

    const port = new MemoryStoragePort(); const source = createWorld().world;
    const a = new LifeHostSaveAdapter(descriptor, source, port); await a.save(source);
    const bDescriptor = alternateDescriptor(); const bWorld = createWorld().world; const b = new LifeHostSaveAdapter(bDescriptor, bWorld, port);
    const cross = (await port.load(a.slot))!; await port.save(b.slot, { ...cross, meta: { ...cross.meta, slot: b.slot } });
    const before = hashWithOrder(bWorld.snapshot(), bWorld.snapshotOrder());
    expect(await b.restore(bWorld)).toBe('incompatible');
    expect(hashWithOrder(bWorld.snapshot(), bWorld.snapshotOrder())).toBe(before);
  });

  it('rejects an active package mismatch before reading storage', async () => {
    const port = new MemoryStoragePort(); const source = createWorld().world;
    const adapter = new LifeHostSaveAdapter(seasideMarketHostDescriptorFixture(), source, port); await adapter.save(source);
    const target = createWorld().world;
    const worldId = target.query('LifeWorld')[0]![0];
    (target.getComponent(worldId, 'LifeWorld') as unknown as Record<string, unknown>).name = 'mutated package';
    const before = hashWithOrder(target.snapshot(), target.snapshotOrder());
    expect(await adapter.restore(target)).toBe('incompatible');
    expect(hashWithOrder(target.snapshot(), target.snapshotOrder())).toBe(before);
  });

  it('autosaves only progress commits and deterministically coalesces them', async () => {
    const port = new CountingPort(); const world = createWorld().world;
    const adapter = new LifeHostSaveAdapter(seasideMarketHostDescriptorFixture(), world, port);
    const autosave = new LifeHostAutosave(adapter, world); const initial = lifeHostCommitSignature(world);
    world.getComponent<Transform>('life:player', 'Transform')!.x += 1;
    world.getComponent<Velocity>('life:player', 'Velocity')!.vx = 2;
    expect(lifeHostCommitSignature(world)).toBe(initial); expect(autosave.observe(world)).toBe(false);
    world.getComponent<Inventory>('life:player', 'Inventory')!.items.push({ kind: 'berry', count: 1 });
    expect(autosave.observe(world)).toBe(true); expect(autosave.observe(world)).toBe(false);
    await autosave.drain(); expect(port.saves).toBe(1);
  });

  it('restores into a pure host that can immediately project HUD and interaction, with optional trace only', async () => {
    const port = new MemoryStoragePort(); const descriptor = seasideMarketHostDescriptorFixture();
    const source = createWorld().world; const adapter = new LifeHostSaveAdapter(descriptor, source, port); await adapter.save(source);
    const target = createWorld().world; target.createEntity('trace');
    target.addComponent('trace', { type: 'DebugTrace', events: [], tick: 17 } satisfies DebugTrace);
    const before = hashSnapshot(target.snapshot());
    expect(await adapter.restore(target)).toBe('restored');
    const view = selectLifeHostView(target); const options = buildLifeInteractionOptions(view);
    expect(validateLayoutNode(buildLifeStandardUi(view, descriptor.hud, null))).toEqual([]);
    expect(() => new LifeInteractionController().interact(options, view)).not.toThrow();
    const trace = target.getComponent<DebugTrace>('trace', 'DebugTrace');
    expect(trace?.events.at(-1)).toMatchObject({ system: 'life-host-save', kind: 'transition' });
    expect(hashSnapshot(target.snapshot())).toBe(before);
  });

  it('rejects malformed descriptor save identity at construction', () => {
    const descriptor = { ...seasideMarketHostDescriptorFixture(), save: { namespace: 'caller:slot', schemaVersion: 1, autosave: 'life-commit-v1' } } as LifeHostDescriptorV1;
    expect(() => deriveLifeHostSaveSlot(descriptor)).toThrow(/save identity/);
    expect(LIFE_HOST_SAVE_SCHEMA).toBe('zerocraft.life-host-save.v1');
  });
});
