import { describe, expect, it } from 'vitest';
import type { AssetIndex } from './asset-index.js';
import {
  compileLifeVisualCatalog,
  deriveAssetSlotBriefFingerprint,
  parseAssetSlotManifest,
  validateAssetPendingIsolation,
  validateAssetSlotClosure,
  validateAssetSlotManifest,
  type AssetSlotBrief,
} from './asset-slot-brief.js';

function slot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const value: Record<string, unknown> = {
    slotId: 'life.player.hero', assetKey: 'art:life:player:hero', kind: 'player',
    consumers: [{ document: 'life.json', jsonPointer: '/playerVisual/skinKey' }],
    asset: { usage: 'sprite', colorSpace: 'srgb', outputPx: { width: 32, height: 48 }, alpha: 'transparent', sampling: 'nearest' },
    render: { display: { unit: 'pixel', width: 28.8, height: 43.2 }, anchor: { x: 0.5, y: 1 }, fit: 'contain', offset: { x: 0, y: 0 }, fallbackRole: 'player' },
    generation: { briefVersion: 1, styleId: 'pixel.warm', prompt: 'pixel farmer, transparent background', negativePrompt: ['text'] },
    governance: { approval: 'placeholder', humanApprovalRequired: true, licenseRequired: true, briefFingerprint: 'pending' },
    ...overrides,
  };
  (value.governance as Record<string, unknown>).briefFingerprint = deriveAssetSlotBriefFingerprint(value as unknown as AssetSlotBrief);
  return value;
}

const manifest = (...slots: Record<string, unknown>[]): Record<string, unknown> => ({ version: 1, game: 'life', note: 'Existing placeholders only; asset-manager owns import and registration.', slots });

describe('AssetSlotBrief strict authoring contract', () => {
  it('accepts a closed versioned brief and compiles only sanitized render data', () => {
    const parsed = parseAssetSlotManifest(manifest(slot()));
    const rule = compileLifeVisualCatalog(parsed).get('art:life:player:hero')!;
    expect(rule).toMatchObject({ kind: 'player', display: { unit: 'pixel', width: 28.8 }, anchor: { x: 0.5, y: 1 }, fit: 'contain' });
    expect(rule).not.toHaveProperty('generation'); expect(rule).not.toHaveProperty('governance'); expect(rule).not.toHaveProperty('path');
  });

  it('rejects unknown fields, arbitrary stretch, named atlas frames, hand-written fingerprints and approved entries without SHA-256', () => {
    const extra = slot({ arbitraryCode: 'no' });
    const stretch = slot(); (stretch.render as Record<string, unknown>).fit = 'stretch';
    const atlas = slot(); (atlas.asset as Record<string, unknown>).frame = { kind: 'atlas-name', name: 'idle' };
    const forged = slot(); (forged.governance as Record<string, unknown>).briefFingerprint = 'asset-slot-v1:00000000';
    const approved = slot(); (approved.governance as Record<string, unknown>).approval = 'approved'; (approved.governance as Record<string, unknown>).briefFingerprint = deriveAssetSlotBriefFingerprint(approved as unknown as AssetSlotBrief);
    expect(validateAssetSlotManifest(manifest(extra)).some((issue) => issue.code === 'closed')).toBe(true);
    expect(validateAssetSlotManifest(manifest(stretch)).some((issue) => issue.code === 'enum')).toBe(true);
    expect(validateAssetSlotManifest(manifest(atlas)).some((issue) => issue.code === 'frame')).toBe(true);
    expect(validateAssetSlotManifest(manifest(forged)).some((issue) => issue.code === 'fingerprint')).toBe(true);
    expect(validateAssetSlotManifest(manifest(approved)).some((issue) => issue.code === 'content_hash')).toBe(true);
  });

  it('requires unique slot/key/consumer identities', () => {
    const duplicate = slot();
    expect(validateAssetSlotManifest(manifest(slot(), duplicate)).filter((issue) => issue.code === 'duplicate').length).toBeGreaterThanOrEqual(3);
  });
});

describe('AssetSlotBrief cross-file closure and approval isolation', () => {
  const index: AssetIndex = { version: 1, assets: [{
    id: 'art:life:player:hero', type: 'texture', status: 'filled', path: '/games/life/art/hero.png', description: 'placeholder', license: 'CC0',
    spec: { usage: 'sprite', colorSpace: 'srgb', width: 32, height: 48, transparent: true },
  }] };

  it('binds JSON pointer value, expected visual key and filled local index metadata', () => {
    const parsed = parseAssetSlotManifest(manifest(slot()));
    expect(validateAssetSlotClosure(parsed, { 'life.json': { playerVisual: { skinKey: 'art:life:player:hero' } } }, index, ['art:life:player:hero'])).toEqual([]);
    expect(validateAssetSlotClosure(parsed, { 'life.json': { playerVisual: { skinKey: 'art:life:player:wrong' } } }, index, ['art:life:player:wrong']).map((issue) => issue.code)).toEqual(expect.arrayContaining(['missing_slot', 'orphan_slot', 'consumer_mismatch']));
    const wrongSize = structuredClone(index); (wrongSize.assets[0]!.spec as Record<string, unknown>).width = 1024;
    expect(validateAssetSlotClosure(parsed, { 'life.json': { playerVisual: { skinKey: 'art:life:player:hero' } } }, wrongSize, ['art:life:player:hero']).some((issue) => issue.code === 'output_size')).toBe(true);
  });

  it('rejects a pending candidate or art-replace row already activated without approval evidence', () => {
    const pending = { version: 1, pending: [{ id: 'art:life:player:hero', path: '/games/life/art/hero.png', license: 'x', provenance: { model: 'm', prompt: 'p', generatedAt: 'd' } }] };
    const ledger = { rows: [{ no: 'art-01', status: 'generated', skinKey: 'art:life:player:hero', gen: { servedPath: '/games/life/art/hero.png', mock: false } }] };
    expect(validateAssetPendingIsolation(index, pending, ledger).map((issue) => issue.code)).toEqual(['approval_bypass', 'replacement_bypass']);
    const approved = structuredClone(index); (approved.assets[0] as unknown as { provenance: Record<string, unknown> }).provenance = { approvedAt: 'd', reviewedBy: 'owner' };
    expect(validateAssetPendingIsolation(approved, { version: 1, pending: [] }, ledger)).toEqual([]);
  });
});
