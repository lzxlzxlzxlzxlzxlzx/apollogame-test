export const LIFE_ART_DIRECTION_SCHEMA = 'zerocraft.life-art-direction.v1' as const;
export const LIFE_ART_MEDIA = ['pixel-art', 'illustrated-2d'] as const;
export type LifeArtMedium = (typeof LIFE_ART_MEDIA)[number];
export const LIFE_ART_SLOT_KINDS = ['tile', 'crop', 'player', 'npc', 'building', 'resource', 'item', 'ui-icon'] as const;
export type LifeArtSlotKind = (typeof LIFE_ART_SLOT_KINDS)[number];

export interface LifeArtDirectionKindDefaults {
  readonly outputPx: { readonly width: number; readonly height: number };
  readonly alpha: 'opaque' | 'transparent';
  readonly sampling: 'nearest' | 'linear';
  readonly render: {
    readonly display: { readonly unit: 'cell' | 'pixel'; readonly width: number; readonly height: number };
    readonly anchor: { readonly x: number; readonly y: number };
    readonly fit: 'cover' | 'contain';
  };
  readonly compositionPrompt: string;
}

export interface LifeArtDirectionV1 {
  readonly schemaVersion: typeof LIFE_ART_DIRECTION_SCHEMA;
  readonly id: string;
  readonly medium: LifeArtMedium;
  readonly basePrompt: string;
  readonly negativePrompt: readonly string[];
  readonly defaults: Readonly<Record<LifeArtSlotKind, LifeArtDirectionKindDefaults>>;
}

export interface LifeArtDirectionIssue { readonly path: string; readonly code: string; readonly message: string }

export interface DirectionalAssetSlotLike {
  readonly kind: string;
  readonly asset?: {
    readonly outputPx?: { readonly width?: number; readonly height?: number };
    readonly alpha?: unknown;
    readonly sampling?: unknown;
  };
  readonly render?: {
    readonly display?: { readonly unit?: unknown; readonly width?: number; readonly height?: number };
    readonly anchor?: { readonly x?: number; readonly y?: number };
    readonly fit?: unknown;
    readonly offset?: { readonly x?: number; readonly y?: number };
  };
  readonly generation?: {
    readonly briefVersion?: unknown;
    readonly styleId?: unknown;
    readonly semanticPrompt?: unknown;
    readonly prompt?: unknown;
    readonly negativePrompt?: unknown;
  };
}

const ILLUSTRATED_PROMPT = 'high-detail illustrated 2D, non-pixel-art, readable at gameplay scale';
const ILLUSTRATED_NEGATIVE = ['pixel art', 'sprite sheet', 'UI', 'text', 'border'] as const;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const compact = (value: string): string => value.trim().replace(/\s+/g, ' ');
const unsafeText = (value: string): boolean => /(?:https?|data|file):|(?:^|\s)(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|\/[A-Za-z0-9])|(?:api[_ -]?key|secret[_ -]?key|bearer\s+[A-Za-z0-9_-]+)/i.test(value);
const opaqueId = (value: unknown): value is string => text(value) && /^[a-z0-9][a-z0-9.-]{0,63}$/.test(value);
const exactKeys = (value: Record<string, unknown>, required: readonly string[]): string[] => {
  const allowed = new Set(required);
  return Object.keys(value).filter((key) => !allowed.has(key)).map((key) => `unknown field "${key}"`)
    .concat(required.filter((key) => !(key in value)).map((key) => `missing field "${key}"`));
};
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

function normalizedUnique(values: readonly string[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const value of values.map(compact)) {
    const key = value.toLocaleLowerCase('en-US');
    if (!seen.has(key)) { seen.add(key); out.push(value); }
  }
  return out;
}

export function composeLifeArtDirectionPrompt(
  profile: LifeArtDirectionV1,
  kind: LifeArtSlotKind,
  semanticPrompt: string,
): { readonly prompt: string; readonly negativePrompt: readonly string[] } {
  const required = profile.medium === 'illustrated-2d' ? [ILLUSTRATED_PROMPT] : [];
  return {
    prompt: [...required, profile.basePrompt, semanticPrompt, profile.defaults[kind].compositionPrompt].map(compact).join(', '),
    negativePrompt: normalizedUnique([...profile.negativePrompt, ...(profile.medium === 'illustrated-2d' ? ILLUSTRATED_NEGATIVE : [])]),
  };
}

export function validateLifeArtDirection(raw: unknown, path = '$.artDirection'): readonly LifeArtDirectionIssue[] {
  const issues: LifeArtDirectionIssue[] = [];
  const issue = (at: string, code: string, message: string): void => { issues.push({ path: at, code, message }); };
  if (!record(raw)) return [{ path, code: 'type', message: 'must be an object' }];
  for (const error of exactKeys(raw, ['schemaVersion', 'id', 'medium', 'basePrompt', 'negativePrompt', 'defaults'])) issue(path, 'closed', error);
  if (raw.schemaVersion !== LIFE_ART_DIRECTION_SCHEMA) issue(`${path}.schemaVersion`, 'schema', `must be ${LIFE_ART_DIRECTION_SCHEMA}`);
  if (!opaqueId(raw.id)) issue(`${path}.id`, 'id', 'must be a lowercase opaque id');
  if (!LIFE_ART_MEDIA.includes(raw.medium as LifeArtMedium)) issue(`${path}.medium`, 'enum', `must be ${LIFE_ART_MEDIA.join('|')}`);
  if (!text(raw.basePrompt) || unsafeText(String(raw.basePrompt))) issue(`${path}.basePrompt`, 'prompt', 'must be non-empty safe prompt text without URLs, paths or secrets');
  if (!Array.isArray(raw.negativePrompt) || raw.negativePrompt.some((value) => !text(value) || unsafeText(String(value)))) issue(`${path}.negativePrompt`, 'prompt', 'must be safe non-empty prompt strings');
  if (!record(raw.defaults)) { issue(`${path}.defaults`, 'type', 'must be an object'); return issues; }
  for (const error of exactKeys(raw.defaults, LIFE_ART_SLOT_KINDS)) issue(`${path}.defaults`, 'closed', error);
  for (const kind of LIFE_ART_SLOT_KINDS) {
    const value = raw.defaults[kind]; const at = `${path}.defaults.${kind}`;
    if (!record(value)) { issue(at, 'type', 'must be an object'); continue; }
    for (const error of exactKeys(value, ['outputPx', 'alpha', 'sampling', 'render', 'compositionPrompt'])) issue(at, 'closed', error);
    if (!record(value.outputPx) || exactKeys(value.outputPx, ['width', 'height']).length > 0 || !finitePositive(value.outputPx.width) || !finitePositive(value.outputPx.height)) issue(`${at}.outputPx`, 'size', 'must contain finite positive width/height only');
    if (!['opaque', 'transparent'].includes(String(value.alpha))) issue(`${at}.alpha`, 'enum', 'must be opaque|transparent');
    if (!['nearest', 'linear'].includes(String(value.sampling))) issue(`${at}.sampling`, 'enum', 'must be nearest|linear');
    if (!text(value.compositionPrompt) || unsafeText(String(value.compositionPrompt))) issue(`${at}.compositionPrompt`, 'prompt', 'must be safe non-empty composition text');
    if (!record(value.render)) issue(`${at}.render`, 'type', 'must be an object');
    else {
      for (const error of exactKeys(value.render, ['display', 'anchor', 'fit'])) issue(`${at}.render`, 'closed', error);
      const display = value.render.display;
      if (!record(display) || exactKeys(display, ['unit', 'width', 'height']).length > 0 || !['cell', 'pixel'].includes(String(display.unit)) || !finitePositive(display.width) || !finitePositive(display.height)) issue(`${at}.render.display`, 'display', 'must contain unit and finite positive width/height only');
      const anchor = value.render.anchor;
      if (!record(anchor) || exactKeys(anchor, ['x', 'y']).length > 0 || !finite(anchor.x) || !finite(anchor.y) || anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) issue(`${at}.render.anchor`, 'anchor', 'must contain normalized x/y only');
      if (!['cover', 'contain'].includes(String(value.render.fit))) issue(`${at}.render.fit`, 'enum', 'must be cover|contain');
    }
    if (raw.medium === 'illustrated-2d') {
      if (value.sampling !== 'linear') issue(`${at}.sampling`, 'medium_conflict', 'illustrated-2d requires linear sampling');
      if (record(value.outputPx) && (Number(value.outputPx.width) < 128 || Number(value.outputPx.height) < 128)) issue(`${at}.outputPx`, 'medium_conflict', 'illustrated-2d source dimensions must be at least 128x128');
      if (kind === 'tile' && value.alpha !== 'opaque') issue(`${at}.alpha`, 'medium_conflict', 'illustrated-2d tile must be opaque');
      if (kind !== 'tile' && value.alpha !== 'transparent') issue(`${at}.alpha`, 'medium_conflict', 'illustrated-2d actor/object assets must be transparent');
    }
  }
  return issues;
}

export function parseLifeArtDirection(raw: unknown): LifeArtDirectionV1 {
  const issues = validateLifeArtDirection(raw);
  if (issues.length > 0) throw new Error(`Invalid LifeArtDirection:\n${issues.map((value) => `${value.path} [${value.code}] ${value.message}`).join('\n')}`);
  return raw as LifeArtDirectionV1;
}

export function validateLifeArtDirectionSlot(profile: LifeArtDirectionV1, slot: DirectionalAssetSlotLike, path: string): readonly LifeArtDirectionIssue[] {
  const issues: LifeArtDirectionIssue[] = [];
  const issue = (suffix: string, code: string, message: string): void => { issues.push({ path: `${path}${suffix}`, code, message }); };
  if (!LIFE_ART_SLOT_KINDS.includes(slot.kind as LifeArtSlotKind)) return [{ path: `${path}.kind`, code: 'direction_kind', message: 'unsupported art direction slot kind' }];
  const kind = slot.kind as LifeArtSlotKind; const defaults = profile.defaults[kind];
  const semantic = slot.generation?.semanticPrompt;
  if (!text(semantic) || unsafeText(String(semantic))) { issue('.generation.semanticPrompt', 'direction_prompt', 'profiled slots require safe semanticPrompt text'); return issues; }
  const composed = composeLifeArtDirectionPrompt(profile, kind, semantic);
  if (slot.generation?.briefVersion !== 1) issue('.generation.briefVersion', 'direction_mismatch', 'profiled slots require briefVersion 1');
  if (slot.generation?.styleId !== profile.id) issue('.generation.styleId', 'direction_mismatch', `must equal art direction id ${profile.id}`);
  if (slot.generation?.prompt !== composed.prompt) issue('.generation.prompt', 'direction_mismatch', 'must equal stable profile + semantic + kind composition prompt');
  if (!same(slot.generation?.negativePrompt, composed.negativePrompt)) issue('.generation.negativePrompt', 'direction_mismatch', 'must equal stable profile negative prompt');
  if (!same(slot.asset?.outputPx, defaults.outputPx)) issue('.asset.outputPx', 'direction_mismatch', 'must equal art direction defaults');
  if (slot.asset?.alpha !== defaults.alpha) issue('.asset.alpha', 'direction_mismatch', 'must equal art direction defaults');
  if (slot.asset?.sampling !== defaults.sampling) issue('.asset.sampling', 'direction_mismatch', 'must equal art direction defaults');
  if (!same(slot.render?.display, defaults.render.display)) issue('.render.display', 'direction_mismatch', 'must equal art direction defaults');
  if (!same(slot.render?.anchor, defaults.render.anchor)) issue('.render.anchor', 'direction_mismatch', 'must equal art direction defaults');
  if (slot.render?.fit !== defaults.render.fit) issue('.render.fit', 'direction_mismatch', 'must equal art direction defaults');
  if (!same(slot.render?.offset, { x: 0, y: 0 })) issue('.render.offset', 'direction_mismatch', 'profiled slots require zero render offset');
  return issues;
}

export function deriveLifeArtDirectionFields(profile: LifeArtDirectionV1, kind: LifeArtSlotKind, semanticPrompt: string): {
  readonly asset: { readonly usage: 'sprite'; readonly colorSpace: 'srgb'; readonly outputPx: { readonly width: number; readonly height: number }; readonly alpha: 'opaque' | 'transparent'; readonly sampling: 'nearest' | 'linear' };
  readonly render: LifeArtDirectionKindDefaults['render'] & { readonly offset: { readonly x: 0; readonly y: 0 } };
  readonly generation: { readonly briefVersion: 1; readonly styleId: string; readonly semanticPrompt: string; readonly prompt: string; readonly negativePrompt: readonly string[] };
} {
  const defaults = profile.defaults[kind]; const composed = composeLifeArtDirectionPrompt(profile, kind, semanticPrompt);
  return {
    asset: { usage: 'sprite', colorSpace: 'srgb', outputPx: { ...defaults.outputPx }, alpha: defaults.alpha, sampling: defaults.sampling },
    render: { display: { ...defaults.render.display }, anchor: { ...defaults.render.anchor }, fit: defaults.render.fit, offset: { x: 0, y: 0 } },
    generation: { briefVersion: 1, styleId: profile.id, semanticPrompt: compact(semanticPrompt), prompt: composed.prompt, negativePrompt: composed.negativePrompt },
  };
}

const pixelComposition = Object.freeze({
  tile: 'seamless repeatable opaque surface, orthographic top-down tile',
  crop: 'transparent background, centered crop growth state, bottom-center anchor',
  player: 'transparent background, full-body character, bottom-center feet anchor',
  npc: 'transparent background, full-body character, bottom-center feet anchor',
  building: 'transparent background, readable building silhouette, bottom-center footprint anchor',
  resource: 'transparent background, readable world resource, bottom-center anchor',
  item: 'transparent background, isolated inventory object, centered anchor',
  'ui-icon': 'transparent background, isolated small interface icon, centered silhouette, no text or border',
}) satisfies Record<LifeArtSlotKind, string>;

function defaults(medium: LifeArtMedium): Record<LifeArtSlotKind, LifeArtDirectionKindDefaults> {
  const illustrated = medium === 'illustrated-2d';
  const size = (kind: LifeArtSlotKind): { width: number; height: number } => {
    if (!illustrated) return kind === 'player' || kind === 'npc' ? { width: 32, height: 48 } : kind === 'building' ? { width: 64, height: 64 } : { width: 32, height: 32 };
    if (kind === 'player' || kind === 'npc') return { width: 384, height: 512 };
    if (kind === 'building') return { width: 512, height: 512 };
    return { width: 256, height: 256 };
  };
  const display = (kind: LifeArtSlotKind): LifeArtDirectionKindDefaults['render']['display'] => {
    if (kind === 'player' || kind === 'npc') return illustrated ? { unit: 'cell', width: 1, height: 1.5 } : { unit: 'pixel', width: 32, height: 48 };
    if (kind === 'building') return { unit: 'cell', width: 2, height: 2 };
    if (kind === 'ui-icon') return { unit: 'pixel', width: 24, height: 24 };
    return { unit: 'cell', width: 1, height: 1 };
  };
  return Object.fromEntries(LIFE_ART_SLOT_KINDS.map((kind) => [kind, {
    outputPx: size(kind), alpha: kind === 'tile' ? 'opaque' : 'transparent', sampling: illustrated ? 'linear' : 'nearest',
    render: { display: display(kind), anchor: kind === 'tile' || kind === 'item' || kind === 'ui-icon' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 }, fit: kind === 'tile' ? 'cover' : 'contain' },
    compositionPrompt: pixelComposition[kind],
  }])) as Record<LifeArtSlotKind, LifeArtDirectionKindDefaults>;
}

export const LIFE_ART_DIRECTION_PIXEL_LEGACY: LifeArtDirectionV1 = Object.freeze({
  schemaVersion: LIFE_ART_DIRECTION_SCHEMA,
  id: 'life.pixel-legacy.v1',
  medium: 'pixel-art',
  basePrompt: 'cohesive pixel art gameplay asset, crisp hard-edged pixels, consistent palette',
  negativePrompt: ['photorealism', 'blurred pixels', 'UI', 'text', 'border'],
  defaults: defaults('pixel-art'),
});

export const LIFE_ART_DIRECTION_ILLUSTRATED_2D: LifeArtDirectionV1 = Object.freeze({
  schemaVersion: LIFE_ART_DIRECTION_SCHEMA,
  id: 'life.illustrated-2d.v1',
  medium: 'illustrated-2d',
  basePrompt: 'cohesive hand-painted gameplay asset, consistent lighting, material language and palette',
  negativePrompt: ['photorealistic camera noise', '3D render'],
  defaults: defaults('illustrated-2d'),
});
