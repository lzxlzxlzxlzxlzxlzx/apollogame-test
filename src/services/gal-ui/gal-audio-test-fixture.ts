import type { GalPackage } from '@engine/protocol/galgame.js';

const L = (value: string) => ({ 'zh-CN': value });
const ref = (nodeId: string) => ({ chapterId: 'a', nodeId });
/** Original, asset-free authoring fixture used only by audio tests and static browser acceptance. */
export function galAudioTestPackage(): GalPackage { return {
  schemaVersion: 1, id: 'gal-audio-test', title: L('音频验收'), defaultLocale: 'zh-CN', locales: ['zh-CN'],
  entry: ref('one'), ui: { template: 'gal-template' },
  characters: { aya: { id: 'aya', name: L('澪'), portraits: {
    neutral: 'art:portrait', expressions: {}, fallback: 'silhouette' } } },
  scenes: { night: { id: 'night', ambience: { bgm: 'theme' } } },
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 0.8, voiceVolume: 0.7, sfxVolume: 0.6, muted: false },
  media: { backgrounds: {}, cg: {}, audio: {
    bgm: { theme: { asset: 'audio:theme', loop: true, defaultVolume: 0.5 } },
    voice: { first: { charId: 'aya', asset: 'audio:first' }, second: { charId: 'aya', asset: 'audio:second' } },
    sfx: { bell: { asset: 'audio:bell' }, synth: { synth: { partials: [{ freq: 440, dur: 0.1 }] } } },
  }, video: {} },
  gallery: { memories: { memory: { title: L('声音回想'), entry: ref('one'), unlock: { kind: 'explicit' } } }, music: {} },
  endings: { end: { title: L('结束') } },
  chapters: { a: { id: 'a', title: L('第一章'), start: 'one', scene: 'night', nodes: {
    one: { kind: 'line', speaker: 'aya', text: L('第一句：听见钟声了吗？'), voice: 'first',
      presentation: { sfx: ['bell'] }, next: ref('two') },
    two: { kind: 'line', speaker: 'aya', text: L('第二句：月光仍然安静。'), voice: 'second', next: ref('end') },
    end: { kind: 'ending', ending: 'end', text: L('声音验收结束') },
  } } },
}; }
export const galAudioTestUrls = { 'audio:theme': '/theme.wav', 'audio:first': '/first.wav',
  'audio:second': '/second.wav', 'audio:bell': '/bell.wav' };
export const galAudioTestInitial = { schema: 1 as const, entities: { random: { RandomSeed: { seed: 12345, sequence: 0 } } } };
