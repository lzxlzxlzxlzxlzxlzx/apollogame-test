import type { GalPackage, PreferenceDefaults, StoryRef } from '@engine/protocol/galgame.js';
import { clamp, cmpStr } from '@engine/math/scalar.js';
import { CorruptSaveError, openEnvelope, sealEnvelope } from '../save/envelope.js';
import type { SaveCodec, SavePort } from '../save/save-port.js';

/** Cross-slot GAL state. This is not the launcher's name/avatar PlayerProfile. */
export const GAL_PROFILE_SCHEMA = 4 as const;
export const GAL_PROFILE_SLOT_PREFIX = 'zerocraft.gal-profile.';
export type GalUnlockKind = 'cg' | 'ending' | 'memory' | 'music';
export const GAL_CONFIRMATION_KEYS = Object.freeze(
  ['saveEmpty', 'overwrite', 'load', 'newGame', 'returnTitle', 'exitGame'] as const);
export type GalConfirmationKey = typeof GAL_CONFIRMATION_KEYS[number];
export type GalConfirmations = Readonly<Record<GalConfirmationKey, boolean>>;
export interface GalProfilePreferences extends PreferenceDefaults {
  readonly locale?: string;
  readonly confirmations: GalConfirmations;
  readonly masterVolume: number;
  readonly focusMute: boolean;
  readonly voiceAuto: boolean;
}
type GalProfilePreferencesV1 = PreferenceDefaults & { readonly locale?: string };
export interface GalProfile {
  readonly schemaVersion: typeof GAL_PROFILE_SCHEMA;
  readonly packageId: string;
  readonly readNodeIds: readonly string[];
  readonly unlockedCgIds: readonly string[];
  readonly unlockedEndingIds: readonly string[];
  readonly unlockedMemoryIds: readonly string[];
  readonly unlockedMusicIds: readonly string[];
  readonly preferences: GalProfilePreferences;
}

const PROFILE_FIELDS = ['schemaVersion', 'packageId', 'readNodeIds', 'unlockedCgIds',
  'unlockedEndingIds', 'unlockedMemoryIds', 'unlockedMusicIds', 'preferences'] as const;
const PREFERENCE_FIELDS_V1 = ['locale', 'textSpeedMsPerChar', 'autoDelayMs', 'skipMode',
  'bgmVolume', 'sfxVolume', 'voiceVolume', 'muted'] as const;
const PREFERENCE_FIELDS_V2 = [...PREFERENCE_FIELDS_V1, 'confirmations'] as const;
const PREFERENCE_FIELDS_V3 = [...PREFERENCE_FIELDS_V2, 'masterVolume', 'focusMute'] as const;
const PREFERENCE_FIELDS = [...PREFERENCE_FIELDS_V3, 'voiceAuto'] as const;

export function defaultGalConfirmations(): GalConfirmations {
  return { saveEmpty: true, overwrite: true, load: true, newGame: true, returnTitle: true, exitGame: true };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}
function requirePackage(pkg: GalPackage): void {
  if (pkg.schemaVersion !== 1 || typeof pkg.id !== 'string' || !pkg.id.trim())
    throw new CorruptSaveError('GAL 档案需要有效的 V1 package 身份');
}
function readKey(ref: StoryRef): string { return JSON.stringify([ref.chapterId, ref.nodeId]); }
function parseReadKey(key: string): StoryRef | undefined {
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 2 ||
        typeof value[0] !== 'string' || typeof value[1] !== 'string' ||
        !value[0] || !value[1] || readKey({ chapterId: value[0], nodeId: value[1] }) !== key) return undefined;
    return { chapterId: value[0], nodeId: value[1] };
  } catch { return undefined; }
}
function visibleNode(pkg: GalPackage, ref: StoryRef): boolean {
  const node = pkg.chapters[ref.chapterId]?.nodes[ref.nodeId];
  return !!node && node.kind !== 'jump';
}
function validUnlockId(pkg: GalPackage, kind: GalUnlockKind, id: string): boolean {
  switch (kind) {
    case 'cg': return Object.hasOwn(pkg.media.cg, id);
    case 'ending': return Object.hasOwn(pkg.endings, id);
    case 'memory': return Object.hasOwn(pkg.gallery.memories, id);
    case 'music': return Object.hasOwn(pkg.gallery.music, id);
  }
}
function sortedUnique(values: readonly string[]): string[] { return [...new Set(values)].sort(cmpStr); }
function parseIds(raw: unknown, label: string, valid: (id: string) => boolean): string[] {
  if (!Array.isArray(raw) || raw.some(id => typeof id !== 'string' || !id || !valid(id)))
    throw new CorruptSaveError(`GAL 档案 ${label} 形状或引用无效`);
  return sortedUnique(raw);
}
function finite(raw: unknown, label: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw))
    throw new CorruptSaveError(`GAL 档案偏好 ${label} 必须是有限数字`);
  return raw;
}
function normalizePreferencesV1(raw: unknown, pkg: GalPackage): GalProfilePreferencesV1 {
  const value = record(raw);
  if (!value || !exactKeys(value, PREFERENCE_FIELDS_V1) ||
      (value.locale !== undefined && (typeof value.locale !== 'string' || !pkg.locales.includes(value.locale))) ||
      (value.skipMode !== 'read-only' && value.skipMode !== 'all') || typeof value.muted !== 'boolean')
    throw new CorruptSaveError('GAL 档案偏好形状或 locale 无效');
  return {
    ...(value.locale === undefined ? {} : { locale: value.locale }),
    textSpeedMsPerChar: clamp(Math.round(finite(value.textSpeedMsPerChar, 'textSpeedMsPerChar')), 0, 500),
    autoDelayMs: clamp(Math.round(finite(value.autoDelayMs, 'autoDelayMs')), 0, 10000),
    skipMode: value.skipMode,
    bgmVolume: clamp(finite(value.bgmVolume, 'bgmVolume'), 0, 1),
    sfxVolume: clamp(finite(value.sfxVolume, 'sfxVolume'), 0, 1),
    voiceVolume: clamp(finite(value.voiceVolume, 'voiceVolume'), 0, 1),
    muted: value.muted,
  };
}
function normalizePreferencesV2(raw: unknown, pkg: GalPackage): Omit<GalProfilePreferences, 'masterVolume' | 'focusMute' | 'voiceAuto'> {
  const value = record(raw);
  if (!value || !exactKeys(value, PREFERENCE_FIELDS_V2))
    throw new CorruptSaveError('GAL 档案偏好形状无效');
  const confirmations = record(value.confirmations);
  if (!confirmations || !exactKeys(confirmations, GAL_CONFIRMATION_KEYS) ||
      GAL_CONFIRMATION_KEYS.some(key => !Object.hasOwn(confirmations, key) || typeof confirmations[key] !== 'boolean'))
    throw new CorruptSaveError('GAL 档案六项确认偏好必须齐全且为布尔值');
  const { confirmations: _ignored, ...legacy } = value;
  return { ...normalizePreferencesV1(legacy, pkg), confirmations: {
    saveEmpty: confirmations.saveEmpty as boolean,
    overwrite: confirmations.overwrite as boolean,
    load: confirmations.load as boolean,
    newGame: confirmations.newGame as boolean,
    returnTitle: confirmations.returnTitle as boolean,
    exitGame: confirmations.exitGame as boolean,
  } };
}

function normalizePreferencesV3(raw: unknown, pkg: GalPackage): Omit<GalProfilePreferences, 'voiceAuto'> {
  const value = record(raw);
  if (!value || !exactKeys(value, PREFERENCE_FIELDS_V3) || typeof value.focusMute !== 'boolean')
    throw new CorruptSaveError('GAL V3 声音偏好形状无效');
  const { masterVolume, focusMute, ...legacy } = value;
  return { ...normalizePreferencesV2(legacy, pkg),
    masterVolume: clamp(finite(masterVolume, 'masterVolume'), 0, 1), focusMute };
}

function normalizePreferences(raw: unknown, pkg: GalPackage): GalProfilePreferences {
  const value = record(raw);
  if (!value || !exactKeys(value, PREFERENCE_FIELDS) || typeof value.voiceAuto !== 'boolean')
    throw new CorruptSaveError('GAL V4 语音偏好形状无效');
  const { voiceAuto, ...legacy } = value;
  return { ...normalizePreferencesV3(legacy, pkg), voiceAuto };
}

function parseProfileFields(raw: unknown, pkg: GalPackage, schemaVersion: 1 | 2 | 3 | 4) {
  requirePackage(pkg);
  const value = record(raw);
  if (!value || !exactKeys(value, PROFILE_FIELDS) || value.schemaVersion !== schemaVersion || value.packageId !== pkg.id)
    throw new CorruptSaveError('GAL 档案版本、package 归属或形状无效');
  return {
    packageId: pkg.id,
    readNodeIds: parseIds(value.readNodeIds, 'readNodeIds', id => {
      const ref = parseReadKey(id); return !!ref && visibleNode(pkg, ref);
    }),
    unlockedCgIds: parseIds(value.unlockedCgIds, 'unlockedCgIds', id => validUnlockId(pkg, 'cg', id)),
    unlockedEndingIds: parseIds(value.unlockedEndingIds, 'unlockedEndingIds', id => validUnlockId(pkg, 'ending', id)),
    unlockedMemoryIds: parseIds(value.unlockedMemoryIds, 'unlockedMemoryIds', id => validUnlockId(pkg, 'memory', id)),
    unlockedMusicIds: parseIds(value.unlockedMusicIds, 'unlockedMusicIds', id => validUnlockId(pkg, 'music', id)),
    preferences: value.preferences,
  };
}

function migrateGalProfileV1(raw: unknown, pkg: GalPackage): unknown {
  const legacy = parseProfileFields(raw, pkg, 1);
  return { ...legacy, schemaVersion: 2,
    preferences: { ...normalizePreferencesV1(legacy.preferences, pkg), confirmations: defaultGalConfirmations() } };
}
function migrateGalProfileV2(raw: unknown, pkg: GalPackage): unknown {
  const legacy = parseProfileFields(raw, pkg, 2);
  return { ...legacy, schemaVersion: 3,
    preferences: { ...normalizePreferencesV2(legacy.preferences, pkg), masterVolume: 1, focusMute: false } };
}
function migrateGalProfileV3(raw: unknown, pkg: GalPackage): GalProfile {
  const legacy = parseProfileFields(raw, pkg, 3);
  return { ...legacy, schemaVersion: GAL_PROFILE_SCHEMA,
    preferences: { ...normalizePreferencesV3(legacy.preferences, pkg), voiceAuto: true } };
}

export function createGalProfile(pkg: GalPackage): GalProfile {
  requirePackage(pkg);
  return {
    schemaVersion: GAL_PROFILE_SCHEMA, packageId: pkg.id,
    readNodeIds: [], unlockedCgIds: [], unlockedEndingIds: [], unlockedMemoryIds: [], unlockedMusicIds: [],
    preferences: normalizePreferences({ locale: pkg.defaultLocale, ...pkg.preferences,
      confirmations: defaultGalConfirmations(), masterVolume: 1, focusMute: false, voiceAuto: true }, pkg),
  };
}

/** Fail-closed V2 decoder. Only canonical IDs from this exact package may enter the profile. */
export function parseGalProfile(raw: unknown, pkg: GalPackage): GalProfile {
  const fields = parseProfileFields(raw, pkg, GAL_PROFILE_SCHEMA);
  return { ...fields, schemaVersion: GAL_PROFILE_SCHEMA,
    preferences: normalizePreferences(fields.preferences, pkg) };
}

function samePackage(profile: GalProfile, pkg: GalPackage): void {
  if (profile.packageId !== pkg.id) throw new CorruptSaveError(`GAL 档案 package 不符：${profile.packageId} ≠ ${pkg.id}`);
}
function addId(profile: GalProfile, field: keyof Pick<GalProfile,
  'readNodeIds'|'unlockedCgIds'|'unlockedEndingIds'|'unlockedMemoryIds'|'unlockedMusicIds'>, id: string): GalProfile {
  if (profile[field].includes(id)) return profile;
  return { ...profile, [field]: sortedUnique([...profile[field], id]) };
}

/** Host calls only after a visible node has actually been read; projection/restore never calls this. */
export function markRead(profile: GalProfile, pkg: GalPackage, ref: StoryRef): GalProfile {
  samePackage(profile, pkg);
  if (!visibleNode(pkg, ref)) throw new CorruptSaveError(`GAL 已读节点不存在或不可见：${readKey(ref)}`);
  return addId(profile, 'readNodeIds', readKey(ref));
}
export function hasRead(profile: GalProfile, pkg: GalPackage, ref: StoryRef): boolean {
  samePackage(profile, pkg); return profile.readNodeIds.includes(readKey(ref));
}
export function unlock(profile: GalProfile, pkg: GalPackage, kind: GalUnlockKind, id: string): GalProfile {
  samePackage(profile, pkg);
  if (!validUnlockId(pkg, kind, id)) throw new CorruptSaveError(`GAL ${kind} ID 不在 package 目录：${id}`);
  const field = ({ cg: 'unlockedCgIds', ending: 'unlockedEndingIds', memory: 'unlockedMemoryIds', music: 'unlockedMusicIds' } as const)[kind];
  return addId(profile, field, id);
}
export function isUnlocked(profile: GalProfile, pkg: GalPackage, kind: GalUnlockKind, id: string): boolean {
  samePackage(profile, pkg);
  const field = ({ cg: 'unlockedCgIds', ending: 'unlockedEndingIds', memory: 'unlockedMemoryIds', music: 'unlockedMusicIds' } as const)[kind];
  return profile[field].includes(id);
}
export function setGalPreferences(profile: GalProfile, pkg: GalPackage,
  change: Partial<Omit<GalProfilePreferences, 'confirmations'>>): GalProfile {
  samePackage(profile, pkg);
  if (Object.hasOwn(change, 'confirmations'))
    throw new CorruptSaveError('GAL 六项确认偏好只能逐项更新');
  const preferences = normalizePreferences({ ...profile.preferences, ...change }, pkg);
  return JSON.stringify(preferences) === JSON.stringify(profile.preferences) ? profile : { ...profile, preferences };
}

export function setGalConfirmation(profile: GalProfile, pkg: GalPackage,
  key: GalConfirmationKey, enabled: boolean): GalProfile {
  samePackage(profile, pkg);
  if (!GAL_CONFIRMATION_KEYS.includes(key) || typeof enabled !== 'boolean')
    throw new CorruptSaveError('GAL 确认偏好键或值无效');
  if (profile.preferences.confirmations[key] === enabled) return profile;
  return { ...profile, preferences: { ...profile.preferences,
    confirmations: { ...profile.preferences.confirmations, [key]: enabled } } };
}

/** Reset every currently versioned GAL setting, never reading progress or unlocks from a fresh profile. */
export function resetGalProfilePreferences(profile: GalProfile, pkg: GalPackage): GalProfile {
  samePackage(profile, pkg);
  const preferences = createGalProfile(pkg).preferences;
  return JSON.stringify(preferences) === JSON.stringify(profile.preferences)
    ? profile : { ...profile, preferences };
}

export function galProfileSlot(pkg: GalPackage): string { requirePackage(pkg); return `${GAL_PROFILE_SLOT_PREFIX}${encodeURIComponent(pkg.id)}`; }
export function galProfileCodec(pkg: GalPackage): SaveCodec {
  requirePackage(pkg);
  // V1 is the first released GAL profile. V2 confirmations, V3 master/focus, V4 voice-auto.
  return { gameId: `zerocraft.gal-profile:${pkg.id}`, schema: GAL_PROFILE_SCHEMA,
    migrations: { 1: raw => migrateGalProfileV1(raw, pkg), 2: raw => migrateGalProfileV2(raw, pkg),
      3: raw => migrateGalProfileV3(raw, pkg) } };
}
export async function loadGalProfile(port: SavePort, pkg: GalPackage): Promise<GalProfile> {
  const env = await port.read(galProfileSlot(pkg));
  return env === null ? createGalProfile(pkg) : parseGalProfile(openEnvelope(env, galProfileCodec(pkg)), pkg);
}
export async function saveGalProfile(port: SavePort, pkg: GalPackage, profile: GalProfile, savedAt: number): Promise<void> {
  if (!Number.isSafeInteger(savedAt) || savedAt < 0) throw new CorruptSaveError('GAL 档案 savedAt 必须由宿主注入有效时间');
  const normalized = parseGalProfile(profile, pkg);
  await port.write(galProfileSlot(pkg), sealEnvelope(normalized, galProfileCodec(pkg), savedAt));
}

// Serialize read-modify-write operations for the same package, including narrative milestone folding.
// A preference save must never overwrite an unlock written by a concurrent bridge drain (or vice versa).
const profileLanes = new Map<string, Promise<void>>();
export async function serialGalProfile<T>(packageId: string, run: () => Promise<T>): Promise<T> {
  const previous = profileLanes.get(packageId) ?? Promise.resolve();
  const current = previous.then(run);
  const settled = current.then(() => undefined, () => undefined);
  profileLanes.set(packageId, settled);
  try { return await current; }
  finally { if (profileLanes.get(packageId) === settled) profileLanes.delete(packageId); }
}

/** Return the updated Profile only after SavePort confirms persistence. */
export async function persistGalConfirmation(port: SavePort, pkg: GalPackage,
  key: GalConfirmationKey, enabled: boolean, savedAt: number): Promise<GalProfile> {
  return serialGalProfile(pkg.id, async () => {
    const current = await loadGalProfile(port, pkg);
    const next = setGalConfirmation(current, pkg, key, enabled);
    await saveGalProfile(port, pkg, next, savedAt);
    return next;
  });
}

/** Serialize playback preference updates with the same package lane as milestone folding. */
export async function persistGalPlaybackPreferences(port: SavePort, pkg: GalPackage,
  change: Pick<GalProfilePreferences, 'autoDelayMs'> | Pick<GalProfilePreferences, 'skipMode'>,
  savedAt: number): Promise<GalProfile> {
  return serialGalProfile(pkg.id, async () => {
    const current = await loadGalProfile(port, pkg);
    const next = setGalPreferences(current, pkg, change);
    if (next !== current) await saveGalProfile(port, pkg, next, savedAt);
    return next;
  });
}

/** UI must only expose this after all settings have real consumers. Shares the milestone lane. */
export async function persistGalPreferencesReset(port: SavePort, pkg: GalPackage,
  savedAt: number): Promise<GalProfile> {
  return serialGalProfile(pkg.id, async () => {
    const current = await loadGalProfile(port, pkg);
    const next = resetGalProfilePreferences(current, pkg);
    if (next !== current) await saveGalProfile(port, pkg, next, savedAt);
    return next;
  });
}

export type GalAudioVolumeKey = 'masterVolume' | 'bgmVolume' | 'voiceVolume' | 'sfxVolume';
/** V3 master plus existing channel fields, serialized with confirmations and milestone folding. */
export async function persistGalAudioVolume(port: SavePort, pkg: GalPackage,
  key: GalAudioVolumeKey, value: number, savedAt: number): Promise<GalProfile> {
  if (!['masterVolume', 'bgmVolume', 'voiceVolume', 'sfxVolume'].includes(key) ||
      !Number.isFinite(value) || value < 0 || value > 1)
    throw new CorruptSaveError('GAL 音量键或值无效');
  return serialGalProfile(pkg.id, async () => {
    const current = await loadGalProfile(port, pkg);
    const next = setGalPreferences(current, pkg, { [key]: value });
    if (next !== current) await saveGalProfile(port, pkg, next, savedAt);
    return next;
  });
}

/** Persist focus policy in the package lane; failed writes never become visible in the host. */
export async function persistGalFocusMute(port: SavePort, pkg: GalPackage,
  enabled: boolean, savedAt: number): Promise<GalProfile> {
  if (typeof enabled !== 'boolean') throw new CorruptSaveError('GAL 失焦静音值无效');
  return serialGalProfile(pkg.id, async () => {
    const current = await loadGalProfile(port, pkg);
    const next = setGalPreferences(current, pkg, { focusMute: enabled });
    if (next !== current) await saveGalProfile(port, pkg, next, savedAt);
    return next;
  });
}

/** Auto voice is a package preference; manual replay remains available when disabled. */
export async function persistGalVoiceAuto(port: SavePort, pkg: GalPackage,
  enabled: boolean, savedAt: number): Promise<GalProfile> {
  if (typeof enabled !== 'boolean') throw new CorruptSaveError('GAL 自动语音值无效');
  return serialGalProfile(pkg.id, async () => {
    const current = await loadGalProfile(port, pkg);
    const next = setGalPreferences(current, pkg, { voiceAuto: enabled });
    if (next !== current) await saveGalProfile(port, pkg, next, savedAt);
    return next;
  });
}
