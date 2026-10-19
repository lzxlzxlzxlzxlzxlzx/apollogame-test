import { describe, expect, it } from 'vitest';
import { deriveAssetSlotBriefFingerprint, type AssetSlotBrief } from './asset-slot-brief.js';
import { planLifeAssetCandidates } from './life-asset-candidate-plan.js';
import {
  buildLifeAssetGenerationBatch,
  buildLifeAssetGenerationBatchFromArtifacts,
  LIFE_ASSET_2D_PROVIDERS,
  LIFE_ASSET_GENERATION_BATCH_SCHEMA,
} from './life-asset-generation-batch.js';
import { buildLifeAssetReviewPacket } from './life-asset-review-packet.js';
import type { LibraryRecord } from './library.js';

function slot(id: string, prompt = 'farmer'): Record<string, unknown> {
  const value: Record<string, unknown> = {
    slotId: id,
    assetKey: `art:test:${id}`,
    kind: 'player',
    consumers: [{ document: 'life.json', jsonPointer: `/visuals/${id}` }],
    asset: { usage: 'sprite', colorSpace: 'srgb', outputPx: { width: 32, height: 48 }, alpha: 'transparent', sampling: 'nearest' },
    render: { display: { unit: 'pixel', width: 32, height: 48 }, anchor: { x: 0.5, y: 1 }, fit: 'contain', offset: { x: 0, y: 0 }, fallbackRole: 'player' },
    generation: { briefVersion: 1, styleId: 'pixel', prompt, negativePrompt: ['text', 'border'] },
    governance: { approval: 'placeholder', humanApprovalRequired: true, licenseRequired: true, briefFingerprint: 'pending' },
  };
  (value.governance as Record<string, unknown>).briefFingerprint = deriveAssetSlotBriefFingerprint(value as unknown as AssetSlotBrief);
  return value;
}

const manifest = (...slots: Record<string, unknown>[]) => ({
  version: 1,
  game: 'batch-test',
  note: 'Existing placeholders only; asset-manager owns import and registration.',
  slots,
});

function candidate(overrides: Partial<LibraryRecord> = {}): LibraryRecord {
  return {
    id: 'library/farmer', type: 'texture', category: 'sprite.character', name: 'farmer', description: 'pixel farmer', tags: ['farmer'],
    source: 'project', sourceLabel: 'assets/', status: 'filled', style: 'pixel', width: 32, height: 48, transparent: true,
    path: 'library/farmer.png', license: 'CC0', usage: 'sprite', colorSpace: 'srgb', sampling: 'nearest',
    ...overrides,
  };
}

describe('Life asset generation batch', () => {
  it('produces a closed local-review + AI generation plan in stable slot order', () => {
    const raw = manifest(slot('local'), slot('ai', 'moon rabbit'));
    const batch = buildLifeAssetGenerationBatch(raw, [candidate()]);
    expect(batch).toMatchObject({ schemaVersion: LIFE_ASSET_GENERATION_BATCH_SCHEMA, game: 'batch-test', valid: true, diagnostics: [] });
    expect(batch.items.map((item) => item.slotId)).toEqual(['ai', 'local']);
    expect(batch.items[0]).toEqual(expect.objectContaining({
      action: 'ai-generate', provider: 'qwen', assetKey: 'art:test:ai', prompt: 'moon rabbit',
      outputPx: { width: 32, height: 48 }, alpha: 'transparent', sampling: 'nearest', anchor: { x: 0.5, y: 1 },
    }));
    expect(batch.items[1]).toEqual(expect.objectContaining({
      action: 'local-review', assetKey: 'art:test:local', candidate: expect.objectContaining({ id: 'library/farmer', source: 'project', score: 100 }),
      spec: { kind: 'player', usage: 'sprite', colorSpace: 'srgb', outputPx: { width: 32, height: 48 }, alpha: 'transparent', sampling: 'nearest', styleId: 'pixel' },
    }));
  });

  it('keeps qwen as the default and applies closed call/slot GPT provider selection deterministically', () => {
    expect(LIFE_ASSET_2D_PROVIDERS).toEqual(['qwen', 'gpt-image']);
    const raw = manifest(slot('z-ai', 'moon rabbit'), slot('a-ai', 'moon barn'));
    const defaults = buildLifeAssetGenerationBatch(raw, []);
    expect(defaults.items.map((item) => item.action === 'ai-generate' ? [item.slotId, item.provider] : null)).toEqual([
      ['a-ai', 'qwen'],
      ['z-ai', 'qwen'],
    ]);
    const selected = buildLifeAssetGenerationBatch(raw, [], {
      provider: 'gpt-image',
      providersBySlot: { 'z-ai': 'qwen' },
    });
    expect(selected.items.map((item) => item.action === 'ai-generate' ? [item.slotId, item.provider] : null)).toEqual([
      ['a-ai', 'gpt-image'],
      ['z-ai', 'qwen'],
    ]);
    const reordered = buildLifeAssetGenerationBatch(manifest(slot('a-ai', 'moon barn'), slot('z-ai', 'moon rabbit')), [], {
      providersBySlot: { 'z-ai': 'qwen', 'a-ai': 'gpt-image' },
      provider: 'gpt-image',
    });
    expect(JSON.stringify(reordered)).toBe(JSON.stringify(selected));
  });

  it('fails closed for unknown providers and unknown slot overrides', () => {
    const raw = manifest(slot('hero'));
    const badProvider = buildLifeAssetGenerationBatch(raw, [], { provider: 'other' as never });
    expect(badProvider).toMatchObject({ valid: false, diagnostics: [expect.objectContaining({ code: 'provider_invalid' })] });
    const badSlot = buildLifeAssetGenerationBatch(raw, [], { providersBySlot: { ghost: 'gpt-image' } });
    expect(badSlot).toMatchObject({ valid: false, diagnostics: [expect.objectContaining({ code: 'provider_slot_unknown', slotId: 'ghost' })] });
  });

  it('fails the whole batch when the brief, candidate plan, or review packet is tampered', () => {
    const raw = manifest(slot('hero'));
    const records = [candidate()];
    const plan = planLifeAssetCandidates(raw, records);
    const packet = buildLifeAssetReviewPacket(raw, records);

    const badBrief = structuredClone(raw);
    (badBrief.slots[0]!.governance as Record<string, unknown>).briefFingerprint = 'asset-slot-v1:00000000';
    const briefResult = buildLifeAssetGenerationBatch(badBrief, records);
    expect(briefResult.valid).toBe(false);
    expect(briefResult.items.every((item) => item.action === 'invalid')).toBe(true);

    const badPlan = structuredClone(plan) as unknown as { items: Array<Record<string, unknown>> };
    badPlan.items[0]!.assetKey = 'art:test:forged';
    const planResult = buildLifeAssetGenerationBatchFromArtifacts(raw, badPlan, packet, records);
    expect(planResult.valid).toBe(false);
    expect(planResult.diagnostics.some((value) => value.code === 'plan_asset_key')).toBe(true);

    const badPacket = structuredClone(packet) as unknown as Record<string, unknown>;
    badPacket.valid = false;
    const packetResult = buildLifeAssetGenerationBatchFromArtifacts(raw, plan, badPacket, records);
    expect(packetResult.valid).toBe(false);
    expect(packetResult.diagnostics).toContainEqual(expect.objectContaining({ code: 'review_packet_mismatch' }));
    expect(packetResult.items.every((item) => item.action === 'invalid')).toBe(true);
  });

  it('returns stable invalid diagnostics and never exposes paths, secrets, bytes, licenses, or approval fields', () => {
    const bad = slot('bad'); bad.arbitraryCode = 'do-not-run';
    const rich = { ...candidate(), path: '/secret/a.png', bytes: [1], apiKey: 'secret', license: 'restricted', approval: 'forged' } as LibraryRecord;
    const first = buildLifeAssetGenerationBatch(manifest(bad), [rich]);
    const second = buildLifeAssetGenerationBatch(manifest(structuredClone(bad)), [rich]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.valid).toBe(false);
    const validText = JSON.stringify(buildLifeAssetGenerationBatch(manifest(slot('local'), slot('ai', 'moon rabbit')), [rich]));
    for (const forbidden of ['"path"', '"url"', '"bytes"', '"apiKey"', '"secret"', '"license"', '"approval"', '"approved"', '"contentHash"']) {
      expect(validText).not.toContain(forbidden);
    }
  });

  it('is byte-stable under slot/record reordering and survives JSON round-trip', () => {
    const slots = [slot('z-local'), slot('a-ai', 'moon rabbit')];
    const records = [candidate({ id: 'z/farmer' }), candidate({ id: 'a/farmer' })];
    const first = buildLifeAssetGenerationBatch(manifest(...slots), records);
    const second = buildLifeAssetGenerationBatch(manifest(...slots.slice().reverse()), records.slice().reverse());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
