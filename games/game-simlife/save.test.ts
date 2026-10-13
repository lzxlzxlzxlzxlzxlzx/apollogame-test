import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCommands } from '@zerocraft/engine/net/commands.js';
import { hashWithOrder } from '@zerocraft/engine/net/index.js';
import type { Camera, Flag, LifeContinuousMotion, LifeNpcSchedule, LifePlacement, LifeQuestState, State, Transform, Velocity } from '@zerocraft/engine/engine/protocol/components.js';
import { MemoryStoragePort, SaveSystem, type SaveGame, type SaveMeta, type StoragePort } from '@zerocraft/engine/services/storage/index.js';
import { createLifeDemoSession, createPersistentLifeDemoSession, type PersistentLifeDemoSession } from './game-simlife.js';
import { selectLifeDemoView } from './view-model.js';
import { LIFE_DEMO_SAVE_SLOT, LIFE_DEMO_SAVE_VERSION, LifeDemoAutosave, LifeDemoSaveAdapter } from './save.js';

class CountingStoragePort implements StoragePort {
  readonly memory = new MemoryStoragePort();
  saveCalls = 0;
  rejectSave = false;
  async save(slot: string, data: SaveGame): Promise<void> { this.saveCalls++; if (this.rejectSave) throw new Error('save rejected'); await this.memory.save(slot, data); }
  load(slot: string): Promise<SaveGame | null> { return this.memory.load(slot); }
  list(): Promise<SaveMeta[]> { return this.memory.list(); }
  delete(slot: string): Promise<void> { return this.memory.delete(slot); }
}

function tick(runtime: PersistentLifeDemoSession): void {
  const { session } = runtime;
  applyCommands(session.engine.world, session.input.commandsForTick(session.engine.world.getVersion() + 1));
  session.engine.world.tick();
  runtime.autosave.observe(session.engine.world);
}
function action(runtime: PersistentLifeDemoSession, key: string, arg?: string): void {
  runtime.session.input.enqueueAction(key, arg === undefined ? undefined : { arg });
  tick(runtime);
}
function hold(runtime: PersistentLifeDemoSession, direction: string, ticks: number): void {
  action(runtime, 'life.move.start', direction);
  for (let i = 1; i < ticks; i++) tick(runtime);
  action(runtime, 'life.move.stop', direction);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('Little Valley SaveSystem adapter', () => {
  it('round-trips farm, story flag, warp, snapshot order and hash through one MemoryStoragePort', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12_345);
    const port = new CountingStoragePort();
    const first = await createPersistentLifeDemoSession(undefined, port);
    expect(first.restoreResult).toBe('missing');

    hold(first, 'up', 8);
    action(first, 'life.action', 'till');
    action(first, 'life.action', 'water');
    action(first, 'life.select-item', 'seed.turnip');
    action(first, 'life.action', 'plant');
    action(first, 'life.advance-day');
    action(first, 'life.action', 'water');
    action(first, 'life.advance-day');
    action(first, 'life.action', 'harvest');
    hold(first, 'down', 8); hold(first, 'right', 42); hold(first, 'up', 16);
    action(first, 'life.select-target', 'mayor'); action(first, 'life.action', 'talk'); action(first, 'dialogue.choose', '1');
    expect(first.session.engine.world.getComponent<State>('life:dialogue-session:player', 'State')).toMatchObject({ current: 'harvested' });
    expect(first.session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest_reported', 'Flag')).toMatchObject({ active: true });
    hold(first, 'down', 36); hold(first, 'down', 7); hold(first, 'right', 48); hold(first, 'up', 4); hold(first, 'right', 1);
    expect(first.session.engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    const gatePosition = first.session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    expect({ scene: selectLifeDemoView(first.session.engine.world).scene, x: Math.floor(gatePosition.x), y: Math.floor(gatePosition.y) }).toEqual({ scene: 'little-valley', x: 34, y: 20 });
    first.session.engine.world.createEntity('10'); first.session.engine.world.createEntity('2');
    first.session.engine.world.addComponent('life:player', { type: 'WorldUI2D', text: 'render-only, never persisted' } as any);
    action(first, 'life.warp', 'mine-gate');
    await first.autosave.drain();

    expect(selectLifeDemoView(first.session.engine.world)).toMatchObject({ scene: 'mine-interior', results: { warp: 'applied' } });
    expect(first.session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest_reported', 'Flag')).toMatchObject({ active: true });
    const stored = await port.load(LIFE_DEMO_SAVE_SLOT);
    expect(JSON.parse(stored!.meta.label!)).toMatchObject({ schema: LIFE_DEMO_SAVE_VERSION, slug: 'game-simlife' });
    expect(stored?.meta.timestamp).toBe(12_345);
    expect(stored?.order).toContain('life:player');
    expect(Object.values(stored!.snapshot).flatMap((components) => Object.keys(components))).not.toContain('WorldUI2D');

    const second = await createPersistentLifeDemoSession(undefined, port);
    expect(second.restoreResult).toBe('restored');
    expect(selectLifeDemoView(second.session.engine.world)).toMatchObject({ scene: 'mine-interior', objective: '在矿洞采集一份矿石' });
    expect(second.session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest_reported', 'Flag')).toMatchObject({ active: true });
    expect(second.session.engine.world.getComponent<LifeQuestState>('life:quest-state','LifeQuestState')).toMatchObject({receipts:['quest.first-season/harvest-turnip','quest.first-season/report-to-mayor'],entries:expect.arrayContaining([{questId:'quest.first-season',nodeId:'mine-ore',state:'active'}])});
    expect(second.session.engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    expect(stored!.snapshot['life:camera']).toBeUndefined();
    expect(second.session.engine.world.getComponent<Camera>('life:camera', 'Camera')).toBeDefined();
  });

  it('does not save movement ticks and saves one real discrete farming commit once', async () => {
    const port = new CountingStoragePort();
    const runtime = await createPersistentLifeDemoSession(undefined, port);
    hold(runtime, 'up', 8);
    await runtime.autosave.drain();
    expect(port.saveCalls).toBe(0);

    action(runtime, 'life.action', 'till');
    await runtime.autosave.drain();
    expect(port.saveCalls).toBe(1);
    expect(runtime.autosave.observe(runtime.session.engine.world)).toBe(false);
    tick(runtime); tick(runtime);
    await runtime.autosave.drain();
    expect(port.saveCalls).toBe(1);
  });

  it('autosaves a slot projection and restores its NPC schedule cursor and placement', async () => {
    const port=new CountingStoragePort();const first=await createPersistentLifeDemoSession(undefined,port);
    action(first,'life.advance-time');await first.autosave.drain();
    expect(port.saveCalls).toBe(1);
    const mayorId=first.session.engine.world.query('LifeNpcSchedule').find(([id])=>first.session.engine.world.getComponent<LifePlacement>(id,'LifePlacement')?.placementId==='mayor')![0];
    expect(first.session.engine.world.getComponent<LifeNpcSchedule>(mayorId,'LifeNpcSchedule')).toMatchObject({currentSlot:'afternoon'});
    const second=await createPersistentLifeDemoSession(undefined,port);
    expect(second.restoreResult).toBe('restored');
    expect(second.session.engine.world.getComponent<LifeNpcSchedule>(mayorId,'LifeNpcSchedule')).toMatchObject({currentSlot:'afternoon'});
    expect(second.session.engine.world.getComponent<LifePlacement>(mayorId,'LifePlacement')).toMatchObject({x:22,y:8});
  });

  it('falls back safely for missing, incompatible and corrupt saves without half-restoring the fresh world', async () => {
    const missingPort = new MemoryStoragePort();
    const missing = createLifeDemoSession();
    expect(await new LifeDemoSaveAdapter(missing.engine.world, missingPort).restore(missing.engine.world)).toBe('missing');

    const incompatiblePort = new MemoryStoragePort();
    await new SaveSystem(incompatiblePort).save(LIFE_DEMO_SAVE_SLOT, createLifeDemoSession().engine.world, 'little-valley:old-format');
    const incompatible = createLifeDemoSession(); const incompatibleHash = hashWithOrder(incompatible.engine.world.snapshot(), incompatible.engine.world.snapshotOrder());
    expect(await new LifeDemoSaveAdapter(incompatible.engine.world, incompatiblePort).restore(incompatible.engine.world)).toBe('incompatible');
    expect(hashWithOrder(incompatible.engine.world.snapshot(), incompatible.engine.world.snapshotOrder())).toBe(incompatibleHash);

    const corruptPort = new MemoryStoragePort(); const source = createLifeDemoSession(); const adapter = new LifeDemoSaveAdapter(source.engine.world, corruptPort);
    expect(await adapter.save(source.engine.world)).toBe(true);
    const corrupt = await corruptPort.load(LIFE_DEMO_SAVE_SLOT); corrupt!.meta.hash = 'tampered'; await corruptPort.save(LIFE_DEMO_SAVE_SLOT, corrupt!);
    const target = createLifeDemoSession(); const targetHash = hashWithOrder(target.engine.world.snapshot(), target.engine.world.snapshotOrder());
    expect(await adapter.restore(target.engine.world)).toBe('failed');
    expect(hashWithOrder(target.engine.world.snapshot(), target.engine.world.snapshotOrder())).toBe(targetHash);
  });

  it('swallows save rejection and restores held motion into a safe stopped input lifetime', async () => {
    const rejecting = new CountingStoragePort(); rejecting.rejectSave = true;
    const playable = createLifeDemoSession();
    expect(await new LifeDemoSaveAdapter(playable.engine.world, rejecting).save(playable.engine.world)).toBe(false);
    playable.input.enqueueAction('life.move.start', { arg: 'right' });
    applyCommands(playable.engine.world, playable.input.commandsForTick(playable.engine.world.getVersion() + 1)); playable.engine.world.tick();
    expect(playable.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')?.right).toBe(true);

    const port = new MemoryStoragePort(); const adapter = new LifeDemoSaveAdapter(playable.engine.world, port);
    expect(await adapter.save(playable.engine.world)).toBe(true);
    const resumed = createLifeDemoSession(); expect(await adapter.restore(resumed.engine.world)).toBe('restored');
    expect(resumed.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: false, down: false, left: false, right: false });
    expect(resumed.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0, vy: 0 });
    const x = selectLifeDemoView(resumed.engine.world).x; resumed.engine.world.tick();
    expect(selectLifeDemoView(resumed.engine.world).x).toBe(x);
  });

  it('coalesces a failed autosave without throwing into the simulation observer', async () => {
    const port = new CountingStoragePort(); port.rejectSave = true;
    const session = createLifeDemoSession(); const autosave = new LifeDemoAutosave(new LifeDemoSaveAdapter(session.engine.world, port), session.engine.world);
    session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest', 'Flag')!.active = true;
    expect(autosave.observe(session.engine.world)).toBe(true);
    await expect(autosave.drain()).resolves.toBeUndefined();
    expect(port.saveCalls).toBe(1);
  });
});
