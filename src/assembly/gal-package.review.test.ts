import { describe, expect, it } from 'vitest';
import { validateGalPackage } from './gal-package.js';

const valid = () => ({
  schemaVersion: 1,
  id: 'review',
  title: { 'zh-CN': '复查' },
  defaultLocale: 'zh-CN',
  locales: ['zh-CN'],
  ui: { template: 'gal-template' },
  characters: {},
  scenes: {},
  gallery: { memories: {}, music: {} },
  media: { backgrounds: {}, cg: {}, audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  preferences: { textSpeedMsPerChar: 0, autoDelayMs: 0, skipMode: 'read-only', bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
  entry: { chapterId: 'main', nodeId: 'end' },
  chapters: {
    main: {
      id: 'main',
      title: { 'zh-CN': '第一章' },
      start: 'end',
      nodes: { end: { kind: 'ending', ending: 'done' } },
    },
  },
  endings: { done: { title: { 'zh-CN': '完结' } } },
});

describe('GAL-ENG-01 independent review', () => {
  it('reports missing locales without throwing', () => {
    const input: Record<string, unknown> = valid();
    delete input.locales;
    expect(() => validateGalPackage(input)).not.toThrow();
    expect(validateGalPackage(input).issues.some(issue => issue.path === '$.locales')).toBe(true);
  });

  it('rejects missing required chapter and ending catalogs', () => {
    for (const field of ['chapters', 'endings']) {
      const input: Record<string, unknown> = valid();
      delete input[field];
      const report = validateGalPackage(input);
      expect(report.ok).toBe(false);
      expect(report.issues.some(issue => issue.path === `$.${field}`)).toBe(true);
    }
  });

  it('rejects malformed media catalogs', () => {
    for (const media of [42, { bg: 'bg:room' }]) {
      const input: Record<string, unknown> = { ...valid(), media };
      const report = validateGalPackage(input, { resolveAsset: () => true });
      expect(report.ok).toBe(false);
      expect(report.issues.some(issue => issue.path.startsWith('$.media'))).toBe(true);
    }
  });

  it('reports duplicate option ids and a forced story loop', () => {
    const input: any = valid();
    input.chapters.main.nodes.end = {
      kind: 'choice',
      options: [
        { id: 'again', text: { 'zh-CN': '继续' }, next: { chapterId: 'main', nodeId: 'end' } },
        { id: 'again', text: { 'zh-CN': '再来' }, next: { chapterId: 'main', nodeId: 'end' } },
      ],
    };
    const report = validateGalPackage(input);
    expect(report.issues.some(issue => issue.code === 'duplicate' && issue.path.endsWith('options[1].id'))).toBe(true);
    expect(report.issues.some(issue => issue.code === 'loop' && issue.severity === 'error')).toBe(true);
  });

  it('checks presentation cast and unlock-memory references', () => {
    const input: any = valid();
    input.chapters.main.nodes.end.presentation = { cast: { missing: { visible: true } } };
    input.chapters.main.nodes.end.enter = [{ kind: 'unlockMemory', id: 'missing' }];
    const report = validateGalPackage(input);
    expect(report.issues.some(issue => issue.path.includes('presentation.cast.missing'))).toBe(true);
    expect(report.issues.some(issue => issue.path.endsWith('enter[0].id'))).toBe(true);
  });

  it('rejects absolute media URLs even without an injected asset resolver', () => {
    const input: any = valid();
    input.media.backgrounds.room = { image: 'https://example.test/background.png' };
    const report = validateGalPackage(input);
    expect(report.issues.some(issue => issue.path === '$.media.backgrounds.room.image')).toBe(true);
  });

  it('validates character voice, synth SFX, and both cast forms', () => {
    const input: any = valid();
    input.characters.hero = {
      id: 'hero', name: { 'zh-CN': '主角' },
      portraits: { neutral: 'art:hero', expressions: {}, fallback: 'neutral' },
      voice: { characterId: 'hero', tts: { rate: 'fast' }, freeScript: 'run' },
    };
    input.media.audio.sfx.click = { synth: { nonsense: true } };
    input.scenes.room = { id: 'room', cast: { hero: { visible: true, emotion: 'missing' } } };
    input.chapters.main.nodes.end.presentation = {
      cast: { hero: { visible: 'yes', side: 'up', zOrder: 'front', motion: 'teleport' } },
    };
    const paths = validateGalPackage(input).issues.map(issue => issue.path);
    expect(paths).toContain('$.characters.hero.voice.freeScript');
    expect(paths).toContain('$.characters.hero.voice.tts.rate');
    expect(paths).toContain('$.media.audio.sfx.click.synth');
    expect(paths).toContain('$.scenes.room.cast.hero.emotion');
    expect(paths).toContain('$.chapters.main.nodes.end.presentation.cast.hero.visible');
    expect(paths).toContain('$.chapters.main.nodes.end.presentation.cast.hero.side');
    expect(paths).toContain('$.chapters.main.nodes.end.presentation.cast.hero.zOrder');
    expect(paths).toContain('$.chapters.main.nodes.end.presentation.cast.hero.motion');
  });

  it('enforces discriminated closed fields and unambiguous story ids', () => {
    const input: any = valid();
    input.chapters.main.nodes.end.options = [];
    input.media.cg.first = {
      image: 'art:cg', title: { 'zh-CN': 'CG' }, unlock: { kind: 'explicit', ending: 'done' },
    };
    input.chapters['main/extra'] = {
      id: 'main/extra', title: { 'zh-CN': '额外章' }, start: 'end',
      nodes: { end: { kind: 'ending', ending: 'done' } },
    };
    const paths = validateGalPackage(input).issues.map(issue => issue.path);
    expect(paths).toContain('$.chapters.main.nodes.end.options');
    expect(paths).toContain('$.media.cg.first.unlock.ending');
    expect(paths).toContain('$.chapters.main/extra.id');
  });

  it('validates complete media and voice payloads, not only their outer shape', () => {
    const input: any = valid();
    input.characters.hero = {
      id: 'hero', name: { 'zh-CN': '主角' },
      portraits: { neutral: 'art:hero', expressions: {}, fallback: 'neutral' },
      voice: { characterId: 42, tts: { lang: 5, voiceHint: false } },
    };
    input.media.audio.bgm.theme = { asset: 'audio:theme', loop: true, defaultVolume: 3 };
    input.media.audio.sfx.click = {
      asset: 'https://example.test/click.wav',
      synth: { partials: [{ wave: 'laser', freq: -10, gain: 5, extra: true }], gain: -1 },
    };
    const paths = validateGalPackage(input).issues.map(issue => issue.path);
    for (const path of [
      '$.characters.hero.voice.characterId',
      '$.characters.hero.voice.tts.lang',
      '$.characters.hero.voice.tts.voiceHint',
      '$.media.audio.bgm.theme.defaultVolume',
      '$.media.audio.sfx.click.asset',
      '$.media.audio.sfx.click.synth.gain',
      '$.media.audio.sfx.click.synth.partials[0].wave',
      '$.media.audio.sfx.click.synth.partials[0].freq',
      '$.media.audio.sfx.click.synth.partials[0].gain',
      '$.media.audio.sfx.click.synth.partials[0].extra',
    ]) expect(paths).toContain(path);
  });

  it('rejects branch-only fields on other node kinds and effect variants', () => {
    const input: any = valid();
    input.chapters.main.nodes.end = {
      kind: 'line', text: { 'zh-CN': '一句话' }, next: null,
      ending: 'done', options: [],
      enter: [{ kind: 'unlockCg', id: 'first', op: 'add', value: 7 }],
    };
    input.media.cg.first = {
      image: 'art:cg', title: { 'zh-CN': 'CG' }, unlock: { kind: 'explicit' },
    };
    const paths = validateGalPackage(input).issues.map(issue => issue.path);
    expect(paths).toContain('$.chapters.main.nodes.end.ending');
    expect(paths).toContain('$.chapters.main.nodes.end.options');
    expect(paths).toContain('$.chapters.main.nodes.end.enter[0].op');
    expect(paths).toContain('$.chapters.main.nodes.end.enter[0].value');
  });
});
