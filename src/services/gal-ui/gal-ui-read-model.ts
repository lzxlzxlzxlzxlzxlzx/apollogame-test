import type { GalPackage, LocalizedText, StoryRef } from '@engine/protocol/galgame.js';
import type { NarrativeProjection } from '@skills/tier3/narrative-director.js';
import { storyRefKey } from '@skills/tier3/narrative-director.js';
import type { readNarrativeHistory } from '@skills/tier3/narrative-director.js';
import { cmpStr } from '@engine/math/scalar.js';
import { parseGalProfile, type GalProfile, type GalProfilePreferences } from '../gal-profile/gal-profile.js';
import type { GalManualSlot } from '../gal-save/gal-manual-save.js';
import { parseGalPreviewRecord, type GalPreviewResult } from '../gal-save/gal-save-preview.js';
import type { UIDataSource, UIListItem } from '@ui/components/bindings.js';

export const GAL_UI_SLOTS_PER_PAGE = 12;
export const GAL_UI_SLOT_COLUMNS = 4;
export const GAL_UI_SLOT_ROWS = 3;

export interface GalUiChoice {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
}
export interface GalUiSlot {
  readonly number: number;
  readonly filled: boolean;
  readonly canLoad: boolean;
  readonly label: string | null;
  readonly tick: number | null;
  readonly timestamp: number | null;
  readonly preview: 'empty' | 'no-preview' | 'ready' | 'damaged' | 'unavailable' | 'invalid-save';
  readonly previewSrc?: string;
}
export interface GalUiHistoryRow {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly current: boolean;
}
export interface GalUiGalleryCard {
  readonly id: string;
  readonly title: string;
  readonly unlocked: boolean;
  /** No asset key is exposed by this S4 model, including for locked cards. */
  readonly preview: 'no-asset' | 'locked';
  /** Only an unlocked card may expose its package-declared content asset key. */
  readonly assetKey?: string;
}
export interface GalUiReadModel {
  readonly packageId: string;
  readonly locale: string;
  readonly title: string;
  /** Detached, validated cross-slot settings; never exposes a SavePort to LayoutNode. */
  readonly preferences: GalProfilePreferences;
  readonly home: Readonly<{ canStart: true; canContinue: boolean; canLoad: boolean }>;
  readonly story: Readonly<{
    ref: StoryRef;
    refKey: string;
    kind: NarrativeProjection['kind'];
    chapterTitle: string;
    speaker: string | null;
    text: string | null;
    read: boolean;
    choices: readonly GalUiChoice[];
    backgroundAssetKey?: string;
    portraitAssetKey?: string;
  }>;
  readonly manual: Readonly<{
    page: number;
    pageCount: number;
    slotsPerPage: 12;
    columns: 4;
    rows: 3;
    slots: readonly GalUiSlot[];
  }>;
  readonly history: Readonly<{ cursor: number; windowSize: number; rows: readonly GalUiHistoryRow[] }>;
  readonly gallery: Readonly<{ cg: readonly GalUiGalleryCard[]; memories: readonly GalUiGalleryCard[] }>;
}

export interface GalUiReadInput {
  readonly pkg: GalPackage;
  readonly projection: NarrativeProjection;
  readonly profile: GalProfile;
  readonly locale: string;
  /** Host-confirmed active-session resume point; profile read history is not a resume point. */
  readonly hasActiveResume: boolean;
  /** Result of GalManualSaveController.list() for this package. Never read StoragePort here. */
  readonly manualSlots: readonly GalManualSlot[];
  /** Already authority-checked sidecars; never grants loadability or progress by itself. */
  readonly previews?: ReadonlyMap<number, GalPreviewResult>;
  readonly page: number;
  /** V2 displays 24 cells; higher numbered actual saves extend the UI, not truncate it. */
  readonly minimumSlotCount?: number;
  /** Detached, presentation-only window returned by readNarrativeHistory. */
  readonly history?: NonNullable<ReturnType<typeof readNarrativeHistory>>;
}

function invalid(what: string): never { throw new TypeError(`GAL UI read model: ${what}`); }

function localized(text: LocalizedText | undefined, locale: string, what: string): string | null {
  if (text === undefined) return null;
  const value = text[locale];
  if (typeof value !== 'string') invalid(`${what} missing locale ${locale}`);
  return value;
}

function expectedSlot(pkg: GalPackage, number: number): string {
  // Mirrors GalManualSaveController.slot(number); fail closed on any foreign/corrupt listing.
  return `zerocraft.gal-manual.v1.${encodeURIComponent(pkg.id).replace(/\./g, '%2E')}.${number}`;
}

/** Pure host-side projection. Only a validated bounded raster data URL may leave as previewSrc. */
export function buildGalUiReadModel(input: GalUiReadInput): GalUiReadModel {
  const { pkg, projection, profile, locale, manualSlots, page, hasActiveResume } = input;
  if (typeof hasActiveResume !== 'boolean') invalid('hasActiveResume invalid');
  if (pkg.schemaVersion !== 1 || !pkg.id || !pkg.locales.includes(locale)) invalid('package or locale invalid');
  if (projection.type !== 'NarrativeProjection' || projection.packageId !== pkg.id || profile.packageId !== pkg.id)
    invalid('package mismatch');
  const chapter = pkg.chapters[projection.chapterId];
  const node = chapter?.nodes[projection.nodeId];
  if (!chapter || !node || node.kind === 'jump' || node.kind !== projection.kind) invalid('current StoryRef invalid');
  const canonicalProfile = parseGalProfile(profile, pkg);
  const ref = { chapterId: projection.chapterId, nodeId: projection.nodeId };
  const refKey = storyRefKey(ref);
  const options = projection.options ?? [];
  if (node.kind === 'choice') {
    if (!Array.isArray(projection.options) || options.length !== node.options.length) invalid('choice projection invalid');
  } else if (options.length !== 0) invalid('options on non-choice node');
  const choiceIds = new Set<string>();
  const choices: GalUiChoice[] = options.map((option, index) => {
    if (typeof option?.id !== 'string' || !option.id || choiceIds.has(option.id) ||
        option.id !== (node.kind === 'choice' ? node.options[index]?.id : undefined) ||
        typeof option.available !== 'boolean') invalid('choice id or availability invalid');
    choiceIds.add(option.id);
    return { id: option.id, label: localized(option.text, locale, `choice ${option.id}`)!, disabled: !option.available };
  });
  if (!Array.isArray(manualSlots)) invalid('manual slot list invalid');
  const byNumber = new Map<number, GalManualSlot>();
  for (const slot of manualSlots) {
    const number = slot?.number;
    const meta = slot?.meta;
    if (!Number.isSafeInteger(number) || number < 1 || byNumber.has(number) || !meta ||
        Object.keys(meta).some(key => !['slot', 'tick', 'hash', 'timestamp', 'label'].includes(key)) ||
        meta.slot !== expectedSlot(pkg, number) || !Number.isSafeInteger(meta.tick) || meta.tick < 0 ||
        !Number.isSafeInteger(meta.timestamp) || meta.timestamp < 0 ||
        typeof meta.hash !== 'string' || !/^[0-9a-f]{8}$/.test(meta.hash) ||
        (meta.label !== undefined && (typeof meta.label !== 'string' || meta.label.length > 120 || /[\x00-\x1f\x7f]/.test(meta.label))))
      invalid('manual slot metadata invalid');
    byNumber.set(number, slot);
  }
  const minimumSlotCount = input.minimumSlotCount ?? 24;
  if (!Number.isSafeInteger(minimumSlotCount) || minimumSlotCount < 1) invalid('minimumSlotCount invalid');
  let maxActual = 0;
  for (const number of byNumber.keys()) if (number > maxActual) maxActual = number;
  const pageCount = Math.ceil(Math.max(minimumSlotCount, maxActual) / GAL_UI_SLOTS_PER_PAGE);
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) invalid('page out of range');
  const start = (page - 1) * GAL_UI_SLOTS_PER_PAGE + 1;
  if (!Number.isSafeInteger(start + GAL_UI_SLOTS_PER_PAGE - 1)) invalid('page slot number unsafe');
  const slots: GalUiSlot[] = Array.from({ length: GAL_UI_SLOTS_PER_PAGE }, (_, index) => {
    const number = start + index;
    const meta = byNumber.get(number)?.meta;
    if (!meta) return { number, filled: false, canLoad: false, label: null,
      tick: null, timestamp: null, preview: 'empty' };
    const result = input.previews?.get(number);
    const validRecord = result?.status === 'ready' ? parseGalPreviewRecord(result.record) : undefined;
    const src = result?.status === 'ready' ? result.src : undefined;
    const ready = !!validRecord && validRecord.packageId === pkg.id && validRecord.slot === number &&
      validRecord.saveHash === meta.hash &&
      src === `data:${validRecord.image.mimeType};base64,${validRecord.image.data}`;
    const preview = ready ? 'ready' : result?.status === 'damaged' ? 'damaged' :
      result?.status === 'unavailable' ? 'unavailable' :
      result?.status === 'invalid-save' ? 'invalid-save' : 'no-preview';
    return { number, filled: true, canLoad: preview !== 'invalid-save', label: meta.label ?? null,
      tick: meta.tick, timestamp: meta.timestamp, preview,
      ...(ready ? { previewSrc: src } : {}) };
  });
  const sourceHistory = input.history;
  const historyEntries = sourceHistory?.entries ?? [];
  const historyCursor = sourceHistory?.cursor ?? -1;
  if (!Array.isArray(historyEntries) || historyEntries.length > 512 ||
      (historyEntries.length === 0 ? historyCursor !== -1 && historyCursor !== 0 :
        !Number.isSafeInteger(historyCursor) || historyCursor < 0 || historyCursor >= historyEntries.length))
    invalid('history window invalid');
  const historyRows: GalUiHistoryRow[] = historyEntries.slice(0, historyCursor + 1).map((entry, index) => {
    const node = pkg.chapters[entry.ref.chapterId]?.nodes[entry.ref.nodeId];
    if (!node || node.kind !== entry.kind) invalid('history ref invalid');
    const speaker = entry.speakerId === undefined ? null : pkg.characters[entry.speakerId];
    if (entry.speakerId !== undefined && !speaker) invalid('history speaker invalid');
    return { id: `${index}:${storyRefKey(entry.ref)}`,
      speaker: localized(speaker?.name, locale, 'history speaker') ?? '旁白',
      text: localized(entry.text, locale, 'history text') ?? '（无台词）',
      current: index === historyCursor };
  });
  const cg: GalUiGalleryCard[] = Object.keys(pkg.media.cg).sort(cmpStr).map(id => {
    const unlocked = canonicalProfile.unlockedCgIds.includes(id);
    return { id, title: unlocked ? localized(pkg.media.cg[id]!.title, locale, `CG ${id}`)! : '未解锁',
      unlocked, preview: unlocked ? 'no-asset' : 'locked',
      ...(unlocked ? { assetKey: pkg.media.cg[id]!.image } : {}) };
  });
  const memories: GalUiGalleryCard[] = Object.keys(pkg.gallery.memories).sort(cmpStr).map(id => {
    const unlocked = canonicalProfile.unlockedMemoryIds.includes(id);
    return { id, title: unlocked ? localized(pkg.gallery.memories[id]!.title, locale, `memory ${id}`)! : '未解锁',
      unlocked, preview: unlocked ? 'no-asset' : 'locked' };
  });
  const portrait = Object.keys(projection.cast ?? {}).sort(cmpStr)
    .map(id => projection.cast[id]).find(member => member?.visible && member.assetKey);
  return {
    packageId: pkg.id, locale, title: localized(pkg.title, locale, 'package title')!,
    preferences: canonicalProfile.preferences,
    home: { canStart: true, canContinue: hasActiveResume || byNumber.size > 0, canLoad: byNumber.size > 0 },
    story: {
      ref, refKey, kind: projection.kind,
      chapterTitle: localized(chapter.title, locale, 'chapter title')!,
      speaker: localized(projection.speakerName, locale, 'speaker'),
      text: localized(projection.text, locale, 'story text'),
      read: canonicalProfile.readNodeIds.includes(refKey), choices,
      ...(projection.backgroundAssetKey ? { backgroundAssetKey: projection.backgroundAssetKey } : {}),
      ...(portrait?.assetKey ? { portraitAssetKey: portrait.assetKey } : {}),
    },
    manual: { page, pageCount, slotsPerPage: 12, columns: 4, rows: 3, slots },
    history: { cursor: historyRows.length ? historyCursor : -1, windowSize: historyEntries.length, rows: historyRows },
    gallery: { cg, memories },
  };
}

/** Existing LayoutNode.repeat consumes these scalar rows without a GAL-specific UI binding. */
export function galUiDataSource(model: GalUiReadModel): UIDataSource {
  const choices: readonly UIListItem[] = model.story.choices.map(choice => ({
    id: choice.id, label: choice.label, disabled: choice.disabled,
  }));
  const slots: readonly UIListItem[] = model.manual.slots.map(slot => ({
    id: String(slot.number), number: slot.number, filled: slot.filled, canLoad: slot.canLoad,
    label: slot.label ?? '', tick: slot.tick ?? '', timestamp: slot.timestamp ?? '', preview: slot.preview,
  }));
  return {
    list: id => id === 'gal.options' ? choices : id === 'gal.slots' ? slots : undefined,
  };
}
