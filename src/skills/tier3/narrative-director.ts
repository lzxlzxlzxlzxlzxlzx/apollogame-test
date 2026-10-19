import { defineCapability } from '@engine/core/define-capability.js';
import { World } from '@engine/core/world.js';
import { SystemPhase, type Component, type IWorld } from '@engine/core/types.js';
import type { InputQueue, Resource, Flag, RandomSeed } from '@engine/protocol/components.js';
import type { GalPackage, GalNode, StoryRef, StoryEffect, PresentationDelta, LocalizedText } from '@engine/protocol/galgame.js';
import { evaluateCondition } from '@skills/tier2/condition.js';
import { getComponentById, sortedIds, worldSeed } from '@engine/core/query.js';
import { randomInt } from '@skills/atoms/random/index.js';
import { appendTrace, findDebugTrace } from '@skills/debug-trace.js';
import { canonicalEntity, hashSnapshot } from '@net/determinism.js';

export const NARRATIVE_ADVANCE = 'narrative.advance';
export const NARRATIVE_CHOOSE = 'narrative.choose';
export const NARRATIVE_BACK = 'narrative.back';
export const NARRATIVE_READ_COMPLETE = 'narrative.read-complete';
export const NARRATIVE_ACK = 'narrative.ack';
export const NARRATIVE_AUTO = 'narrative.auto';
export const NARRATIVE_SKIP = 'narrative.skip';
export const NARRATIVE_HISTORY_LIMIT = 512;
export const NARRATIVE_OUTBOX_LIMIT = 256;
const SYSTEM = 'narrative-director';
const MAX_AUTOMATIC_HOPS = 32;

export interface NarrativePackage extends Component { readonly type: 'NarrativePackage'; readonly package: GalPackage }
export interface NarrativeSceneState {
  sceneId?: string; backgroundId?: string;
  cast: Record<string, { visible: boolean; side?: 'left'|'right'|'center'; zOrder?: number; emotion?: string; motion?: string }>;
  cgId?: string; bgmId?: string; sfxIds: string[]; videoId?: string; transition?: 'cut'|'fade'|'wipe'|'dissolve';
}
export type NarrativeRejectReason =
  'missing-package'|'package-mismatch'|'bad-ref'|'unsupported-effect'|'missing-effect-target'|
  'missing-seed'|'missing-check-resource'|'invalid-input'|'too-many-inputs'|'invalid-node-action'|
  'invalid-choice'|'condition-failed'|'no-next'|'jump-loop'|'ambiguous-runtime'|
  'no-history'|'history-limit'|'choice-unconfirmed'|'bad-history'|'unsupported-action'|
  'outbox-full'|'bad-outbox'|'stale-read';
export interface NarrativeReceipt {
  status: 'applied'|'rejected'; reason?: NarrativeRejectReason; detail?: string; from: StoryRef; to?: StoryRef;
}
export interface StoryRuntime extends Component {
  readonly type: 'StoryRuntime'; packageId: string; current: StoryRef; scene: NarrativeSceneState;
  enteredNodeIds: string[]; activeNodeKey?: string; activeChapterId?: string; automaticTrail: string[]; endingId?: string; lastReceipt?: NarrativeReceipt;
}
export interface NarrativeProjection extends Component {
  readonly type: 'NarrativeProjection'; packageId: string; chapterId: string; nodeId: string; kind: GalNode['kind'];
  sceneId?: string; backgroundId?: string; backgroundAssetKey?: string;
  cast: Record<string, { visible: boolean; side?: 'left'|'right'|'center'; zOrder?: number; emotion?: string; assetKey?: string; motion?: string }>;
  cgId?: string; cgAssetKey?: string; bgmId?: string; bgmAssetKey?: string; sfxIds: string[]; sfxAssetKeys: string[];
  videoId?: string; videoAssetKey?: string; transition?: 'cut'|'fade'|'wipe'|'dissolve';
  speakerId?: string; speakerName?: LocalizedText; text?: LocalizedText; voiceId?: string; voiceAssetKey?: string;
  options?: { id: string; text: LocalizedText; available: boolean }[]; endingId?: string;
}
export interface NarrativeHistoryEntry {
  ref: StoryRef; kind: 'line'|'choice'|'check'|'ending'; speakerId?: string; text?: LocalizedText;
  state: StoryRuntime; enteredDelta: string[]; projection: NarrativeProjection;
  values: { entity: string; component: Resource|Flag|RandomSeed }[];
}
/** Session-only, bounded, snapshot-safe history. Static GalPackage and global PlayerProfile are excluded. */
export interface NarrativeHistory extends Component {
  readonly type: 'NarrativeHistory'; version: 1; packageId: string; packageHash: string;
  cursor: number; baseEnteredNodeIds: string[]; entries: NarrativeHistoryEntry[];
}
export type NarrativeMilestoneKind = 'reach-node'|'reach-ending'|'read-complete'|'unlockCg'|'unlockMemory'|'unlockMusic';
export interface NarrativeMilestone {
  seq: number; id: string; packageId: string; kind: NarrativeMilestoneKind;
  ref: StoryRef; contentId: string;
}
/** Durable, bounded sim outbox; the host acknowledges only after Profile persistence succeeds. */
export interface NarrativeOutbox extends Component {
  readonly type: 'NarrativeOutbox'; version: 1; packageId: string;
  nextSeq: number; ackedSeq: number; pending: NarrativeMilestone[];
}
export function readNarrativeEvents(world: IWorld, entity: string): readonly NarrativeMilestone[] {
  const box = world.getComponent<NarrativeOutbox>(entity, 'NarrativeOutbox');
  if (!box) return [];
  if (!validOutbox(box, box.packageId)) throw new Error('bad-outbox');
  return clone(box.pending);
}
/** Only the Director calls this from a named InputQueue action at the tick boundary. */
function acknowledgeNarrativeEvents(world: IWorld, entity: string, state: StoryRuntime, throughSeq: number): void {
  const box = world.getComponent<NarrativeOutbox>(entity, 'NarrativeOutbox');
  if (!box || !validOutbox(box, state.packageId)) { reject(world, state, 'bad-outbox'); return; }
  if (!Number.isSafeInteger(throughSeq) || throughSeq <= box.ackedSeq || !box.pending.some(event => event.seq === throughSeq)) {
    reject(world, state, 'invalid-input', `ack:${throughSeq}`); return;
  }
  const next = clone(box);
  next.pending = next.pending.filter(event => event.seq > throughSeq);
  next.ackedSeq = throughSeq;
  world.addComponent(entity, next);
  state.lastReceipt = { status: 'applied', from: { ...state.current }, to: { ...state.current } };
  const trace = findDebugTrace(world);
  if (trace) appendTrace(trace, trace.tick ?? 0, SYSTEM, 'commit', `outbox-ack:${throughSeq}`);
}
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
function packageHash(pkg: GalPackage): string {
  return hashSnapshot({ package: { NarrativePackage: { type: 'NarrativePackage', package: pkg } as NarrativePackage } });
}
function validHistoryValue(value: NarrativeHistoryEntry['values'][number]): boolean {
  if (!value || typeof value.entity !== 'string' || !value.component) return false;
  const component = value.component;
  if (component.type === 'Resource') return typeof component.id === 'string' &&
    [component.current, component.min, component.max].every(Number.isFinite) &&
    component.min <= component.max && component.current >= component.min && component.current <= component.max;
  if (component.type === 'Flag') return typeof component.id === 'string' && typeof component.active === 'boolean';
  if (component.type === 'RandomSeed') return Number.isInteger(component.seed) && Number.isInteger(component.sequence) && component.sequence >= 0;
  return false;
}
function mutableValues(world: IWorld): NarrativeHistoryEntry['values'] {
  const values: NarrativeHistoryEntry['values'] = [];
  for (const type of ['Resource', 'Flag', 'RandomSeed'] as const)
    for (const id of sortedIds(world, type)) {
      const component = world.getComponent<Resource|Flag|RandomSeed>(id, type);
      if (component) values.push({ entity: id, component: clone(component) });
    }
  return values;
}
function sameData(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown) => canonicalEntity('narrative-history', [['HistoryCompare', { value }]]);
  return canonical(left) === canonical(right);
}
function compareHistoryValue(a: NarrativeHistoryEntry['values'][number], b: NarrativeHistoryEntry['values'][number]): number {
  const left = `${a.component.type}:${a.entity}`; const right = `${b.component.type}:${b.entity}`;
  return left < right ? -1 : left > right ? 1 : 0;
}
function historyAt(world: IWorld, entity: string): NarrativeHistory | undefined {
  return world.getComponent<NarrativeHistory>(entity, 'NarrativeHistory');
}
function ensureHistory(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime): NarrativeHistory | undefined {
  let history = historyAt(world, entity);
  if (history) {
    if (history.version !== 1 || history.packageId !== pkg.id || history.packageHash !== packageHash(pkg) ||
        !Array.isArray(history.entries) || !Array.isArray(history.baseEnteredNodeIds) || !Number.isInteger(history.cursor) ||
        history.entries.length > NARRATIVE_HISTORY_LIMIT || history.cursor < 0 || history.cursor >= history.entries.length) {
      reject(world, state, 'bad-history', 'header'); return undefined;
    }
    return history;
  }
  history = { type: 'NarrativeHistory', version: 1, packageId: pkg.id, packageHash: packageHash(pkg), cursor: 0, baseEnteredNodeIds: [], entries: [] };
  world.addComponent(entity, history);
  return history;
}
function capture(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime, history: NarrativeHistory, force = false): void {
  const node = nodeAt(pkg, state.current);
  if (!node || node.kind === 'jump') return;
  const key = storyRefKey(state.current);
  if (!force && history.entries[history.cursor] && storyRefKey(history.entries[history.cursor].ref) === key) return;
  const previous = history.entries.length ? enteredAt(history, history.cursor) : [];
  const extendsPrevious = previous.every((id, index) => state.enteredNodeIds[index] === id);
  if (!extendsPrevious) { reject(world, state, 'bad-history', 'entered-ledger'); return; }
  const values = mutableValues(world);
  if (history.entries.length) history.entries.splice(history.cursor + 1);
  const projection = world.getComponent<NarrativeProjection>(entity, 'NarrativeProjection');
  if (!projection) { reject(world, state, 'bad-history', 'missing-projection'); return; }
  const stateCopy = clone(state); stateCopy.enteredNodeIds = [];
  if (!history.entries.length) history.baseEnteredNodeIds = [...state.enteredNodeIds];
  history.entries.push({ ref: { ...state.current }, kind: node.kind, speakerId: node.kind === 'line' ? node.speaker : undefined,
    text: clone(projection.text), state: stateCopy, enteredDelta: history.entries.length ? state.enteredNodeIds.slice(previous.length) : [], projection: clone(projection), values });
  if (history.entries.length > NARRATIVE_HISTORY_LIMIT) {
    history.entries.shift();
    history.baseEnteredNodeIds.push(...history.entries[0].enteredDelta);
    history.entries[0].enteredDelta = [];
  }
  history.cursor = history.entries.length - 1;
}
function enteredAt(history: NarrativeHistory, cursor: number): string[] {
  const ids = [...history.baseEnteredNodeIds];
  for (let i = 1; i <= cursor; i++) ids.push(...history.entries[i].enteredDelta);
  return ids;
}
function restoreHistory(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime, history: NarrativeHistory, cursor: number): boolean {
  const entry = history.entries[cursor];
  if (!entry?.ref || !nodeAt(pkg, entry.ref) || nodeAt(pkg, entry.ref)?.kind !== entry.kind ||
      entry.state?.packageId !== pkg.id || !entry.state.current || storyRefKey(entry.state.current) !== storyRefKey(entry.ref) ||
      entry.projection?.packageId !== pkg.id || entry.projection.chapterId !== entry.ref.chapterId || entry.projection.nodeId !== entry.ref.nodeId ||
      !Array.isArray(entry.enteredDelta) || !Array.isArray(entry.values) ||
      entry.values.some(v => !validHistoryValue(v) || !world.hasComponent(v.entity, v.component.type))) {
    reject(world, state, 'bad-history', `entry:${cursor}`); return false;
  }
  for (const value of entry.values) world.addComponent(value.entity, clone(value.component));
  const restoredState = clone(entry.state); restoredState.enteredNodeIds = enteredAt(history, cursor);
  world.addComponent(entity, restoredState);
  world.addComponent(entity, clone(entry.projection));
  history.cursor = cursor;
  return true;
}
/** Versioned session export; callers persist it only through a future GAL save controller. */
export function exportNarrativeHistory(world: IWorld, entity: string): NarrativeHistory | undefined {
  const history = historyAt(world, entity);
  return history ? clone(history) : undefined;
}
/** Presentation-only history view; callers cannot mutate the authoritative session window. */
export function readNarrativeHistory(world: IWorld, entity: string):
  { cursor: number; entries: Pick<NarrativeHistoryEntry, 'ref'|'kind'|'speakerId'|'text'>[] } | undefined {
  const history = historyAt(world, entity);
  if (!history) return undefined;
  return { cursor: history.cursor, entries: history.entries.map(({ ref, kind, speakerId, text }) =>
    ({ ref: clone(ref), kind, speakerId, text: clone(text) })) };
}
/** Missing legacy history starts a fresh window at the loaded cursor; invalid imports fail closed. */
export function importNarrativeHistory(world: IWorld, entity: string, data?: NarrativeHistory): boolean {
  const state = world.getComponent<StoryRuntime>(entity, 'StoryRuntime');
  const pkg = world.getComponent<NarrativePackage>(entity, 'NarrativePackage')?.package;
  if (!state || !pkg) return false;
  if (!data) { world.removeComponent(entity, 'NarrativeHistory'); return true; }
  if (data.type !== 'NarrativeHistory' || data.version !== 1 || data.packageId !== pkg.id ||
      data.packageHash !== packageHash(pkg) || !Array.isArray(data.baseEnteredNodeIds) ||
      data.baseEnteredNodeIds.some(id => typeof id !== 'string') || !Array.isArray(data.entries) || data.entries.length < 1 ||
      data.entries.length > NARRATIVE_HISTORY_LIMIT || !Number.isInteger(data.cursor) || data.cursor < 0 || data.cursor >= data.entries.length ||
      !data.entries[data.cursor]?.ref || storyRefKey(data.entries[data.cursor].ref) !== storyRefKey(state.current) ||
      data.entries.some(entry => !entry?.ref || !nodeAt(pkg, entry.ref) || nodeAt(pkg, entry.ref)?.kind !== entry.kind ||
        entry.state?.packageId !== pkg.id || !entry.state.current || storyRefKey(entry.state.current) !== storyRefKey(entry.ref) ||
        entry.projection?.packageId !== pkg.id || entry.projection.chapterId !== entry.ref.chapterId ||
        entry.projection.nodeId !== entry.ref.nodeId || !Array.isArray(entry.enteredDelta) ||
        entry.enteredDelta.some(id => typeof id !== 'string') || !Array.isArray(entry.values) ||
        entry.values.some(v => !validHistoryValue(v) || !world.hasComponent(v.entity, v.component.type)))) {
    reject(world, state, 'bad-history', 'import'); return false;
  }
  const current = data.entries[data.cursor];
  const projection = world.getComponent<NarrativeProjection>(entity, 'NarrativeProjection');
  const { lastReceipt: _worldReceipt, ...worldState } = state;
  const { lastReceipt: _historyReceipt, ...checkpointState } = current.state;
  if (!projection || !sameData(worldState, { ...checkpointState, enteredNodeIds: enteredAt(data, data.cursor) }) ||
      !sameData(projection, current.projection) ||
      !sameData(mutableValues(world).sort(compareHistoryValue), [...current.values].sort(compareHistoryValue))) {
    reject(world, state, 'bad-history', 'current-mismatch'); return false;
  }
  world.addComponent(entity, clone(data));
  return true;
}
export function storyRefKey(ref: StoryRef): string { return JSON.stringify([ref.chapterId, ref.nodeId]); }
export function createStoryRuntime(pkg: GalPackage): StoryRuntime {
  return { type: 'StoryRuntime', packageId: pkg.id, current: { ...pkg.entry }, scene: { cast: {}, sfxIds: [] }, enteredNodeIds: [], automaticTrail: [] };
}
function nodeAt(pkg: GalPackage, ref: StoryRef): GalNode | undefined { return pkg.chapters[ref.chapterId]?.nodes[ref.nodeId]; }
function milestone(pkg: GalPackage, kind: NarrativeMilestoneKind, ref: StoryRef, contentId: string): Omit<NarrativeMilestone, 'seq'> {
  return { id: JSON.stringify([pkg.id, kind, contentId]), packageId: pkg.id, kind, ref: { ...ref }, contentId };
}
function reachMilestones(pkg: GalPackage, ref: StoryRef, node: GalNode): Omit<NarrativeMilestone, 'seq'>[] {
  const key = storyRefKey(ref);
  const events = [milestone(pkg, 'reach-node', ref, key)];
  if (node.kind === 'ending') events.push(milestone(pkg, 'reach-ending', ref, node.ending));
  const matched = (rule: { kind: string; ref?: StoryRef; ending?: string }): boolean =>
    rule.kind === 'reach-node' && !!rule.ref && storyRefKey(rule.ref) === key ||
    rule.kind === 'reach-ending' && node.kind === 'ending' && rule.ending === node.ending;
  for (const id of Object.keys(pkg.media.cg).sort()) if (matched(pkg.media.cg[id].unlock)) events.push(milestone(pkg, 'unlockCg', ref, id));
  for (const id of Object.keys(pkg.gallery.memories).sort()) if (matched(pkg.gallery.memories[id].unlock)) events.push(milestone(pkg, 'unlockMemory', ref, id));
  for (const id of Object.keys(pkg.gallery.music).sort()) if (matched(pkg.gallery.music[id].unlock)) events.push(milestone(pkg, 'unlockMusic', ref, id));
  return events;
}
function explicitMilestones(pkg: GalPackage, ref: StoryRef, effects: readonly StoryEffect[] | undefined): Omit<NarrativeMilestone, 'seq'>[] {
  return (effects ?? []).filter(effect => effect.kind === 'unlockCg' || effect.kind === 'unlockMemory' || effect.kind === 'unlockMusic')
    .map(effect => milestone(pkg, effect.kind as NarrativeMilestoneKind, ref, effect.id));
}
function validOutbox(box: NarrativeOutbox, packageId: string): boolean {
  if (box.type !== 'NarrativeOutbox' || box.version !== 1 || typeof box.packageId !== 'string' || box.packageId !== packageId ||
      !Number.isSafeInteger(box.nextSeq) || box.nextSeq < 1 ||
      !Number.isSafeInteger(box.ackedSeq) || box.ackedSeq < 0 || box.ackedSeq >= box.nextSeq ||
      !Array.isArray(box.pending) || box.pending.length > NARRATIVE_OUTBOX_LIMIT ||
      box.pending.length !== box.nextSeq - box.ackedSeq - 1) return false;
  return new Set(box.pending.map(event => event?.id)).size === box.pending.length &&
    box.pending.every((event, index) => event && event.seq === box.ackedSeq + index + 1 &&
    event.packageId === packageId &&
    ['reach-node', 'reach-ending', 'read-complete', 'unlockCg', 'unlockMemory', 'unlockMusic'].includes(event.kind) &&
    typeof event.contentId === 'string' && event.id === JSON.stringify([packageId, event.kind, event.contentId]) &&
    typeof event.ref?.chapterId === 'string' && typeof event.ref?.nodeId === 'string');
}
function enqueueMilestones(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime,
  incoming: readonly Omit<NarrativeMilestone, 'seq'>[]): boolean {
  if (!incoming.length) return true;
  const existing = world.getComponent<NarrativeOutbox>(entity, 'NarrativeOutbox');
  if (existing && !validOutbox(existing, pkg.id)) {
    reject(world, state, 'bad-outbox'); return false;
  }
  const box: NarrativeOutbox = existing ?? { type: 'NarrativeOutbox', version: 1, packageId: pkg.id,
    nextSeq: 1, ackedSeq: 0, pending: [] };
  const ids = new Set(box.pending.map(event => event.id));
  const fresh = incoming.filter(event => { if (ids.has(event.id)) return false; ids.add(event.id); return true; });
  if (box.pending.length + fresh.length > NARRATIVE_OUTBOX_LIMIT) {
    reject(world, state, 'outbox-full', `${box.pending.length}+${fresh.length}`); return false;
  }
  if (!fresh.length) return true;
  if (box.nextSeq + fresh.length > Number.MAX_SAFE_INTEGER) { reject(world, state, 'outbox-full', 'sequence'); return false; }
  for (const event of fresh) box.pending.push({ ...event, seq: box.nextSeq++ });
  if (!existing) world.addComponent(entity, box);
  return true;
}
function reject(world: IWorld, state: StoryRuntime, reason: NarrativeRejectReason, detail?: string): void {
  state.lastReceipt = { status: 'rejected', reason, detail, from: { ...state.current } };
  const trace = findDebugTrace(world);
  if (trace) appendTrace(trace, trace.tick ?? 0, SYSTEM, 'reject', reason, detail);
}
function applied(world: IWorld, state: StoryRuntime, from: StoryRef, silent = false): void {
  state.lastReceipt = { status: 'applied', from, to: { ...state.current } };
  if (silent) return;
  const trace = findDebugTrace(world);
  if (trace) appendTrace(trace, trace.tick ?? 0, SYSTEM, 'transition', `${storyRefKey(from)}→${storyRefKey(state.current)}`);
}
function effectError(world: IWorld, pkg: GalPackage, effects: readonly StoryEffect[] | undefined): { reason: NarrativeRejectReason; detail: string } | undefined {
  for (const effect of effects ?? []) {
    if (effect.kind === 'unlockCg' && !Object.hasOwn(pkg.media.cg, effect.id) ||
        effect.kind === 'unlockMemory' && !Object.hasOwn(pkg.gallery.memories, effect.id) ||
        effect.kind === 'unlockMusic' && !Object.hasOwn(pkg.gallery.music, effect.id))
      return { reason: 'bad-ref', detail: `${effect.kind}:${effect.id}` };
    if (effect.kind !== 'resource' && effect.kind !== 'flag') continue;
    if (!getComponentById(world, effect.kind === 'resource' ? 'Resource' : 'Flag', 'id', effect.id))
      return { reason: 'missing-effect-target', detail: `${effect.kind}:${effect.id}` };
  }
  return undefined;
}
function applyEffects(world: IWorld, effects: readonly StoryEffect[] | undefined): void {
  for (const effect of effects ?? []) {
    if (effect.kind === 'resource') {
      const target = getComponentById<Resource>(world, 'Resource', 'id', effect.id)!;
      const value = effect.op === 'set' ? effect.value : target.current + effect.value;
      target.current = Math.max(target.min, Math.min(target.max, value));
    } else if (effect.kind === 'flag') getComponentById<Flag>(world, 'Flag', 'id', effect.id)!.active = effect.value;
  }
}
function applyScene(state: NarrativeSceneState, pkg: GalPackage, sceneId: string): void {
  const scene = pkg.scenes[sceneId];
  state.sceneId = sceneId; state.backgroundId = scene.background; state.bgmId = scene.ambience?.bgm;
  state.cast = Object.fromEntries(Object.entries(scene.cast ?? {}).map(([id, cast]) => [id, { ...cast }]));
  state.cgId = undefined; state.videoId = undefined; state.sfxIds = [];
}
function applyPresentation(state: NarrativeSceneState, pkg: GalPackage, delta: PresentationDelta | undefined): void {
  if (!delta) return;
  if (delta.scene !== undefined) {
    if (delta.scene === null) { state.sceneId = undefined; state.backgroundId = undefined; state.cast = {}; state.bgmId = undefined; }
    else applyScene(state, pkg, delta.scene);
  }
  if (delta.background !== undefined) state.backgroundId = delta.background ?? undefined;
  for (const [id, change] of Object.entries(delta.cast ?? {})) state.cast[id] = { ...(state.cast[id] ?? { visible: true }), ...change };
  if (delta.cg?.hide) state.cgId = undefined;
  if (delta.cg?.show) state.cgId = delta.cg.show;
  if (delta.bgm?.stop) state.bgmId = undefined;
  if (delta.bgm?.play) state.bgmId = delta.bgm.play;
  if (delta.sfx) state.sfxIds = [...delta.sfx];
  if (delta.video && 'stop' in delta.video) state.videoId = undefined;
  else if (delta.video && 'play' in delta.video) state.videoId = delta.video.play;
  if (delta.transition) state.transition = delta.transition;
}
function presentationError(pkg: GalPackage, ref: StoryRef, node: GalNode): string | undefined {
  const chapter = pkg.chapters[ref.chapterId]; const d = node.presentation;
  const sceneId = d?.scene === undefined ? chapter?.scene : d.scene;
  if (sceneId && !pkg.scenes[sceneId]) return `scene:${sceneId}`;
  if (sceneId) {
    const scene = pkg.scenes[sceneId];
    if (scene.background && !pkg.media.backgrounds[scene.background]) return `scene-background:${sceneId}:${scene.background}`;
    if (scene.ambience?.bgm && !pkg.media.audio.bgm[scene.ambience.bgm]) return `scene-bgm:${sceneId}:${scene.ambience.bgm}`;
    for (const [id, pose] of Object.entries(scene.cast ?? {})) {
      const character = pkg.characters[id];
      if (!character) return `scene-character:${sceneId}:${id}`;
      if (pose.emotion && !character.portraits.expressions[pose.emotion]) return `scene-emotion:${sceneId}:${id}:${pose.emotion}`;
    }
  }
  if (d?.background && !pkg.media.backgrounds[d.background]) return `background:${d.background}`;
  if (d?.cg?.show && !pkg.media.cg[d.cg.show]) return `cg:${d.cg.show}`;
  if (d?.bgm?.play && !pkg.media.audio.bgm[d.bgm.play]) return `bgm:${d.bgm.play}`;
  for (const id of d?.sfx ?? []) if (!pkg.media.audio.sfx[id]) return `sfx:${id}`;
  if (d?.video && 'play' in d.video && !pkg.media.video[d.video.play]) return `video:${d.video.play}`;
  for (const [id, cast] of Object.entries(d?.cast ?? {})) {
    const character = pkg.characters[id];
    if (!character) return `character:${id}`;
    if (cast.emotion && !character.portraits.expressions[cast.emotion]) return `emotion:${id}:${cast.emotion}`;
  }
  if (node.kind === 'line' && node.speaker && !pkg.characters[node.speaker]) return `speaker:${node.speaker}`;
  if (node.kind === 'line' && node.voice && !pkg.media.audio.voice[node.voice]) return `voice:${node.voice}`;
  if (node.kind === 'ending' && !pkg.endings[node.ending]) return `ending:${node.ending}`;
  return undefined;
}
function buildProjection(pkg: GalPackage, state: StoryRuntime, node: GalNode, world: IWorld): NarrativeProjection {
  const scene = state.scene;
  const cast = Object.fromEntries(Object.entries(scene.cast).map(([id, pose]) => {
    const character = pkg.characters[id];
    const assetKey = pose.emotion ? character?.portraits.expressions[pose.emotion] : character?.portraits.neutral;
    return [id, { ...pose, assetKey }];
  }));
  return {
    type: 'NarrativeProjection', packageId: pkg.id, chapterId: state.current.chapterId, nodeId: state.current.nodeId, kind: node.kind,
    sceneId: scene.sceneId, backgroundId: scene.backgroundId, backgroundAssetKey: scene.backgroundId ? pkg.media.backgrounds[scene.backgroundId]?.image : undefined,
    cast, cgId: scene.cgId, cgAssetKey: scene.cgId ? pkg.media.cg[scene.cgId]?.image : undefined,
    bgmId: scene.bgmId, bgmAssetKey: scene.bgmId ? pkg.media.audio.bgm[scene.bgmId]?.asset : undefined,
    sfxIds: [...scene.sfxIds], sfxAssetKeys: scene.sfxIds.flatMap(id => pkg.media.audio.sfx[id]?.asset ? [pkg.media.audio.sfx[id].asset!] : []),
    videoId: scene.videoId, videoAssetKey: scene.videoId ? pkg.media.video[scene.videoId]?.asset : undefined, transition: scene.transition,
    speakerId: node.kind === 'line' ? node.speaker : undefined, speakerName: node.kind === 'line' && node.speaker ? pkg.characters[node.speaker]?.name : undefined,
    text: node.kind === 'line' || node.kind === 'ending' ? node.text : node.kind === 'choice' || node.kind === 'check' ? node.prompt : undefined,
    voiceId: node.kind === 'line' ? node.voice : undefined, voiceAssetKey: node.kind === 'line' && node.voice ? pkg.media.audio.voice[node.voice]?.asset : undefined,
    options: node.kind === 'choice' ? node.options.map(option => ({ id: option.id, text: option.text, available: !option.when || evaluateCondition(world, option.when) })) : undefined,
    endingId: node.kind === 'ending' ? node.ending : undefined,
  };
}
/** Read-only recomputation of the Director's current projection for save preflight. */
export function deriveNarrativeProjection(world: IWorld, entity: string): NarrativeProjection | undefined {
  const state = world.getComponent<StoryRuntime>(entity, 'StoryRuntime');
  const pkg = world.getComponent<NarrativePackage>(entity, 'NarrativePackage')?.package;
  if (!state || !pkg) return undefined;
  const node = nodeAt(pkg, state.current);
  return node && node.kind !== 'jump' ? clone(buildProjection(pkg, state, node, world)) : undefined;
}
function enter(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime, silent = false): boolean {
  const node = nodeAt(pkg, state.current);
  if (!node) { reject(world, state, 'bad-ref', storyRefKey(state.current)); return false; }
  const key = storyRefKey(state.current); const error = presentationError(pkg, state.current, node);
  if (error) { reject(world, state, 'bad-ref', error); return false; }
  if (!state.enteredNodeIds.includes(key)) {
    const effect = effectError(world, pkg, node.enter);
    if (effect) { reject(world, state, effect.reason, effect.detail); return false; }
  }
  if (state.activeNodeKey !== key) {
    const events = [...explicitMilestones(pkg, state.current, state.enteredNodeIds.includes(key) ? undefined : node.enter),
      ...reachMilestones(pkg, state.current, node)];
    if (!enqueueMilestones(world, entity, pkg, state, events)) return false;
    const chapter = pkg.chapters[state.current.chapterId];
    if (state.activeChapterId !== state.current.chapterId) {
      if (chapter.scene) applyScene(state.scene, pkg, chapter.scene);
    }
    /* AI START */
    // A transition is the entrance of the node that declares it. Later lines stay cut
    // unless they declare their own, so an unchanged background does not fade again.
    state.scene.transition = undefined;
    /* AI END */
    applyPresentation(state.scene, pkg, node.presentation);
    state.activeNodeKey = key;
    state.activeChapterId = state.current.chapterId;
    if (!state.enteredNodeIds.includes(key)) { applyEffects(world, node.enter); state.enteredNodeIds.push(key); }
    if (node.kind === 'ending') state.endingId = node.ending;
    // SystemView makes read-only package fields Proxy objects. Projection must be plain snapshot data.
    world.addComponent(entity, JSON.parse(JSON.stringify(buildProjection(pkg, state, node, world))) as NarrativeProjection);
    if (!silent) {
      const trace = findDebugTrace(world);
      if (trace) appendTrace(trace, trace.tick ?? 0, SYSTEM, 'commit', key, 'enter/presentation');
    }
  }
  return true;
}
function refreshChoiceProjection(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime, node: Extract<GalNode, { kind: 'choice' }>): void {
  const current = world.getComponent<NarrativeProjection>(entity, 'NarrativeProjection');
  const options = node.options.map(option => ({
    id: option.id,
    text: option.text,
    available: !option.when || evaluateCondition(world, option.when),
  }));
  const stale = !current || current.options?.length !== options.length ||
    options.some((option, index) => current.options?.[index]?.id !== option.id || current.options[index].available !== option.available);
  if (!stale) return;
  // Only derived presentation changes. No node entry, effect, cursor move, or receipt.
  world.addComponent(entity, JSON.parse(JSON.stringify(buildProjection(pkg, state, node, world))) as NarrativeProjection);
  const trace = findDebugTrace(world);
  if (trace) appendTrace(trace, trace.tick ?? 0, SYSTEM, 'commit', storyRefKey(state.current), 'choice-availability');
}
function readInput(world: IWorld): { kind: 'advance'|'choose'|'back'|'read'|'ack'|'unsupported'; choiceId?: string; key?: string; refKey?: string; throughSeq?: number }[] {
  const inputs: { kind: 'advance'|'choose'|'back'|'read'|'ack'|'unsupported'; choiceId?: string; key?: string; refKey?: string; throughSeq?: number }[] = [];
  for (const entity of sortedIds(world, 'InputQueue')) for (const action of world.getComponent<InputQueue>(entity, 'InputQueue')?.actions ?? []) {
    if (action.phase !== 'action') continue;
    if (action.key === NARRATIVE_ADVANCE) inputs.push({ kind: 'advance' });
    else if (action.key === NARRATIVE_CHOOSE) inputs.push({ kind: 'choose', choiceId: action.arg });
    else if (action.key === NARRATIVE_BACK) inputs.push({ kind: 'back' });
    else if (action.key === NARRATIVE_READ_COMPLETE) inputs.push({ kind: 'read', refKey: action.arg });
    else if (action.key === NARRATIVE_ACK) inputs.push({ kind: 'ack', throughSeq: action.arg && /^[1-9]\d*$/.test(action.arg) ? Number(action.arg) : NaN });
    else if (action.key === NARRATIVE_AUTO || action.key === NARRATIVE_SKIP) inputs.push({ kind: 'unsupported', key: action.key });
  }
  return inputs;
}
function transition(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime, next: StoryRef, effects?: readonly StoryEffect[], previewSeed?: RandomSeed, silent = false): void {
  const target = nodeAt(pkg, next);
  if (!target) { reject(world, state, 'bad-ref', storyRefKey(next)); return; }
  const effect = effectError(world, pkg, effects);
  if (effect) { reject(world, state, effect.reason, effect.detail); return; }
  const targetError = presentationError(pkg, next, target);
  if (targetError) { reject(world, state, 'bad-ref', targetError); return; }
  if (!state.enteredNodeIds.includes(storyRefKey(next))) {
    const enterEffect = effectError(world, pkg, target.enter);
    if (enterEffect) { reject(world, state, enterEffect.reason, enterEffect.detail); return; }
  }
  const from = { ...state.current };
  if (!enqueueMilestones(world, entity, pkg, state, explicitMilestones(pkg, state.current, effects))) return;
  if (previewSeed) { const seed = worldSeed(world)!; seed.seed = previewSeed.seed; seed.sequence = previewSeed.sequence; }
  applyEffects(world, effects);
  state.current = { ...next };
  if (target.kind !== 'jump') state.automaticTrail = [];
  if (!enter(world, entity, pkg, state, silent)) return;
  applied(world, state, from, silent);
}
function settleJumps(world: IWorld, entity: string, pkg: GalPackage, state: StoryRuntime): boolean {
  const seen = new Set<string>();
  const start = { ...state.current };
  for (let hops = 0; hops <= MAX_AUTOMATIC_HOPS; hops++) {
    const node = nodeAt(pkg, state.current);
    if (!node || node.kind !== 'jump') {
      if (node && seen.size) {
        const trace = findDebugTrace(world);
        if (trace) appendTrace(trace, trace.tick ?? 0, SYSTEM, 'transition', `${storyRefKey(start)}→${storyRefKey(state.current)}`, `auto-jump:${seen.size}`);
      }
      return !!node;
    }
    const key = storyRefKey(state.current);
    if (seen.has(key) || hops === MAX_AUTOMATIC_HOPS) { reject(world, state, 'jump-loop', key); return false; }
    seen.add(key);
    const next = !node.when || evaluateCondition(world, node.when) ? node.then : node.otherwise;
    if (!next) { reject(world, state, 'condition-failed', key); return false; }
    transition(world, entity, pkg, state, next, undefined, undefined, true);
    if (state.lastReceipt?.status !== 'applied') return false;
  }
  return false;
}
function executeCore(world: IWorld): void {
  const input = readInput(world);
  const runtimes = sortedIds(world, 'StoryRuntime');
  if (runtimes.length > 1) {
    for (const entity of runtimes) reject(world, world.getComponent<StoryRuntime>(entity, 'StoryRuntime')!, 'ambiguous-runtime');
    return;
  }
  for (const entity of runtimes) {
    const state = world.getComponent<StoryRuntime>(entity, 'StoryRuntime')!;
    const activeBeforeInput = state.activeNodeKey === storyRefKey(state.current);
    const source = world.getComponent<NarrativePackage>(entity, 'NarrativePackage');
    if (!source) { reject(world, state, 'missing-package'); continue; }
    const pkg = source.package;
    if (pkg.id !== state.packageId) { reject(world, state, 'package-mismatch', pkg.id); continue; }
    if (input.length === 1 && input[0].kind === 'ack') {
      acknowledgeNarrativeEvents(world, entity, state, input[0].throughSeq!);
      continue;
    }
    if (!enter(world, entity, pkg, state)) continue;
    if (!settleJumps(world, entity, pkg, state)) continue;
    const history = ensureHistory(world, entity, pkg, state);
    if (!history) continue;
    capture(world, entity, pkg, state, history);
    const node = nodeAt(pkg, state.current)!;
    if (node.kind === 'choice') refreshChoiceProjection(world, entity, pkg, state, node);
    if (!input.length) continue;
    if (input.length > 1) { reject(world, state, 'too-many-inputs'); continue; }
    const action = input[0];
    if (action.kind === 'unsupported') { reject(world, state, 'unsupported-action', action.key); continue; }
    if (action.kind === 'read') {
      const refKey = storyRefKey(state.current);
      if (!activeBeforeInput || node.kind === 'jump' || action.refKey !== refKey) { reject(world, state, 'stale-read', action.refKey); continue; }
      if (enqueueMilestones(world, entity, pkg, state, [milestone(pkg, 'read-complete', state.current, refKey)]))
        applied(world, state, state.current);
      continue;
    }
    if (action.kind === 'back') {
      if (history.cursor === 0) { reject(world, state, history.entries.length >= NARRATIVE_HISTORY_LIMIT ? 'history-limit' : 'no-history'); continue; }
      const from = { ...state.current };
      if (restoreHistory(world, entity, pkg, state, history, history.cursor - 1)) {
        const restored = world.getComponent<StoryRuntime>(entity, 'StoryRuntime')!;
        applied(world, restored, from);
      }
      continue;
    }
    if (node.kind === 'choice' && action.kind === 'advance') { reject(world, state, 'choice-unconfirmed'); continue; }
    if (action.kind === 'advance' && history.cursor < history.entries.length - 1) {
      const from = { ...state.current };
      if (restoreHistory(world, entity, pkg, state, history, history.cursor + 1)) {
        const restored = world.getComponent<StoryRuntime>(entity, 'StoryRuntime')!;
        applied(world, restored, from);
      }
      continue;
    }
    if (node.kind === 'ending') { reject(world, state, 'invalid-node-action', 'ending'); continue; }
    if (node.kind === 'line') {
      if (action.kind !== 'advance') reject(world, state, 'invalid-input', action.kind);
      else if (!node.next) reject(world, state, 'no-next');
      else { transition(world, entity, pkg, state, node.next); if (state.lastReceipt?.status === 'applied' && settleJumps(world, entity, pkg, state)) capture(world, entity, pkg, state, history, true); }
    } else if (node.kind === 'choice') {
      if (action.kind !== 'choose' || !action.choiceId) { reject(world, state, 'invalid-input'); continue; }
      const option = node.options.find(x => x.id === action.choiceId);
      if (!option) { reject(world, state, 'invalid-choice', action.choiceId); continue; }
      if (option.when && !evaluateCondition(world, option.when)) { reject(world, state, 'condition-failed', action.choiceId); continue; }
      transition(world, entity, pkg, state, option.next, option.effects);
      if (state.lastReceipt?.status === 'applied' && settleJumps(world, entity, pkg, state)) capture(world, entity, pkg, state, history, true);
    } else if (node.kind === 'check') {
      if (action.kind !== 'advance') { reject(world, state, 'invalid-input'); continue; }
      const seed = worldSeed(world);
      if (!seed) { reject(world, state, 'missing-seed'); continue; }
      const base = getComponentById<Resource>(world, 'Resource', 'id', node.check.attribute);
      const bonus = node.check.bonusFrom ? getComponentById<Resource>(world, 'Resource', 'id', node.check.bonusFrom) : undefined;
      if (!base || (node.check.bonusFrom && !bonus)) { reject(world, state, 'missing-check-resource', !base ? node.check.attribute : node.check.bonusFrom); continue; }
      const dice = node.check.dice ?? 20;
      const preview = { ...seed };
      const roll = randomInt(preview, 1, dice + 1);
      const score = base.current + Math.floor((bonus?.current ?? 0) / (node.check.bonusDiv ?? 1)) + roll;
      const branch = score >= node.check.difficulty ? node.pass : node.fail;
      transition(world, entity, pkg, state, branch.next, branch.effects, preview);
      if (state.lastReceipt?.status === 'applied' && settleJumps(world, entity, pkg, state)) capture(world, entity, pkg, state, history, true);
    }
  }
}
function execute(world: IWorld): void {
  const root = world.root;
  if (!(root instanceof World)) { executeCore(world); return; }
  const input = readInput(world);
  const needsPreflight = input.length > 0 || world.query('StoryRuntime').some(([entity]) => {
    const state = world.getComponent<StoryRuntime>(entity, 'StoryRuntime')!;
    return state.activeNodeKey !== storyRefKey(state.current) ||
      world.getComponent<NarrativePackage>(entity, 'NarrativePackage')?.package.chapters[state.current.chapterId]?.nodes[state.current.nodeId]?.kind === 'jump';
  });
  if (!needsPreflight) { executeCore(world); return; }
  const draft = new World();
  draft.restore(root.snapshot(), root.snapshotOrder());
  for (const [entity] of draft.query('StoryRuntime')) {
    const state = draft.getComponent<StoryRuntime>(entity, 'StoryRuntime')!;
    state.lastReceipt = undefined;
  }
  executeCore(draft);
  for (const [entity] of draft.query('StoryRuntime')) {
    const receipt = draft.getComponent<StoryRuntime>(entity, 'StoryRuntime')?.lastReceipt;
    if (receipt?.status === 'rejected') {
      const live = world.getComponent<StoryRuntime>(entity, 'StoryRuntime');
      if (live) reject(world, live, receipt.reason!, receipt.detail);
      return;
    }
  }
  executeCore(world);
}
export const narrativeDirectorCapability = defineCapability({
  id: 't3-narrative-director',
  version: '1.2.0',
  describe: {
    name: 'narrative-director',
    summary: '确定性 GalPackage StoryRef 解释器、资源/旗标效果、只读演出投影、有界会话历史与持久里程碑 outbox。',
    semantic: ['tier3', 'narrative', 'interpreter'],
    whenToUse: '已校验 GalPackage 的 GAL/VN 运行时；会话内最近 512 句可回滚，不含正式持久化或媒体播放。',
    examples: ['NarrativePackage + StoryRuntime + InputQueue → NarrativeProjection'],
  },
  components: {
    provides: {
      NarrativePackage: { category: 'config', describe: '静态 GalPackage 数据，不复制入 StoryRuntime。', fields: { package: { type: 'string', describe: '已通过静态校验的 GalPackage' } } },
      StoryRuntime: { category: 'resource', describe: '快照内的剧情游标、场景继承与 enter 身份。', fields: { packageId: { type: 'string', describe: '包身份' }, current: { type: 'string', describe: 'StoryRef' }, enteredNodeIds: { type: 'string[]', describe: '已执行 enter 的稳定键' } } },
      NarrativeProjection: { category: 'render', describe: '只读派生演出引用，不播放媒体。', fields: { chapterId: { type: 'string', describe: '章节 ID' }, nodeId: { type: 'string', describe: '节点 ID' } } },
      NarrativeHistory: { category: 'resource', describe: '会话内有界可见叙事历史，不包含静态包或全局档案。', fields: { cursor: { type: 'number', describe: '窗口内游标' }, entries: { type: 'string[]', describe: '最多 512 条可见节点检查点' } } },
      NarrativeOutbox: { category: 'resource', describe: '有界、可确认的剧情里程碑待投递队列；不含 GalProfile。', fields: { nextSeq: { type: 'number', describe: '下一个稳定序号' }, pending: { type: 'string[]', describe: '最多 256 条待确认事件' } } },
    },
    reads: ['InputQueue', 'NarrativePackage', 'StoryRuntime', 'Resource', 'Flag', 'RandomSeed', 'NarrativeProjection', 'NarrativeHistory', 'NarrativeOutbox', 'DebugTrace'],
    writes: ['StoryRuntime', 'NarrativeProjection', 'NarrativeHistory', 'NarrativeOutbox', 'RandomSeed', 'Resource', 'Flag', 'DebugTrace'],
    consumes: [],
  },
  config: {},
  systems: [{
    id: SYSTEM,
    phase: SystemPhase.Resolve,
    reads: ['InputQueue', 'NarrativePackage', 'StoryRuntime', 'Resource', 'Flag', 'RandomSeed', 'NarrativeProjection', 'NarrativeHistory', 'NarrativeOutbox', 'DebugTrace'],
    writes: ['StoryRuntime', 'NarrativeProjection', 'NarrativeHistory', 'NarrativeOutbox', 'RandomSeed', 'Resource', 'Flag', 'DebugTrace'],
    consumes: [],
    // Both graph interpreters may be co-mounted. Dialogue settles shared Flag/seed first;
    // this explicit order removes the opposite inferred RMW edge without hiding reads.
    runsAfter: ['dialogue'],
    execute,
  }],
});
