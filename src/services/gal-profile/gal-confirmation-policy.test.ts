import { describe, expect, it } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { createGalProfile, setGalConfirmation } from './gal-profile.js';
import { requiresGalConfirmation } from './gal-confirmation-policy.js';

const pkg: GalPackage = { schemaVersion: 1, id: 'policy', title: { 'zh-CN': '政策' },
  locales: ['zh-CN'], defaultLocale: 'zh-CN', entry: { chapterId: 'a', nodeId: 'start' },
  ui: { template: 'gal-template' }, characters: {}, scenes: {},
  chapters: { a: { id: 'a', title: { 'zh-CN': '章' }, start: 'start', nodes: {
    start: { kind: 'ending', ending: 'end', text: { 'zh-CN': '完' } },
  } } }, endings: { end: { title: { 'zh-CN': '完' } } },
  gallery: { memories: {}, music: {} },
  media: { backgrounds: {}, cg: {}, audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false } };

describe('GAL-ENG-05A single confirmation policy', () => {
  it('asks each valid operation by its own default-on switch, never by another switch', () => {
    const original = createGalProfile(pkg);
    const cases = [
      ['saveEmpty', { slotFilled: false }], ['overwrite', { slotFilled: true }],
      ['load', { slotReadable: true }], ['newGame', { hasProgress: true }],
      ['returnTitle', {}], ['exitGame', {}],
    ] as const;
    for (const [kind, context] of cases) {
      expect(requiresGalConfirmation(kind, original.preferences, context)).toBe(true);
      const disabled = setGalConfirmation(original, pkg, kind, false);
      expect(requiresGalConfirmation(kind, disabled.preferences, context)).toBe(false);
      for (const [other, otherContext] of cases)
        if (other !== kind) expect(requiresGalConfirmation(other, disabled.preferences, otherContext)).toBe(true);
    }
  });

  it('never prompts for an inapplicable slot or no-progress new game', () => {
    const preferences = createGalProfile(pkg).preferences;
    expect(requiresGalConfirmation('saveEmpty', preferences, { slotFilled: true })).toBe(false);
    expect(requiresGalConfirmation('saveEmpty', preferences)).toBe(false);
    expect(requiresGalConfirmation('overwrite', preferences, { slotFilled: false })).toBe(false);
    expect(requiresGalConfirmation('load', preferences, { slotReadable: false })).toBe(false);
    expect(requiresGalConfirmation('load', preferences)).toBe(false);
    expect(requiresGalConfirmation('newGame', preferences, { hasProgress: false })).toBe(false);
    expect(requiresGalConfirmation('newGame', preferences)).toBe(false);
  });
});
