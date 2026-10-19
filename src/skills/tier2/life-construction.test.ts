import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage, compileLifeGamePackage, lifeEntityId } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { validateLifeGamePackage } from '@assembly/life-package-validate.js';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { hashSnapshot } from '@net/determinism.js';
import { QueuedInputSource } from '@net/host/index.js';
import type { DebugTrace, Flag, LifeActionResult, LifeActivityContext, LifeConstructionProject, LifePosition, LifeRelationshipState, Transform } from '@engine/protocol/components.js';
import { collectLifeSceneRender } from '@renderer/life-scene-render.js';
import { LifeHostSaveAdapter } from '@assembly/life-host/life-save.js';
import { seasideMarketHostDescriptorFixture } from '../../authoring/life-host-descriptor.fixture.js';
import { MemoryStoragePort } from '../../services/storage/index.js';
import { invCount, type Inventory } from './inventory.js';
import { lifeConstructionCapability } from './life-construction.js';

const projectEntityId = lifeEntityId('construction', 'bridge.repair');

function constructionPackage(): any {
  const value: any = structuredClone(threeSceneLifePackage());
  value.itemCatalog.push(
    { id: 'resource.wood', kind: 'resource', skinKey: 'art:item:wood' },
    { id: 'resource.stone', kind: 'resource', skinKey: 'art:item:stone' },
  );
  value.playerInventory.items = [{ itemId: 'resource.wood', count: 4 }, { itemId: 'resource.stone', count: 2 }];
  value.logic = { flags: [{ id: 'bridge.unlocked', initial: true }, { id: 'bridge.quest-done', initial: false }] };
  value.scenes[0].zones[0].allowedActions.push('build');
  value.scenes[0].placements.push({ id: 'bridge', kind: 'building', x: 1, y: 0, width: 1, height: 1, prefabRef: 'building.bridge', skinKey: 'art:building:bridge-broken' });
  value.constructionProjects = [{
    id: 'bridge.repair', placementId: 'bridge',
    materials: [{ itemId: 'resource.wood', count: 3 }, { itemId: 'resource.stone', count: 2 }],
    requires: { kind: 'flag', id: 'bridge.unlocked', equals: true },
    completedSkinKey: 'art:building:bridge-complete',
  }];
  value.relationships = [{
    npcId: 'mayor', min: 0, max: 10, initial: 0,
    levels: [{ id: 'neutral', min: 0, titleKey: 'relationship.neutral' }],
    dailyCaps: { talk: 5, gift: 5, action: 5 },
    rules: [{ id: 'bridge-help', priority: 10, trigger: { kind: 'life-action', action: 'build', targetId: 'bridge' }, effect: { kind: 'relationship-delta', amount: 2 } }],
  }];
  value.quests = [{ id: 'town', titleKey: 'chapter.town', quests: [{
    id: 'quest.bridge', chapterId: 'town', priority: 10, initialNodeId: 'repair', terminalNodeIds: ['repair'],
    nodes: [{ id: 'repair', titleKey: 'quest.bridge', objectiveKey: 'quest.bridge.repair', trigger: { kind: 'life-action', action: 'build', targetId: 'bridge' }, effects: [
      { kind: 'set-flag', id: 'bridge.quest-done', value: true },
      { kind: 'set-node-state', questId: 'quest.bridge', nodeId: 'repair', state: 'completed' },
    ] }],
  }] }];
  return value;
}

function make(trace = false): Engine {
  const engine = new Engine();
  engine.load(compileAndParseLifeGamePackage(constructionPackage()).blueprint);
  if (trace) {
    engine.world.createEntity('trace');
    engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 1, max: 30 } as DebugTrace);
  }
  engine.world.tick();
  return engine;
}

function input(engine: Engine, ...actions: Array<[string, string?]>): void {
  const source = new QueuedInputSource('host');
  for (const [name, arg] of actions) source.enqueueAction(name, arg === undefined ? undefined : { arg });
  applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1));
  engine.world.tick();
}

function project(engine: Engine): LifeConstructionProject {
  return engine.world.getComponent<LifeConstructionProject>(projectEntityId, 'LifeConstructionProject')!;
}

describe('t2-life-construction', () => {
  it('completion write anchor: compiles build data, exposes an affordance, and completes exactly once', () => {
    const raw = constructionPackage();
    expect(validateLifeGamePackage(raw)).toEqual({ ok: true, issues: [] });
    const manifest = compileLifeGamePackage(raw);
    expect(manifest.capabilities).toContain('t2-life-construction');
    expect(manifest.entities[projectEntityId]?.LifeConstructionProject).toMatchObject({ projectId: 'bridge.repair', placementId: 'bridge', completed: false });
    const engine = make();
    expect(engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')!.affordances).toContainEqual(expect.objectContaining({ action: 'build', targetId: 'bridge', available: true }));
    input(engine, ['life.select-target', 'bridge'], ['life.action', 'build']);
    expect(project(engine).completed).toBe(true);
    expect(engine.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ action: 'build', status: 'accepted' });
    expect(collectLifeSceneRender(engine.world)?.placements.find((entry) => entry.placementId === 'bridge')?.skinKey).toBe('art:building:bridge-complete');
    expect(engine.world.getComponent<Flag>('life:logic:flag:bridge.quest-done', 'Flag')?.active).toBe(true);
    expect(engine.world.getComponent<LifeRelationshipState>('life:relationship-state', 'LifeRelationshipState')?.entries.find((entry) => entry.npcId === 'mayor')?.value).toBe(2);
    input(engine, ['life.action', 'build']);
    expect(engine.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ status: 'rejected', reason: 'already-completed' });
  });

  it('material deduction anchor: deducts the complete material set atomically and preserves placement identity', () => {
    const engine = make();
    const placementBefore = structuredClone(engine.world.getComponent<any>(lifeEntityId('placement', 'town', 'bridge'), 'LifePlacement'));
    input(engine, ['life.select-target', 'bridge'], ['life.action', 'build']);
    const inventory = engine.world.getComponent<Inventory>('life:player', 'Inventory')!;
    expect(invCount(inventory, 'resource.wood')).toBe(1);
    expect(invCount(inventory, 'resource.stone')).toBe(0);
    expect(engine.world.getComponent<any>(lifeEntityId('placement', 'town', 'bridge'), 'LifePlacement')).toEqual(placementBefore);
  });

  it('projects locked and missing-material states, then rejects both with zero writes', () => {
    const locked = make();
    locked.world.getComponent<Flag>('life:logic:flag:bridge.unlocked', 'Flag')!.active = false;
    locked.world.tick();
    expect(locked.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')!.affordances).toContainEqual(expect.objectContaining({ action: 'build', reason: 'locked', available: false }));
    const lockedInventory = structuredClone(locked.world.getComponent<Inventory>('life:player', 'Inventory'));
    input(locked, ['life.select-target', 'bridge'], ['life.action', 'build']);
    expect(locked.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ status: 'rejected', reason: 'locked' });
    expect(project(locked).completed).toBe(false);
    expect(locked.world.getComponent<Inventory>('life:player', 'Inventory')).toEqual(lockedInventory);

    const missing = make();
    missing.world.getComponent<Inventory>('life:player', 'Inventory')!.items.find((entry) => entry.kind === 'resource.wood')!.count = 2;
    missing.world.tick();
    expect(missing.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')!.affordances).toContainEqual(expect.objectContaining({ action: 'build', reason: 'missing-materials', available: false }));
    const missingInventory = structuredClone(missing.world.getComponent<Inventory>('life:player', 'Inventory'));
    input(missing, ['life.select-target', 'bridge'], ['life.action', 'build']);
    expect(missing.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ status: 'rejected', reason: 'missing-materials' });
    expect(project(missing).completed).toBe(false);
    expect(missing.world.getComponent<Inventory>('life:player', 'Inventory')).toEqual(missingInventory);
  });

  it('rejects missing selection and stale non-nearby selection without writes or false triggers', () => {
    const missing = make();
    input(missing, ['life.action', 'build']);
    expect(missing.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ status: 'rejected', reason: 'missing-selection' });
    expect(project(missing).completed).toBe(false);
    expect(missing.world.getComponent<Flag>('life:logic:flag:bridge.quest-done', 'Flag')?.active).toBe(false);

    const far = make();
    far.world.addComponent('life:player', { type: 'LifeSelectedTarget', placementId: 'bridge' } as any);
    far.world.addComponent('life:player', { type: 'LifePosition', sceneId: 'town', x: 3, y: 3 } as LifePosition);
    far.world.addComponent('life:player', { type: 'Transform', x: 3, y: 3, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    far.world.tick();
    input(far, ['life.action', 'build']);
    expect(far.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ status: 'rejected', reason: 'target-not-nearby' });
    expect(project(far).completed).toBe(false);
  });

  it('requires exactly one current build affordance even when a stale context still lists the target nearby', () => {
    const engine = make();
    const context = engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')!;
    engine.world.addComponent('life:player', { ...context, affordances: context.affordances.filter((entry) => entry.action !== 'build') } as LifeActivityContext);
    engine.world.addComponent('life:player', { type: 'LifeSelectedTarget', placementId: 'bridge' } as any);
    engine.world.addComponent('life:player', { type: 'LifeActionResult', action: 'build', status: 'accepted', sceneId: 'town', x: 0, y: 0, zoneIds: ['town-forage'] } as LifeActionResult);
    const before = structuredClone(engine.world.getComponent<Inventory>('life:player', 'Inventory'));
    lifeConstructionCapability.systems[0]!.execute(engine.world);
    expect(engine.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ status: 'rejected', reason: 'invalid-target' });
    expect(project(engine).completed).toBe(false);
    expect(engine.world.getComponent<Inventory>('life:player', 'Inventory')).toEqual(before);
  });

  it('is deterministic, traces a reconstructable three-event success, and trace opt-in does not change authority hash', () => {
    const a = make(true); const b = make(false);
    input(a, ['life.select-target', 'bridge'], ['life.action', 'build']);
    input(b, ['life.select-target', 'bridge'], ['life.action', 'build']);
    const trace = a.world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    const events = trace.events.filter((event) => event.system === 'life-construction');
    expect(events.map((event) => event.kind)).toEqual(['decision', 'transition', 'commit']);
    expect(events).toHaveLength(3);
    expect(hashSnapshot(a.world.snapshot())).toBe(hashSnapshot(b.world.snapshot()));
  });

  it('round-trips completion through the Life host save and renders completed skin immediately after restore', async () => {
    const source = make();
    input(source, ['life.select-target', 'bridge'], ['life.action', 'build']);
    const port = new MemoryStoragePort();
    const descriptor = seasideMarketHostDescriptorFixture();
    const adapter = new LifeHostSaveAdapter(descriptor, source.world, port);
    expect(await adapter.save(source.world)).toBe(true);
    const target = make();
    const restore = new LifeHostSaveAdapter(descriptor, target.world, port);
    expect(await restore.restore(target.world)).toBe('restored');
    expect(project(target).completed).toBe(true);
    expect(collectLifeSceneRender(target.world)?.placements.find((entry) => entry.placementId === 'bridge')?.skinKey).toBe('art:building:bridge-complete');
  });

  it('validates construction authoring as a strict, closed fixed-site contract', () => {
    const invalid = constructionPackage();
    invalid.constructionProjects.push(structuredClone(invalid.constructionProjects[0]));
    invalid.constructionProjects[1].id = 'bridge.repair.duplicate';
    invalid.constructionProjects[1].materials = [{ itemId: 'missing', count: 0 }, { itemId: 'missing', count: 1 }];
    invalid.constructionProjects[1].completedSkinKey = 'https://bad.example/bridge.png';
    invalid.constructionProjects[1].callback = 'free-code';
    const paths = validateLifeGamePackage(invalid).issues.map((entry) => entry.path);
    expect(paths).toEqual(expect.arrayContaining([
      '$.constructionProjects[1].placementId',
      '$.constructionProjects[1].materials[0].itemId',
      '$.constructionProjects[1].materials[0].count',
      '$.constructionProjects[1].materials[1].itemId',
      '$.constructionProjects[1].completedSkinKey',
      '$.constructionProjects[1].callback',
    ]));
  });
});
