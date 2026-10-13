import { describe, expect, it } from 'vitest';
import localIndex from '../../public/games/game-simlife/art/index.json';
import littleValleySlots from '../../games/game-simlife/little-valley.asset-slots.json';
import { parseAssetIndex } from './asset-index.js';
import { deriveAssetSlotBriefFingerprint, validateAssetPendingIsolation, type AssetSlotBrief } from './asset-slot-brief.js';
import { planLifeAssetCandidates } from './life-asset-candidate-plan.js';
import { projectRecords, type LibraryRecord } from './library.js';

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
  game: 'candidate-test',
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

describe('Life asset candidate planner', () => {
  it('selects the unique qualified local candidate through rankRecords', () => {
    const plan = planLifeAssetCandidates(manifest(slot('hero')), [candidate()]);
    expect(plan.items).toEqual([expect.objectContaining({
      slotId: 'hero', assetKey: 'art:test:hero', decision: 'local-candidate', candidate: expect.objectContaining({ id: 'library/farmer', source: 'project', score: 100 }),
    })]);
    expect(plan.handoff).toEqual({ owner: 'asset-manager', next: ['vendor-or-create-candidate', 'human-review', 'asset-index-registration'] });
  });

  it.each([
    ['type', { type: 'mesh' as const }],
    ['status', { status: 'placeholder' as const }],
    ['width', { width: 64 }],
    ['height', { height: 64 }],
    ['alpha', { transparent: false }],
    ['style', { style: 'cartoon.flat' as const }],
    ['usage', { usage: 'normal' }],
    ['colorSpace', { colorSpace: 'linear' }],
    ['sampling', { sampling: 'linear' }],
    ['license', { license: undefined }],
    ['path', { path: undefined }],
  ])('routes a %s mismatch to an AI request without calling a provider', (_label, overrides) => {
    const plan = planLifeAssetCandidates(manifest(slot('hero')), [candidate(overrides)]);
    expect(plan.items[0]).toMatchObject({
      decision: 'ai-required',
      request: {
        prompt: 'farmer', negativePrompt: ['text', 'border'],
        spec: { kind: 'player', styleId: 'pixel', outputPx: { width: 32, height: 48 }, alpha: 'transparent' },
      },
    });
    expect(plan.items[0]).not.toHaveProperty('candidate');
  });

  it('breaks equal rank scores by record id and never uses slot identity as the query', () => {
    const records = [candidate({ id: 'z/farmer' }), candidate({ id: 'a/farmer' })];
    expect(planLifeAssetCandidates(manifest(slot('hero')), records).items[0]?.candidate?.id).toBe('a/farmer');
    expect(planLifeAssetCandidates(manifest(slot('secret-id', 'unmatched-prompt')), [candidate({ id: 'secret-id', tags: ['secret-id'] })]).items[0]?.decision).toBe('ai-required');
  });

  it('is byte-stable when slot and record input order are reversed', () => {
    const slots = [slot('z-slot'), slot('a-slot')];
    const records = [candidate({ id: 'z/farmer' }), candidate({ id: 'a/farmer' })];
    const first = planLifeAssetCandidates(manifest(...slots), records);
    const second = planLifeAssetCandidates(manifest(...slots.slice().reverse()), records.slice().reverse());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.items.map((item) => item.slotId)).toEqual(['a-slot', 'z-slot']);
  });

  it('returns stable invalid items for an unclosed malicious slot instead of throwing', () => {
    const bad = slot('bad'); bad.arbitraryCode = 'do-not-run';
    expect(() => planLifeAssetCandidates(manifest(bad), [candidate()])).not.toThrow();
    const result = planLifeAssetCandidates(manifest(bad), [candidate()]);
    expect(result.items).toEqual([expect.objectContaining({ slotId: 'bad', assetKey: 'art:test:bad', decision: 'invalid' })]);
    expect(result.items[0]?.reasons.some((reason) => reason.code === 'manifest_closed')).toBe(true);
  });

  it('round-trips as JSON and never exposes sensitive library or governance metadata', () => {
    const rich = { ...candidate(), path: '/secret/farmer.png', license: 'restricted', provider: 'vendor-x', bytes: [1, 2], contentHash: 'sha256:x', approval: 'forged' } as LibraryRecord;
    const plans = [
      planLifeAssetCandidates(manifest(slot('local')), [rich]),
      planLifeAssetCandidates(manifest(slot('ai', 'no match')), [rich]),
    ];
    for (const plan of plans) {
      expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
      const text = JSON.stringify(plan);
      for (const forbidden of ['"path"', '"license"', '"provider"', '"bytes"', '"contentHash"', '"approval"']) expect(text).not.toContain(forbidden);
    }
  });

  it('does not weaken pending isolation while planning remains read-only', () => {
    const index = parseAssetIndex({ version: 1, assets: [{ id: 'library/farmer', type: 'texture', status: 'filled', path: '/active/farmer.png', description: 'farmer' }] });
    const pending = { pending: [{ id: 'library/farmer', path: '/active/farmer.png', license: 'x', provenance: { model: 'm', prompt: 'p', generatedAt: 'd' } }] };
    expect(validateAssetPendingIsolation(index, pending).map((issue) => issue.code)).toContain('approval_bypass');
    planLifeAssetCandidates(manifest(slot('hero')), [candidate()]);
    expect(validateAssetPendingIsolation(index, pending).map((issue) => issue.code)).toContain('approval_bypass');
  });

  it('accepts the Little Valley AssetSlotBrief as a pure read-only planning input', () => {
    const plan = planLifeAssetCandidates(littleValleySlots, projectRecords(parseAssetIndex(localIndex), ''));
    expect(plan.game).toBe('game-simlife');
    expect(plan.items).toHaveLength(21);
    expect(plan.items.map((item) => item.slotId)).toEqual([...plan.items.map((item) => item.slotId)].sort());
    expect(plan.items.every((item) => item.decision !== 'invalid')).toBe(true);
  });
});
