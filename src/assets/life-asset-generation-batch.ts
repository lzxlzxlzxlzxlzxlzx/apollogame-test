import type { AssetSlotBrief, AssetSlotManifest, AssetSlotPoint, AssetSlotSize } from './asset-slot-brief.js';
import { stableAssetSlotJson, validateAssetSlotManifest } from './asset-slot-brief.js';
import {
  planLifeAssetCandidates,
  type AssetCandidatePlan,
  type AssetCandidatePlanReason,
  type LocalAssetCandidate,
} from './life-asset-candidate-plan.js';
import {
  buildLifeAssetReviewPacket,
  buildLifeAssetReviewPacketFromPlan,
  type LifeAssetReviewPacket,
  type LifeAssetReviewSpec,
} from './life-asset-review-packet.js';
import type { LibraryRecord } from './library.js';

export const LIFE_ASSET_GENERATION_BATCH_SCHEMA = 'zerocraft.life-asset-generation-batch.v1' as const;
export const LIFE_ASSET_2D_PROVIDER = 'qwen' as const;
export const LIFE_ASSET_2D_PROVIDERS = ['qwen', 'gpt-image'] as const;
export type LifeAsset2dProvider = typeof LIFE_ASSET_2D_PROVIDERS[number];

export interface LifeAssetProviderSelection {
  /** Backwards-compatible batch default. */
  readonly provider?: LifeAsset2dProvider;
  /** Optional authoring-time overrides; this never enters AssetSlotBrief or runtime data. */
  readonly providersBySlot?: Readonly<Record<string, LifeAsset2dProvider>>;
}

export interface LifeAssetGenerationDiagnostic {
  readonly code: string;
  readonly detail: string;
  readonly slotId?: string;
}

interface LifeAssetGenerationItemBase {
  readonly slotId: string;
  readonly assetKey: string;
}

export interface LifeAssetLocalReviewExecution extends LifeAssetGenerationItemBase {
  readonly action: 'local-review';
  readonly candidate: LocalAssetCandidate;
  readonly spec: LifeAssetReviewSpec;
  readonly anchor: AssetSlotPoint;
  readonly consumers: AssetSlotBrief['consumers'];
  readonly briefFingerprint: string;
}

export interface LifeAssetAiGenerationExecution extends LifeAssetGenerationItemBase {
  readonly action: 'ai-generate';
  readonly provider: LifeAsset2dProvider;
  readonly prompt: string;
  readonly negativePrompt: readonly string[];
  readonly usage: AssetSlotBrief['asset']['usage'];
  readonly colorSpace: AssetSlotBrief['asset']['colorSpace'];
  readonly outputPx: AssetSlotSize;
  readonly alpha: AssetSlotBrief['asset']['alpha'];
  readonly sampling: AssetSlotBrief['asset']['sampling'];
  readonly anchor: AssetSlotPoint;
  readonly briefFingerprint: string;
}

export interface LifeAssetInvalidGenerationExecution extends LifeAssetGenerationItemBase {
  readonly action: 'invalid';
  readonly diagnostics: readonly LifeAssetGenerationDiagnostic[];
}

export type LifeAssetGenerationExecution =
  | LifeAssetLocalReviewExecution
  | LifeAssetAiGenerationExecution
  | LifeAssetInvalidGenerationExecution;

export interface LifeAssetGenerationBatch {
  readonly schemaVersion: typeof LIFE_ASSET_GENERATION_BATCH_SCHEMA;
  readonly game: string;
  readonly valid: boolean;
  readonly items: readonly LifeAssetGenerationExecution[];
  readonly diagnostics: readonly LifeAssetGenerationDiagnostic[];
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function normalizeDiagnostics(values: readonly LifeAssetGenerationDiagnostic[]): LifeAssetGenerationDiagnostic[] {
  const unique = new Map<string, LifeAssetGenerationDiagnostic>();
  for (const value of values) unique.set(`${value.slotId ?? ''}\u0000${value.code}\u0000${value.detail}`, value);
  return [...unique.values()].sort((a, b) => (a.slotId ?? '').localeCompare(b.slotId ?? '') || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail));
}

function slotIdentities(rawManifest: unknown, fallbackPlan?: AssetCandidatePlan): Array<{ slotId: string; assetKey: string }> {
  if (record(rawManifest) && Array.isArray(rawManifest.slots)) {
    const values = rawManifest.slots.flatMap((value) => record(value) && nonEmpty(value.slotId)
      ? [{ slotId: value.slotId, assetKey: nonEmpty(value.assetKey) ? value.assetKey : '' }]
      : []);
    if (values.length > 0) return values.sort((a, b) => a.slotId.localeCompare(b.slotId) || a.assetKey.localeCompare(b.assetKey));
  }
  return (fallbackPlan?.items ?? []).map(({ slotId, assetKey }) => ({ slotId, assetKey }))
    .sort((a, b) => a.slotId.localeCompare(b.slotId) || a.assetKey.localeCompare(b.assetKey));
}

function invalidBatch(
  rawManifest: unknown,
  values: readonly LifeAssetGenerationDiagnostic[],
  fallbackPlan?: AssetCandidatePlan,
): LifeAssetGenerationBatch {
  const diagnostics = normalizeDiagnostics(values);
  return {
    schemaVersion: LIFE_ASSET_GENERATION_BATCH_SCHEMA,
    game: record(rawManifest) && nonEmpty(rawManifest.game) ? rawManifest.game : '',
    valid: false,
    items: slotIdentities(rawManifest, fallbackPlan).map(({ slotId, assetKey }) => ({ slotId, assetKey, action: 'invalid', diagnostics })),
    diagnostics,
  };
}

function reasonsToDiagnostics(reasons: readonly AssetCandidatePlanReason[], slotId?: string): LifeAssetGenerationDiagnostic[] {
  return reasons.map(({ code, detail }) => ({ code, detail, ...(slotId === undefined ? {} : { slotId }) }));
}

function slotSpec(slot: AssetSlotBrief): LifeAssetReviewSpec {
  return {
    kind: slot.kind,
    usage: slot.asset.usage,
    colorSpace: slot.asset.colorSpace,
    outputPx: { width: slot.asset.outputPx.width, height: slot.asset.outputPx.height },
    alpha: slot.asset.alpha,
    sampling: slot.asset.sampling,
    styleId: slot.generation.styleId,
  };
}

function validateProviderSelection(
  selection: LifeAssetProviderSelection,
  manifest: AssetSlotManifest,
): LifeAssetGenerationDiagnostic[] {
  const diagnostics: LifeAssetGenerationDiagnostic[] = [];
  const accepted = new Set<string>(LIFE_ASSET_2D_PROVIDERS);
  if (selection === null || typeof selection !== 'object' || Array.isArray(selection)) {
    return [{ code: 'provider_selection_shape', detail: 'Provider selection must be an object' }];
  }
  const keys = Object.keys(selection);
  if (keys.some((key) => key !== 'provider' && key !== 'providersBySlot')) {
    diagnostics.push({ code: 'provider_selection_shape', detail: 'Provider selection contains unknown fields' });
  }
  if (selection.provider !== undefined && !accepted.has(selection.provider)) {
    diagnostics.push({ code: 'provider_invalid', detail: `Unsupported Life 2D provider: ${String(selection.provider)}` });
  }
  if (selection.providersBySlot !== undefined) {
    const overrides = selection.providersBySlot;
    if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
      diagnostics.push({ code: 'provider_selection_shape', detail: 'providersBySlot must be an object' });
    } else {
      const slots = new Set(manifest.slots.map((slot) => slot.slotId));
      for (const slotId of Object.keys(overrides).sort()) {
        if (!slots.has(slotId)) diagnostics.push({ code: 'provider_slot_unknown', detail: 'Provider override references an unknown slot', slotId });
        if (!accepted.has(overrides[slotId])) diagnostics.push({ code: 'provider_invalid', detail: `Unsupported Life 2D provider: ${String(overrides[slotId])}`, slotId });
      }
    }
  }
  return diagnostics;
}

function providerForSlot(selection: LifeAssetProviderSelection, slotId: string): LifeAsset2dProvider {
  const override = selection.providersBySlot !== undefined && Object.hasOwn(selection.providersBySlot, slotId)
    ? selection.providersBySlot[slotId]
    : undefined;
  return override ?? selection.provider ?? LIFE_ASSET_2D_PROVIDER;
}

/**
 * Persisted-artifact verification seam. A changed brief, candidate plan, or review packet invalidates the entire batch.
 * The returned plan is pure data and deliberately contains no paths, URLs, provider credentials, bytes, or approval fields.
 */
export function buildLifeAssetGenerationBatchFromArtifacts(
  rawManifest: unknown,
  rawPlan: unknown,
  rawPacket: unknown,
  records: readonly LibraryRecord[],
  selection: LifeAssetProviderSelection = {},
): LifeAssetGenerationBatch {
  try {
    const manifestIssues = validateAssetSlotManifest(rawManifest);
    if (manifestIssues.length > 0) return invalidBatch(rawManifest, manifestIssues.map((issue) => ({
      code: `manifest_${issue.code}`,
      detail: `${issue.path}: ${issue.message}`,
    })));

    const manifest = rawManifest as AssetSlotManifest;
    const providerIssues = validateProviderSelection(selection, manifest);
    if (providerIssues.length > 0) return invalidBatch(manifest, providerIssues);
    const expectedPacket = buildLifeAssetReviewPacketFromPlan(manifest, rawPlan, records);
    if (!expectedPacket.valid) return invalidBatch(manifest, expectedPacket.diagnostics.map(({ code, detail, slotId }) => ({
      code,
      detail,
      ...(slotId === undefined ? {} : { slotId }),
    })));
    if (stableAssetSlotJson(rawPacket) !== stableAssetSlotJson(expectedPacket)) {
      return invalidBatch(manifest, [{ code: 'review_packet_mismatch', detail: 'Review packet does not match the verified manifest and candidate plan' }]);
    }

    const nonPlaceholder = manifest.slots.filter((slot) => slot.governance.approval !== 'placeholder');
    if (nonPlaceholder.length > 0) return invalidBatch(manifest, nonPlaceholder.map((slot) => ({
      code: 'slot_not_placeholder',
      detail: 'Generation batches accept placeholder slots only',
      slotId: slot.slotId,
    })));

    const plan = rawPlan as AssetCandidatePlan;
    const bySlot = new Map(plan.items.map((item) => [item.slotId, item]));
    const items: LifeAssetGenerationExecution[] = [...manifest.slots].sort((a, b) => a.slotId.localeCompare(b.slotId)).map((slot) => {
      const item = bySlot.get(slot.slotId)!;
      if (item.decision === 'local-candidate' && item.candidate) return {
        slotId: slot.slotId,
        assetKey: slot.assetKey,
        action: 'local-review',
        candidate: {
          id: item.candidate.id,
          source: item.candidate.source,
          score: item.candidate.score,
          sourceFingerprint: item.candidate.sourceFingerprint,
        },
        spec: slotSpec(slot),
        anchor: { x: slot.render.anchor.x, y: slot.render.anchor.y },
        consumers: slot.consumers.map((consumer) => ({ document: consumer.document, jsonPointer: consumer.jsonPointer }))
          .sort((a, b) => a.document.localeCompare(b.document) || a.jsonPointer.localeCompare(b.jsonPointer)),
        briefFingerprint: slot.governance.briefFingerprint,
      };
      if (item.decision === 'ai-required' && item.request) return {
        slotId: slot.slotId,
        assetKey: slot.assetKey,
        action: 'ai-generate',
        provider: providerForSlot(selection, slot.slotId),
        prompt: item.request.prompt,
        negativePrompt: [...item.request.negativePrompt],
        usage: item.request.spec.usage,
        colorSpace: item.request.spec.colorSpace,
        outputPx: { width: item.request.spec.outputPx.width, height: item.request.spec.outputPx.height },
        alpha: item.request.spec.alpha,
        sampling: item.request.spec.sampling,
        anchor: { x: slot.render.anchor.x, y: slot.render.anchor.y },
        briefFingerprint: slot.governance.briefFingerprint,
      };
      return {
        slotId: slot.slotId,
        assetKey: slot.assetKey,
        action: 'invalid',
        diagnostics: normalizeDiagnostics(reasonsToDiagnostics(item.reasons, slot.slotId)),
      };
    });
    if (items.some((item) => item.action === 'invalid')) {
      const diagnostics = items.flatMap((item) => item.action === 'invalid' ? item.diagnostics : []);
      return invalidBatch(manifest, diagnostics, plan);
    }
    return { schemaVersion: LIFE_ASSET_GENERATION_BATCH_SCHEMA, game: manifest.game, valid: true, items, diagnostics: [] };
  } catch {
    return invalidBatch(rawManifest, [{ code: 'batch_unreadable', detail: 'Generation batch inputs could not be verified' }]);
  }
}

/** Normal entry point: derives the accepted planner and review packet, then passes through the same verification seam. */
export function buildLifeAssetGenerationBatch(
  rawManifest: unknown,
  records: readonly LibraryRecord[],
  selection: LifeAssetProviderSelection = {},
): LifeAssetGenerationBatch {
  const plan = planLifeAssetCandidates(rawManifest, records);
  const packet: LifeAssetReviewPacket = buildLifeAssetReviewPacket(rawManifest, records);
  return buildLifeAssetGenerationBatchFromArtifacts(rawManifest, plan, packet, records, selection);
}
