import { describe, expect, it } from 'vitest';
import { createGalWorld } from '../../assembly/gal-world.js';
import { NullAudioPort } from '../audio/null-audio.js';
import { createGalProfile } from '../gal-profile/gal-profile.js';
import type { NarrativeProjection } from '@skills/tier3/narrative-director.js';
import { GalAudioCoordinator, type GalAudioFrame } from './gal-audio-coordinator.js';
import { galAudioTestPackage, galAudioTestUrls, galAudioTestInitial } from './gal-audio-test-fixture.js';

function fixture() {
  const pkg = galAudioTestPackage();
  const { world, storyEntity } = createGalWorld(pkg, galAudioTestInitial);
  const ports = { bgm: new NullAudioPort(), voice: new NullAudioPort(), sfx: new NullAudioPort(), synthSfx: new NullAudioPort() };
  const coordinator = new GalAudioCoordinator(pkg, galAudioTestUrls, ports);
  const projection = world.peek<NarrativeProjection>(storyEntity, 'NarrativeProjection')!;
  const frame: GalAudioFrame = { projection, entry: 1, hasSession: true, storyVisible: true,
    preferences: createGalProfile(pkg).preferences };
  return { pkg, ports, coordinator, frame };
}
const plays = (port: NullAudioPort) => port.log.filter(event => event.op === 'play');

describe('GAL audio projection consumer', () => {
  it('deduplicates redraws, keeps BGM, and never repeats inherited SFX on the next line', () => {
    const { coordinator, frame, ports } = fixture();
    coordinator.sync(frame); coordinator.sync(frame);
    expect(plays(ports.bgm)).toHaveLength(1);
    expect(plays(ports.voice)).toEqual([{ op: 'play', clipId: 'first' }]);
    expect(plays(ports.sfx)).toEqual([{ op: 'play', clipId: 'bell' }]);
    coordinator.sync({ ...frame, entry: 2, projection: { ...frame.projection, nodeId: 'two',
      voiceId: 'second', voiceAssetKey: 'audio:second' } });
    expect(plays(ports.bgm)).toHaveLength(1);
    expect(plays(ports.voice).map(event => event.clipId)).toEqual(['first', 'second']);
    expect(plays(ports.sfx)).toHaveLength(1);
    expect(ports.voice.log.some(event => event.op === 'stopAll')).toBe(true);
  });

  it('updates independent gains and stops voice on an overlay without replaying on return', () => {
    const { coordinator, frame, ports } = fixture();
    coordinator.sync(frame);
    coordinator.sync({ ...frame, storyVisible: false });
    expect(ports.bgm.playing.has('theme')).toBe(true);
    expect(ports.voice.playing.size).toBe(0);
    coordinator.sync({ ...frame, preferences: { ...frame.preferences, bgmVolume: 0.2, voiceVolume: 0.3, sfxVolume: 0.4 } });
    expect([ports.bgm.masterVolume, ports.voice.masterVolume, ports.sfx.masterVolume]).toEqual([0.1, 0.3, 0.4]);
    expect(plays(ports.voice)).toHaveLength(1);
    coordinator.sync({ ...frame, preferences: { ...frame.preferences, muted: true } });
    expect([ports.bgm.masterVolume, ports.voice.masterVolume, ports.sfx.masterVolume]).toEqual([0, 0, 0]);
    coordinator.sync({ ...frame, hasSession: false });
    expect(ports.bgm.playing.size).toBe(0);
  });

  it('allows explicit same-ref re-entry and keeps settings previews alive until the page closes', () => {
    const { coordinator, frame, ports } = fixture();
    coordinator.sync(frame); coordinator.reset();
    coordinator.sync({ ...frame, entry: 2 });
    expect(plays(ports.voice)).toHaveLength(2);
    coordinator.reset();
    expect(coordinator.preview(frame.preferences)).toBe(true);
    coordinator.sync({ ...frame, hasSession: false, storyVisible: false, previewVisible: true });
    expect(ports.sfx.playing.has('bell')).toBe(true);
    expect(ports.bgm.playing.size).toBe(0);
    coordinator.sync({ ...frame, hasSession: false, storyVisible: false });
    expect(ports.sfx.playing.size).toBe(0);
  });

  it('reports missing assets consistently, rejects foreign frames, and contains backend exceptions', () => {
    const { pkg, ports, frame } = fixture();
    const coordinator = new GalAudioCoordinator(pkg, {}, ports);
    expect(coordinator.sync(frame).unavailable).toEqual(['bgm:theme', 'voice:first', 'sfx:bell']);
    expect(coordinator.sync(frame).unavailable).toEqual(['bgm:theme', 'voice:first', 'sfx:bell']);
    expect(coordinator.sync({ ...frame, projection: { ...frame.projection, packageId: 'foreign' } }).status).toBe('rejected');
    const failing = new NullAudioPort(); failing.play = () => { throw new Error('audio device failed'); };
    const broken = new GalAudioCoordinator(pkg, galAudioTestUrls, { ...ports, bgm: failing });
    expect(broken.sync(frame)).toMatchObject({ status: 'rejected', error: expect.stringContaining('audio device failed') });
    expect(() => new GalAudioCoordinator(pkg, galAudioTestUrls, { bgm: failing, voice: failing, sfx: ports.sfx })).toThrow('independent');
  });

  it('honors scene gain overrides without restarting an unchanged BGM', () => {
    const { pkg, frame, ports } = fixture();
    const tuned = { ...pkg, scenes: { night: { ...pkg.scenes.night, ambience: { bgm: 'theme', volume: 0.25 } } } };
    const coordinator = new GalAudioCoordinator(tuned, galAudioTestUrls, ports);
    coordinator.sync(frame);
    expect(ports.bgm.masterVolume).toBe(0.2);
    coordinator.sync({ ...frame, projection: { ...frame.projection, sceneId: undefined } });
    expect(ports.bgm.masterVolume).toBe(0.4);
    expect(plays(ports.bgm)).toHaveLength(1);
  });

  it('multiplies master gain and restores focus-mute without restarting the track', () => {
    const { coordinator, frame, ports } = fixture();
    const preferences = { ...frame.preferences, masterVolume: 0.5, focusMute: true };
    coordinator.sync({ ...frame, preferences, focused: true });
    expect([ports.bgm.masterVolume, ports.voice.masterVolume, ports.sfx.masterVolume]).toEqual([0.2, 0.35, 0.3]);
    coordinator.sync({ ...frame, preferences, focused: false });
    expect([ports.bgm.masterVolume, ports.voice.masterVolume, ports.sfx.masterVolume]).toEqual([0, 0, 0]);
    coordinator.sync({ ...frame, preferences, focused: true });
    expect(ports.bgm.masterVolume).toBe(0.2);
    expect(plays(ports.bgm)).toHaveLength(1);
  });

  it('leaves BGM and SFX active when auto voice is off, and manually replays only the current line', () => {
    const { coordinator, frame, ports } = fixture();
    const manual = { ...frame, preferences: { ...frame.preferences, voiceAuto: false } };
    coordinator.sync(manual);
    expect(plays(ports.bgm)).toHaveLength(1);
    expect(plays(ports.sfx)).toHaveLength(1);
    expect(plays(ports.voice)).toHaveLength(0);
    expect(coordinator.canReplayVoice(manual)).toBe(true);
    expect(coordinator.replayVoice(manual)).toBe(true);
    expect(coordinator.replayVoice(manual)).toBe(true);
    expect(plays(ports.voice).map(row => row.clipId)).toEqual(['first', 'first']);
    expect(coordinator.replayVoice({ ...manual, entry: 2 })).toBe(false);
    expect(coordinator.replayVoice({ ...manual, storyVisible: false })).toBe(false);
    expect(coordinator.replayVoice({ ...manual, projection: { ...manual.projection, nodeId: 'two' } })).toBe(false);
    expect(plays(ports.voice)).toHaveLength(2);
  });
});
