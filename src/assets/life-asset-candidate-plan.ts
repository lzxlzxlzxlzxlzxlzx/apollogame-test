import type { AssetSlotBrief, AssetSlotManifest, AssetSlotSize } from './asset-slot-brief.js';
import { stableAssetSlotJson, validateAssetSlotManifest } from './asset-slot-brief.js';
import type { LibraryRecord, LibrarySource } from './library.js';
import { rankRecords } from './library.js';

export const ASSET_CANDIDATE_PLAN_SCHEMA = 'zerocraft.asset-candidate-plan.v1' as const;
export type AssetCandidateDecision = 'local-candidate' | 'ai-required' | 'invalid';

export interface AssetCandidatePlanReason {
  readonly code: string;
  readonly detail: string;
}

export interface LocalAssetCandidate {
  readonly id: string;
  readonly source: LibrarySource;
  readonly score: number;
  /** Safe metadata binding only. Approval always rebuilds it from a trusted index and never trusts this value. */
  readonly sourceFingerprint: string;
}

export interface AiAssetCandidateRequest {
  readonly prompt: string;
  readonly negativePrompt: readonly string[];
  readonly spec: {
    readonly kind: AssetSlotBrief['kind'];
    readonly styleId: string;
    readonly usage: AssetSlotBrief['asset']['usage'];
    readonly colorSpace: AssetSlotBrief['asset']['colorSpace'];
    readonly outputPx: AssetSlotSize;
    readonly alpha: AssetSlotBrief['asset']['alpha'];
    readonly sampling: AssetSlotBrief['asset']['sampling'];
    readonly frame?: { readonly kind: 'sheet-index'; readonly index: 0 };
  };
}

export interface AssetCandidatePlanItem {
  readonly slotId: string;
  readonly assetKey: string;
  readonly decision: AssetCandidateDecision;
  readonly reasons: readonly AssetCandidatePlanReason[];
  readonly candidate?: LocalAssetCandidate;
  readonly request?: AiAssetCandidateRequest;
}

export interface AssetCandidatePlan {
  readonly schemaVersion: typeof ASSET_CANDIDATE_PLAN_SCHEMA;
  readonly game: string;
  readonly items: readonly AssetCandidatePlanItem[];
  readonly handoff: {
    readonly owner: 'asset-manager';
    readonly next: readonly ['vendor-or-create-candidate', 'human-review', 'asset-index-registration'];
  };
}

type CandidateFailure = 'type' | 'status' | 'size' | 'alpha' | 'style' | 'usage' | 'colorSpace' | 'sampling' | 'format' | 'license' | 'path';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const opaqueAssetKey = (value: unknown): value is string => nonEmpty(value) && !/[\\/]/.test(value) && !/^(?:https?|data|file):/i.test(value);

function canonical(value: unknown): string {
  try { return stableAssetSlotJson(value) ?? 'null'; } catch { return '"[unserializable]"'; }
}

function fingerprint(value: unknown): string {
  const source = canonical(value); let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveLocalAssetCandidateFingerprint(candidate: LibraryRecord): string {
  return `library-record-v1:${fingerprint({
    id: candidate.id,
    type: candidate.type,
    status: candidate.status,
    source: candidate.source,
    style: candidate.style ?? null,
    width: candidate.width ?? null,
    height: candidate.height ?? null,
    transparent: candidate.transparent ?? null,
    format: candidate.format ?? null,
    usage: candidate.usage ?? 'sprite',
    colorSpace: candidate.colorSpace ?? 'srgb',
    sampling: candidate.sampling ?? null,
    path: candidate.path ?? null,
    license: candidate.license ?? null,
  })}`;
}

function slotIdentity(value: unknown): { slotId: string; assetKey: string } {
  if (!record(value)) return { slotId: `$invalid:${fingerprint(value)}`, assetKey: '' };
  return {
    slotId: nonEmpty(value.slotId) ? value.slotId : `$invalid:${fingerprint(value)}`,
    assetKey: opaqueAssetKey(value.assetKey) ? value.assetKey : '',
  };
}

function sortedRawSlots(raw: unknown): unknown[] {
  if (!record(raw) || !Array.isArray(raw.slots)) return [];
  return [...raw.slots].sort((a, b) => {
    const ai = slotIdentity(a); const bi = slotIdentity(b);
    return ai.slotId.localeCompare(bi.slotId) || ai.assetKey.localeCompare(bi.assetKey) || canonical(a).localeCompare(canonical(b));
  });
}

function normalizedManifest(raw: unknown, slots: readonly unknown[]): unknown {
  return record(raw) ? { ...raw, slots } : raw;
}

function invalidPlan(raw: unknown, slots: readonly unknown[], codes: readonly string[]): AssetCandidatePlan {
  const normalizedCodes = [...new Set(codes)].sort();
  const reasons = normalizedCodes.map((code) => ({ code: `manifest_${code}`, detail: `AssetSlotBrief validation failed (${code})` }));
  const values = slots.length > 0 ? slots : [undefined];
  return {
    schemaVersion: ASSET_CANDIDATE_PLAN_SCHEMA,
    game: record(raw) && nonEmpty(raw.game) ? raw.game : '',
    items: values.map((value) => ({ ...slotIdentity(value), decision: 'invalid' as const, reasons })),
    handoff: { owner: 'asset-manager', next: ['vendor-or-create-candidate', 'human-review', 'asset-index-registration'] },
  };
}

function candidateFailures(candidate: LibraryRecord, slot: AssetSlotBrief): CandidateFailure[] {
  const failures: CandidateFailure[] = [];
  if (candidate.type !== 'texture') failures.push('type');
  if (candidate.status !== 'filled') failures.push('status');
  if (candidate.width !== slot.asset.outputPx.width || candidate.height !== slot.asset.outputPx.height) failures.push('size');
  if (candidate.transparent !== (slot.asset.alpha === 'transparent')) failures.push('alpha');
  // Style matching is deliberately strict in v1. Broader families would silently mix art direction.
  if (candidate.style !== slot.generation.styleId) failures.push('style');
  if ((candidate.usage ?? 'sprite') !== slot.asset.usage) failures.push('usage');
  if ((candidate.colorSpace ?? 'srgb') !== slot.asset.colorSpace) failures.push('colorSpace');
  if (candidate.sampling !== undefined && candidate.sampling !== slot.asset.sampling) failures.push('sampling');
  // The approval seam can prove pixel size/alpha from PNG bytes today. Other formats must wait for an equally strict decoder.
  if ((candidate.format !== undefined && candidate.format.toLowerCase() !== 'png') || !candidate.path?.toLowerCase().endsWith('.png')) failures.push('format');
  if (!nonEmpty(candidate.license)) failures.push('license');
  if (!nonEmpty(candidate.path)) failures.push('path');
  return failures;
}

function aiRequest(slot: AssetSlotBrief): AiAssetCandidateRequest {
  return {
    prompt: slot.generation.prompt,
    negativePrompt: [...slot.generation.negativePrompt],
    spec: {
      kind: slot.kind,
      styleId: slot.generation.styleId,
      usage: slot.asset.usage,
      colorSpace: slot.asset.colorSpace,
      outputPx: { width: slot.asset.outputPx.width, height: slot.asset.outputPx.height },
      alpha: slot.asset.alpha,
      sampling: slot.asset.sampling,
      ...(slot.asset.frame === undefined ? {} : { frame: { kind: slot.asset.frame.kind, index: slot.asset.frame.index } }),
    },
  };
}

function planSlot(slot: AssetSlotBrief, records: readonly LibraryRecord[]): AssetCandidatePlanItem {
  const ranked = rankRecords(records, slot.generation.prompt);
  const qualified = ranked.filter(({ record: candidate }) => candidateFailures(candidate, slot).length === 0);
  const selected = qualified[0];
  if (selected) return {
    slotId: slot.slotId,
    assetKey: slot.assetKey,
    decision: 'local-candidate',
    reasons: [{ code: 'local_candidate_selected', detail: `ranked=${ranked.length};candidate=${selected.record.id};score=${selected.score}` }],
    candidate: {
      id: selected.record.id,
      source: selected.record.source,
      score: selected.score,
      sourceFingerprint: deriveLocalAssetCandidateFingerprint(selected.record),
    },
  };
  const rejected = [...new Set(ranked.flatMap(({ record: candidate }) => candidateFailures(candidate, slot)))].sort();
  return {
    slotId: slot.slotId,
    assetKey: slot.assetKey,
    decision: 'ai-required',
    reasons: ranked.length === 0
      ? [{ code: 'library_query_empty', detail: 'rankRecords returned no prompt match' }]
      : [{ code: 'no_qualified_local_candidate', detail: `ranked=${ranked.length};rejected=${rejected.join(',')}` }],
    request: aiRequest(slot),
  };
}

/**
 * Read-only authoring planner. It never touches files, pending data, AssetIndex, AI providers or the Life runtime.
 * Invalid/unparsed input is represented as stable invalid plan items instead of throwing a partial plan.
 */
export function planLifeAssetCandidates(rawManifest: unknown, records: readonly LibraryRecord[]): AssetCandidatePlan {
  try {
    const slots = sortedRawSlots(rawManifest);
    const normalized = normalizedManifest(rawManifest, slots);
    const issues = validateAssetSlotManifest(normalized);
    if (issues.length > 0) return invalidPlan(normalized, slots, issues.map((issue) => issue.code));
    const manifest = normalized as AssetSlotManifest;
    return {
      schemaVersion: ASSET_CANDIDATE_PLAN_SCHEMA,
      game: manifest.game,
      items: manifest.slots.map((slot) => planSlot(slot, records)),
      handoff: { owner: 'asset-manager', next: ['vendor-or-create-candidate', 'human-review', 'asset-index-registration'] },
    };
  } catch {
    return invalidPlan(rawManifest, [], ['unreadable']);
  }
}
