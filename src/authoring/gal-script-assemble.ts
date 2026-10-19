/* AI START */
import type { GalPackage, PresentationDelta } from '@engine/protocol/galgame.js';

export interface GalArtPortraitApproval {
  readonly characterId: string;
  readonly emotion: string;
  readonly file: string;
  readonly assetKey: string;
  readonly neutral?: boolean;
}
export interface GalArtImageApproval {
  readonly id: string;
  readonly file: string;
  readonly assetKey: string;
  readonly title: string;
  readonly endingId?: string;
}
export interface GalArtApproval {
  readonly projectId: string;
  readonly portraits: readonly GalArtPortraitApproval[];
  readonly backgrounds: readonly GalArtImageApproval[];
  readonly cg: readonly GalArtImageApproval[];
  readonly omittedAudio?: readonly string[];
}
export interface GalScriptCandidate {
  readonly projectId: string;
  readonly locale: string;
  readonly entry: { readonly chapterId: string; readonly nodeId: string };
  readonly chapters: Readonly<Record<string, {
    readonly id: string;
    readonly title: Readonly<Record<string, string>>;
    readonly start: string;
    readonly nodes: Readonly<Record<string, Record<string, unknown>>>;
  }>>;
}

const NAMES: Readonly<Record<string, string>> = {
  mechanic: '机械师', prisoner: '囚徒', doctor: '医生', gardener: '园丁', 'factory-chief': '厂长',
};
const SCENE_BACKGROUND: Readonly<Record<string, string>> = {
  's-hall': 'bg-hall', 's-cipher': 'bg-cipher', 's-workshop': 'bg-workshop', 's-gate': 'bg-gate', 's-outside': 'bg-outside',
};

function text(locale: string, value: string): Readonly<Record<string, string>> {
  return { [locale]: value };
}

function presentation(raw: unknown, omitted: Set<string>): PresentationDelta | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const bgm = source.bgm;
  if (bgm && typeof bgm === 'object' && !Array.isArray(bgm) && typeof (bgm as { play?: unknown }).play === 'string')
    omitted.add((bgm as { play: string }).play);
  const next: Record<string, unknown> = {};
  for (const key of ['scene', 'background', 'cast', 'cg', 'transition'] as const)
    if (source[key] !== undefined) next[key] = source[key];
  return Object.keys(next).length ? next as PresentationDelta : undefined;
}

function nodeOf(raw: Record<string, unknown>, omitted: Set<string>): Record<string, unknown> {
  const presentationValue = presentation(raw.presentation, omitted);
  if (raw.kind === 'line') return {
    kind: 'line', ...(typeof raw.speaker === 'string' ? { speaker: raw.speaker } : {}), text: raw.text,
    ...(presentationValue ? { presentation: presentationValue } : {}), next: raw.next,
  };
  if (raw.kind === 'choice') return {
    kind: 'choice', ...(raw.prompt ? { prompt: raw.prompt } : {}),
    options: Array.isArray(raw.options) ? raw.options.map(option => {
      const item = option as Record<string, unknown>;
      return { id: item.id, text: item.text, ...(item.when ? { when: item.when } : {}),
        ...(item.effects ? { effects: item.effects } : {}), next: item.next };
    }) : [],
    ...(presentationValue ? { presentation: presentationValue } : {}),
  };
  if (raw.kind === 'ending') return {
    kind: 'ending', ending: raw.ending, ...(raw.text ? { text: raw.text } : {}),
    ...(presentationValue ? { presentation: presentationValue } : {}),
  };
  throw new Error(`GAL script assembler: unsupported node kind ${String(raw.kind)}`);
}

/** Approved line script plus confirmed image keys. Audio absent from the approval is omitted, not invented. */
export function assembleApprovedGalScript(script: GalScriptCandidate, approval: GalArtApproval): {
  readonly package: GalPackage; readonly omittedAudio: readonly string[];
} {
  if (script.projectId !== approval.projectId) throw new Error('GAL script assembler: project mismatch');
  const locale = script.locale;
  const omitted = new Set<string>(approval.omittedAudio ?? []);
  const characters: Record<string, unknown> = {};
  for (const characterId of Object.keys(NAMES)) {
    const rows = approval.portraits.filter(item => item.characterId === characterId);
    const neutral = rows.find(item => item.neutral) ?? rows[0];
    if (!neutral) throw new Error(`GAL script assembler: ${characterId} has no approved portrait`);
    characters[characterId] = {
      id: characterId, name: text(locale, NAMES[characterId]!),
      portraits: {
        neutral: neutral.assetKey,
        expressions: Object.fromEntries(rows.map(item => [item.emotion, item.assetKey])),
        fallback: 'neutral',
      },
      defaults: { side: characterId === 'prisoner' || characterId === 'factory-chief' ? 'right' : 'left', visible: false },
    };
  }
  const chapters: Record<string, unknown> = {};
  const sceneIds = new Set<string>();
  for (const [chapterId, chapter] of Object.entries(script.chapters)) {
    const nodes: Record<string, unknown> = {};
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      nodes[nodeId] = nodeOf(node, omitted);
      const scene = (node.presentation as { scene?: unknown } | undefined)?.scene;
      if (typeof scene === 'string') sceneIds.add(scene);
    }
    const firstScene = (chapter.nodes[chapter.start]?.presentation as { scene?: unknown } | undefined)?.scene;
    chapters[chapterId] = {
      id: chapter.id, title: chapter.title, ...(typeof firstScene === 'string' ? { scene: firstScene } : {}),
      start: chapter.start, nodes,
    };
  }
  const scenes = Object.fromEntries([...sceneIds].sort().map(id => [id, {
    id, ...(SCENE_BACKGROUND[id] ? { background: SCENE_BACKGROUND[id] } : {}), uiVariant: 'default',
  }]));
  const endings = {
    'end-leave': { title: text(locale, '一起离开') },
    'end-stay': { title: text(locale, '一起留下') },
  };
  const cg = Object.fromEntries(approval.cg.map(item => [item.id, {
    image: item.assetKey, title: text(locale, item.title),
    unlock: { kind: 'reach-ending', ending: item.endingId },
  }]));
  const leave = script.chapters['c-outside']?.nodes['n-end-leave'] ? { chapterId: 'c-outside', nodeId: 'n-end-leave' } : script.entry;
  const stay = script.chapters['c-belong']?.nodes['n-end-stay'] ? { chapterId: 'c-belong', nodeId: 'n-end-stay' } : script.entry;
  const pkg: GalPackage = {
    schemaVersion: 1, id: approval.projectId, title: text(locale, '庄园出逃'),
    defaultLocale: locale, locales: [locale], entry: script.entry,
    ui: { template: 'gal-template', titleBackground: 'bg-hall' },
    characters: characters as GalPackage['characters'],
    scenes: scenes as GalPackage['scenes'],
    chapters: chapters as GalPackage['chapters'],
    endings, gallery: { memories: {
      'memory-leave': { title: text(locale, '一起离开'), entry: leave, unlock: { kind: 'reach-ending', ending: 'end-leave' },
        ...(approval.cg.find(item => item.id === 'cg-outside') ? { previewImage: approval.cg.find(item => item.id === 'cg-outside')!.assetKey } : {}) },
      'memory-stay': { title: text(locale, '一起留下'), entry: stay, unlock: { kind: 'reach-ending', ending: 'end-stay' },
        ...(approval.cg.find(item => item.id === 'cg-belong') ? { previewImage: approval.cg.find(item => item.id === 'cg-belong')!.assetKey } : {}) },
    }, music: {} },
    media: {
      backgrounds: Object.fromEntries(approval.backgrounds.map(item => [item.id, { image: item.assetKey, title: text(locale, item.title) }])),
      cg: cg as GalPackage['media']['cg'],
      audio: { bgm: {}, sfx: {}, voice: {} }, video: {},
    },
    preferences: { textSpeedMsPerChar: 30, autoDelayMs: 800, skipMode: 'read-only', bgmVolume: 0.8, sfxVolume: 0.8, voiceVolume: 0.8, muted: false },
  };
  return { package: pkg, omittedAudio: [...omitted].sort() };
}
/* AI END */
