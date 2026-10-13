import { describe, expect, it } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { worldWith } from '../../test-fixtures/test-kit.js';
import { NARRATIVE_ADVANCE, NARRATIVE_BACK, createStoryRuntime, narrativeDirectorCapability } from '@skills/tier3/narrative-director.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { CorruptSaveError, computeChecksum, openEnvelope, sealEnvelope } from '../save/envelope.js';
import type { SaveCodec, SavePort } from '../save/save-port.js';
import {
  GAL_PROFILE_SCHEMA, GAL_PROFILE_SLOT_PREFIX, createGalProfile, galProfileCodec, galProfileSlot,
  hasRead, isUnlocked, loadGalProfile, markRead, parseGalProfile, persistGalConfirmation,
  persistGalPreferencesReset, persistGalAudioVolume, persistGalFocusMute, persistGalVoiceAuto,
  resetGalProfilePreferences, saveGalProfile, setGalConfirmation,
  setGalPreferences, unlock,
} from './gal-profile.js';

const L = (text: string) => ({ 'zh-CN': text });
const ref = (chapterId: string, nodeId: string) => ({ chapterId, nodeId });
function pkg(id: string): GalPackage {
  return {
    schemaVersion: 1, id, title: L('档案'), defaultLocale: 'zh-CN', locales: ['zh-CN'], entry: ref('a','start'),
    ui: { template: 'gal-template' }, characters: {}, scenes: {},
    chapters: { a: { id: 'a', title: L('第一章'), start: 'start', nodes: {
      start: { kind: 'line', text: L('开始'), next: ref('a','end') },
      end: { kind: 'ending', ending: 'good', text: L('结束') },
      jump: { kind: 'jump', then: ref('a','end') },
    } } },
    endings: { good: { title: L('好结局') } },
    gallery: { memories: { memory: { title: L('回想'), entry: ref('a','start'), unlock: { kind: 'explicit' } } },
      music: { theme: { unlock: { kind: 'explicit' } } } },
    media: { backgrounds: {}, cg: { cg: { image: 'art:cg', title: L('CG'), unlock: { kind: 'explicit' } },
      alpha: { image: 'art:alpha', title: L('先前的 CG'), unlock: { kind: 'explicit' } } },
      audio: { bgm: { theme: { asset: 'audio:theme', loop: true } }, sfx: {}, voice: {} }, video: {} },
    preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only', bgmVolume: 1,
      sfxVolume: 0.8, voiceVolume: 0.7, muted: false },
  };
}

function legacyV1(profile: ReturnType<typeof createGalProfile>) {
  const { confirmations: _confirmations, masterVolume: _master, focusMute: _focus,
    voiceAuto: _voiceAuto, ...preferences } = profile.preferences;
  return { ...profile, schemaVersion: 1, preferences };
}
function legacyV2(profile: ReturnType<typeof createGalProfile>) {
  const { masterVolume: _master, focusMute: _focus, voiceAuto: _voiceAuto, ...preferences } = profile.preferences;
  return { ...profile, schemaVersion: 2, preferences };
}
function legacyV3(profile: ReturnType<typeof createGalProfile>) {
  const { voiceAuto: _voiceAuto, ...preferences } = profile.preferences;
  return { ...profile, schemaVersion: 3, preferences };
}

describe('GalProfile V4', () => {
  it('creates a clean separate profile and keeps read/unlock updates explicit, pure and idempotent', () => {
    const packageA = pkg('gal-a');
    const fresh = createGalProfile(packageA);
    expect(fresh).toMatchObject({ schemaVersion: GAL_PROFILE_SCHEMA, packageId: 'gal-a', readNodeIds: [], unlockedCgIds: [] });
    const read = markRead(fresh, packageA, ref('a','start'));
    expect(fresh.readNodeIds).toEqual([]);
    expect(hasRead(read, packageA, ref('a','start'))).toBe(true);
    expect(markRead(read, packageA, ref('a','start'))).toBe(read);
    const all = (['cg','ending','memory','music'] as const).reduce((p, kind) => unlock(p, packageA, kind,
      ({ cg: 'cg', ending: 'good', memory: 'memory', music: 'theme' } as const)[kind]), read);
    expect(all).toMatchObject({ unlockedCgIds: ['cg'], unlockedEndingIds: ['good'], unlockedMemoryIds: ['memory'], unlockedMusicIds: ['theme'] });
    expect(unlock(all, packageA, 'cg', 'cg')).toBe(all);
    expect(isUnlocked(all, packageA, 'cg', 'cg')).toBe(true);
    expect(() => markRead(all, packageA, ref('a','jump'))).toThrow(CorruptSaveError);
    expect(() => unlock(all, packageA, 'cg', 'unknown')).toThrow(CorruptSaveError);
    expect(() => unlock(all, packageA, 'ending', 'unknown')).toThrow(CorruptSaveError);
    expect(() => unlock(all, packageA, 'memory', 'unknown')).toThrow(CorruptSaveError);
    expect(() => unlock(all, packageA, 'music', 'unknown')).toThrow(CorruptSaveError);
    expect(() => unlock(all, pkg('gal-b'), 'cg', 'cg')).toThrow(CorruptSaveError);
    expect(() => hasRead(all, pkg('gal-b'), ref('a','start'))).toThrow(CorruptSaveError);
  });

  it('uses package-isolated SavePort slots/envelopes and never the launcher role-card key', async () => {
    const port = new MemorySavePort(); const a = pkg('gal-a'); const b = pkg('gal-b');
    expect(galProfileSlot(a)).toBe(`${GAL_PROFILE_SLOT_PREFIX}gal-a`);
    expect(galProfileSlot(pkg('a/b'))).toBe(`${GAL_PROFILE_SLOT_PREFIX}a%2Fb`);
    expect(galProfileSlot(a)).not.toBe('apollo.playerProfile');
    expect(galProfileCodec(a).gameId).not.toBe(galProfileCodec(b).gameId);
    const initial = await loadGalProfile(port, a);
    const updated = unlock(markRead(initial, a, ref('a','start')), a, 'cg', 'cg');
    await saveGalProfile(port, a, updated, 1234);
    expect(await loadGalProfile(port, a)).toEqual(updated);
    expect(await loadGalProfile(port, b)).toEqual(createGalProfile(b));
    const envelope = await port.read(galProfileSlot(a));
    expect(envelope).toMatchObject({ schema: 4, gameId: galProfileCodec(a).gameId, savedAt: 1234 });
    expect(() => openEnvelope(envelope!, galProfileCodec(b))).toThrow(CorruptSaveError);
    expect(() => parseGalProfile(updated, b)).toThrow(CorruptSaveError);
  });

  it('normalizes preference ranges, stable set order and duplicate IDs without admitting unknown IDs', () => {
    const p = pkg('gal-a'); const original = createGalProfile(p);
    const normalized = setGalPreferences(original, p, { textSpeedMsPerChar: 700, autoDelayMs: -5,
      bgmVolume: 1.5, sfxVolume: -1, voiceVolume: 0.25 });
    expect(normalized.preferences).toMatchObject({ textSpeedMsPerChar: 500, autoDelayMs: 0,
      bgmVolume: 1, sfxVolume: 0, voiceVolume: 0.25 });
    expect(() => setGalPreferences(original, p, { bgmVolume: Number.NaN })).toThrow(CorruptSaveError);
    expect(() => setGalPreferences(original, p, { locale: 'xx' })).toThrow(CorruptSaveError);
    const row = { ...original, unlockedCgIds: ['cg','alpha','cg'], readNodeIds: ['["a","start"]','["a","start"]'] };
    expect(parseGalProfile(row, p)).toMatchObject({ unlockedCgIds: ['alpha','cg'], readNodeIds: ['["a","start"]'] });
    expect(JSON.stringify(parseGalProfile(row, p))).toBe(JSON.stringify(parseGalProfile({ ...row, unlockedCgIds: ['alpha','cg'] }, p)));
    expect(() => parseGalProfile({ ...row, unlockedCgIds: ['wrong'] }, p)).toThrow(CorruptSaveError);
    expect(() => parseGalProfile({ ...row, readNodeIds: ['["a","missing"]'] }, p)).toThrow(CorruptSaveError);
    expect(() => parseGalProfile({ ...row, name: 'launcher-card' }, p)).toThrow(CorruptSaveError);
  });

  it('defaults all six confirmations on and changes exactly one with stable idempotence', () => {
    const p = pkg('gal-a'), original = createGalProfile(p);
    expect(original.preferences.confirmations).toEqual({
      saveEmpty: true, overwrite: true, load: true, newGame: true, returnTitle: true, exitGame: true,
    });
    for (const key of Object.keys(original.preferences.confirmations) as (keyof typeof original.preferences.confirmations)[]) {
      const changed = setGalConfirmation(original, p, key, false);
      expect(changed.preferences.confirmations[key]).toBe(false);
      for (const other of Object.keys(original.preferences.confirmations) as (keyof typeof original.preferences.confirmations)[])
        if (other !== key) expect(changed.preferences.confirmations[other]).toBe(true);
      expect(setGalConfirmation(changed, p, key, false)).toBe(changed);
      expect(setGalConfirmation(changed, p, key, true).preferences.confirmations).toEqual(original.preferences.confirmations);
    }
    expect(() => setGalConfirmation(original, p, 'other' as never, false)).toThrow(CorruptSaveError);
    expect(() => setGalConfirmation(original, p, 'load', 'yes' as never)).toThrow(CorruptSaveError);
    expect(() => setGalPreferences(original, p, { confirmations: { load: false } } as never)).toThrow(CorruptSaveError);
    expect(setGalPreferences(setGalConfirmation(original, p, 'load', false), p,
      { textSpeedMsPerChar: 42 }).preferences.confirmations.load).toBe(false);
  });

  it('migrates a real V1 envelope only in memory after checksum and package checks, preserving every old fact', async () => {
    const p = pkg('gal-a'), port = new MemorySavePort();
    let current = setGalPreferences(createGalProfile(p), p, { textSpeedMsPerChar: 91, autoDelayMs: 1777,
      skipMode: 'all', bgmVolume: 0.3, sfxVolume: 0.4, voiceVolume: 0.5, muted: true });
    current = markRead(current, p, ref('a', 'start'));
    for (const [kind, id] of [['cg', 'alpha'], ['ending', 'good'], ['memory', 'memory'], ['music', 'theme']] as const)
      current = unlock(current, p, kind, id);
    const v1 = legacyV1(current);
    const oldCodec: SaveCodec = { gameId: galProfileCodec(p).gameId, schema: 1 };
    const envelope = sealEnvelope(v1, oldCodec, 99);
    await port.write(galProfileSlot(p), envelope);
    const migrated = await loadGalProfile(port, p);
    expect(migrated.schemaVersion).toBe(4);
    expect(legacyV1(migrated)).toEqual(v1);
    expect(migrated.preferences.confirmations).toEqual(createGalProfile(p).preferences.confirmations);
    expect(migrated.preferences).toMatchObject({ masterVolume: 1, focusMute: false, voiceAuto: true });
    expect(await port.read(galProfileSlot(p))).toEqual(envelope); // Read-only migration.
    await saveGalProfile(port, p, migrated, 100);
    expect(await port.read(galProfileSlot(p))).toMatchObject({ schema: 4, savedAt: 100 });
    expect(await loadGalProfile(port, p)).toEqual(migrated);
  });

  it('migrates V2 audio preferences without losing confirmations or progress', async () => {
    const p = pkg('gal-v2'), port = new MemorySavePort();
    const current = setGalConfirmation(markRead(createGalProfile(p), p, ref('a', 'start')), p, 'load', false);
    const v2 = legacyV2(current), envelope = sealEnvelope(v2, { gameId: galProfileCodec(p).gameId, schema: 2 }, 44);
    await port.write(galProfileSlot(p), envelope);
    const restored = await loadGalProfile(port, p);
    expect(restored).toMatchObject({ schemaVersion: 4, readNodeIds: current.readNodeIds,
      preferences: { confirmations: current.preferences.confirmations, masterVolume: 1, focusMute: false, voiceAuto: true } });
    expect(await port.read(galProfileSlot(p))).toEqual(envelope);
  });

  it('migrates V3 voice-auto policy with the old master and focus choices intact', async () => {
    const p = pkg('gal-v3'), port = new MemorySavePort();
    const current = setGalPreferences(createGalProfile(p), p, { masterVolume: 0.3, focusMute: true });
    const v3 = legacyV3(current), envelope = sealEnvelope(v3, { gameId: galProfileCodec(p).gameId, schema: 3 }, 45);
    await port.write(galProfileSlot(p), envelope);
    expect((await loadGalProfile(port, p)).preferences).toMatchObject({ masterVolume: 0.3,
      focusMute: true, voiceAuto: true });
    expect(await port.read(galProfileSlot(p))).toEqual(envelope);
  });

  it('persists master and focus policy serially without dropping other preferences', async () => {
    const p = pkg('gal-audio-policy'), port = new MemorySavePort();
    await Promise.all([persistGalAudioVolume(port, p, 'masterVolume', 0.4, 51),
      persistGalFocusMute(port, p, true, 52), persistGalAudioVolume(port, p, 'bgmVolume', 0.6, 53)]);
    expect((await loadGalProfile(port, p)).preferences).toMatchObject({ masterVolume: 0.4,
      focusMute: true, bgmVolume: 0.6 });
    await expect(persistGalFocusMute(port, p, 'yes' as never, 54)).rejects.toThrow(CorruptSaveError);
    await expect(persistGalAudioVolume(port, p, 'masterVolume', Number.NaN, 54)).rejects.toThrow(CorruptSaveError);
    expect(() => parseGalProfile({ ...createGalProfile(p), preferences: {
      ...createGalProfile(p).preferences, focusMute: 'yes' } }, p)).toThrow(CorruptSaveError);
  });

  it('serializes voice-auto writes without dropping master or confirmation choices', async () => {
    const p = pkg('gal-voice-auto'), port = new MemorySavePort();
    await Promise.all([persistGalAudioVolume(port, p, 'masterVolume', 0.4, 60),
      persistGalVoiceAuto(port, p, false, 61), persistGalConfirmation(port, p, 'load', false, 62)]);
    expect((await loadGalProfile(port, p)).preferences).toMatchObject({ masterVolume: 0.4,
      voiceAuto: false, confirmations: { load: false } });
    await expect(persistGalVoiceAuto(port, p, 'off' as never, 63)).rejects.toThrow(CorruptSaveError);
  });

  it('rejects malformed V1 even when the envelope checksum is valid', async () => {
    const p = pkg('gal-a'), port = new MemorySavePort();
    const codec: SaveCodec = { gameId: galProfileCodec(p).gameId, schema: 1 };
    const valid = legacyV1(createGalProfile(p));
    for (const data of [
      { ...valid, packageId: 'gal-b' },
      { ...valid, readNodeIds: ['["a","missing"]'] },
      { ...valid, unlockedCgIds: ['unknown'] },
      { ...valid, preferences: { ...valid.preferences, locale: 'xx' } },
      { ...valid, preferences: { ...valid.preferences, muted: 'false' } },
      { ...valid, preferences: { ...valid.preferences, confirmations: { load: false } } },
    ]) {
      await port.write(galProfileSlot(p), sealEnvelope(data, codec, 10));
      await expect(loadGalProfile(port, p)).rejects.toThrow(CorruptSaveError);
    }
    const badChecksum = sealEnvelope(valid, codec, 10);
    await port.write(galProfileSlot(p), { ...badChecksum, checksum: 'bad' });
    await expect(loadGalProfile(port, p)).rejects.toThrow(/checksum/);
  });

  it('rejects missing, extra, and non-boolean V2 confirmation keys', () => {
    const p = pkg('gal-a'), valid = createGalProfile(p);
    const { load: _load, ...missing } = valid.preferences.confirmations;
    for (const confirmations of [missing,
      { ...valid.preferences.confirmations, other: true },
      { ...valid.preferences.confirmations, load: 'yes' }])
      expect(() => parseGalProfile({ ...valid, preferences: { ...valid.preferences, confirmations } }, p))
        .toThrow(CorruptSaveError);
  });

  it('rejects bad checksum, future schema, broken migration and bad profile shape', async () => {
    const p = pkg('gal-a'); const port = new MemorySavePort(); const codec = galProfileCodec(p);
    const profile = createGalProfile(p);
    const env = sealEnvelope(profile, codec, 10);
    await port.write(galProfileSlot(p), { ...env, checksum: 'bad' });
    await expect(loadGalProfile(port, p)).rejects.toThrow(CorruptSaveError);
    await port.write(galProfileSlot(p), { ...env, schema: 5, checksum: computeChecksum(5, env.gameId, env.savedAt, env.data) });
    await expect(loadGalProfile(port, p)).rejects.toThrow(/高于当前/);
    const old = sealEnvelope(profile, { ...codec, schema: 0 }, 10);
    await port.write(galProfileSlot(p), old);
    await expect(loadGalProfile(port, p)).rejects.toThrow(/迁移链断裂/);
    const malformed = { ...profile, unlockedMusicIds: ['not-in-catalog'] };
    await port.write(galProfileSlot(p), sealEnvelope(malformed, codec, 10));
    await expect(loadGalProfile(port, p)).rejects.toThrow(CorruptSaveError);
    expect(() => parseGalProfile({ ...profile, schemaVersion: 5 }, p)).toThrow(CorruptSaveError);
  });

  it('surfaces SavePort write failure and never fabricates a successful save', async () => {
    const p = pkg('gal-a'); const error = new Error('storage offline');
    const failing: SavePort = {
      list: async () => [], read: async () => null, remove: async () => undefined,
      write: async () => { throw error; },
    };
    await expect(saveGalProfile(failing, p, createGalProfile(p), 50)).rejects.toBe(error);
    await expect(persistGalConfirmation(failing, p, 'load', false, 50)).rejects.toBe(error);
    await expect(saveGalProfile(failing, p, createGalProfile(p), Number.NaN)).rejects.toThrow(CorruptSaveError);
  });

  it('serializes concurrent preference writes for one package without dropping another switch', async () => {
    const p = pkg('gal-a'), port = new MemorySavePort();
    const [first, second] = await Promise.all([
      persistGalConfirmation(port, p, 'saveEmpty', false, 10),
      persistGalConfirmation(port, p, 'load', false, 11),
    ]);
    expect(first.preferences.confirmations.saveEmpty).toBe(false);
    expect(second.preferences.confirmations).toMatchObject({ saveEmpty: false, load: false, overwrite: true });
    expect((await loadGalProfile(port, p)).preferences.confirmations).toEqual(second.preferences.confirmations);
    expect((await port.read(galProfileSlot(p)))?.savedAt).toBe(11);
  });

  it('resets all current settings atomically while preserving read and unlock facts', async () => {
    const p = pkg('gal-reset'), port = new MemorySavePort();
    let changed = setGalPreferences(createGalProfile(p), p, {
      textSpeedMsPerChar: 90, autoDelayMs: 2000, skipMode: 'all',
      bgmVolume: 0.2, sfxVolume: 0.3, voiceVolume: 0.4, muted: true,
    });
    changed = setGalConfirmation(changed, p, 'load', false);
    changed = unlock(markRead(changed, p, ref('a', 'start')), p, 'cg', 'cg');
    expect(() => resetGalProfilePreferences(changed, pkg('other'))).toThrow(CorruptSaveError);
    await saveGalProfile(port, p, changed, 20);
    const reset = await persistGalPreferencesReset(port, p, 21);
    expect(reset.preferences).toEqual(createGalProfile(p).preferences);
    expect(reset.readNodeIds).toEqual(changed.readNodeIds);
    expect(reset.unlockedCgIds).toEqual(changed.unlockedCgIds);
    expect(await loadGalProfile(port, p)).toEqual(reset);
    expect((await port.read(galProfileSlot(p)))?.savedAt).toBe(21);
    expect(resetGalProfilePreferences(reset, p)).toBe(reset);
    await persistGalPreferencesReset(port, p, 22);
    expect((await port.read(galProfileSlot(p)))?.savedAt).toBe(21);
  });

  it('does not claim a reset after a failed write and can retry on the same lane', async () => {
    const p = pkg('gal-reset-failure'), port = new MemorySavePort();
    const changed = setGalConfirmation(createGalProfile(p), p, 'newGame', false);
    await saveGalProfile(port, p, changed, 30);
    const error = new Error('storage offline');
    const failing: SavePort = {
      list: () => port.list(), read: slot => port.read(slot), remove: slot => port.remove(slot),
      write: async () => { throw error; },
    };
    await expect(persistGalPreferencesReset(failing, p, 31)).rejects.toBe(error);
    expect((await loadGalProfile(port, p)).preferences.confirmations.newGame).toBe(false);
    const reset = await persistGalPreferencesReset(port, p, 32);
    expect(reset.preferences.confirmations.newGame).toBe(true);
    expect((await loadGalProfile(port, p)).preferences.confirmations.newGame).toBe(true);
  });

  it('serializes three existing audio fields without losing confirmations or unlocks and rejects bad inputs', async () => {
    const p = pkg('gal-audio-volume'), port = new MemorySavePort();
    await saveGalProfile(port, p, unlock(createGalProfile(p), p, 'cg', 'cg'), 10);
    await Promise.all([
      persistGalAudioVolume(port, p, 'bgmVolume', 0.2, 11),
      persistGalAudioVolume(port, p, 'voiceVolume', 0.3, 12),
      persistGalAudioVolume(port, p, 'sfxVolume', 0.4, 13),
      persistGalConfirmation(port, p, 'load', false, 14),
    ]);
    const actual = await loadGalProfile(port, p);
    expect(actual.preferences).toMatchObject({ bgmVolume: 0.2, voiceVolume: 0.3, sfxVolume: 0.4,
      confirmations: { load: false } });
    expect(actual.unlockedCgIds).toEqual(['cg']);
    expect((await loadGalProfile(port, pkg('other'))).preferences.bgmVolume).toBe(1);
    await expect(persistGalAudioVolume(port, p, 'muted' as never, 0, 15)).rejects.toThrow(CorruptSaveError);
    for (const value of [-1, 1.1, Number.NaN])
      await expect(persistGalAudioVolume(port, p, 'bgmVolume', value, 15)).rejects.toThrow(CorruptSaveError);
    expect(await loadGalProfile(port, p)).toEqual(actual);
  });

  it('keeps an externally held unlock after Director rollback and excludes it from WorldSnapshot', () => {
    const p = pkg('gal-a');
    const profile = unlock(createGalProfile(p), p, 'cg', 'cg');
    const world = worldWith(narrativeDirectorCapability);
    world.createEntity('story'); world.addComponent('story', { type: 'NarrativePackage', package: p });
    world.addComponent('story', createStoryRuntime(p));
    world.createEntity('input'); world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    world.tick();
    world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [{ source: 'test', phase: 'action', key: NARRATIVE_ADVANCE }] });
    world.tick();
    world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [{ source: 'test', phase: 'action', key: NARRATIVE_BACK }] });
    world.tick();
    expect(isUnlocked(profile, p, 'cg', 'cg')).toBe(true);
    expect(JSON.stringify(world.snapshot())).not.toContain('GalProfile');
    expect(JSON.stringify(world.getComponent('story','NarrativeHistory'))).not.toContain('GalProfile');
    expect(profile.readNodeIds).toEqual([]); // entering, loading and rollback do not mark read
  });
});
