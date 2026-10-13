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
  'advance-time', 'advance-day', 'relationships', 'selected-item', 'selected-target',
] as const;

export type LifeHostLabelKey = typeof LIFE_HOST_LABEL_KEYS[number];

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
  };
  readonly input: { readonly preset: typeof LIFE_HOST_INPUT_PRESET };
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
const SAVE_KEYS = ['namespace', 'schemaVersion', 'autosave'] as const;
const LABEL_KEY_SET: ReadonlySet<string> = new Set(LIFE_HOST_LABEL_KEYS);
const SAFE_SLUG = /^game-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const PLAIN_TEXT = /^[^\u0000-\u001f\u007f]*$/u;

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

  if (!object(raw, '', ROOT_KEYS)) return { ok: false, diagnostics: ordered(diagnostics) };
  exact(raw.schema, '/schema', LIFE_HOST_SCHEMA, 'schema');
  if (typeof raw.slug !== 'string' || !SAFE_SLUG.test(raw.slug)) add('/slug', 'slug', 'must match game-<lowercase-kebab>, max 52 characters');
  exact(raw.packagePath, '/packagePath', 'life.json', 'path');
  exact(raw.assetSlotsPath, '/assetSlotsPath', 'asset-slots.json', 'path');
  if (raw.artSlug !== raw.slug) add('/artSlug', 'art_slug', 'must exactly equal slug');
  exact(raw.theme, '/theme', LIFE_HOST_THEME);

  if (object(raw.viewport, '/viewport', VIEWPORT_KEYS)) {
    if (!isLifeViewportProfileId(raw.viewport.profile)) add('/viewport/profile', 'enum', `must equal ${LIFE_VIEWPORT_PROFILE_ID}`);
  }
  if (object(raw.hud, '/hud', ['preset'], ['title', 'labels'])) {
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
  }
  if (object(raw.input, '/input', INPUT_KEYS)) exact(raw.input.preset, '/input/preset', LIFE_HOST_INPUT_PRESET);
  if (object(raw.save, '/save', SAVE_KEYS)) {
    const expected = typeof raw.slug === 'string' ? deriveLifeHostSaveNamespace(raw.slug) : '';
    if (raw.save.namespace !== expected) add('/save/namespace', 'namespace', `must equal ${expected || 'the namespace derived from slug'}`);
    if (raw.save.schemaVersion !== 1) add('/save/schemaVersion', 'schema_version', 'must equal 1');
    exact(raw.save.autosave, '/save/autosave', LIFE_HOST_AUTOSAVE);
  }
  const result = ordered(diagnostics);
  return { ok: result.length === 0, diagnostics: result };
}

export function parseLifeHostDescriptor(raw: unknown): LifeHostDescriptorV1 {
  const result = validateLifeHostDescriptor(raw);
  if (!result.ok) {
    const detail = result.diagnostics.map((entry) => `${entry.path || '/'} [${entry.code}] ${entry.message}`).join('; ');
    throw new Error(`Invalid LifeHostDescriptor: ${detail}`);
  }
  return JSON.parse(JSON.stringify(raw)) as LifeHostDescriptorV1;
}
