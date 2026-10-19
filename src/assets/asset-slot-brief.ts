import type { AssetIndex, AssetIndexEntry, ColorSpace, TextureUsage } from './asset-index.js';
import {
  validateLifeArtDirection, validateLifeArtDirectionSlot,
  type LifeArtDirectionV1,
} from './life-art-direction.js';

export const ASSET_SLOT_KINDS = ['tile', 'crop', 'player', 'npc', 'building', 'resource', 'item', 'ui-icon'] as const;
export type AssetSlotKind = (typeof ASSET_SLOT_KINDS)[number];
export const ASSET_SLOT_ALPHA = ['opaque', 'transparent'] as const;
export type AssetSlotAlpha = (typeof ASSET_SLOT_ALPHA)[number];
export const ASSET_SLOT_SAMPLING = ['nearest', 'linear'] as const;
export type AssetSlotSampling = (typeof ASSET_SLOT_SAMPLING)[number];
export const ASSET_SLOT_FITS = ['cover', 'contain'] as const;
export type AssetSlotFit = (typeof ASSET_SLOT_FITS)[number];
export const ASSET_SLOT_DISPLAY_UNITS = ['cell', 'pixel'] as const;
export type AssetSlotDisplayUnit = (typeof ASSET_SLOT_DISPLAY_UNITS)[number];
export const ASSET_SLOT_FALLBACK_ROLES = ['ground', 'water', 'plantable', 'crop', 'player', 'npc', 'building', 'resource', 'item', 'ui-icon'] as const;
export type AssetSlotFallbackRole = (typeof ASSET_SLOT_FALLBACK_ROLES)[number];
export const ASSET_SLOT_APPROVALS = ['placeholder', 'approved'] as const;
export type AssetSlotApproval = (typeof ASSET_SLOT_APPROVALS)[number];

export interface AssetSlotConsumer { readonly document: string; readonly jsonPointer: string }
export interface AssetSlotSize { readonly width: number; readonly height: number }
export interface AssetSlotPoint { readonly x: number; readonly y: number }
export interface AssetSlotBrief {
  readonly slotId: string;
  readonly assetKey: string;
  readonly kind: AssetSlotKind;
  readonly consumers: readonly AssetSlotConsumer[];
  readonly asset: {
    readonly usage: TextureUsage;
    readonly colorSpace: ColorSpace;
    readonly outputPx: AssetSlotSize;
    readonly alpha: AssetSlotAlpha;
    readonly sampling: AssetSlotSampling;
    /** Life currently supports whole textures and sprite-sheet frame 0 only. Named atlas frames are rejected. */
    readonly frame?: { readonly kind: 'sheet-index'; readonly index: 0 };
  };
  readonly render: {
    readonly display: AssetSlotSize & { readonly unit: AssetSlotDisplayUnit };
    readonly anchor: AssetSlotPoint;
    readonly fit: AssetSlotFit;
    readonly offset: AssetSlotPoint;
    readonly fallbackRole: AssetSlotFallbackRole;
  };
  readonly generation: {
    readonly briefVersion: number;
    readonly styleId: string;
    /** Required only when the manifest opts into Life Art Direction v1. */
    readonly semanticPrompt?: string;
    readonly prompt: string;
    readonly negativePrompt: readonly string[];
  };
  readonly governance: {
    readonly approval: AssetSlotApproval;
    readonly humanApprovalRequired: true;
    readonly licenseRequired: true;
    /** Derived from the normalized brief by tooling; a mismatched hand-written value is rejected. */
    readonly briefFingerprint: string;
    /** Tool-derived SHA-256 of an approved non-placeholder file. */
    readonly contentHash?: string;
  };
}

export interface AssetSlotManifest {
  readonly version: 1;
  readonly game: string;
  readonly note: string;
  /** Authoring-only profile. It is compiled into slot rules and never enters Life runtime data. */
  readonly artDirection?: LifeArtDirectionV1;
  readonly slots: readonly AssetSlotBrief[];
}

export interface AssetSlotIssue { readonly path: string; readonly code: string; readonly message: string }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const oneOf = (value: unknown, values: readonly string[]): value is string => typeof value === 'string' && values.includes(value);
const keysExactly = (value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []): string[] => {
  const allowed = new Set([...keys, ...optional]);
  return Object.keys(value).filter((key) => !allowed.has(key)).map((key) => `unknown field "${key}"`)
    .concat(keys.filter((key) => !(key in value)).map((key) => `missing field "${key}"`));
};

/** Stable, browser-safe canonical form. Objects sort keys; arrays preserve authored order. */
export function stableAssetSlotJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableAssetSlotJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableAssetSlotJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fingerprintSource(slot: AssetSlotBrief): unknown {
  return { ...slot, governance: { approval: slot.governance.approval, humanApprovalRequired: true, licenseRequired: true } };
}

/** FNV-1a is an identity/checksum, not a security boundary; file bytes use SHA-256 in the authoring tool. */
export function deriveAssetSlotBriefFingerprint(slot: AssetSlotBrief): string {
  const source = stableAssetSlotJson(fingerprintSource(slot));
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return `asset-slot-v1:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function validateSize(value: unknown, path: string, issue: (path: string, code: string, message: string) => void, unit = false): void {
  if (!record(value)) { issue(path, 'type', 'must be an object'); return; }
  for (const error of keysExactly(value, unit ? ['unit', 'width', 'height'] : ['width', 'height'])) issue(path, 'closed', error);
  if (unit && !oneOf(value.unit, ASSET_SLOT_DISPLAY_UNITS)) issue(`${path}.unit`, 'enum', `must be ${ASSET_SLOT_DISPLAY_UNITS.join('|')}`);
  if (!finitePositive(value.width) || !finitePositive(value.height)) issue(path, 'size', 'width and height must be finite positive numbers');
}

function validatePoint(value: unknown, path: string, issue: (path: string, code: string, message: string) => void, normalized = false): void {
  if (!record(value)) { issue(path, 'type', 'must be an object'); return; }
  for (const error of keysExactly(value, ['x', 'y'])) issue(path, 'closed', error);
  if (!finite(value.x) || !finite(value.y)) issue(path, 'point', 'x and y must be finite numbers');
  else if (normalized && (value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1)) issue(path, 'range', 'anchor x/y must be within 0..1');
}

export function validateAssetSlotManifest(raw: unknown): readonly AssetSlotIssue[] {
  const issues: AssetSlotIssue[] = [];
  const issue = (path: string, code: string, message: string): void => { issues.push({ path, code, message }); };
  if (!record(raw)) return [{ path: '$', code: 'type', message: 'must be an object' }];
  for (const error of keysExactly(raw, ['version', 'game', 'note', 'slots'], ['artDirection'])) issue('$', 'closed', error);
  if (raw.version !== 1) issue('$.version', 'version', 'must be 1');
  if (!text(raw.game)) issue('$.game', 'text', 'must be a non-empty string');
  if (!text(raw.note)) issue('$.note', 'text', 'must explicitly describe placeholder/asset-manager ownership');
  let artDirection: LifeArtDirectionV1 | undefined;
  if (raw.artDirection !== undefined) {
    const directionIssues = validateLifeArtDirection(raw.artDirection);
    for (const value of directionIssues) issue(value.path, value.code, value.message);
    if (directionIssues.length === 0) artDirection = raw.artDirection as LifeArtDirectionV1;
  }
  if (!Array.isArray(raw.slots)) { issue('$.slots', 'type', 'must be an array'); return issues; }
  const slotIds = new Set<string>(); const assetKeys = new Set<string>(); const consumerKeys = new Set<string>();
  for (let i = 0; i < raw.slots.length; i++) {
    const slot = raw.slots[i]; const base = `$.slots[${i}]`;
    if (!record(slot)) { issue(base, 'type', 'must be an object'); continue; }
    for (const error of keysExactly(slot, ['slotId', 'assetKey', 'kind', 'consumers', 'asset', 'render', 'generation', 'governance'])) issue(base, 'closed', error);
    if (!text(slot.slotId)) issue(`${base}.slotId`, 'text', 'must be a non-empty string');
    else if (slotIds.has(slot.slotId)) issue(`${base}.slotId`, 'duplicate', `duplicate slotId ${slot.slotId}`); else slotIds.add(slot.slotId);
    if (!text(slot.assetKey) || /[\\/]|^(?:https?|data|file):/i.test(String(slot.assetKey))) issue(`${base}.assetKey`, 'asset_key', 'must be an opaque asset key, not a path or URL');
    else if (assetKeys.has(slot.assetKey)) issue(`${base}.assetKey`, 'duplicate', `duplicate assetKey ${slot.assetKey}`); else assetKeys.add(slot.assetKey);
    if (!oneOf(slot.kind, ASSET_SLOT_KINDS)) issue(`${base}.kind`, 'enum', `must be ${ASSET_SLOT_KINDS.join('|')}`);
    if (!Array.isArray(slot.consumers) || slot.consumers.length === 0) issue(`${base}.consumers`, 'type', 'must be a non-empty array');
    else for (let j = 0; j < slot.consumers.length; j++) {
      const consumer = slot.consumers[j]; const path = `${base}.consumers[${j}]`;
      if (!record(consumer)) { issue(path, 'type', 'must be an object'); continue; }
      for (const error of keysExactly(consumer, ['document', 'jsonPointer'])) issue(path, 'closed', error);
      if (!text(consumer.document) || /^(?:https?|data|file):/i.test(String(consumer.document))) issue(`${path}.document`, 'document', 'must be a repository-relative document id');
      if (!text(consumer.jsonPointer) || !String(consumer.jsonPointer).startsWith('/')) issue(`${path}.jsonPointer`, 'pointer', 'must be an RFC 6901 JSON pointer');
      const identity = `${consumer.document}#${consumer.jsonPointer}`;
      if (consumerKeys.has(identity)) issue(path, 'duplicate', `duplicate consumer ${identity}`); else consumerKeys.add(identity);
    }
    if (!record(slot.asset)) issue(`${base}.asset`, 'type', 'must be an object');
    else {
      for (const error of keysExactly(slot.asset, ['usage', 'colorSpace', 'outputPx', 'alpha', 'sampling'], ['frame'])) issue(`${base}.asset`, 'closed', error);
      if (slot.asset.usage !== 'sprite') issue(`${base}.asset.usage`, 'enum', 'Life visual slots currently require sprite');
      if (slot.asset.colorSpace !== 'srgb') issue(`${base}.asset.colorSpace`, 'enum', 'Life visual slots currently require srgb');
      if (!oneOf(slot.asset.alpha, ASSET_SLOT_ALPHA)) issue(`${base}.asset.alpha`, 'enum', `must be ${ASSET_SLOT_ALPHA.join('|')}`);
      if (!oneOf(slot.asset.sampling, ASSET_SLOT_SAMPLING)) issue(`${base}.asset.sampling`, 'enum', `must be ${ASSET_SLOT_SAMPLING.join('|')}`);
      validateSize(slot.asset.outputPx, `${base}.asset.outputPx`, issue);
      if (slot.asset.frame !== undefined) {
        if (!record(slot.asset.frame)) issue(`${base}.asset.frame`, 'type', 'must be an object');
        else { for (const error of keysExactly(slot.asset.frame, ['kind', 'index'])) issue(`${base}.asset.frame`, 'closed', error); if (slot.asset.frame.kind !== 'sheet-index' || slot.asset.frame.index !== 0) issue(`${base}.asset.frame`, 'frame', 'Life supports only sprite-sheet frame index 0; named atlas frames are unsupported'); }
      }
    }
    if (!record(slot.render)) issue(`${base}.render`, 'type', 'must be an object');
    else {
      for (const error of keysExactly(slot.render, ['display', 'anchor', 'fit', 'offset', 'fallbackRole'])) issue(`${base}.render`, 'closed', error);
      validateSize(slot.render.display, `${base}.render.display`, issue, true);
      validatePoint(slot.render.anchor, `${base}.render.anchor`, issue, true);
      validatePoint(slot.render.offset, `${base}.render.offset`, issue);
      if (!oneOf(slot.render.fit, ASSET_SLOT_FITS)) issue(`${base}.render.fit`, 'enum', `must be ${ASSET_SLOT_FITS.join('|')}; arbitrary stretch is forbidden`);
      if (!oneOf(slot.render.fallbackRole, ASSET_SLOT_FALLBACK_ROLES)) issue(`${base}.render.fallbackRole`, 'enum', `must be ${ASSET_SLOT_FALLBACK_ROLES.join('|')}`);
    }
    if (!record(slot.generation)) issue(`${base}.generation`, 'type', 'must be an object');
    else {
      for (const error of keysExactly(slot.generation, ['briefVersion', 'styleId', 'prompt', 'negativePrompt'], ['semanticPrompt'])) issue(`${base}.generation`, 'closed', error);
      if (!Number.isInteger(slot.generation.briefVersion) || Number(slot.generation.briefVersion) < 1) issue(`${base}.generation.briefVersion`, 'version', 'must be a positive integer');
      if (!text(slot.generation.styleId) || !text(slot.generation.prompt)) issue(`${base}.generation`, 'text', 'styleId and prompt must be non-empty strings');
      if (!Array.isArray(slot.generation.negativePrompt) || slot.generation.negativePrompt.some((value) => !text(value))) issue(`${base}.generation.negativePrompt`, 'type', 'must be an array of non-empty strings');
    }
    if (artDirection) for (const value of validateLifeArtDirectionSlot(artDirection, slot as unknown as AssetSlotBrief, base)) issue(value.path, value.code, value.message);
    if (!record(slot.governance)) issue(`${base}.governance`, 'type', 'must be an object');
    else {
      for (const error of keysExactly(slot.governance, ['approval', 'humanApprovalRequired', 'licenseRequired', 'briefFingerprint'], ['contentHash'])) issue(`${base}.governance`, 'closed', error);
      if (!oneOf(slot.governance.approval, ASSET_SLOT_APPROVALS)) issue(`${base}.governance.approval`, 'enum', `must be ${ASSET_SLOT_APPROVALS.join('|')}`);
      if (slot.governance.humanApprovalRequired !== true || slot.governance.licenseRequired !== true) issue(`${base}.governance`, 'governance', 'humanApprovalRequired and licenseRequired must be true');
      if (!text(slot.governance.briefFingerprint)) issue(`${base}.governance.briefFingerprint`, 'fingerprint', 'must be tool-derived');
      if (slot.governance.approval === 'approved' && !/^sha256:[0-9a-f]{64}$/.test(String(slot.governance.contentHash ?? ''))) issue(`${base}.governance.contentHash`, 'content_hash', 'approved assets require a tool-derived sha256 content hash');
    }
  }
  if (issues.length === 0) for (let i = 0; i < raw.slots.length; i++) {
    const slot = raw.slots[i] as unknown as AssetSlotBrief;
    if (slot.governance.briefFingerprint !== deriveAssetSlotBriefFingerprint(slot)) issue(`$.slots[${i}].governance.briefFingerprint`, 'fingerprint', 'does not match the tool-derived normalized brief');
  }
  return issues;
}

export function parseAssetSlotManifest(raw: unknown): AssetSlotManifest {
  const issues = validateAssetSlotManifest(raw);
  if (issues.length > 0) throw new Error(`Invalid AssetSlotManifest:\n${issues.map((value) => `${value.path} [${value.code}] ${value.message}`).join('\n')}`);
  return raw as AssetSlotManifest;
}

export function resolveJsonPointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document;
  if (!pointer.startsWith('/')) return undefined;
  let value: unknown = document;
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(value)) { const index = /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1; value = index >= 0 ? value[index] : undefined; }
    else if (record(value)) value = value[key];
    else return undefined;
  }
  return value;
}

/** Cross-file authoring guard. It is read-only and never registers or mutates assets. */
export function validateAssetSlotClosure(
  manifest: AssetSlotManifest,
  documents: Readonly<Record<string, unknown>>,
  index: AssetIndex,
  expectedKeys: readonly string[],
): readonly AssetSlotIssue[] {
  const issues: AssetSlotIssue[] = [];
  const entries = new Map(index.assets.map((entry) => [entry.id, entry]));
  const slotKeys = new Set(manifest.slots.map((slot) => slot.assetKey));
  for (const key of expectedKeys) if (!slotKeys.has(key)) issues.push({ path: '$.slots', code: 'missing_slot', message: `Life visual key has no slot: ${key}` });
  for (const slot of manifest.slots) {
    if (!expectedKeys.includes(slot.assetKey)) issues.push({ path: `slot:${slot.slotId}`, code: 'orphan_slot', message: `slot assetKey is not a Life visual consumer: ${slot.assetKey}` });
    for (const consumer of slot.consumers) {
      const document = documents[consumer.document];
      if (document === undefined) issues.push({ path: `slot:${slot.slotId}`, code: 'missing_document', message: consumer.document });
      else if (resolveJsonPointer(document, consumer.jsonPointer) !== slot.assetKey) issues.push({ path: `slot:${slot.slotId}`, code: 'consumer_mismatch', message: `${consumer.document}#${consumer.jsonPointer} must equal ${slot.assetKey}` });
    }
    const entry = entries.get(slot.assetKey);
    if (!entry || entry.status !== 'filled' || entry.type !== 'texture') { issues.push({ path: `slot:${slot.slotId}`, code: 'missing_asset', message: `${slot.assetKey} must resolve to a filled texture` }); continue; }
    validateEntryAgainstSlot(entry, slot, issues, manifest.artDirection !== undefined);
  }
  return issues;
}

/** Rejects candidates or art-replace rows that have become active without the human approval edge. */
export function validateAssetPendingIsolation(index: AssetIndex, pendingRaw: unknown, ledgerRaw?: unknown): readonly AssetSlotIssue[] {
  const issues: AssetSlotIssue[] = [];
  const entries = new Map(index.assets.map((entry) => [entry.id, entry]));
  const pending = record(pendingRaw) && Array.isArray(pendingRaw.pending) ? pendingRaw.pending : [];
  for (let i = 0; i < pending.length; i++) {
    const candidate = pending[i];
    if (!record(candidate) || !text(candidate.id)) { issues.push({ path: `pending[${i}]`, code: 'pending_shape', message: 'pending entry requires id' }); continue; }
    const provenance = record(candidate.provenance) ? candidate.provenance : {};
    if (!text(candidate.license) || !text(provenance.model) || !text(provenance.prompt) || !text(provenance.generatedAt)) issues.push({ path: `pending:${candidate.id}`, code: 'pending_provenance', message: 'pending candidate requires license/model/prompt/generatedAt' });
    const active = entries.get(candidate.id);
    if (active?.path !== undefined && active.path === candidate.path) issues.push({ path: `pending:${candidate.id}`, code: 'approval_bypass', message: 'pending candidate path is already active in AssetIndex' });
  }
  const rows = record(ledgerRaw) && Array.isArray(ledgerRaw.rows) ? ledgerRaw.rows : [];
  for (const row of rows) {
    if (!record(row) || !['generated', 'replaced'].includes(String(row.status)) || !record(row.gen) || row.gen.mock === true || !text(row.skinKey)) continue;
    const active = entries.get(row.skinKey); const provenance = active && record(active.provenance) ? active.provenance : {};
    if (active?.path === row.gen.servedPath && (!provenance.approvedAt || !provenance.reviewedBy)) issues.push({ path: `ledger:${String(row.no)}`, code: 'replacement_bypass', message: `${row.skinKey} was activated without approval evidence` });
  }
  return issues;
}

function validateEntryAgainstSlot(entry: AssetIndexEntry, slot: AssetSlotBrief, issues: AssetSlotIssue[], strictProfile: boolean): void {
  const spec = entry.spec ?? {};
  const at = `slot:${slot.slotId}`;
  if ((spec.usage ?? 'sprite') !== slot.asset.usage) issues.push({ path: at, code: 'usage', message: `index usage must equal ${slot.asset.usage}` });
  if ((spec.colorSpace ?? 'srgb') !== slot.asset.colorSpace) issues.push({ path: at, code: 'color_space', message: `index colorSpace must equal ${slot.asset.colorSpace}` });
  if (spec.width !== slot.asset.outputPx.width || spec.height !== slot.asset.outputPx.height) issues.push({ path: at, code: 'output_size', message: `index width/height must equal ${slot.asset.outputPx.width}x${slot.asset.outputPx.height}` });
  if (strictProfile && entry.style !== slot.generation.styleId) issues.push({ path: at, code: 'style', message: `index style must equal ${slot.generation.styleId}` });
  if (strictProfile && spec.sampling !== slot.asset.sampling) issues.push({ path: at, code: 'sampling', message: `index sampling must equal ${slot.asset.sampling}` });
  // Legacy placeholders predate the transparent metadata. Keep them usable while
  // requiring every approved replacement to prove the declared alpha contract.
  if (spec.transparent !== undefined || slot.governance.approval === 'approved') {
    const transparent = spec.transparent === true;
    if ((slot.asset.alpha === 'transparent') !== transparent) issues.push({ path: at, code: 'alpha', message: `index transparent must match ${slot.asset.alpha}` });
  }
  if (slot.governance.licenseRequired && !text(entry.license)) issues.push({ path: at, code: 'license', message: 'filled index entry requires license metadata' });
}

export interface LifeVisualRule {
  readonly slotId: string;
  readonly assetKey: string;
  readonly kind: AssetSlotKind;
  readonly sourcePx: AssetSlotSize;
  readonly frameIndex?: 0;
  readonly display: AssetSlotSize & { readonly unit: AssetSlotDisplayUnit };
  readonly anchor: AssetSlotPoint;
  readonly fit: AssetSlotFit;
  readonly offset: AssetSlotPoint;
  readonly fallbackRole: AssetSlotFallbackRole;
  readonly sampling: AssetSlotSampling;
}

export type LifeVisualCatalog = ReadonlyMap<string, LifeVisualRule>;

/** Sanitizes authoring data into render-only rules: no prompt, path, license, provider, model or bytes cross this edge. */
export function compileLifeVisualCatalog(manifest: AssetSlotManifest): LifeVisualCatalog {
  return new Map(manifest.slots.map((slot) => [slot.assetKey, {
    slotId: slot.slotId, assetKey: slot.assetKey, kind: slot.kind, sourcePx: slot.asset.outputPx,
    ...(slot.asset.frame === undefined ? {} : { frameIndex: slot.asset.frame.index }),
    display: slot.render.display, anchor: slot.render.anchor, fit: slot.render.fit, offset: slot.render.offset,
    fallbackRole: slot.render.fallbackRole, sampling: slot.asset.sampling,
  }]));
}
