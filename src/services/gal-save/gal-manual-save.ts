import { World } from '@engine/core/world.js';
import type { InputQueue } from '@engine/protocol/components.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { canonicalEntity, hashSnapshot, hashWithOrder } from '@net/determinism.js';
import { deriveNarrativeProjection, importNarrativeHistory, type NarrativeHistory, type NarrativePackage,
  type NarrativeProjection, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { CorruptSaveError } from '../save/envelope.js';
import { SaveSystem } from '../storage/save-system.js';
import type { SaveGame, SaveMeta, StoragePort } from '../storage/storage-port.js';

export interface GalManualSlot { readonly number: number; readonly meta: SaveMeta }
export type GalManualLoadResult = { readonly status: 'empty' } | { readonly status: 'loaded'; readonly meta: SaveMeta };

const PREFIX = 'zerocraft.gal-manual.v1.';
function slotNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('GAL 手动槽号必须是正安全整数');
  return value;
}
function packageFingerprint(pkg: GalPackage): string {
  return hashSnapshot({ package: { NarrativePackage: { type: 'NarrativePackage', package: pkg } as NarrativePackage } });
}
function samePackage(a: GalPackage, b: GalPackage): boolean {
  return a.id === b.id && packageFingerprint(a) === packageFingerprint(b);
}
function exactOrder(world: World, order: readonly string[]): boolean {
  const actual = world.snapshotOrder();
  return actual.length === order.length && actual.every((id, index) => id === order[index]);
}
function reject(message: string): never { throw new CorruptSaveError(`GAL 手动存档：${message}`); }

/** A save-only copy keeps the active tick in SaveMeta without ticking an isolated World. */
class SaveCopy extends World {
  constructor(private readonly sourceTick: number) { super(); }
  override getVersion(): number { return this.sourceTick; }
}

/** Host-side controller. It never puts global GalProfile or pending input in a slot. */
export class GalManualSaveController {
  private readonly saves: SaveSystem;
  private readonly slotPrefix: string;

  constructor(private readonly pkg: GalPackage, private readonly port: StoragePort) {
    if (pkg.schemaVersion !== 1 || typeof pkg.id !== 'string' || !pkg.id.trim())
      throw new TypeError('GAL 手动存档需要已验证的 V1 package');
    this.saves = new SaveSystem(port);
    this.slotPrefix = `${PREFIX}${encodeURIComponent(pkg.id).replace(/\./g, '%2E')}.`;
  }

  slot(number: number): string { return `${this.slotPrefix}${slotNumber(number)}`; }

  async list(): Promise<GalManualSlot[]> {
    const metas = await this.saves.list();
    const entries: GalManualSlot[] = [];
    for (const meta of metas) {
      if (!meta.slot.startsWith(this.slotPrefix)) continue;
      const suffix = meta.slot.slice(this.slotPrefix.length);
      const number = Number(suffix);
      if (!/^[1-9]\d*$/.test(suffix) || !Number.isSafeInteger(number) || String(number) !== suffix) continue;
      entries.push({ number, meta: structuredClone(meta) });
    }
    return entries.sort((a, b) => a.number - b.number);
  }

  async save(number: number, active: World, label?: string): Promise<SaveMeta> {
    const slot = this.slot(number);
    if (label !== undefined && (typeof label !== 'string' || label.length > 120 || /[\x00-\x1f\x7f]/.test(label)))
      throw new TypeError('GAL 手动存档标签必须是至多 120 字的安全文本');
    const candidate = new SaveCopy(active.getVersion());
    candidate.restore(active.snapshot(), active.snapshotOrder());
    this.validate(candidate);
    this.clearPendingInput(candidate);
    return this.saves.save(slot, candidate, label);
  }

  async load(number: number, active: World): Promise<GalManualLoadResult> {
    this.validateActivePackage(active);
    const verified = await this.readVerified(number);
    if (!verified) return { status: 'empty' };
    active.restore(verified.snapshot, verified.order);
    active.clearEvents();
    return { status: 'loaded', meta: verified.meta };
  }

  /** Verify the authoritative save in isolation without restoring an active World. */
  async inspect(number: number): Promise<SaveMeta | null> {
    const verified = await this.readVerified(number);
    return verified?.meta ?? null;
  }

  private async readVerified(number: number): Promise<{
    meta: SaveMeta; snapshot: ReturnType<World['snapshot']>; order: ReturnType<World['snapshotOrder']>;
  } | null> {
    const slot = this.slot(number);
    const candidate = new World();
    const captured: { data?: SaveGame | null } = {};
    const observingPort: StoragePort = {
      save: (name, data) => this.port.save(name, data),
      load: async name => { captured.data = await this.port.load(name); return captured.data; },
      list: () => this.port.list(),
      delete: name => this.port.delete(name),
    };
    const meta = await new SaveSystem(observingPort).load(slot, candidate);
    if (!meta) return null;
    if (meta.slot !== slot) reject('槽位元数据与请求不符');
    // Legacy orderless saves cannot prove entity creation order; GAL manual slots require it.
    if (!captured.data || !captured.data.order || !exactOrder(candidate, captured.data.order) ||
        hashWithOrder(candidate.snapshot(), candidate.snapshotOrder()) !== meta.hash)
      reject('实体创建序缺失、损坏或存档在预检期间发生变化');
    this.validate(candidate);
    this.clearPendingInput(candidate);
    const snapshot = candidate.snapshot();
    const order = candidate.snapshotOrder();
    // A second isolated restore proves the candidate is wholly restorable before touching active.
    const rehearsal = new World();
    rehearsal.restore(snapshot, order);
    if (!exactOrder(rehearsal, order)) reject('实体创建序无法恢复');
    return { meta: structuredClone(meta), snapshot, order };
  }

  async delete(number: number): Promise<void> { await this.saves.delete(this.slot(number)); }

  private validateActivePackage(world: World): void {
    if (world.query('GalProfile').length) reject('活动世界不得包含全局 GalProfile');
    const packages = world.query('NarrativePackage');
    if (packages.length !== 1) reject('活动世界缺少唯一 NarrativePackage');
    const actual = packages[0][1].get('NarrativePackage') as NarrativePackage;
    if (!actual?.package || !samePackage(actual.package, this.pkg)) reject('活动世界 package 与发布包不兼容');
  }

  private validate(world: World): void {
    const packages = world.query('NarrativePackage');
    const runtimes = world.query('StoryRuntime');
    const projections = world.query('NarrativeProjection');
    if (packages.length !== 1 || runtimes.length !== 1 || projections.length !== 1 ||
        packages[0][0] !== runtimes[0][0] || runtimes[0][0] !== projections[0][0])
      reject('剧情包、运行态与投影必须在同一唯一实体');
    const entity = runtimes[0][0];
    const storedPackage = packages[0][1].get('NarrativePackage') as NarrativePackage;
    const state = runtimes[0][1].get('StoryRuntime') as StoryRuntime;
    const projection = projections[0][1].get('NarrativeProjection') as NarrativeProjection;
    if (!storedPackage?.package || !samePackage(storedPackage.package, this.pkg)) reject('存档 package 与当前发布包不兼容');
    const ref = state?.current;
    const node = ref && this.pkg.chapters[ref.chapterId]?.nodes[ref.nodeId];
    const refKey = ref && JSON.stringify([ref.chapterId, ref.nodeId]);
    if (state?.packageId !== this.pkg.id || !node || node.kind === 'jump' ||
        state.activeNodeKey !== refKey || state.activeChapterId !== ref.chapterId ||
        !Array.isArray(state.enteredNodeIds) || !state.enteredNodeIds.includes(refKey) ||
        (node.kind === 'ending' && state.endingId !== node.ending) ||
        projection?.packageId !== this.pkg.id || projection.chapterId !== ref.chapterId ||
        projection.nodeId !== ref.nodeId || projection.kind !== node.kind)
      reject('StoryRef 或投影与当前发布包不一致');
    let derived: NarrativeProjection | undefined;
    try { derived = deriveNarrativeProjection(world.readView(), entity); }
    catch { reject('投影无法从当前发布包重建'); }
    const canonicalProjection = (value: NarrativeProjection): string =>
      canonicalEntity(entity, [['NarrativeProjection', value]]);
    if (!derived || canonicalProjection(derived) !== canonicalProjection(projection))
      reject('投影内容与当前发布包不一致');
    if (world.query('GalProfile').length) reject('全局 GalProfile 不得进入 WorldSnapshot');
    const histories = world.query('NarrativeHistory');
    if (histories.length > 1 || (histories.length === 1 && histories[0][0] !== entity)) reject('历史组件归属不合法');
    const history = histories[0]?.[1].get('NarrativeHistory') as NarrativeHistory | undefined;
    if (histories.length && !history) reject('历史组件损坏');
    if (!importNarrativeHistory(world, entity, history)) reject('历史游标或当前剧情态不一致');
    if (history) this.validateHistoryProjections(world, entity, history);
  }

  private validateHistoryProjections(world: World, entity: string, history: NarrativeHistory): void {
    const replay = new World();
    replay.restore(world.snapshot(), world.snapshotOrder());
    const canonicalProjection = (value: NarrativeProjection): string =>
      canonicalEntity(entity, [['NarrativeProjection', value]]);
    const canonicalText = (value: unknown): string =>
      canonicalEntity(entity, [['HistoryText', { value }]]);
    for (const [index, entry] of history.entries.entries()) {
      replay.addComponent(entity, entry.state);
      for (const value of entry.values) replay.addComponent(value.entity, value.component);
      let derived: NarrativeProjection | undefined;
      try { derived = deriveNarrativeProjection(replay.readView(), entity); }
      catch { reject(`历史第 ${index} 条投影无法重建`); }
      if (!derived || canonicalProjection(derived) !== canonicalProjection(entry.projection) ||
          canonicalText(entry.text) !== canonicalText(derived.text) || entry.speakerId !== derived.speakerId)
        reject(`历史第 ${index} 条投影或回看文本与发布包不一致`);
    }
  }

  private clearPendingInput(world: World): void {
    for (const [entity] of world.query('InputQueue'))
      world.addComponent<InputQueue>(entity, { type: 'InputQueue', actions: [] });
  }
}
