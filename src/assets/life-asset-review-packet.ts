import type { AssetSlotBrief, AssetSlotManifest } from './asset-slot-brief.js';
import { stableAssetSlotJson, validateAssetSlotManifest } from './asset-slot-brief.js';
import {
  ASSET_CANDIDATE_PLAN_SCHEMA,
  planLifeAssetCandidates,
  type AiAssetCandidateRequest,
  type AssetCandidatePlan,
  type AssetCandidatePlanReason,
  type LocalAssetCandidate,
} from './life-asset-candidate-plan.js';
import type { LibraryRecord } from './library.js';

export const LIFE_ASSET_REVIEW_PACKET_SCHEMA = 'zerocraft.life-asset-review-packet.v1' as const;
export const LIFE_ASSET_REVIEW_STATUS = 'pending-human-review' as const;

export interface LifeAssetReviewDiagnostic {
  readonly code: string;
  readonly detail: string;
  readonly slotId?: string;
}

export interface LifeAssetReviewSpec {
  readonly kind: AssetSlotBrief['kind'];
  readonly usage: AssetSlotBrief['asset']['usage'];
  readonly colorSpace: AssetSlotBrief['asset']['colorSpace'];
  readonly outputPx: AssetSlotBrief['asset']['outputPx'];
  readonly alpha: AssetSlotBrief['asset']['alpha'];
  readonly sampling: AssetSlotBrief['asset']['sampling'];
  readonly styleId: string;
}

export interface LifeAssetReviewRender {
  readonly display: AssetSlotBrief['render']['display'];
  readonly anchor: AssetSlotBrief['render']['anchor'];
  readonly fit: AssetSlotBrief['render']['fit'];
  readonly offset: AssetSlotBrief['render']['offset'];
}

interface LifeAssetReviewItemBase {
  readonly slotId: string;
  readonly assetKey: string;
  readonly reviewStatus: typeof LIFE_ASSET_REVIEW_STATUS;
}

interface LifeAssetReviewableItemBase extends LifeAssetReviewItemBase {
  readonly spec: LifeAssetReviewSpec;
  readonly render: LifeAssetReviewRender;
  readonly consumers: AssetSlotBrief['consumers'];
}

export interface LifeAssetLocalReviewItem extends LifeAssetReviewableItemBase {
  readonly decision: 'local-candidate';
  readonly candidate: LocalAssetCandidate;
}

export interface LifeAssetAiReviewItem extends LifeAssetReviewableItemBase {
  readonly decision: 'ai-required';
  readonly request: AiAssetCandidateRequest;
}

export interface LifeAssetInvalidReviewItem extends LifeAssetReviewItemBase {
  readonly decision: 'invalid';
  readonly reasons: readonly AssetCandidatePlanReason[];
}

export type LifeAssetReviewItem = LifeAssetLocalReviewItem | LifeAssetAiReviewItem | LifeAssetInvalidReviewItem;

export interface LifeAssetReviewPacket {
  readonly schemaVersion: typeof LIFE_ASSET_REVIEW_PACKET_SCHEMA;
  readonly game: string;
  readonly valid: boolean;
  readonly localCandidateCount: number;
  readonly aiRequiredCount: number;
  readonly invalidCount: number;
  readonly items: readonly LifeAssetReviewItem[];
  readonly diagnostics: readonly LifeAssetReviewDiagnostic[];
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const opaqueAssetKey = (value: unknown): value is string => nonEmpty(value) && !/[\\/]/.test(value) && !/^(?:https?|data|file):/i.test(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

function diagnostic(code: string, detail: string, slotId?: string): LifeAssetReviewDiagnostic {
  return slotId === undefined ? { code, detail } : { code, detail, slotId };
}

function normalizeDiagnostics(values: readonly LifeAssetReviewDiagnostic[]): LifeAssetReviewDiagnostic[] {
  const unique = new Map<string, LifeAssetReviewDiagnostic>();
  for (const value of values) unique.set(`${value.slotId ?? ''}\u0000${value.code}\u0000${value.detail}`, value);
  return [...unique.values()].sort((a, b) => (a.slotId ?? '').localeCompare(b.slotId ?? '') || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail));
}

function invalidItems(rawManifest: unknown, diagnostics: readonly LifeAssetReviewDiagnostic[]): LifeAssetInvalidReviewItem[] {
  if (!record(rawManifest) || !Array.isArray(rawManifest.slots)) return [];
  const reasons = diagnostics.map(({ code, detail }) => ({ code, detail }));
  return rawManifest.slots.flatMap((value) => {
    if (!record(value) || !nonEmpty(value.slotId) || !opaqueAssetKey(value.assetKey)) return [];
    return [{ slotId: value.slotId, assetKey: value.assetKey, decision: 'invalid' as const, reviewStatus: LIFE_ASSET_REVIEW_STATUS, reasons }];
  }).sort((a, b) => a.slotId.localeCompare(b.slotId) || a.assetKey.localeCompare(b.assetKey));
}

function invalidPacket(rawManifest: unknown, values: readonly LifeAssetReviewDiagnostic[]): LifeAssetReviewPacket {
  const diagnostics = normalizeDiagnostics(values);
  const items = invalidItems(rawManifest, diagnostics);
  const rawSlotCount = record(rawManifest) && Array.isArray(rawManifest.slots) ? rawManifest.slots.length : 1;
  return {
    schemaVersion: LIFE_ASSET_REVIEW_PACKET_SCHEMA,
    game: record(rawManifest) && nonEmpty(rawManifest.game) ? rawManifest.game : '',
    valid: false,
    localCandidateCount: 0,
    aiRequiredCount: 0,
    invalidCount: Math.max(items.length, rawSlotCount),
    items,
    diagnostics,
  };
}

function validCandidate(value: unknown): value is LocalAssetCandidate {
  return record(value) && exactKeys(value, ['id', 'source', 'score', 'sourceFingerprint']) && nonEmpty(value.id)
    && ['project', 'artlib', 'game'].includes(String(value.source))
    && typeof value.score === 'number' && Number.isFinite(value.score)
    && typeof value.sourceFingerprint === 'string' && /^library-record-v1:[0-9a-f]{8}$/.test(value.sourceFingerprint);
}

function expectedAiRequest(slot: AssetSlotBrief): AiAssetCandidateRequest {
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

function reviewSpec(slot: AssetSlotBrief): LifeAssetReviewSpec {
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

function reviewRender(slot: AssetSlotBrief): LifeAssetReviewRender {
  return {
    display: { unit: slot.render.display.unit, width: slot.render.display.width, height: slot.render.display.height },
    anchor: { x: slot.render.anchor.x, y: slot.render.anchor.y },
    fit: slot.render.fit,
    offset: { x: slot.render.offset.x, y: slot.render.offset.y },
  };
}

function reviewConsumers(slot: AssetSlotBrief): AssetSlotBrief['consumers'] {
  return slot.consumers.map((consumer) => ({ document: consumer.document, jsonPointer: consumer.jsonPointer }))
    .sort((a, b) => a.document.localeCompare(b.document) || a.jsonPointer.localeCompare(b.jsonPointer));
}

function reconcilePlan(manifest: AssetSlotManifest, rawPlan: unknown, expectedPlan: AssetCandidatePlan): LifeAssetReviewDiagnostic[] {
  const diagnostics: LifeAssetReviewDiagnostic[] = [];
  if (!record(rawPlan) || !exactKeys(rawPlan, ['schemaVersion', 'game', 'items', 'handoff'])) {
    return [diagnostic('plan_shape', 'Candidate plan must use the closed v1 shape')];
  }
  if (rawPlan.schemaVersion !== ASSET_CANDIDATE_PLAN_SCHEMA) diagnostics.push(diagnostic('plan_schema', 'Candidate plan schema does not match v1'));
  if (rawPlan.game !== manifest.game) diagnostics.push(diagnostic('plan_game', 'Candidate plan game does not match the manifest'));
  if (!Array.isArray(rawPlan.items)) return [...diagnostics, diagnostic('plan_items', 'Candidate plan items must be an array')];
  if (!record(rawPlan.handoff) || stableAssetSlotJson(rawPlan.handoff) !== stableAssetSlotJson({
    owner: 'asset-manager', next: ['vendor-or-create-candidate', 'human-review', 'asset-index-registration'],
  })) diagnostics.push(diagnostic('plan_handoff', 'Candidate plan handoff does not match the asset-manager boundary'));

  const slots = [...manifest.slots].sort((a, b) => a.slotId.localeCompare(b.slotId));
  const items = rawPlan.items;
  const seen = new Set<string>();
  const bySlot = new Map<string, Record<string, unknown>>();
  const expectedBySlot = new Map(expectedPlan.items.map((item) => [item.slotId, item]));
  for (const value of items) {
    if (!record(value) || !nonEmpty(value.slotId) || seen.has(value.slotId)) {
      diagnostics.push(diagnostic('plan_slot_set', 'Candidate plan slot identities are missing or duplicated'));
      continue;
    }
    seen.add(value.slotId);
    bySlot.set(value.slotId, value);
  }
  if (items.length !== slots.length || bySlot.size !== slots.length) diagnostics.push(diagnostic('plan_slot_set', 'Candidate plan slot set does not match the manifest'));
  const orderedIds = items.map((value) => record(value) && nonEmpty(value.slotId) ? value.slotId : '');
  if (stableAssetSlotJson(orderedIds) !== stableAssetSlotJson(slots.map((slot) => slot.slotId))) diagnostics.push(diagnostic('plan_slot_order', 'Candidate plan items are not in stable slotId order'));

  for (const slot of slots) {
    const item = bySlot.get(slot.slotId);
    if (!item) { diagnostics.push(diagnostic('plan_slot_set', 'Candidate plan is missing a manifest slot', slot.slotId)); continue; }
    const expected = expectedBySlot.get(slot.slotId);
    if (!expected) { diagnostics.push(diagnostic('plan_slot_set', 'Accepted planner did not produce the manifest slot', slot.slotId)); continue; }
    if (item.assetKey !== slot.assetKey) diagnostics.push(diagnostic('plan_asset_key', 'Candidate plan assetKey does not match the manifest slot', slot.slotId));
    if (stableAssetSlotJson(item.reasons) !== stableAssetSlotJson(expected.reasons)) {
      diagnostics.push(diagnostic('plan_reasons', 'Candidate plan reasons do not match the accepted planner result', slot.slotId));
    }
    if (item.decision !== expected.decision) {
      diagnostics.push(diagnostic('plan_decision', 'Candidate plan decision does not match the accepted planner result', slot.slotId));
    }
    if (item.decision === 'local-candidate') {
      if (!exactKeys(item, ['slotId', 'assetKey', 'decision', 'reasons', 'candidate']) || !validCandidate(item.candidate)
        || stableAssetSlotJson(item.candidate) !== stableAssetSlotJson(expected.candidate)) {
        diagnostics.push(diagnostic('plan_decision_payload', 'Local decision must contain only a valid candidate payload', slot.slotId));
      }
    } else if (item.decision === 'ai-required') {
      if (!exactKeys(item, ['slotId', 'assetKey', 'decision', 'reasons', 'request'])
        || stableAssetSlotJson(item.request) !== stableAssetSlotJson(expected.request)
        || stableAssetSlotJson(item.request) !== stableAssetSlotJson(expectedAiRequest(slot))) {
        diagnostics.push(diagnostic('plan_decision_payload', 'AI decision must contain only the slot-owned request payload', slot.slotId));
      }
    } else if (item.decision === 'invalid') {
      diagnostics.push(diagnostic('plan_invalid_for_valid_manifest', 'A valid manifest cannot produce an invalid candidate decision', slot.slotId));
    } else diagnostics.push(diagnostic('plan_decision', 'Candidate plan decision is outside the closed set', slot.slotId));
  }
  return diagnostics;
}

/**
 * Verification seam for persisted/future UI plan transport. It is intentionally not re-exported by the public barrel;
 * callers should normally use buildLifeAssetReviewPacket(), which always obtains its plan from the accepted planner.
 */
export function buildLifeAssetReviewPacketFromPlan(
  rawManifest: unknown,
  rawPlan: unknown,
  records: readonly LibraryRecord[],
): LifeAssetReviewPacket {
  try {
    const issues = validateAssetSlotManifest(rawManifest);
    if (issues.length > 0) return invalidPacket(rawManifest, issues.map((issue) => diagnostic(`manifest_${issue.code}`, `AssetSlotBrief validation failed (${issue.code})`)));
    const manifest = rawManifest as AssetSlotManifest;
    const diagnostics = reconcilePlan(manifest, rawPlan, planLifeAssetCandidates(rawManifest, records));
    if (diagnostics.length > 0) return invalidPacket(manifest, diagnostics);
    const plan = rawPlan as { readonly items: readonly Record<string, unknown>[] };
    const planItems = new Map(plan.items.map((item) => [item.slotId as string, item]));
    const items: LifeAssetReviewItem[] = [...manifest.slots].sort((a, b) => a.slotId.localeCompare(b.slotId)).map((slot) => {
      const item = planItems.get(slot.slotId)!;
      const common = {
        slotId: slot.slotId,
        assetKey: slot.assetKey,
        reviewStatus: LIFE_ASSET_REVIEW_STATUS,
        spec: reviewSpec(slot),
        render: reviewRender(slot),
        consumers: reviewConsumers(slot),
      };
      return item.decision === 'local-candidate'
        ? { ...common, decision: 'local-candidate' as const, candidate: { ...(item.candidate as LocalAssetCandidate) } }
        : { ...common, decision: 'ai-required' as const, request: expectedAiRequest(slot) };
    });
    return {
      schemaVersion: LIFE_ASSET_REVIEW_PACKET_SCHEMA,
      game: manifest.game,
      valid: true,
      localCandidateCount: items.filter((item) => item.decision === 'local-candidate').length,
      aiRequiredCount: items.filter((item) => item.decision === 'ai-required').length,
      invalidCount: 0,
      items,
      diagnostics: [],
    };
  } catch {
    return invalidPacket(rawManifest, [diagnostic('packet_unreadable', 'Review packet input could not be verified')]);
  }
}

/** Read-only authoring projection. No provider, filesystem, AssetIndex, pending queue or approval edge is touched. */
export function buildLifeAssetReviewPacket(rawManifest: unknown, records: readonly LibraryRecord[]): LifeAssetReviewPacket {
  return buildLifeAssetReviewPacketFromPlan(rawManifest, planLifeAssetCandidates(rawManifest, records), records);
}
