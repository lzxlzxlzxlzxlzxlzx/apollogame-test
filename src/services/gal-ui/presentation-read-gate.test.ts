import { describe, expect, it } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/determinism.js';
import { worldWith } from '../../test-fixtures/test-kit.js';
import { NARRATIVE_ADVANCE, NARRATIVE_BACK, NARRATIVE_READ_COMPLETE,
  createStoryRuntime, narrativeDirectorCapability, readNarrativeEvents, storyRefKey,
  type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { GalNarrativeProfileBridge } from '../gal-profile/narrative-profile-bridge.js';
import { loadGalProfile } from '../gal-profile/gal-profile.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import type { SavePort } from '../save/save-port.js';
import { PresentationReadGate } from './presentation-read-gate.js';

const L = (value: string) => ({ 'zh-CN': value });
const ref = (nodeId: string) => ({ chapterId: 'a', nodeId });
function pkg(): GalPackage {
  return {
    schemaVersion: 1, id: 'gal-read-gate', title: L('读完'), defaultLocale: 'zh-CN', locales: ['zh-CN'],
    entry: ref('first'), ui: { template: 'gal-template' }, characters: {}, scenes: {},
    preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
      bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
    media: { backgrounds: {}, cg: {}, audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
    gallery: { memories: {}, music: {} }, endings: { done: { title: L('终') } },
    chapters: { a: { id: 'a', title: L('章'), start: 'first', nodes: {
      first: { kind: 'line', text: L('第一句'), next: ref('second') },
      second: { kind: 'line', text: L('第二句'), next: ref('done') },
      done: { kind: 'ending', ending: 'done', text: L('结束') },
    } } },
  };
}
function world(p: GalPackage): World {
  const w = worldWith(narrativeDirectorCapability);
  w.createEntity('story'); w.addComponent('story', { type: 'NarrativePackage', package: p });
  w.addComponent('story', createStoryRuntime(p));
  w.createEntity('input'); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
  w.tick();
  return w;
}
function queue(w: World): InputQueue { return w.peek<InputQueue>('input', 'InputQueue')!; }
function action(w: World, key?: string): void {
  w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: key ? [
    { source: 'player', phase: 'action', key },
  ] : [] });
  w.tick();
  w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
}
function refKey(w: World): string { return storyRefKey(w.peek<StoryRuntime>('story', 'StoryRuntime')!.current); }

describe('GAL-UI-02A PresentationReadGate', () => {
  it('does not infer read from the initial projection; queues exactly one named action only after explicit presentation completion', async () => {
    const p = pkg(), w = world(p), gate = new PresentationReadGate(), token = gate.begin(w, 'story')!;
    const port = new MemorySavePort(), bridge = new GalNarrativeProfileBridge(p, port);
    expect(token.refKey).toBe(storyRefKey(ref('first')));
    expect(queue(w).actions).toEqual([]);
    expect((await bridge.drain(w, 'story', 1)).status).toBe('ack-queued');
    w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    expect((await loadGalProfile(port, p)).readNodeIds).toEqual([]);
    expect(gate.fullyPresented(w, token)).toEqual({ status: 'queued', refKey: token.refKey });
    expect(queue(w).actions).toEqual([{
      source: 'gal-presentation-read-gate', phase: 'action', key: NARRATIVE_READ_COMPLETE, arg: token.refKey,
    }]);
    expect(gate.fullyPresented(w, token)).toEqual({ status: 'ignored', reason: 'already-queued' });
    w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    expect(readNarrativeEvents(w, 'story').filter(event => event.kind === 'read-complete')).toHaveLength(1);
    expect((await bridge.drain(w, 'story', 2)).status).toBe('ack-queued');
    expect((await loadGalProfile(port, p)).readNodeIds).toEqual([token.refKey]);
    w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    expect(readNarrativeEvents(w, 'story')).toEqual([]);
    expect(gate.fullyPresented(w, token)).toEqual({ status: 'ignored', reason: 'already-queued' });
    expect(queue(w).actions).toEqual([]);
  });

  it('retries a read action lost before Director consumption but not one still queued or already consumed', () => {
    const p = pkg(), w = world(p), gate = new PresentationReadGate(), token = gate.begin(w, 'story')!;
    expect(gate.fullyPresented(w, token).status).toBe('queued');
    expect(gate.fullyPresented(w, token)).toEqual({ status: 'ignored', reason: 'already-queued' });
    w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] }); // host lost the queue before tick
    expect(gate.fullyPresented(w, token).status).toBe('queued');
    expect(queue(w).actions).toHaveLength(1);
    w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    expect(readNarrativeEvents(w, 'story').filter(event => event.kind === 'read-complete')).toHaveLength(1);
    expect(gate.fullyPresented(w, token)).toEqual({ status: 'ignored', reason: 'already-queued' });
  });

  it('accepts an older restored presentation without an outbox and lets the Director create one', () => {
    const p = pkg(), w = world(p), gate = new PresentationReadGate();
    w.removeComponent('story', 'NarrativeOutbox');
    const token = gate.begin(w, 'story')!;
    expect(token.refKey).toBe(storyRefKey(ref('first')));
    expect(gate.fullyPresented(w, token).status).toBe('queued');
    w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] }); // lost before tick
    expect(gate.fullyPresented(w, token).status).toBe('queued');
    w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    expect(readNarrativeEvents(w, 'story').filter(event => event.kind === 'read-complete')).toHaveLength(1);
    expect(gate.fullyPresented(w, token)).toEqual({ status: 'ignored', reason: 'already-queued' });
  });

  it('does not enqueue a duplicate while the same read milestone is already pending', () => {
    const p = pkg(), w = world(p), firstGate = new PresentationReadGate();
    expect(firstGate.fullyPresented(w, firstGate.begin(w, 'story')!).status).toBe('queued');
    w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    const again = new PresentationReadGate(), token = again.begin(w, 'story')!;
    expect(again.fullyPresented(w, token)).toEqual({ status: 'ignored', reason: 'already-queued' });
    expect(queue(w).actions).toEqual([]);
    expect(readNarrativeEvents(w, 'story').filter(event => event.kind === 'read-complete')).toHaveLength(1);
  });

  it('returns pending on player action or unavailable queue, without replacing actions or ticking', () => {
    const p = pkg(), w = world(p), gate = new PresentationReadGate(), token = gate.begin(w, 'story')!;
    w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [
      { source: 'player', phase: 'action', key: NARRATIVE_ADVANCE },
    ] });
    const before = hashSnapshot(w.snapshot());
    expect(gate.fullyPresented(w, token)).toEqual({ status: 'pending', reason: 'input-busy' });
    expect(hashSnapshot(w.snapshot())).toBe(before);
    expect(queue(w).actions[0]?.key).toBe(NARRATIVE_ADVANCE);
    w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    expect(gate.fullyPresented(w, token).status).toBe('queued');
    const advancing = world(p), advancingGate = new PresentationReadGate(), old = advancingGate.begin(advancing, 'story')!;
    advancing.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [
      { source: 'player', phase: 'action', key: NARRATIVE_ADVANCE },
    ] });
    expect(advancingGate.fullyPresented(advancing, old)).toEqual({ status: 'pending', reason: 'input-busy' });
    advancing.tick(); advancing.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    expect(advancingGate.fullyPresented(advancing, old)).toEqual({ status: 'ignored', reason: 'stale' });
    expect(readNarrativeEvents(advancing, 'story').some(event => event.kind === 'read-complete')).toBe(false);
    const another = world(p), missingGate = new PresentationReadGate(), missingToken = missingGate.begin(another, 'story')!;
    another.removeComponent('input', 'InputQueue');
    expect(missingGate.fullyPresented(another, missingToken)).toEqual({ status: 'pending', reason: 'input-unavailable' });
  });

  it('rejects late callbacks across node change, rollback, restore and World switch', () => {
    const p = pkg(), w = world(p), gate = new PresentationReadGate();
    const first = gate.begin(w, 'story')!;
    expect(gate.begin(w, 'story')).toBe(first); // same presentation cannot mint a second read opportunity
    action(w, NARRATIVE_ADVANCE);
    expect(refKey(w)).toBe(storyRefKey(ref('second')));
    expect(gate.fullyPresented(w, first)).toEqual({ status: 'ignored', reason: 'stale' });
    const second = gate.begin(w, 'story')!;
    action(w, NARRATIVE_BACK);
    expect(refKey(w)).toBe(storyRefKey(ref('first')));
    expect(gate.fullyPresented(w, second)).toEqual({ status: 'ignored', reason: 'stale' });
    const beforeRestore = gate.begin(w, 'story')!;
    w.restore(w.snapshot(), w.snapshotOrder());
    expect(gate.fullyPresented(w, beforeRestore)).toEqual({ status: 'ignored', reason: 'stale' });
    const afterRestore = gate.begin(w, 'story')!;
    const other = world(p);
    expect(gate.fullyPresented(other, afterRestore)).toEqual({ status: 'ignored', reason: 'stale' });
    expect(queue(other).actions).toEqual([]);
  });

  it('fails closed on malformed projection identity and keeps Profile unchanged on save failure', async () => {
    const p = pkg(), w = world(p), gate = new PresentationReadGate();
    const projection = w.peek('story', 'NarrativeProjection')!;
    w.addComponent('story', { ...projection, nodeId: 'not-a-node' });
    expect(gate.begin(w, 'story')).toBeUndefined();
    w.addComponent('story', projection);
    const token = gate.begin(w, 'story')!;
    expect(gate.fullyPresented(w, token).status).toBe('queued');
    w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    const backing = new MemorySavePort();
    const failing: SavePort = { list: () => backing.list(), read: slot => backing.read(slot),
      remove: slot => backing.remove(slot), write: () => Promise.reject(new Error('disk unavailable')) };
    const bridge = new GalNarrativeProfileBridge(p, failing);
    expect(await bridge.drain(w, 'story', 1)).toMatchObject({ status: 'failed', stage: 'save' });
    expect((await loadGalProfile(backing, p)).readNodeIds).toEqual([]);
    expect(readNarrativeEvents(w, 'story').some(event => event.kind === 'read-complete')).toBe(true);
  });

  it('produces the same World hash and milestone sequence for the same presentation/action sequence', () => {
    function run(): { hash: string; events: string } {
      const p = pkg(), w = world(p), gate = new PresentationReadGate();
      const first = gate.begin(w, 'story')!;
      expect(gate.fullyPresented(w, first).status).toBe('queued');
      w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
      action(w, NARRATIVE_ADVANCE);
      const second = gate.begin(w, 'story')!;
      expect(gate.fullyPresented(w, second).status).toBe('queued');
      w.tick(); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
      return { hash: hashSnapshot(w.snapshot()), events: JSON.stringify(readNarrativeEvents(w, 'story')) };
    }
    expect(run()).toEqual(run());
  });
});
