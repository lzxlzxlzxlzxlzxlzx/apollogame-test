import type { LifeHostDescriptorV1 } from '../../authoring/life-host-descriptor.js';
import { World } from '../../engine/core/world.js';
import type { Component, WorldSnapshot } from '../../engine/core/types.js';
import type { LifeContinuousMotion, LifePosition, Velocity } from '../../engine/protocol/components.js';
import { hashSnapshot, hashWithOrder } from '../../net/index.js';
import { appendTrace, findDebugTrace } from '../../skills/debug-trace.js';
import { SaveSystem, type SaveMeta, type StoragePort } from '../../services/storage/index.js';

export const LIFE_HOST_SAVE_SCHEMA = 'zerocraft.life-host-save.v1' as const;
const LIFE_HOST_SAVE_SYSTEM = 'life-host-save';
export type LifeHostRestoreResult = 'restored' | 'missing' | 'incompatible' | 'failed';

const PERSISTENT_COMPONENTS: ReadonlySet<string> = new Set([
  // DialogueScript/Text are deliberately absent: LifeDialogueSession + State are the progress
  // cursor, while t2-life-talk applies the fresh catalog policy and rehydrates valid runtime data.
  'Inventory', 'LifeFarmPlot', 'LifeCrop', 'LifeResourceNode', 'LifeCalendar', 'LifeNpcSchedule',
  'LifePlacement', 'Flag', 'Resource', 'LifeMilestoneLedger', 'LifeDialogueSession', 'State',
  'LifeQuestState', 'LifeQuestProjection', 'LifeRelationshipState', 'LifeRelationshipProjection',
  'LifeConstructionProject',
  'LifePosition', 'Transform',
]);
const COMMIT_COMPONENTS: ReadonlySet<string> = new Set([
  'Inventory', 'LifeFarmPlot', 'LifeCrop', 'LifeResourceNode', 'LifeCalendar', 'LifeNpcSchedule',
  'LifePlacement', 'Flag', 'Resource', 'LifeMilestoneLedger', 'LifeDialogueSession', 'State',
  'LifeQuestState', 'LifeQuestProjection', 'LifeRelationshipState', 'LifeRelationshipProjection',
  'LifeConstructionProject',
]);
const PACKAGE_COMPONENTS: ReadonlySet<string> = new Set([
  'LifeWorld', 'LifeTileCatalog', 'LifeItemCatalog', 'LifeCropCatalog', 'LifeCalendarConfig',
  'LifeScene', 'LifeZone', 'LifeWarp', 'LifeSpawn', 'LifePlayerVisual', 'LifeDialogueCatalog',
  'LifeMilestoneCatalog', 'LifeQuestCatalog', 'LifeRelationshipCatalog', 'LifeActor',
  'LifeProfileCatalog',
]);

interface SaveLabelV1 {
  readonly schema: typeof LIFE_HOST_SAVE_SCHEMA;
  readonly slug: string;
  readonly descriptorHash: string;
  readonly packageHash: string;
}

const cloneComponent = (component: Component): Component => JSON.parse(JSON.stringify(component)) as Component;

function projectPersistentComponent(type: string, component: Component, entityComponents: ReadonlyMap<string, Component>): Component | undefined {
  const value = component as Component & Record<string, unknown>;
  if (type === 'Inventory') return { type, items: structuredClone(value.items) } as Component;
  if (type === 'LifeResourceNode') return { type, remaining: value.remaining } as Component;
  if (type === 'LifeConstructionProject') return { type, completed: value.completed } as Component;
  if (type === 'LifeNpcSchedule') return { type, currentSlot: value.currentSlot } as Component;
  if (type === 'LifePlacement') {
    return {
      type, sceneId: value.sceneId, x: value.x, y: value.y,
      ...(value.visible === undefined ? {} : { visible: value.visible }),
      ...(value.interactive === undefined ? {} : { interactive: value.interactive }),
    } as Component;
  }
  if (type === 'Transform' && !entityComponents.has('LifePosition')) return undefined;
  return cloneComponent(component);
}

function mergePersistentComponent(baseline: Component | undefined, stored: Component): Component {
  if (['Inventory', 'LifeResourceNode', 'LifeNpcSchedule', 'LifePlacement', 'LifeConstructionProject'].includes(stored.type)) {
    if (!baseline || baseline.type !== stored.type) throw new Error(`Missing package baseline for ${stored.type}`);
    return { ...cloneComponent(baseline), ...cloneComponent(stored) } as Component;
  }
  return cloneComponent(stored);
}

function descriptorFingerprint(descriptor: LifeHostDescriptorV1): string {
  // The new calendar name map is presentation-only for every adapter caller,
  // not just mountLifeGame. With this optional field omitted the old descriptor
  // fingerprint stays byte-identical; do not normalize other legacy fields.
  const { calendarLabels: _calendarLabels, ...hud } = descriptor.hud;
  return hashSnapshot({ descriptor: { LifeHostDescriptor: cloneComponent({ type: 'LifeHostDescriptor', ...descriptor, hud } as Component) } });
}

function stablePackageComponent(type: string, component: Component): Component {
  const copy = cloneComponent(component) as Component & Record<string, unknown>;
  if (type === 'LifePlacement') { delete copy.x; delete copy.y; delete copy.visible; delete copy.interactive; }
  else if (type === 'LifeResourceNode') delete copy.remaining;
  else if (type === 'LifeConstructionProject') delete copy.completed;
  else if (type === 'LifeNpcSchedule') delete copy.currentSlot;
  else if (type === 'Inventory') delete copy.items;
  return copy;
}

/** Runtime compatibility fingerprint: immutable package/catalog/config plus installed system order. */
export function lifeHostPackageFingerprint(world: World): string {
  const snapshot: WorldSnapshot = {};
  for (const entityId of world.snapshotOrder()) {
    const components = world.componentsOf(entityId);
    if (!components) continue;
    const kept: Record<string, Component> = {};
    for (const [type, component] of components) {
      if (PACKAGE_COMPONENTS.has(type) || ['LifePlacement', 'LifeResourceNode', 'LifeNpcSchedule', 'LifeConstructionProject', 'Inventory'].includes(type)) {
        kept[type] = stablePackageComponent(type, component);
      }
    }
    if (Object.keys(kept).length > 0) snapshot[entityId] = kept;
  }
  snapshot['life:host:systems'] = {
    LifeHostSystems: { type: 'LifeHostSystems', ids: world.getSortedSystems().map((system) => system.id) } as Component,
  };
  return hashSnapshot(snapshot);
}

function assertDescriptorIdentity(descriptor: LifeHostDescriptorV1): void {
  const expected = `life:${descriptor.slug}:v1`;
  if (descriptor.schema !== 'zerocraft.life-host.v1' || descriptor.save.namespace !== expected
    || descriptor.save.schemaVersion !== 1 || descriptor.save.autosave !== 'life-commit-v1') {
    throw new Error('Invalid LifeHostDescriptor save identity');
  }
}

export function deriveLifeHostSaveSlot(descriptor: LifeHostDescriptorV1): string {
  assertDescriptorIdentity(descriptor);
  return `${descriptor.save.namespace.slice(0, -3)}:slot-1`;
}

function persistentSnapshot(world: World): { snapshot: WorldSnapshot; order: string[] } {
  const snapshot: WorldSnapshot = {};
  const order: string[] = [];
  for (const entityId of world.snapshotOrder()) {
    const components = world.componentsOf(entityId);
    if (!components) continue;
    const kept: Record<string, Component> = {};
    for (const [type, component] of components) {
      if (!PERSISTENT_COMPONENTS.has(type)) continue;
      const projected = projectPersistentComponent(type, component, components);
      if (projected) kept[type] = projected;
    }
    if (Object.keys(kept).length > 0) { snapshot[entityId] = kept; order.push(entityId); }
  }
  return { snapshot, order };
}

/** Exactly the payload protected by SaveSystem.hash. */
export function lifeHostPersistentHash(world: World): string {
  const projection = persistentSnapshot(world);
  return hashWithOrder(projection.snapshot, projection.order);
}

/** Progress-only fingerprint. Coordinates, camera, input, velocity, prompts and render state cannot trigger autosave. */
export function lifeHostCommitSignature(world: World): string {
  const snapshot: WorldSnapshot = {};
  for (const entityId of world.snapshotOrder()) {
    const components = world.componentsOf(entityId);
    if (!components) continue;
    const kept: Record<string, Component> = {};
    for (const [type, component] of components) {
      if (COMMIT_COMPONENTS.has(type)) kept[type] = cloneComponent(component);
      else if (type === 'LifePosition') {
        const sceneId = (component as Component & { sceneId?: unknown }).sceneId;
        kept[type] = { type: 'LifePosition', sceneId } as Component;
      }
    }
    if (Object.keys(kept).length > 0) snapshot[entityId] = kept;
  }
  return hashSnapshot(snapshot);
}

function resetTransientState(world: World): void {
  const position = world.getComponent<LifePosition>('life:player', 'LifePosition');
  const motion = world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion');
  if (motion) {
    // Scene identity is progress authority on LifePosition. The transient motion controller comes
    // from the fresh baseline and must follow it before the first post-restore position-sync tick.
    if (position) motion.sceneId = position.sceneId;
    motion.up = false; motion.down = false; motion.left = false; motion.right = false;
  }
  const velocity = world.getComponent<Velocity>('life:player', 'Velocity');
  if (velocity) { velocity.vx = 0; velocity.vy = 0; }
  world.removeComponent('life:player', 'LifeMoveRequest');
  world.removeComponent('life:player', 'LifeWarpRequest');
}

function exactOrder(snapshot: WorldSnapshot, order: readonly string[] | undefined): order is string[] {
  if (!order || new Set(order).size !== order.length) return false;
  const keys = Object.keys(snapshot);
  return order.length === keys.length && order.every((id) => Object.prototype.hasOwnProperty.call(snapshot, id));
}

function validProjection(world: World): boolean {
  const snapshot = world.snapshot();
  if (!exactOrder(snapshot, world.snapshotOrder())) return false;
  for (const components of Object.values(snapshot)) {
    for (const [type, component] of Object.entries(components)) {
      if (!PERSISTENT_COMPONENTS.has(type)) return false;
      const keys = Object.keys(component).sort();
      if (type === 'Inventory' && keys.join(',') !== 'items,type') return false;
      if (type === 'LifeResourceNode' && keys.join(',') !== 'remaining,type') return false;
      if (type === 'LifeConstructionProject' && keys.join(',') !== 'completed,type') return false;
      if (type === 'LifeNpcSchedule' && keys.join(',') !== 'currentSlot,type') return false;
      if (type === 'LifePlacement' && keys.some((key) => !['type', 'sceneId', 'x', 'y', 'visible', 'interactive'].includes(key))) return false;
    }
  }
  return world.hasComponent('life:player', 'LifePosition') && world.hasComponent('life:calendar', 'LifeCalendar');
}

function parseLabel(label: string | undefined): SaveLabelV1 | undefined {
  if (!label) return undefined;
  try {
    const raw = JSON.parse(label) as Partial<SaveLabelV1>;
    if (raw.schema !== LIFE_HOST_SAVE_SCHEMA || typeof raw.slug !== 'string'
      || typeof raw.descriptorHash !== 'string' || typeof raw.packageHash !== 'string') return undefined;
    return raw as SaveLabelV1;
  } catch { return undefined; }
}

const encodeLabel = (label: SaveLabelV1): string => JSON.stringify({
  schema: label.schema, slug: label.slug, descriptorHash: label.descriptorHash, packageHash: label.packageHash,
});

/** Generic Life host policy: fixed descriptor-derived slot and isolated, atomic restoration. */
export class LifeHostSaveAdapter {
  readonly slot: string;
  private readonly saves: SaveSystem;
  private readonly descriptorHash: string;
  private readonly packageHash: string;
  private readonly baseline: WorldSnapshot;
  private readonly baselineOrder: string[];
  private readonly port: StoragePort;

  constructor(readonly descriptor: LifeHostDescriptorV1, compiledWorld: World, port: StoragePort) {
    assertDescriptorIdentity(descriptor);
    this.slot = deriveLifeHostSaveSlot(descriptor);
    this.port = port;
    this.saves = new SaveSystem(port);
    this.descriptorHash = descriptorFingerprint(descriptor);
    this.packageHash = lifeHostPackageFingerprint(compiledWorld);
    this.baseline = compiledWorld.snapshot();
    this.baselineOrder = compiledWorld.snapshotOrder();
  }

  private compatible(meta: SaveMeta): boolean {
    if (meta.slot !== this.slot) return false;
    const label = parseLabel(meta.label);
    return label?.slug === this.descriptor.slug && label.descriptorHash === this.descriptorHash && label.packageHash === this.packageHash;
  }

  async list(): Promise<SaveMeta[]> {
    return (await this.saves.list()).filter((meta) => this.compatible(meta));
  }

  async save(world: World): Promise<boolean> {
    try {
      if (lifeHostPackageFingerprint(world) !== this.packageHash) throw new Error('Life package compatibility changed');
      const projection = persistentSnapshot(world);
      const isolated = new World();
      isolated.restore(projection.snapshot, projection.order);
      await this.saves.save(this.slot, isolated, encodeLabel({
        schema: LIFE_HOST_SAVE_SCHEMA, slug: this.descriptor.slug,
        descriptorHash: this.descriptorHash, packageHash: this.packageHash,
      }));
      const trace = findDebugTrace(world);
      appendTrace(trace, trace?.tick ?? world.getVersion(), LIFE_HOST_SAVE_SYSTEM, 'commit', `saved ${this.slot}`);
      return true;
    } catch {
      const trace = findDebugTrace(world);
      appendTrace(trace, trace?.tick ?? world.getVersion(), LIFE_HOST_SAVE_SYSTEM, 'reject', `save rejected ${this.slot}`);
      return false;
    }
  }

  async restore(world: World): Promise<LifeHostRestoreResult> {
    try {
      if (lifeHostPackageFingerprint(world) !== this.packageHash) return this.reject(world, 'incompatible', 'active package mismatch');
      const meta = (await this.saves.list()).find((entry) => entry.slot === this.slot);
      if (!meta) return this.reject(world, 'missing', 'slot missing');
      if (!this.compatible(meta)) return this.reject(world, 'incompatible', 'descriptor or package mismatch');
      const raw = await this.port.load(this.slot);
      if (!raw || raw.meta.slot !== this.slot || !exactOrder(raw.snapshot, raw.order)) {
        return this.reject(world, 'incompatible', 'invalid slot or entity order');
      }
      const stored = new World();
      const loaded = await this.saves.load(this.slot, stored);
      if (!loaded || !this.compatible(loaded) || !validProjection(stored)) return this.reject(world, 'incompatible', 'invalid progress projection');
      const storedSnapshot = stored.snapshot();
      const storedOrder = stored.snapshotOrder();
      if (hashWithOrder(storedSnapshot, storedOrder) !== loaded.hash) return this.reject(world, 'failed', 'projection hash mismatch');

      const candidateSnapshot = structuredClone(this.baseline);
      for (const components of Object.values(candidateSnapshot)) {
        for (const type of Object.keys(components)) if (PERSISTENT_COMPONENTS.has(type)) delete components[type];
      }
      for (const [entityId, components] of Object.entries(storedSnapshot)) {
        candidateSnapshot[entityId] ??= {};
        for (const [type, component] of Object.entries(components)) {
          candidateSnapshot[entityId]![type] = mergePersistentComponent(this.baseline[entityId]?.[type], component);
        }
      }
      const baselineSet = new Set(this.baselineOrder);
      const candidateOrder = [...this.baselineOrder, ...storedOrder.filter((id) => !baselineSet.has(id))];
      const candidate = new World();
      candidate.restore(candidateSnapshot, candidateOrder);
      // DebugTrace is host-local and excluded from authority. Preserve an enabled sink
      // across the atomic world swap so the restore decision remains observable.
      for (const [traceEntity, components] of world.query('DebugTrace')) {
        const trace = components.get('DebugTrace');
        if (!trace) continue;
        if (!candidate.componentsOf(traceEntity)) candidate.createEntity(traceEntity);
        candidate.addComponent(traceEntity, cloneComponent(trace));
      }
      resetTransientState(candidate);
      if (lifeHostPersistentHash(candidate) !== loaded.hash) return this.reject(world, 'failed', 'merged progress mismatch');
      world.restore(candidate.snapshot(), candidate.snapshotOrder());
      const trace = findDebugTrace(world);
      appendTrace(trace, trace?.tick ?? world.getVersion(), LIFE_HOST_SAVE_SYSTEM, 'transition', `restored ${this.slot}`);
      return 'restored';
    } catch {
      return this.reject(world, 'failed', 'storage or integrity failure');
    }
  }

  private reject(world: World, result: Exclude<LifeHostRestoreResult, 'restored'>, why: string): LifeHostRestoreResult {
    const trace = findDebugTrace(world);
    appendTrace(trace, trace?.tick ?? world.getVersion(), LIFE_HOST_SAVE_SYSTEM, 'reject', `${result} ${this.slot}`, why);
    return result;
  }
}

/** Coalesces progress commits while ignoring movement, camera, render and input churn. */
export class LifeHostAutosave {
  private signature: string;
  private dirty = false;
  private saving: Promise<void> | undefined;
  private latestWorld: World;

  constructor(private readonly adapter: LifeHostSaveAdapter, world: World) {
    this.latestWorld = world;
    this.signature = lifeHostCommitSignature(world);
  }
  observe(world: World): boolean {
    const next = lifeHostCommitSignature(world);
    if (next === this.signature) return false;
    this.signature = next;
    this.latestWorld = world;
    this.dirty = true;
    this.kick();
    return true;
  }
  private kick(): void {
    if (this.saving || !this.dirty) return;
    this.dirty = false;
    const world = this.latestWorld;
    this.saving = this.adapter.save(world).then(() => undefined).finally(() => {
      this.saving = undefined;
      this.kick();
    });
  }
  async drain(): Promise<void> {
    while (this.saving) await this.saving;
  }
}
