import { describe, expect, it } from 'vitest';
import littleValleySlots from '../../games/game-simlife/little-valley.asset-slots.json';
import localIndex from '../../public/games/game-simlife/art/index.json';
import { parseAssetIndex } from './asset-index.js';
import { deriveAssetSlotBriefFingerprint, validateAssetPendingIsolation, type AssetSlotBrief } from './asset-slot-brief.js';
import { planLifeAssetCandidates } from './life-asset-candidate-plan.js';
import {
  buildLifeAssetReviewPacket,
  buildLifeAssetReviewPacketFromPlan,
  LIFE_ASSET_REVIEW_PACKET_SCHEMA,
} from './life-asset-review-packet.js';
import { projectRecords, type LibraryRecord } from './library.js';

function slot(id: string, prompt = 'farmer'): Record<string, unknown> {
  const value: Record<string, unknown> = {
    slotId: id,
    assetKey: `art:test:${id}`,
    kind: 'player',
    consumers: [{ document: 'life.json', jsonPointer: `/visuals/${id}` }],
    asset: { usage: 'sprite', colorSpace: 'srgb', outputPx: { width: 32, height: 48 }, alpha: 'transparent', sampling: 'nearest' },
    render: { display: { unit: 'pixel', width: 30, height: 45 }, anchor: { x: 0.5, y: 1 }, fit: 'contain', offset: { x: 1, y: -2 }, fallbackRole: 'player' },
    generation: { briefVersion: 1, styleId: 'pixel', prompt, negativePrompt: ['text', 'border'] },
    governance: { approval: 'placeholder', humanApprovalRequired: true, licenseRequired: true, briefFingerprint: 'pending' },
  };
  (value.governance as Record<string, unknown>).briefFingerprint = deriveAssetSlotBriefFingerprint(value as unknown as AssetSlotBrief);
  return value;
}

const manifest = (...slots: Record<string, unknown>[]) => ({
  version: 1,
  game: 'review-test',
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

describe('Life asset review packet', () => {
  it('projects local and AI decisions into closed pending-human-review entries and exact totals', () => {
    const packet = buildLifeAssetReviewPacket(manifest(slot('local'), slot('ai', 'moon rabbit')), [candidate()]);
    expect(packet).toMatchObject({
      schemaVersion: LIFE_ASSET_REVIEW_PACKET_SCHEMA,
      game: 'review-test',
      valid: true,
      localCandidateCount: 1,
      aiRequiredCount: 1,
      invalidCount: 0,
      diagnostics: [],
    });
    expect(packet.items.map((item) => item.slotId)).toEqual(['ai', 'local']);
    expect(packet.items[0]).toEqual({
      slotId: 'ai', assetKey: 'art:test:ai', decision: 'ai-required', reviewStatus: 'pending-human-review',
      spec: { kind: 'player', usage: 'sprite', colorSpace: 'srgb', outputPx: { width: 32, height: 48 }, alpha: 'transparent', sampling: 'nearest', styleId: 'pixel' },
      render: { display: { unit: 'pixel', width: 30, height: 45 }, anchor: { x: 0.5, y: 1 }, fit: 'contain', offset: { x: 1, y: -2 } },
      consumers: [{ document: 'life.json', jsonPointer: '/visuals/ai' }],
      request: {
        prompt: 'moon rabbit', negativePrompt: ['text', 'border'],
        spec: { kind: 'player', styleId: 'pixel', usage: 'sprite', colorSpace: 'srgb', outputPx: { width: 32, height: 48 }, alpha: 'transparent', sampling: 'nearest' },
      },
    });
    expect(packet.items[1]).toMatchObject({
      decision: 'local-candidate', reviewStatus: 'pending-human-review', candidate: expect.objectContaining({ id: 'library/farmer', source: 'project', score: 100 }),
    });
  });

  it('uses a strict per-decision field whitelist and never leaks candidate or governance metadata', () => {
    const rich = {
      ...candidate(), path: '/secret/farmer.png', license: 'restricted', provider: 'vendor-x', bytes: [1, 2],
      contentHash: 'sha256:x', approval: 'forged', executable: () => 'no',
    } as LibraryRecord;
    const packet = buildLifeAssetReviewPacket(manifest(slot('local'), slot('ai', 'unmatched')), [rich]);
    const local = packet.items.find((item) => item.decision === 'local-candidate')!;
    const ai = packet.items.find((item) => item.decision === 'ai-required')!;
    expect(Object.keys(local).sort()).toEqual(['assetKey', 'candidate', 'consumers', 'decision', 'render', 'reviewStatus', 'slotId', 'spec'].sort());
    expect(Object.keys(ai).sort()).toEqual(['assetKey', 'consumers', 'decision', 'render', 'request', 'reviewStatus', 'slotId', 'spec'].sort());
    const text = JSON.stringify(packet);
    for (const forbidden of ['"path"', '"license"', '"provider"', '"bytes"', '"contentHash"', '"approval"', '"executable"']) expect(text).not.toContain(forbidden);
    expect(text).not.toContain('"approved"');
  });

  it('fails closed for an invalid manifest without throwing or exposing a partially reviewable item', () => {
    const malicious = slot('bad'); malicious.arbitraryCode = 'do-not-run';
    expect(() => buildLifeAssetReviewPacket(manifest(malicious), [candidate()])).not.toThrow();
    const packet = buildLifeAssetReviewPacket(manifest(malicious), [candidate()]);
    expect(packet).toMatchObject({ valid: false, localCandidateCount: 0, aiRequiredCount: 0, invalidCount: 1 });
    expect(packet.diagnostics.some((value) => value.code === 'manifest_closed')).toBe(true);
    expect(packet.items).toEqual([{
      slotId: 'bad', assetKey: 'art:test:bad', decision: 'invalid', reviewStatus: 'pending-human-review',
      reasons: expect.arrayContaining([expect.objectContaining({ code: 'manifest_closed' })]),
    }]);
    expect(packet.items[0]).not.toHaveProperty('candidate');
    expect(packet.items[0]).not.toHaveProperty('request');
  });

  it('fails closed when plan schema, game, slot set or decision payload does not reconcile', () => {
    const raw = manifest(slot('hero'));
    const good = planLifeAssetCandidates(raw, [candidate()]);
    const corruptions: Array<[string, (value: Record<string, unknown>) => void]> = [
      ['plan_schema', (value) => { value.schemaVersion = 'wrong'; }],
      ['plan_game', (value) => { value.game = 'other'; }],
      ['plan_slot_set', (value) => { value.items = []; }],
      ['plan_reasons', (value) => { ((value.items as Record<string, unknown>[])[0] as Record<string, unknown>).reasons = [{ code: 'forged', detail: 'forged' }]; }],
      ['plan_decision_payload', (value) => { ((value.items as Record<string, unknown>[])[0] as Record<string, unknown>).request = { prompt: 'forged' }; }],
    ];
    for (const [code, corrupt] of corruptions) {
      const changed = structuredClone(good) as unknown as Record<string, unknown>;
      corrupt(changed);
      const packet = buildLifeAssetReviewPacketFromPlan(raw, changed, [candidate()]);
      expect(packet.valid, code).toBe(false);
      expect(packet.localCandidateCount, code).toBe(0);
      expect(packet.items.every((item) => item.decision === 'invalid'), code).toBe(true);
      expect(packet.diagnostics.some((value) => value.code === code), code).toBe(true);
    }
  });

  it('fails closed when plan assetKey does not match the brief', () => {
    const raw = manifest(slot('hero'));
    const changed = structuredClone(planLifeAssetCandidates(raw, [candidate()])) as unknown as { items: Array<Record<string, unknown>> };
    changed.items[0]!.assetKey = 'art:test:forged';
    const packet = buildLifeAssetReviewPacketFromPlan(raw, changed, [candidate()]);
    expect(packet.valid).toBe(false);
    expect(packet.items).toEqual([expect.objectContaining({ slotId: 'hero', assetKey: 'art:test:hero', decision: 'invalid' })]);
    expect(packet.diagnostics).toContainEqual(expect.objectContaining({ code: 'plan_asset_key', slotId: 'hero' }));
  });

  it('is byte-stable under slot and record reordering and survives a JSON round-trip', () => {
    const slots = [slot('z-slot'), slot('a-slot', 'moon rabbit')];
    const records = [candidate({ id: 'z/farmer' }), candidate({ id: 'a/farmer' })];
    const first = buildLifeAssetReviewPacket(manifest(...slots), records);
    const second = buildLifeAssetReviewPacket(manifest(...slots.slice().reverse()), records.slice().reverse());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('does not mutate inputs, perform I/O or weaken pending approval isolation', () => {
    const raw = manifest(slot('hero'));
    const records = [candidate()];
    const beforeManifest = JSON.stringify(raw);
    const beforeRecords = JSON.stringify(records);
    const index = parseAssetIndex({ version: 1, assets: [{ id: 'library/farmer', type: 'texture', status: 'filled', path: '/active/farmer.png', description: 'farmer' }] });
    const pending = { pending: [{ id: 'library/farmer', path: '/active/farmer.png', license: 'x', provenance: { model: 'm', prompt: 'p', generatedAt: 'd' } }] };
    expect(validateAssetPendingIsolation(index, pending).map((issue) => issue.code)).toContain('approval_bypass');
    buildLifeAssetReviewPacket(raw, records);
    expect(JSON.stringify(raw)).toBe(beforeManifest);
    expect(JSON.stringify(records)).toBe(beforeRecords);
    expect(validateAssetPendingIsolation(index, pending).map((issue) => issue.code)).toContain('approval_bypass');
  });

  it('builds a displayable read-only packet for all 21 Little Valley slots', () => {
    const packet = buildLifeAssetReviewPacket(littleValleySlots, projectRecords(parseAssetIndex(localIndex), ''));
    expect(packet.valid).toBe(true);
    expect(packet.game).toBe('game-simlife');
    expect(packet.items).toHaveLength(21);
    expect(packet.localCandidateCount + packet.aiRequiredCount + packet.invalidCount).toBe(21);
    expect(packet.items.every((item) => item.reviewStatus === 'pending-human-review' && item.decision !== 'invalid')).toBe(true);
    expect(packet.items.map((item) => item.slotId)).toEqual([...packet.items.map((item) => item.slotId)].sort());
  });
});
