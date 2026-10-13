// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createGalWorld } from '../../assembly/gal-world.js';
import { NullAudioPort } from '../audio/null-audio.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
import { loadGalProfile, saveGalProfile, unlock } from '../gal-profile/gal-profile.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { hashWithOrder } from '@net/determinism.js';
import { GalSliceHost } from './gal-ui-slice-host.js';
import { galAudioTestPackage, galAudioTestUrls, galAudioTestInitial } from './gal-audio-test-fixture.js';

async function fixture(profile = new MemorySavePort()) {
  const pkg = galAudioTestPackage(), { world, storyEntity } = createGalWorld(pkg, galAudioTestInitial);
  const audio = { bgm: new NullAudioPort(), voice: new NullAudioPort(), sfx: new NullAudioPort() };
  const manual = new MemoryStoragePort();
  const host = await GalSliceHost.create(pkg, world, storyEntity,
    { profile, manual, savedAt: () => 100, contentUrls: galAudioTestUrls, audio });
  return { pkg, world, host, audio, profile, manual };
}
const played = (port: NullAudioPort) => port.log.filter(event => event.op === 'play').map(event => event.clipId);

describe('GAL file audio and existing volume controls', () => {
  it('plays once per visible entry, survives ack without repeating, and interrupts on rollback', async () => {
    const { host, audio } = await fixture();
    expect(played(audio.bgm)).toEqual([]);
    await host.dispatch('gal.home.start');
    expect(played(audio.bgm)).toEqual(['theme']);
    expect(played(audio.voice)).toEqual(['first']);
    expect(played(audio.sfx)).toEqual(['bell']);
    await host.fullyPresented(host.presentationToken()!);
    expect(played(audio.voice)).toEqual(['first']);
    await host.dispatch('narrative.advance');
    expect(played(audio.voice)).toEqual(['first', 'second']);
    expect(played(audio.sfx)).toEqual(['bell']);
    await host.dispatch('narrative.back');
    expect(played(audio.voice)).toEqual(['first', 'second', 'first']);
    expect(played(audio.sfx)).toEqual(['bell', 'bell']);
    expect(played(audio.bgm)).toEqual(['theme']);
    await host.dispatch('gal.story.home'); await host.dispatch('gal.confirm.accept');
    expect(audio.bgm.playing.size).toBe(0);
    expect(audio.voice.playing.size).toBe(0);
  });

  it('persists three sliders, restores failed native edits, and keeps unrelated controls disabled', async () => {
    class FailingProfile extends MemorySavePort {
      fail = false;
      override async write(...args: Parameters<MemorySavePort['write']>): Promise<void> {
        if (this.fail) throw new Error('offline');
        return super.write(...args);
      }
    }
    const profile = new FailingProfile(), { pkg, host, audio } = await fixture(profile);
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.settings.open'); await host.dispatch('gal.settings.tab', 'audio');
    expect(audio.voice.playing.size).toBe(0);
    expect(audio.bgm.playing.has('theme')).toBe(true);
    expect(validateLayoutNode(host.tree)).toEqual([]);
    for (const [action, value] of [['bgm', '25'], ['voice', '35'], ['sfx', '45']])
      await host.dispatch(`gal.settings.${action}-volume`, value);
    expect([audio.bgm.masterVolume, audio.voice.masterVolume, audio.sfx.masterVolume]).toEqual([0.125, 0.35, 0.45]);
    expect((await loadGalProfile(profile, pkg)).preferences).toMatchObject({ bgmVolume: 0.25, voiceVolume: 0.35, sfxVolume: 0.45 });
    const revision = host.uiState.settingsRenderRevision;
    profile.fail = true;
    await host.dispatch('gal.settings.bgm-volume', '90');
    expect(host.view.preferences.bgmVolume).toBe(0.25);
    expect(audio.bgm.masterVolume).toBe(0.125);
    expect(host.uiState.settingsRenderRevision).toBe(revision + 1);
    expect(host.uiState.feedback).toContain('设置保存失败');
    profile.fail = false;
    for (const invalid of ['101', '-1', '0.5', 'NaN', '']) await host.dispatch('gal.settings.bgm-volume', invalid);
    await host.dispatch('gal.settings.tab', 'text');
    await host.dispatch('gal.settings.bgm-volume', '90');
    expect((await loadGalProfile(profile, pkg)).preferences.bgmVolume).toBe(0.25);
    expect(JSON.stringify(host.tree)).toContain('恢复默认（待接入）');
  });

  it('persists master and focus settings, mutes BGM on blur and restores without replay', async () => {
    const { host, audio, profile, pkg } = await fixture();
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.settings.open'); await host.dispatch('gal.settings.tab', 'audio');
    await host.dispatch('gal.settings.master-volume', '40');
    await host.dispatch('gal.settings.focus-mute', 'true');
    expect((await loadGalProfile(profile, pkg)).preferences).toMatchObject({ masterVolume: 0.4, focusMute: true });
    expect(audio.bgm.masterVolume).toBeCloseTo(0.16);
    const element = document.createElement('div'); document.body.append(element);
    const detach = host.attach(element);
    window.dispatchEvent(new Event('blur'));
    expect(audio.bgm.masterVolume).toBe(0);
    window.dispatchEvent(new Event('focus'));
    expect(audio.bgm.masterVolume).toBeCloseTo(0.16);
    expect(played(audio.bgm)).toEqual(['theme']);
    detach(); element.remove();
    expect(audio.bgm.playing.size).toBe(0);
  });

  it('keeps voice replay available when auto voice is off without advancing or marking text read', async () => {
    const { host, audio, profile, pkg, world } = await fixture();
    await host.dispatch('gal.settings.open'); await host.dispatch('gal.settings.tab', 'audio');
    await host.dispatch('gal.settings.voice-auto', 'false');
    expect((await loadGalProfile(profile, pkg)).preferences.voiceAuto).toBe(false);
    await host.dispatch('gal.settings.back'); await host.dispatch('gal.home.start');
    expect(played(audio.voice)).toEqual([]);
    expect(played(audio.bgm)).toEqual(['theme']);
    const before = hashWithOrder(world.snapshot(), world.snapshotOrder());
    expect(JSON.stringify(host.tree)).toContain('gal-story-voice-replay');
    await host.dispatch('gal.story.voice-replay'); await host.dispatch('gal.story.voice-replay');
    expect(played(audio.voice)).toEqual(['first', 'first']);
    expect(hashWithOrder(world.snapshot(), world.snapshotOrder())).toBe(before);
    expect((await loadGalProfile(profile, pkg)).readNodeIds).toEqual([]);
    await host.dispatch('narrative.advance');
    expect(played(audio.voice)).toEqual(['first', 'first']);
    await host.dispatch('gal.story.voice-replay');
    expect(played(audio.voice)).toEqual(['first', 'first', 'second']);
  });

  it('previews from title settings and replays the same line only after a successful load', async () => {
    const { host, audio } = await fixture();
    await host.dispatch('gal.settings.open'); await host.dispatch('gal.settings.tab', 'audio');
    await host.dispatch('gal.settings.audio-preview');
    expect(audio.sfx.playing.has('bell')).toBe(true);
    expect(audio.bgm.playing.size).toBe(0);
    await host.dispatch('gal.settings.back');
    expect(audio.sfx.playing.size).toBe(0);
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.save'); await host.dispatch('gal.slot.select', '1');
    await host.dispatch('gal.slot.commit'); await host.dispatch('gal.confirm.accept');
    await host.dispatch('gal.slot.mode', 'load');
    await host.dispatch('gal.slot.select', '1');
    await host.dispatch('gal.slot.commit'); await host.dispatch('gal.confirm.accept');
    expect(host.uiState.page).toBe('story');
    expect(played(audio.voice)).toEqual(['first', 'first']);
    expect(played(audio.bgm)).toEqual(['theme', 'theme']);
  });

  it('isolates replay audio and leaves the active World and Profile intact', async () => {
    const { host, pkg, profile, world, audio } = await fixture();
    await host.dispatch('gal.home.start'); await host.dispatch('narrative.advance');
    await saveGalProfile(profile, pkg, unlock(await loadGalProfile(profile, pkg), pkg, 'memory', 'memory'), 101);
    await host.refreshView();
    await host.dispatch('gal.settings.open'); await host.dispatch('gal.settings.nav', 'gallery');
    const hash = hashWithOrder(world.snapshot(), world.snapshotOrder());
    const saved = JSON.stringify(await loadGalProfile(profile, pkg));
    await host.dispatch('gal.gallery.play-memory', 'memory');
    expect(played(audio.voice).at(-1)).toBe('first');
    await host.dispatch('narrative.advance'); expect(played(audio.voice).at(-1)).toBe('second');
    await host.dispatch('gal.replay.exit');
    expect(host.uiState.page).toBe('gallery');
    expect(audio.voice.playing.size).toBe(0);
    expect(hashWithOrder(world.snapshot(), world.snapshotOrder())).toBe(hash);
    expect(JSON.stringify(await loadGalProfile(profile, pkg))).toBe(saved);
  });
});
