import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import type { InputQueue, Resource, Flag } from '@engine/protocol/components.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { hashSnapshot } from '@net/determinism.js';
import { validateGalPackage } from '@assembly/gal-package.js';
import { expectDeterministic, expectRestoreContinues, expectQuiescent, worldWith } from '../../test-fixtures/test-kit.js';
import { NARRATIVE_ADVANCE, NARRATIVE_CHOOSE, NARRATIVE_BACK, NARRATIVE_READ_COMPLETE, NARRATIVE_ACK, NARRATIVE_AUTO, NARRATIVE_HISTORY_LIMIT, NARRATIVE_OUTBOX_LIMIT, createStoryRuntime, exportNarrativeHistory, importNarrativeHistory, readNarrativeHistory, readNarrativeEvents, narrativeDirectorCapability, storyRefKey, type StoryRuntime, type NarrativeProjection, type NarrativeHistory, type NarrativeOutbox } from './narrative-director.js';
import { dialogueCapability } from './dialogue.js';

const L = (text: string) => ({ 'zh-CN': text });
const ref = (chapterId: string, nodeId: string) => ({ chapterId, nodeId });
function packageData(): GalPackage {
  return {
    schemaVersion: 1, id: 'gal-director-test', title: L('样例'), defaultLocale: 'zh-CN', locales: ['zh-CN'], entry: ref('a','start'),
    ui: { template: 'gal-template' },
    preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only', bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
    characters: {
      hero: { id: 'hero', name: L('主角'), portraits: { neutral: 'art:hero', expressions: { smile: 'art:hero-smile' }, fallback: 'neutral' } },
      friend: { id: 'friend', name: L('朋友'), portraits: { neutral: 'art:friend', expressions: {}, fallback: 'neutral' } },
    },
    scenes: { room: { id: 'room', background: 'room', ambience: { bgm: 'theme' }, cast: { hero: { visible: true, emotion: 'smile' }, friend: { visible: true, side: 'right' } } } },
    media: {
      backgrounds: { room: { image: 'art:room' } }, cg: { reward: { image: 'art:reward', title: L('奖励'), unlock: { kind: 'reach-ending', ending: 'good' } } },
      audio: { bgm: { theme: { asset: 'audio:theme', loop: true } }, sfx: { click: { asset: 'audio:click' } }, voice: { hello: { asset: 'audio:hello', charId: 'hero' } } },
      video: { opening: { asset: 'video:opening', skippable: true, audioPolicy: 'mute' } },
    },
    endings: { good: { title: L('好') }, bad: { title: L('坏') } }, gallery: { memories: {}, music: {} },
    chapters: {
      a: { id: 'a', title: L('第一章'), start: 'start', scene: 'room', nodes: {
        start: { kind: 'line', speaker: 'hero', text: L('你好'), voice: 'hello', enter: [{ kind: 'resource', id: 'affection', op: 'add', value: 2 }], presentation: { cg: { show: 'reward' }, sfx: ['click'], transition: 'fade' }, next: ref('b','pick') },
      } },
      b: { id: 'b', title: L('第二章'), start: 'pick', nodes: {
        pick: { kind: 'choice', prompt: L('选择'), options: [
          { id: 'go', text: L('继续'), effects: [{ kind: 'resource', id: 'affection', op: 'add', value: 1 }, { kind: 'flag', id: 'chose', value: true }], next: ref('b','route') },
          { id: 'locked', text: L('锁定'), when: { kind: 'flag', id: 'locked' }, next: ref('b','bad') },
        ] },
        route: { kind: 'jump', when: { kind: 'flag', id: 'chose' }, then: ref('b','check'), otherwise: ref('b','bad') },
        check: { kind: 'check', prompt: L('检定'), check: { attribute: 'affection', difficulty: 5, dice: 6 }, pass: { next: ref('b','good') }, fail: { next: ref('b','bad') } },
        good: { kind: 'ending', ending: 'good', text: L('成功') },
        bad: { kind: 'ending', ending: 'bad', text: L('失败') },
      } },
    },
  };
}
function build(pkg = packageData(), seed = true): World {
  const world = worldWith(narrativeDirectorCapability);
  world.createEntity('story'); world.addComponent('story', { type: 'NarrativePackage', package: pkg });
  world.addComponent('story', createStoryRuntime(pkg));
  world.createEntity('input'); world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
  world.createEntity('affection'); world.addComponent<Resource>('affection', { type: 'Resource', id: 'affection', current: 0, min: 0, max: 100 });
  world.createEntity('chose'); world.addComponent<Flag>('chose', { type: 'Flag', id: 'chose', active: false });
  world.createEntity('locked'); world.addComponent<Flag>('locked', { type: 'Flag', id: 'locked', active: false });
  if (seed) { world.createEntity('seed'); world.addComponent('seed', { type: 'RandomSeed', seed: 1, sequence: 0 }); }
  return world;
}
const state = (w: World) => w.getComponent<StoryRuntime>('story','StoryRuntime')!;
const projection = (w: World) => w.getComponent<NarrativeProjection>('story','NarrativeProjection')!;
const affection = (w: World) => w.getComponent<Resource>('affection','Resource')!.current;
function input(w: World, key?: string, arg?: string): void {
  w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: key ? [{ source: 'test', phase: 'action', key, arg }] : [] });
  w.tick();
  w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
}
function ack(w: World, throughSeq: number): void { input(w, NARRATIVE_ACK, String(throughSeq)); }
function toChoice(w: World): void { input(w); input(w, NARRATIVE_ADVANCE); }
function toCheck(w: World): void { toChoice(w); input(w, NARRATIVE_CHOOSE, 'go'); input(w); }
describe('t3-narrative-director 02A', () => {
  it('keeps projection as plain structured-cloneable data', () => {
    const w = build(); input(w);
    expect(() => structuredClone(projection(w))).not.toThrow();
  });
  it('declares every world component it reads for deterministic scheduling', () => {
    const system = narrativeDirectorCapability.systems[0];
    for (const type of ['InputQueue', 'NarrativePackage', 'StoryRuntime', 'Resource', 'Flag', 'RandomSeed']) {
      expect(system.reads, `${type} must be declared as a read`).toContain(type);
    }
  });
  it('co-loads with dialogue in an explicit order without a soft scheduling cycle', () => {
    const systems = [...dialogueCapability.systems, ...narrativeDirectorCapability.systems];
    expect(topologicalSort(systems, { softCycle: 'throw' }).map(system => system.id)).toEqual(['dialogue', 'narrative-director']);
  });
  it('refreshes option availability when flags change while a choice remains visible', () => {
    const w = build(); toChoice(w);
    expect(projection(w).options?.find(option => option.id === 'locked')?.available).toBe(false);
    w.getComponent<Flag>('locked','Flag')!.active = true;
    input(w);
    expect(projection(w).options?.find(option => option.id === 'locked')?.available).toBe(true);
  });
  it('refreshes resource-gated options without re-entering the choice or replaying effects', () => {
    const pkg = packageData();
    (pkg.chapters.b.nodes.pick as unknown as { options: { when?: unknown }[] }).options[1].when =
      { kind: 'resource', id: 'affection', cmp: 'gte', value: 4 };
    const w = build(pkg); toChoice(w);
    const before = [...state(w).enteredNodeIds];
    expect(projection(w).options?.find(option => option.id === 'locked')?.available).toBe(false);
    w.getComponent<Resource>('affection', 'Resource')!.current = 4;
    input(w);
    expect(projection(w).options?.find(option => option.id === 'locked')?.available).toBe(true);
    expect(state(w).enteredNodeIds).toEqual(before);
    expect(affection(w)).toBe(4);
    input(w);
    expect(state(w).enteredNodeIds).toEqual(before);
    expect(affection(w)).toBe(4);
  });
  it('uses a package accepted by the V1 static validator', () => {
    expect(validateGalPackage(packageData()).issues).toEqual([]);
  });
  it('projects inherited scene and media keys across chapters, and runs enter/choice once', () => {
    const w = build(); input(w);
    expect(projection(w)).toMatchObject({ chapterId: 'a', nodeId: 'start', backgroundAssetKey: 'art:room', cgAssetKey: 'art:reward', bgmAssetKey: 'audio:theme', sfxAssetKeys: ['audio:click'], voiceAssetKey: 'audio:hello', transition: 'fade' });
    expect(projection(w).cast).toMatchObject({ hero: { assetKey: 'art:hero-smile' }, friend: { assetKey: 'art:friend' } });
    expect(affection(w)).toBe(2);
    input(w); expect(affection(w)).toBe(2);
    input(w, NARRATIVE_ADVANCE);
    expect(projection(w)).toMatchObject({ chapterId: 'b', nodeId: 'pick', backgroundAssetKey: 'art:room', cgAssetKey: 'art:reward' });
    expect(projection(w).transition).toBeUndefined();
    expect(projection(w).options).toMatchObject([{ id: 'go', available: true }, { id: 'locked', available: false }]);
    input(w, NARRATIVE_CHOOSE, 'go'); expect(affection(w)).toBe(3);
    expect(state(w).current).toEqual(ref('b','check'));
    input(w); expect(state(w).current).toEqual(ref('b','check'));
    expect(affection(w)).toBe(3);
    expect(state(w).enteredNodeIds).toEqual([storyRefKey(ref('a','start')),storyRefKey(ref('b','pick')),storyRefKey(ref('b','route')),storyRefKey(ref('b','check'))]);
  });
  it('rejects rapid clicks, invalid/locked choices, and missing seed without moving or writing', () => {
    const w = build(packageData(), false); toChoice(w);
    const q = w.getComponent<InputQueue>('input','InputQueue')!;
    q.actions = [{ source: 'test', phase: 'action', key: NARRATIVE_CHOOSE, arg: 'go' }, { source: 'test', phase: 'action', key: NARRATIVE_CHOOSE, arg: 'go' }];
    w.tick(); q.actions = [];
    expect(state(w).lastReceipt?.reason).toBe('too-many-inputs'); expect(affection(w)).toBe(2);
    input(w, NARRATIVE_CHOOSE, 'absent'); expect(state(w).lastReceipt?.reason).toBe('invalid-choice');
    input(w, NARRATIVE_CHOOSE, 'locked'); expect(state(w).lastReceipt?.reason).toBe('condition-failed');
    input(w, NARRATIVE_CHOOSE, 'go'); input(w);
    input(w, NARRATIVE_ADVANCE); expect(state(w).lastReceipt?.reason).toBe('missing-seed');
    expect(state(w).current).toEqual(ref('b','check')); expect(affection(w)).toBe(3);
  });
  it('reaches both endings with deterministic dice branches', () => {
    const goodPkg = packageData();
    (goodPkg.chapters.b.nodes.check as { check: { difficulty: number } }).check.difficulty = 1;
    const good = build(goodPkg); toCheck(good); input(good, NARRATIVE_ADVANCE);
    expect(projection(good).endingId).toBe('good');
    const badPkg = packageData();
    (badPkg.chapters.b.nodes.check as { check: { difficulty: number } }).check.difficulty = 100;
    const bad = build(badPkg); toCheck(bad); input(bad, NARRATIVE_ADVANCE);
    expect(projection(bad).endingId).toBe('bad');
  });
  it('settles automatic jump within the visible step without an extra input', () => {
    const w = build(); toChoice(w); input(w, NARRATIVE_CHOOSE, 'go');
    expect(state(w).current).toEqual(ref('b','check'));
    input(w);
    expect(projection(w).kind).toBe('check');
  });
  it('fails closed on bad refs, unknown unlocks, and forced jump loops', () => {
    const badRef = packageData(); (badRef.chapters.a.nodes.start as { next: { nodeId: string } }).next.nodeId = 'missing';
    const a = build(badRef); input(a); input(a, NARRATIVE_ADVANCE);
    expect(state(a).lastReceipt?.reason).toBe('bad-ref'); expect(state(a).current).toEqual(ref('a','start'));
    const unlock = packageData(); (unlock.chapters.a.nodes.start as unknown as { enter: unknown[] }).enter = [{ kind: 'unlockCg', id: 'missing' }];
    const b = build(unlock); input(b); expect(state(b).lastReceipt?.reason).toBe('bad-ref'); expect(affection(b)).toBe(0);
    const loop = packageData(); (loop.chapters.b.nodes.route as { then: unknown }).then = ref('b','route');
    const c = build(loop); toChoice(c); input(c, NARRATIVE_CHOOSE, 'go'); input(c); input(c);
    expect(state(c).lastReceipt?.reason).toBe('jump-loop');
  });
  it('does not partially commit rejected option effects or invalid scene defaults', () => {
    const unlock = packageData();
    (unlock.chapters.b.nodes.pick as unknown as { options: { effects?: unknown[] }[] }).options[0].effects = [{ kind: 'resource', id: 'affection', op: 'add', value: 50 }, { kind: 'unlockMusic', id: 'theme' }];
    const a = build(unlock); toChoice(a); input(a, NARRATIVE_CHOOSE, 'go');
    expect(state(a).lastReceipt?.reason).toBe('bad-ref');
    expect(state(a).current).toEqual(ref('b','pick')); expect(affection(a)).toBe(2);
    const scene = packageData();
    (scene.scenes.room as { background: string }).background = 'missing';
    const b = build(scene); input(b);
    expect(state(b).lastReceipt).toMatchObject({ status: 'rejected', reason: 'bad-ref', detail: 'scene-background:room:missing' });
    expect(b.getComponent('story','NarrativeProjection')).toBeUndefined();
  });
  it('emits opt-in reject trace and does not rerun enter after snapshot restore', () => {
    const w = build(); w.createEntity('trace'); w.addComponent('trace', { type: 'DebugTrace', events: [], max: 100, tick: 0 });
    toChoice(w);
    const snap = JSON.parse(JSON.stringify(w.snapshot())); const order = w.getAllEntities();
    const restored = build(); restored.restore(snap, order);
    input(restored, NARRATIVE_CHOOSE, 'invalid');
    expect(state(restored).lastReceipt?.reason).toBe('invalid-choice');
    expect((restored.getComponent<{ type: 'DebugTrace'; events: { kind: string; what: string }[] }>('trace','DebugTrace')?.events ?? []).at(-1)).toMatchObject({ kind: 'reject', what: 'invalid-choice' });
    expect(affection(restored)).toBe(2);
    input(restored, NARRATIVE_CHOOSE, 'go');
    expect(affection(restored)).toBe(3);
    expect(state(restored).enteredNodeIds.filter(id => id === storyRefKey(ref('a','start')))).toHaveLength(1);
  });
  it('is deterministic, snapshot-restorable and quiescent after settling', () => {
    expectDeterministic(build, w => { toCheck(w); input(w, NARRATIVE_ADVANCE); });
    expectRestoreContinues(build, w => { toChoice(w); }, w => { input(w, NARRATIVE_CHOOSE, 'go'); input(w); input(w, NARRATIVE_ADVANCE); });
    const w = build(); toChoice(w); expectQuiescent(w, 4);
    const x = build(); const y = build(); toCheck(x); toCheck(y);
    expect(hashSnapshot(x.snapshot())).toBe(hashSnapshot(y.snapshot()));
  });
});

describe('t3-narrative-director 04A milestones', () => {
  function milestonesPackage(): GalPackage {
    const pkg = packageData();
    (pkg.media.cg as Record<string, unknown>).start = { image: 'art:start', title: L('开场'), unlock: { kind: 'reach-node', ref: ref('a', 'start') } };
    (pkg.media.cg as Record<string, unknown>).explicit = { image: 'art:explicit', title: L('显式'), unlock: { kind: 'explicit' } };
    (pkg.gallery.memories as Record<string, unknown>).memory = { title: L('回想'), entry: ref('a','start'), unlock: { kind: 'explicit' } };
    (pkg.gallery.music as Record<string, unknown>).theme = { unlock: { kind: 'explicit' } };
    (pkg.chapters.a.nodes.start as { enter?: unknown[] }).enter = [
      { kind: 'resource', id: 'affection', op: 'add', value: 2 }, { kind: 'unlockCg', id: 'explicit' },
    ];
    (pkg.chapters.b.nodes.pick as unknown as { options: { effects?: unknown[] }[] }).options[0].effects = [
      { kind: 'resource', id: 'affection', op: 'add', value: 1 }, { kind: 'flag', id: 'chose', value: true }, { kind: 'unlockMemory', id: 'memory' },
    ];
    (pkg.chapters.b.nodes.check as { check: { difficulty: number }; pass: { effects?: unknown[] }; fail: { effects?: unknown[] } }).check.difficulty = 1;
    (pkg.chapters.b.nodes.check as { pass: { effects?: unknown[] }; fail: { effects?: unknown[] } }).pass.effects = [{ kind: 'unlockMusic', id: 'theme' }];
    expect(validateGalPackage(pkg).issues).toEqual([]);
    return pkg;
  }
  const events = (w: World) => readNarrativeEvents(w, 'story');
  it('emits stable reach and explicit events at real entry, choice, check and ending only', () => {
    const w = build(milestonesPackage()); input(w);
    expect(events(w).map(e => [e.kind, e.contentId])).toEqual([
      ['unlockCg', 'explicit'], ['reach-node', storyRefKey(ref('a','start'))], ['unlockCg', 'start'],
    ]);
    const first = events(w);
    input(w); expect(events(w)).toEqual(first);
    input(w, NARRATIVE_ADVANCE); input(w, NARRATIVE_CHOOSE, 'go');
    expect(events(w).some(e => e.kind === 'unlockMemory' && e.contentId === 'memory')).toBe(true);
    input(w, NARRATIVE_ADVANCE);
    expect(events(w).some(e => e.kind === 'unlockMusic' && e.contentId === 'theme')).toBe(true);
    expect(events(w).some(e => e.kind === 'reach-ending' && e.contentId === 'good')).toBe(true);
    expect(events(w).some(e => e.kind === 'unlockCg' && e.contentId === 'reward')).toBe(true);
    expect(events(w).map(e => e.seq)).toEqual(events(w).map((_, i) => i + 1));
    expect(new Set(events(w).map(e => e.id)).size).toBe(events(w).length);
    const settled = events(w); input(w); expect(events(w)).toEqual(settled);
  });
  it('accepts read-complete only for the already visible current ref and one action per tick', () => {
    const w = build();
    input(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('a','start')));
    expect(state(w).lastReceipt?.reason).toBe('stale-read');
    expect(events(w)).toEqual([]);
    input(w);
    expect(events(w).some(e => e.kind === 'read-complete')).toBe(false);
    input(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('b','pick')));
    expect(state(w).lastReceipt?.reason).toBe('stale-read');
    input(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('a','start')));
    expect(events(w).filter(e => e.kind === 'read-complete')).toHaveLength(1);
    const before = events(w);
    input(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('a','start'))); expect(events(w)).toEqual(before);
    const q = w.getComponent<InputQueue>('input', 'InputQueue')!;
    q.actions = [{ source:'test', phase:'action', key:NARRATIVE_READ_COMPLETE, arg:storyRefKey(ref('a','start')) },
      { source:'test', phase:'action', key:NARRATIVE_ADVANCE }];
    w.tick(); q.actions = [];
    expect(state(w).lastReceipt?.reason).toBe('too-many-inputs');
    expect(state(w).current).toEqual(ref('a','start'));
    expect(events(w)).toEqual(before);
    input(w, NARRATIVE_ADVANCE);
    input(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('a','start')));
    expect(state(w).lastReceipt?.reason).toBe('stale-read');
  });
  it('keeps unacknowledged events through snapshot restore, rollback, future replay and branch change', () => {
    const w = build(milestonesPackage()); toChoice(w);
    const before = events(w);
    const restored = build(milestonesPackage()); restored.restore(w.snapshot(), w.snapshotOrder());
    input(restored); expect(events(restored)).toEqual(before);
    input(restored, NARRATIVE_CHOOSE, 'go'); const chosen = events(restored);
    input(restored, NARRATIVE_BACK); input(restored, NARRATIVE_BACK);
    expect(events(restored)).toEqual(chosen);
    input(restored, NARRATIVE_ADVANCE);
    expect(events(restored)).toEqual(chosen);
    expect(state(restored).current).toEqual(ref('b','pick'));
    restored.getComponent<Flag>('locked', 'Flag')!.active = true;
    input(restored, NARRATIVE_CHOOSE, 'locked');
    expect(state(restored).current).toEqual(ref('b','bad'));
    expect(events(restored).slice(0, chosen.length)).toEqual(chosen);
    expect(events(restored).some(e => e.kind === 'reach-ending' && e.contentId === 'bad')).toBe(true);
  });
  it('acknowledges only a valid prefix and returns defensive event copies', () => {
    const w = build(); input(w); input(w, NARRATIVE_ADVANCE);
    const original = events(w); expect(original.length).toBe(2);
    (original[0] as { contentId: string }).contentId = 'tampered';
    expect(events(w)[0].contentId).not.toBe('tampered');
    ack(w, 0); expect(state(w).lastReceipt?.reason).toBe('invalid-input');
    ack(w, 3); expect(state(w).lastReceipt?.reason).toBe('invalid-input');
    ack(w, 1); expect(state(w).lastReceipt?.status).toBe('applied');
    expect(events(w).map(e => e.seq)).toEqual([2]);
    ack(w, 1); expect(state(w).lastReceipt?.reason).toBe('invalid-input');
    ack(w, 2); expect(state(w).lastReceipt?.status).toBe('applied');
    expect(events(w)).toEqual([]);
    const q = w.getComponent<InputQueue>('input', 'InputQueue')!;
    q.actions = [{ source:'host', phase:'action', key:NARRATIVE_ACK, arg:'2' },
      { source:'player', phase:'action', key:NARRATIVE_CHOOSE, arg:'go' }];
    w.tick(); q.actions = [];
    expect(state(w).lastReceipt?.reason).toBe('too-many-inputs');
    expect(state(w).current).toEqual(ref('b','pick'));
  });
  it('rejects invalid effect batches and full outbox without partial state or seed commits', () => {
    const bad = milestonesPackage();
    (bad.chapters.b.nodes.pick as unknown as { options: { effects?: unknown[] }[] }).options[0].effects = [
      { kind:'resource', id:'affection', op:'add', value:50 }, { kind:'unlockMusic', id:'unknown' },
    ];
    const a = build(bad); toChoice(a); const beforeA = events(a);
    input(a, NARRATIVE_CHOOSE, 'go');
    expect(state(a).lastReceipt?.reason).toBe('bad-ref');
    expect(affection(a)).toBe(2); expect(state(a).current).toEqual(ref('b','pick')); expect(events(a)).toEqual(beforeA);
    const missing = milestonesPackage();
    (missing.chapters.b.nodes.pick as unknown as { options: { effects?: unknown[] }[] }).options[0].effects = [
      { kind:'unlockMemory', id:'memory' }, { kind:'resource', id:'missing', op:'add', value:1 },
    ];
    const m = build(missing); toChoice(m); const beforeM = events(m);
    input(m, NARRATIVE_CHOOSE, 'go');
    expect(state(m).lastReceipt?.reason).toBe('missing-effect-target');
    expect(state(m).current).toEqual(ref('b','pick')); expect(events(m)).toEqual(beforeM);
    const w = build(milestonesPackage()); toCheck(w);
    const box = w.getComponent<NarrativeOutbox>('story', 'NarrativeOutbox')!;
    while (box.pending.length < NARRATIVE_OUTBOX_LIMIT) {
      const seq = box.nextSeq++;
      box.pending.push({ seq, id:JSON.stringify([box.packageId, 'reach-node', `filler-${seq}`]), packageId:box.packageId, kind:'reach-node', ref:ref('a','start'), contentId:`filler-${seq}` });
    }
    const beforeRef = { ...state(w).current };
    const beforeSeed = w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!.sequence;
    const beforeEvents = events(w);
    input(w, NARRATIVE_ADVANCE);
    expect(state(w).lastReceipt?.reason).toBe('outbox-full');
    expect(state(w).current).toEqual(beforeRef);
    expect(w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!.sequence).toBe(beforeSeed);
    expect(events(w)).toEqual(beforeEvents);
  });
  it('fails closed on a malformed outbox and keeps trace density bounded per tick', () => {
    const w = build(milestonesPackage());
    w.createEntity('trace'); w.addComponent('trace', { type:'DebugTrace', events:[], max:100, tick:0 });
    input(w); input(w, NARRATIVE_ADVANCE);
    const trace = w.getComponent<{type:'DebugTrace';events:{system:string;kind:string;what:string}[]}>('trace','DebugTrace')!;
    trace.events = [];
    input(w, NARRATIVE_CHOOSE, 'go');
    expect(trace.events.filter(e => e.system === 'narrative-director')).toHaveLength(3);
    const box = w.getComponent<NarrativeOutbox>('story', 'NarrativeOutbox')!;
    box.pending[0].id = 'wrong';
    expect(() => events(w)).toThrow('bad-outbox');
    ack(w, box.pending[0].seq);
    expect(state(w).lastReceipt?.reason).toBe('bad-outbox');
    trace.events = [];
    input(w, NARRATIVE_ADVANCE);
    expect(state(w).lastReceipt?.reason).toBe('bad-outbox');
    expect(trace.events.filter(e => e.system === 'narrative-director')).toEqual([
      expect.objectContaining({ kind:'reject', what:'bad-outbox' }),
    ]);
  });
  it('keeps World hashes and event order deterministic with and without optional trace', () => {
    const run = (trace: boolean): World => {
      const w = build(milestonesPackage());
      if (trace) { w.createEntity('trace'); w.addComponent('trace', { type:'DebugTrace', events:[], max:100, tick:0 }); }
      input(w); ack(w, events(w).at(-1)!.seq);
      input(w, NARRATIVE_READ_COMPLETE, storyRefKey(ref('a','start')));
      input(w, NARRATIVE_ADVANCE); input(w, NARRATIVE_CHOOSE, 'go'); input(w, NARRATIVE_ADVANCE);
      return w;
    };
    const a = run(false), b = run(false), traced = run(true);
    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
    expect(events(a)).toEqual(events(b));
    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(traced.snapshot()));
    const trace = traced.getComponent<{type:'DebugTrace';events:{system:string;kind:string;what:string}[]}>('trace','DebugTrace')!;
    expect(trace.events.filter(e => e.system === 'narrative-director' && e.kind === 'reject')).toEqual([]);
  });
});

describe('t3-narrative-director 02B session history', () => {
  const history = (w: World) => w.getComponent<NarrativeHistory>('story', 'NarrativeHistory')!;
  it('rolls across a choice, restores effects and seed, then truncates the old future on reselect', () => {
    const w = build();
    w.createEntity('profile'); w.addComponent('profile', { type: 'PlayerProfile', unlockedCg: ['already-read'] });
    toCheck(w); const preCheckSeed = w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!.sequence;
    expect(history(w).entries.map(e => e.kind)).toEqual(['line','choice','check']);
    expect(history(w).entries.map(e => e.ref.nodeId)).toEqual(['start','pick','check']);
    const view = readNarrativeHistory(w, 'story')!;
    expect(view.entries[0].text).toEqual(L('你好'));
    (view.entries[0].ref as { nodeId: string }).nodeId = 'tampered';
    expect(history(w).entries[0].ref.nodeId).toBe('start');
    expect(affection(w)).toBe(3);
    input(w, NARRATIVE_ADVANCE);
    expect(history(w).entries).toHaveLength(4);
    input(w, NARRATIVE_BACK);
    expect(projection(w).kind).toBe('check');
    expect(w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!.sequence).toBe(preCheckSeed);
    input(w, NARRATIVE_BACK);
    expect(projection(w).kind).toBe('choice'); expect(affection(w)).toBe(2);
    expect(w.getComponent<Flag>('chose','Flag')!.active).toBe(false);
    input(w, NARRATIVE_ADVANCE);
    expect(state(w).lastReceipt?.reason).toBe('choice-unconfirmed');
    w.getComponent<Flag>('locked','Flag')!.active = true;
    input(w, NARRATIVE_CHOOSE, 'locked');
    expect(projection(w).endingId).toBe('bad');
    expect(history(w).entries.map(e => e.ref.nodeId)).toEqual(['start','pick','bad']);
    expect(w.getComponent<{type:'PlayerProfile';unlockedCg:string[]}>('profile','PlayerProfile')?.unlockedCg).toEqual(['already-read']);
  });
  it('replays the existing future one visible step down and rejects unsupported automatic mode', () => {
    const w = build(); toCheck(w); input(w, NARRATIVE_ADVANCE);
    input(w, NARRATIVE_BACK); input(w, NARRATIVE_BACK);
    expect(history(w).cursor).toBe(1);
    input(w, NARRATIVE_ADVANCE); expect(state(w).lastReceipt?.reason).toBe('choice-unconfirmed');
    input(w, NARRATIVE_CHOOSE, 'go'); expect(history(w).entries.map(e => e.ref.nodeId)).toEqual(['start','pick','check']);
    input(w, NARRATIVE_AUTO); expect(state(w).lastReceipt?.reason).toBe('unsupported-action');
    expect(history(w).entries).toHaveLength(3);
  });
  it('re-running a check after returning through the choice uses the same seed and result', () => {
    const w = build(); toCheck(w);
    const before = structuredClone(w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!);
    input(w, NARRATIVE_ADVANCE);
    const result = projection(w).endingId;
    const after = structuredClone(w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!);
    input(w, NARRATIVE_BACK); input(w, NARRATIVE_BACK);
    input(w, NARRATIVE_CHOOSE, 'go');
    expect(w.getComponent('seed','RandomSeed')).toEqual(before);
    input(w, NARRATIVE_ADVANCE);
    expect(projection(w).endingId).toBe(result);
    expect(w.getComponent('seed','RandomSeed')).toEqual(after);
  });
  it('restores history across a world snapshot and rejects corrupt, old and package-mismatched imports', () => {
    const w = build(); toCheck(w);
    const exported = exportNarrativeHistory(w, 'story')!;
    const snap = w.snapshot(); const order = w.snapshotOrder();
    const restored = build(); restored.restore(snap, order);
    expect(importNarrativeHistory(restored, 'story', exported)).toBe(true);
    input(restored, NARRATIVE_BACK);
    expect(projection(restored).kind).toBe('choice');
    const midSnap = restored.snapshot(); const midOrder = restored.snapshotOrder();
    const replayed = build(); replayed.restore(midSnap, midOrder);
    input(replayed, NARRATIVE_CHOOSE, 'go');
    expect(projection(replayed).kind).toBe('check');
    const rejects = (data: NarrativeHistory) => {
      const target = build(); target.restore(snap, order);
      expect(importNarrativeHistory(target, 'story', data)).toBe(false);
      expect(state(target).lastReceipt?.reason).toBe('bad-history');
    };
    const corrupt = structuredClone(exported); corrupt.cursor = 99;
    rejects(corrupt);
    const old = structuredClone(exported) as unknown as { version: number };
    old.version = 0;
    rejects(old as NarrativeHistory);
    const other = structuredClone(exported); other.packageHash = 'other';
    rejects(other);
    const badRef = structuredClone(exported); badRef.entries[0].ref = ref('a','missing');
    rejects(badRef);
    const badValue = structuredClone(exported);
    (badValue.entries[0].values[0].component as Resource).current = Number.NaN;
    rejects(badValue);
    expect(importNarrativeHistory(restored, 'story', exported)).toBe(false);
    expect(importNarrativeHistory(restored, 'story', undefined)).toBe(true);
    input(restored);
    expect(history(restored).entries).toHaveLength(1);
    expect(history(restored).entries[0].ref.nodeId).toBe('pick');
  });
  it('refuses an imported cursor when the loaded world differs in plot state, projection, resource, flag or seed', () => {
    const source = build(); toCheck(source);
    const data = exportNarrativeHistory(source, 'story')!;
    const snap = source.snapshot(); const order = source.snapshotOrder();
    const altered: { name: string; change: (world: World) => void }[] = [
      { name: 'resource', change: w => { w.getComponent<Resource>('affection','Resource')!.current = 77; } },
      { name: 'flag', change: w => { w.getComponent<Flag>('chose','Flag')!.active = false; } },
      { name: 'seed', change: w => { w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!.sequence = 9; } },
      { name: 'story', change: w => { state(w).scene.backgroundId = 'other'; } },
      { name: 'projection', change: w => { projection(w).backgroundId = 'other'; } },
    ];
    for (const { name, change } of altered) {
      const loaded = build(); loaded.restore(snap, order); change(loaded);
      const before = JSON.stringify(loaded.snapshot());
      expect(importNarrativeHistory(loaded, 'story', data), name).toBe(false);
      expect(state(loaded).lastReceipt?.reason, name).toBe('bad-history');
      if (name === 'resource') expect(affection(loaded)).toBe(77);
      expect(JSON.stringify(loaded.snapshot())).not.toBe(before); // only the explicit reject receipt changes
    }
  });
  it('is deterministic with rollback and keeps no static package copy in its bounded entries', () => {
    const run = () => { const w = build(); toCheck(w); input(w, NARRATIVE_ADVANCE); input(w, NARRATIVE_BACK); input(w, NARRATIVE_BACK); input(w, NARRATIVE_CHOOSE, 'go'); input(w, NARRATIVE_ADVANCE); return w; };
    const a = run(); const b = run();
    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
    expect(JSON.stringify(exportNarrativeHistory(a, 'story'))).not.toContain('GalPackage');
    expect(JSON.stringify(exportNarrativeHistory(a, 'story'))).not.toContain('"chapters"');
    const before = JSON.stringify(history(a)); input(a); expect(JSON.stringify(history(a))).toBe(before);
  });
  it('honors hard checkpoints only inside the window and rejects same-tick double input', () => {
    const pkg = packageData();
    (pkg.chapters.b.nodes.pick as { checkpoint?: 'hard' }).checkpoint = 'hard';
    const w = build(pkg); toCheck(w);
    input(w, NARRATIVE_BACK); expect(projection(w).kind).toBe('choice');
    const q = w.getComponent<InputQueue>('input', 'InputQueue')!;
    q.actions = [
      { source: 'test', phase: 'action', key: NARRATIVE_ADVANCE },
      { source: 'test', phase: 'action', key: NARRATIVE_BACK },
    ];
    w.tick(); q.actions = [];
    expect(state(w).lastReceipt?.reason).toBe('too-many-inputs');
    expect(history(w).cursor).toBe(1);
    input(w, NARRATIVE_BACK); expect(projection(w).nodeId).toBe('start');
  });
  it('keeps automatic jump trace within three entries and records boundary rejection only when enabled', () => {
    const w = build(); w.createEntity('trace'); w.addComponent('trace', { type: 'DebugTrace', events: [], max: 100, tick: 0 });
    toChoice(w);
    const trace = w.getComponent<{type:'DebugTrace'; events:{kind:string;what:string;why?:string}[]}>('trace','DebugTrace')!;
    trace.events = [];
    input(w, NARRATIVE_CHOOSE, 'go');
    expect(trace.events.length).toBeLessThanOrEqual(3);
    expect(trace.events.filter(e => e.why?.startsWith('auto-jump:'))).toHaveLength(1);
    input(w, NARRATIVE_BACK); input(w, NARRATIVE_BACK); input(w, NARRATIVE_BACK);
    expect(trace.events.at(-1)).toMatchObject({ kind: 'reject', what: 'no-history' });
  });
  it('caps the visible window at 512 and refuses to cross the evicted boundary', () => {
    const pkg = { ...packageData(), entry: ref('a','step0') };
    const nodes = pkg.chapters.a.nodes as Record<string, unknown>;
    for (let i = 0; i <= NARRATIVE_HISTORY_LIMIT; i++) nodes[`step${i}`] = { kind: 'line', text: L(`第${i}句`), next: i < NARRATIVE_HISTORY_LIMIT ? ref('a', `step${i+1}`) : ref('b','pick') };
    const w = build(pkg); input(w);
    for (let i = 0; i < NARRATIVE_HISTORY_LIMIT; i++) {
      input(w, NARRATIVE_ADVANCE);
      const last = readNarrativeEvents(w, 'story').at(-1);
      if (last) { ack(w, last.seq); expect(state(w).lastReceipt?.status).toBe('applied'); }
    }
    expect(history(w).entries).toHaveLength(NARRATIVE_HISTORY_LIMIT);
    expect(history(w).entries[0].ref.nodeId).toBe('step1');
    expect(history(w).entries.at(-1)?.ref.nodeId).toBe(`step${NARRATIVE_HISTORY_LIMIT}`);
    const bytes = Buffer.byteLength(JSON.stringify(history(w)), 'utf8');
    console.info(`[GAL-ENG-02B] 512-entry history bytes=${bytes}`);
    expect(bytes).toBeLessThan(1_000_000);
    for (let i = 1; i < NARRATIVE_HISTORY_LIMIT; i++) input(w, NARRATIVE_BACK);
    expect(history(w).cursor).toBe(0);
    const seed = w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!.sequence;
    input(w, NARRATIVE_BACK);
    expect(state(w).lastReceipt?.reason).toBe('history-limit');
    expect(projection(w).nodeId).toBe('step1');
    expect(state(w).enteredNodeIds).toHaveLength(2);
    expect(w.getComponent<{type:'RandomSeed';seed:number;sequence:number}>('seed','RandomSeed')!.sequence).toBe(seed);
    input(w, NARRATIVE_ADVANCE); expect(projection(w).nodeId).toBe('step2'); expect(state(w).enteredNodeIds).toHaveLength(3);
  });
});
