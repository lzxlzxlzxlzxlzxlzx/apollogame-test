import {
  LIFE_VIEWPORT_PROFILE_ID,
  isLifeViewportProfileId,
  type LifeViewportProfileId,
} from '../engine/protocol/life-viewport-profile.js';

export const LIFE_HOST_SCHEMA = 'zerocraft.life-host.v1' as const;
export const LIFE_HOST_THEME = 'starter' as const;
export const LIFE_HOST_HUD_PRESET = 'life-standard-v1' as const;
export const LIFE_HOST_INPUT_PRESET = 'life-keyboard-v1' as const;
export const LIFE_HOST_AUTOSAVE = 'life-commit-v1' as const;

export const LIFE_HOST_LABEL_KEYS = [
  'date', 'time-slot', 'place', 'inventory', 'interaction', 'objective',
  'advance-time', 'advance-day', 'relationships', 'selected-item', 'selected-target', 'quests', 'profile',
] as const;

export type LifeHostLabelKey = typeof LIFE_HOST_LABEL_KEYS[number];
export const LIFE_HOST_INVENTORY_PANEL_MIN_COLUMNS = 1;
export const LIFE_HOST_INVENTORY_PANEL_MAX_COLUMNS = 8;

export interface LifeHostInventoryPanelDescriptor {
  readonly enabled: boolean;
  readonly columns: number;
  readonly titleLabelKey: LifeHostLabelKey;
}

export type LifeHostQuestTrackingPolicy = 'first-active' | 'none';
export interface LifeHostQuestPanelDescriptor {
  readonly enabled: boolean;
  readonly titleLabelKey: LifeHostLabelKey;
  readonly defaultTracking: LifeHostQuestTrackingPolicy;
}
export interface LifeHostProfilePanelDescriptor { readonly enabled:boolean;readonly titleLabelKey:LifeHostLabelKey }
export const LIFE_HOST_UI_SKIN_SLOTS = [
  'trackedQuestFrame', 'worldStatusRibbon', 'panelFrame', 'hudChrome',
  'questIcon', 'inventoryIcon', 'profileIcon',
] as const;
export type LifeHostUiSkinSlot = typeof LIFE_HOST_UI_SKIN_SLOTS[number];
export interface LifeHostUiSkinDescriptor {
  readonly id: string;
  readonly slots: Partial<Readonly<Record<LifeHostUiSkinSlot, string>>>;
  readonly slices?: Partial<Readonly<Record<'trackedQuestFrame' | 'panelFrame', {
    readonly source: number;
    readonly display?: number;
  }>>>;
}

/** Render-only names keyed by authoritative calendar ids; never copied into World or save data. */
export interface LifeHostCalendarLabels {
  readonly seasons?: Readonly<Record<string, string>>;
  readonly slots?: Readonly<Record<string, string>>;
}

export const LIFE_HOST_CALENDAR_LABEL_MAX_LENGTH = 64;
export const LIFE_HOST_CALENDAR_LABEL_MAX_ENTRIES = 256;

export interface LifeHostDescriptorV1 {
  readonly schema: typeof LIFE_HOST_SCHEMA;
  readonly slug: string;
  readonly packagePath: 'life.json';
  readonly assetSlotsPath: 'asset-slots.json';
  readonly artSlug: string;
  readonly viewport: {
    readonly profile: LifeViewportProfileId;
  };
  readonly theme: typeof LIFE_HOST_THEME;
  readonly hud: {
    readonly preset: typeof LIFE_HOST_HUD_PRESET;
    readonly title?: string;
    readonly labels?: Partial<Readonly<Record<LifeHostLabelKey, string>>>;
    readonly calendarLabels?: LifeHostCalendarLabels;
  };
  readonly input: { readonly preset: typeof LIFE_HOST_INPUT_PRESET };
  /** Optional render-local inventory chrome. Absence preserves the v1 host exactly. */
  readonly inventoryPanel?: LifeHostInventoryPanelDescriptor;
  /** Optional render-local quest journal. Tracking preference never enters World state or saves. */
  readonly questPanel?: LifeHostQuestPanelDescriptor;
  /** Optional read-only profile drawer. */
  readonly profilePanel?:LifeHostProfilePanelDescriptor;
  readonly uiSkin?: LifeHostUiSkinDescriptor;
  readonly save: {
    readonly namespace: string;
    readonly schemaVersion: 1;
    readonly autosave: typeof LIFE_HOST_AUTOSAVE;
  };
}

export interface LifeHostDiagnostic { readonly path: string; readonly code: string; readonly message: string }
export interface LifeHostValidationResult { readonly ok: boolean; readonly diagnostics: readonly LifeHostDiagnostic[] }

const ROOT_KEYS = ['schema', 'slug', 'packagePath', 'assetSlotsPath', 'artSlug', 'viewport', 'theme', 'hud', 'input', 'save'] as const;
const VIEWPORT_KEYS = ['profile'] as const;
const HUD_KEYS = ['preset', 'title', 'labels'] as const;
const INPUT_KEYS = ['preset'] as const;
const INVENTORY_PANEL_KEYS = ['enabled', 'columns', 'titleLabelKey'] as const;
const QUEST_PANEL_KEYS = ['enabled', 'titleLabelKey', 'defaultTracking'] as const;
const PROFILE_PANEL_KEYS = ['enabled','titleLabelKey'] as const;
const SAVE_KEYS = ['namespace', 'schemaVersion', 'autosave'] as const;
const LABEL_KEY_SET: ReadonlySet<string> = new Set(LIFE_HOST_LABEL_KEYS);
const SAFE_SLUG = /^game-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const PLAIN_TEXT = /^[^\u0000-\u001f\u007f]*$/u;
const UNSAFE_CALENDAR_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f<>]/u;
const UNSAFE_CALENDAR_IDS = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const pointerEscape = (value: string): string => value.replace(/~/g, '~0').replace(/\//g, '~1');

export function deriveLifeHostSaveNamespace(slug: string): string { return `life:${slug}:v1`; }
function ordered(values: readonly LifeHostDiagnostic[]): LifeHostDiagnostic[] {
  return [...values].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
}

/** Browser-safe strict boundary shared by authoring and the runtime host. No IO or hashing. */
export function validateLifeHostDescriptor(raw: unknown): LifeHostValidationResult {
  const diagnostics: LifeHostDiagnostic[] = [];
  const add = (path: string, code: string, message: string): void => { diagnostics.push({ path, code, message }); };
  const object = (value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> => {
    if (!isRecord(value)) { add(path, 'type', 'must be a plain object'); return false; }
    const allowed = new Set([...required, ...optional]);
    for (const key of Object.keys(value).sort()) if (!allowed.has(key)) add(`${path}/${pointerEscape(key)}`, 'unknown_field', 'field is not allowed');
    for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) add(`${path}/${pointerEscape(key)}`, 'missing_field', 'field is required');
    return true;
  };
  const exact = (value: unknown, path: string, expected: string, code = 'enum'): void => { if (value !== expected) add(path, code, `must equal ${expected}`); };
  const boundedText = (value: unknown, path: string, max: number): void => {
    if (typeof value !== 'string') { add(path, 'type', 'must be a string'); return; }
    if (value.length > max) add(path, 'text_limit', `must be at most ${max} characters`);
    if (!PLAIN_TEXT.test(value)) add(path, 'plain_text', 'must be single-line plain text without control characters');
  };

  if (!object(raw, '', ROOT_KEYS, ['inventoryPanel', 'questPanel', 'profilePanel','uiSkin'])) return { ok: false, diagnostics: ordered(diagnostics) };
  exact(raw.schema, '/schema', LIFE_HOST_SCHEMA, 'schema');
  if (typeof raw.slug !== 'string' || !SAFE_SLUG.test(raw.slug)) add('/slug', 'slug', 'must match game-<lowercase-kebab>, max 52 characters');
  exact(raw.packagePath, '/packagePath', 'life.json', 'path');
  exact(raw.assetSlotsPath, '/assetSlotsPath', 'asset-slots.json', 'path');
  if (raw.artSlug !== raw.slug) add('/artSlug', 'art_slug', 'must exactly equal slug');
  exact(raw.theme, '/theme', LIFE_HOST_THEME);

  if (object(raw.viewport, '/viewport', VIEWPORT_KEYS)) {
    if (!isLifeViewportProfileId(raw.viewport.profile)) add('/viewport/profile', 'enum', `must equal ${LIFE_VIEWPORT_PROFILE_ID}`);
  }
  if (object(raw.hud, '/hud', ['preset'], ['title', 'labels', 'calendarLabels'])) {
    exact(raw.hud.preset, '/hud/preset', LIFE_HOST_HUD_PRESET);
    if (Object.prototype.hasOwnProperty.call(raw.hud, 'title')) boundedText(raw.hud.title, '/hud/title', 120);
    if (Object.prototype.hasOwnProperty.call(raw.hud, 'labels')) {
      if (!isRecord(raw.hud.labels)) add('/hud/labels', 'type', 'must be a plain object');
      else for (const key of Object.keys(raw.hud.labels).sort()) {
        const path = `/hud/labels/${pointerEscape(key)}`;
        if (!LABEL_KEY_SET.has(key)) add(path, 'label_key', 'label key is not part of the Life host vocabulary');
        boundedText(raw.hud.labels[key], path, 160);
      }
    }
    if (Object.prototype.hasOwnProperty.call(raw.hud, 'calendarLabels') && object(raw.hud.calendarLabels, '/hud/calendarLabels', [], ['seasons', 'slots'])) {
      for (const kind of ['seasons', 'slots'] as const) {
        if (!Object.prototype.hasOwnProperty.call(raw.hud.calendarLabels, kind)) continue;
        const path = `/hud/calendarLabels/${kind}`;
        const map = raw.hud.calendarLabels[kind];
        if (!isRecord(map)) { add(path, 'type', 'must be a plain object'); continue; }
        if (Object.keys(map).length > LIFE_HOST_CALENDAR_LABEL_MAX_ENTRIES) add(path, 'entry_limit', `must contain at most ${LIFE_HOST_CALENDAR_LABEL_MAX_ENTRIES} entries`);
        for (const id of Object.keys(map).sort()) {
          const entryPath = `${path}/${pointerEscape(id)}`;
          if (!id.trim() || id !== id.trim() || id.length > 128 || UNSAFE_CALENDAR_IDS.has(id) || UNSAFE_CALENDAR_TEXT.test(id) || /[\\/]/.test(id)) {
            add(entryPath, 'calendar_id', 'must be a safe non-empty calendar id of at most 128 characters');
          }
          const name = map[id];
          if (typeof name !== 'string' || !name.trim()) add(entryPath, 'text', 'must be a non-empty string');
          else {
            if (name.length > LIFE_HOST_CALENDAR_LABEL_MAX_LENGTH) add(entryPath, 'text_limit', `must be at most ${LIFE_HOST_CALENDAR_LABEL_MAX_LENGTH} characters`);
            if (UNSAFE_CALENDAR_TEXT.test(name)) add(entryPath, 'plain_text', 'must be single-line plain text without markup, control or invisible formatting characters');
          }
        }
      }
    }
  }
  if (object(raw.input, '/input', INPUT_KEYS)) exact(raw.input.preset, '/input/preset', LIFE_HOST_INPUT_PRESET);
  if (Object.prototype.hasOwnProperty.call(raw, 'inventoryPanel') && object(raw.inventoryPanel, '/inventoryPanel', INVENTORY_PANEL_KEYS)) {
    if (typeof raw.inventoryPanel.enabled !== 'boolean') add('/inventoryPanel/enabled', 'type', 'must be a boolean');
    if (!Number.isInteger(raw.inventoryPanel.columns)
      || (raw.inventoryPanel.columns as number) < LIFE_HOST_INVENTORY_PANEL_MIN_COLUMNS
      || (raw.inventoryPanel.columns as number) > LIFE_HOST_INVENTORY_PANEL_MAX_COLUMNS) {
      add('/inventoryPanel/columns', 'range', `must be an integer from ${LIFE_HOST_INVENTORY_PANEL_MIN_COLUMNS} to ${LIFE_HOST_INVENTORY_PANEL_MAX_COLUMNS}`);
    }
    if (typeof raw.inventoryPanel.titleLabelKey !== 'string' || !LABEL_KEY_SET.has(raw.inventoryPanel.titleLabelKey)) {
      add('/inventoryPanel/titleLabelKey', 'label_key', 'must be a Life host label key');
    }
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'questPanel') && object(raw.questPanel, '/questPanel', QUEST_PANEL_KEYS)) {
    if (typeof raw.questPanel.enabled !== 'boolean') add('/questPanel/enabled', 'type', 'must be a boolean');
    if (typeof raw.questPanel.titleLabelKey !== 'string' || !LABEL_KEY_SET.has(raw.questPanel.titleLabelKey)) {
      add('/questPanel/titleLabelKey', 'label_key', 'must be a Life host label key');
    }
    if (raw.questPanel.defaultTracking !== 'first-active' && raw.questPanel.defaultTracking !== 'none') {
      add('/questPanel/defaultTracking', 'enum', 'must equal first-active or none');
    }
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'profilePanel') && object(raw.profilePanel, '/profilePanel', PROFILE_PANEL_KEYS)) {
    if(typeof raw.profilePanel.enabled!=='boolean')add('/profilePanel/enabled','type','must be a boolean');
    if(typeof raw.profilePanel.titleLabelKey!=='string'||!LABEL_KEY_SET.has(raw.profilePanel.titleLabelKey))add('/profilePanel/titleLabelKey','label_key','must be a Life host label key');
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'uiSkin') && object(raw.uiSkin, '/uiSkin', ['id', 'slots'], ['slices'])) {
    const skin = raw.uiSkin;
    if (typeof skin.id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(skin.id)) {
      add('/uiSkin/id', 'skin_id', 'must be lowercase kebab');
    }
    if (object(skin.slots, '/uiSkin/slots', [], LIFE_HOST_UI_SKIN_SLOTS)) {
      for (const key of Object.keys(skin.slots)) {
        const value = skin.slots[key];
        const match = typeof value === 'string' ? /^art:([^:]+):ui:[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(value) : null;
        if (!match || match[1] !== raw.artSlug) add(`/uiSkin/slots/${pointerEscape(key)}`, 'skin_key', 'must be art:<artSlug>:ui:<lowercase-kebab-name>');
      }
    }
    if (Object.prototype.hasOwnProperty.call(skin, 'slices') && object(skin.slices, '/uiSkin/slices', [], ['trackedQuestFrame', 'panelFrame'])) {
      for (const key of Object.keys(skin.slices)) {
        const path = `/uiSkin/slices/${pointerEscape(key)}`;
        const slice = skin.slices[key];
        if (!object(slice, path, ['source'], ['display'])) continue;
        if (!Number.isInteger(slice.source) || (slice.source as number) < 1 || (slice.source as number) > 256) add(`${path}/source`, 'range', 'must be an integer from 1 to 256');
        if (Object.prototype.hasOwnProperty.call(slice, 'display') && (!Number.isInteger(slice.display) || (slice.display as number) < 1 || (slice.display as number) > 128)) add(`${path}/display`, 'range', 'must be an integer from 1 to 128');
        if (!isRecord(skin.slots) || !Object.prototype.hasOwnProperty.call(skin.slots, key)) add(path, 'skin_slot', 'slice requires its matching skin slot');
      }
    }
  }
  if (object(raw.save, '/save', SAVE_KEYS)) {
    const expected = typeof raw.slug === 'string' ? deriveLifeHostSaveNamespace(raw.slug) : '';
    if (raw.save.namespace !== expected) add('/save/namespace', 'namespace', `must equal ${expected || 'the namespace derived from slug'}`);
    if (raw.save.schemaVersion !== 1) add('/save/schemaVersion', 'schema_version', 'must equal 1');
    exact(raw.save.autosave, '/save/autosave', LIFE_HOST_AUTOSAVE);
  }
  const result = ordered(diagnostics);
  return { ok: result.length === 0, diagnostics: result };
}

/** Cross-file reference check after both strict parsers pass. Mirrors the existing compiler defaults. */
export function validateLifeHostCalendarLabels(
  descriptor: LifeHostDescriptorV1,
  calendar: { readonly seasons: readonly { readonly id: string }[]; readonly slots?: readonly string[] } | undefined,
): LifeHostValidationResult {
  const labels = descriptor.hud.calendarLabels;
  if (labels === undefined) return { ok: true, diagnostics: [] };
  const known = {
    seasons: new Set(calendar?.seasons.map((season) => season.id) ?? ['spring']),
    slots: new Set(calendar?.slots ?? []),
  };
  const diagnostics: LifeHostDiagnostic[] = [];
  for (const kind of ['seasons', 'slots'] as const) for (const id of Object.keys(labels[kind] ?? {}).sort()) {
    if (!known[kind].has(id)) diagnostics.push({ path: `/hud/calendarLabels/${kind}/${pointerEscape(id)}`, code: 'calendar_reference', message: `must name an existing calendar ${kind === 'seasons' ? 'season' : 'slot'} id` });
  }
  return { ok: diagnostics.length === 0, diagnostics: ordered(diagnostics) };
}

export function parseLifeHostDescriptor(raw: unknown): LifeHostDescriptorV1 {
  const result = validateLifeHostDescriptor(raw);
  if (!result.ok) {
    const detail = result.diagnostics.map((entry) => `${entry.path || '/'} [${entry.code}] ${entry.message}`).join('; ');
    throw new Error(`Invalid LifeHostDescriptor: ${detail}`);
  }
  return JSON.parse(JSON.stringify(raw)) as LifeHostDescriptorV1;
}
