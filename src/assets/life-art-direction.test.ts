import { describe, expect, it } from 'vitest';
import { threeSceneLifePackage } from '../assembly/life-package.fixture.js';
import { validateLifeGamePackage } from '../assembly/life-package.js';
import type { AssetIndex } from './asset-index.js';
import {
  LIFE_ART_DIRECTION_ILLUSTRATED_2D,
  LIFE_ART_DIRECTION_PIXEL_LEGACY,
  composeLifeArtDirectionPrompt,
  deriveLifeArtDirectionFields,
  parseLifeArtDirection,
  validateLifeArtDirection,
  type LifeArtDirectionV1,
  type LifeArtSlotKind,
} from './life-art-direction.js';
import {
  deriveAssetSlotBriefFingerprint,
  parseAssetSlotManifest,
  validateAssetSlotClosure,
  validateAssetSlotManifest,
  type AssetSlotBrief,
} from './asset-slot-brief.js';

const role = (kind: LifeArtSlotKind): AssetSlotBrief['render']['fallbackRole'] => kind === 'tile' ? 'ground' : kind;

function profiledSlot(kind: LifeArtSlotKind, semanticPrompt = `distinct ${kind} gameplay subject`): AssetSlotBrief {
  const fields = deriveLifeArtDirectionFields(LIFE_ART_DIRECTION_ILLUSTRATED_2D, kind, semanticPrompt);
  const slot = {
    slotId: `profile.${kind}`,
    assetKey: `art:profile:${kind}`,
    kind,
    consumers: [{ document: 'life.json', jsonPointer: `/visuals/${kind}` }],
    asset: fields.asset,
    render: { ...fields.render, fallbackRole: role(kind) },
    generation: fields.generation,
    governance: { approval: 'placeholder' as const, humanApprovalRequired: true as const, licenseRequired: true as const, briefFingerprint: '' },
  } satisfies AssetSlotBrief;
  return { ...slot, governance: { ...slot.governance, briefFingerprint: deriveAssetSlotBriefFingerprint(slot) } };
}

const manifest = (slots: readonly AssetSlotBrief[], artDirection: LifeArtDirectionV1 = LIFE_ART_DIRECTION_ILLUSTRATED_2D): unknown => ({
  version: 1,
  game: 'direction-test',
  note: 'Profiled placeholders only; asset-manager owns import and registration.',
  artDirection,
  slots,
});

describe('Life Art Direction v1', () => {
  it('parses both engine-owned profiles as a closed authoring-only contract', () => {
    expect(parseLifeArtDirection(LIFE_ART_DIRECTION_PIXEL_LEGACY)).toEqual(LIFE_ART_DIRECTION_PIXEL_LEGACY);
    expect(parseLifeArtDirection(LIFE_ART_DIRECTION_ILLUSTRATED_2D)).toEqual(LIFE_ART_DIRECTION_ILLUSTRATED_2D);
    const extra = { ...LIFE_ART_DIRECTION_ILLUSTRATED_2D, rendererCode: 'drawAnything()' };
    const unsafe = { ...LIFE_ART_DIRECTION_ILLUSTRATED_2D, basePrompt: 'load https://example.invalid/image.png with API key secret' };
    expect(validateLifeArtDirection(extra).some((entry) => entry.code === 'closed')).toBe(true);
    expect(validateLifeArtDirection(unsafe).some((entry) => entry.code === 'prompt')).toBe(true);
  });

  it('composes stable illustrated prompts with mandatory medium and kind constraints', () => {
    const first = composeLifeArtDirectionPrompt(LIFE_ART_DIRECTION_ILLUSTRATED_2D, 'tile', 'moonlit garden soil');
    const second = composeLifeArtDirectionPrompt(LIFE_ART_DIRECTION_ILLUSTRATED_2D, 'tile', 'moonlit garden soil');
    expect(first).toEqual(second);
    expect(first.prompt).toContain('high-detail illustrated 2D, non-pixel-art, readable at gameplay scale');
    expect(first.prompt).toContain('moonlit garden soil');
    expect(first.prompt).toContain('seamless repeatable opaque surface');
    expect(first.negativePrompt).toEqual(expect.arrayContaining(['pixel art', 'sprite sheet', 'UI', 'text', 'border']));
    expect(composeLifeArtDirectionPrompt(LIFE_ART_DIRECTION_ILLUSTRATED_2D, 'player', 'young farmer').prompt).toContain('bottom-center feet anchor');
  });

  it('derives and validates high-resolution linear slot rules for every closed kind', () => {
    const slots = (['tile', 'crop', 'player', 'npc', 'building', 'resource', 'item', 'ui-icon'] as const).map((kind) => profiledSlot(kind));
    const parsed = parseAssetSlotManifest(manifest(slots));
    expect(parsed.artDirection?.id).toBe('life.illustrated-2d.v1');
    expect(parsed.slots.find((slot) => slot.kind === 'tile')).toMatchObject({
      asset: { outputPx: { width: 256, height: 256 }, alpha: 'opaque', sampling: 'linear' },
      render: { display: { unit: 'cell', width: 1, height: 1 }, anchor: { x: 0.5, y: 0.5 }, fit: 'cover' },
    });
    expect(parsed.slots.find((slot) => slot.kind === 'player')).toMatchObject({
      asset: { outputPx: { width: 384, height: 512 }, alpha: 'transparent', sampling: 'linear' },
      render: { display: { unit: 'cell', width: 1, height: 1.5 }, anchor: { x: 0.5, y: 1 }, fit: 'contain' },
    });
    expect(parsed.slots.find((slot) => slot.kind === 'npc')).toMatchObject({
      asset: { outputPx: { width: 384, height: 512 }, alpha: 'transparent', sampling: 'linear' },
      render: { display: { unit: 'cell', width: 1, height: 1.5 }, anchor: { x: 0.5, y: 1 }, fit: 'contain' },
    });
    expect(parsed.slots.find((slot)=>slot.kind==='ui-icon')).toMatchObject({asset:{alpha:'transparent'},render:{display:{unit:'pixel',width:24,height:24},anchor:{x:0.5,y:0.5},fit:'contain'}});
  });

  it('keeps legacy player/npc at the exact 32x48 pixel display contract', () => {
    for (const kind of ['player', 'npc'] as const) {
      const fields = deriveLifeArtDirectionFields(LIFE_ART_DIRECTION_PIXEL_LEGACY, kind, `legacy ${kind}`);
      expect(fields.asset).toMatchObject({ outputPx: { width: 32, height: 48 }, sampling: 'nearest', alpha: 'transparent' });
      expect(fields.render).toEqual({
        display: { unit: 'pixel', width: 32, height: 48 },
        anchor: { x: 0.5, y: 1 }, fit: 'contain', offset: { x: 0, y: 0 },
      });
    }
  });

  it('rejects illustrated nearest/pixel-sized drift even with a recomputed slot fingerprint', () => {
    const nearest = structuredClone(profiledSlot('player')) as AssetSlotBrief;
    (nearest.asset as { sampling: string }).sampling = 'nearest';
    (nearest.asset.outputPx as { width: number; height: number }).width = 32;
    (nearest.asset.outputPx as { width: number; height: number }).height = 32;
    (nearest.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(nearest);
    const issues = validateAssetSlotManifest(manifest([nearest]));
    expect(issues.filter((entry) => entry.code === 'direction_mismatch').map((entry) => entry.path)).toEqual(expect.arrayContaining([
      '$.slots[0].asset.outputPx', '$.slots[0].asset.sampling',
    ]));

    const badProfile = structuredClone(LIFE_ART_DIRECTION_ILLUSTRATED_2D) as LifeArtDirectionV1;
    (badProfile.defaults.player as { sampling: string }).sampling = 'nearest';
    expect(validateLifeArtDirection(badProfile).some((entry) => entry.path.endsWith('.player.sampling') && entry.code === 'medium_conflict')).toBe(true);
  });

  it('keeps legacy v1 manifests valid when artDirection and semanticPrompt are omitted', () => {
    const legacy = structuredClone(profiledSlot('player')) as AssetSlotBrief;
    const generation = legacy.generation as unknown as Record<string, unknown>;
    delete generation.semanticPrompt;
    generation.styleId = 'legacy.custom'; generation.prompt = 'legacy authored player'; generation.negativePrompt = ['text'];
    (legacy.asset as { sampling: string }).sampling = 'nearest';
    (legacy.asset.outputPx as { width: number; height: number }).width = 32;
    (legacy.asset.outputPx as { width: number; height: number }).height = 48;
    (legacy.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(legacy);
    expect(parseAssetSlotManifest({ version: 1, game: 'legacy', note: 'Legacy placeholder manifest.', slots: [legacy] }).slots[0]?.generation.styleId).toBe('legacy.custom');
  });

  it('keeps the authoring profile outside the closed LifeGamePackage runtime contract', () => {
    const runtime = threeSceneLifePackage();
    runtime.artDirection = LIFE_ART_DIRECTION_ILLUSTRATED_2D;
    const report = validateLifeGamePackage(runtime);
    expect(report.ok).toBe(false);
    expect(report.issues.some((entry) => entry.path === '$.artDirection')).toBe(true);
  });

  it('requires profiled formal index entries to prove the exact style and sampling', () => {
    const player = profiledSlot('player');
    const parsed = parseAssetSlotManifest(manifest([player]));
    const exact: AssetIndex = { version: 1, assets: [{
      id: player.assetKey, type: 'texture', description: 'approved candidate', status: 'filled', path: 'player.png', license: 'CC0',
      style: LIFE_ART_DIRECTION_ILLUSTRATED_2D.id,
      spec: { usage: 'sprite', colorSpace: 'srgb', width: 384, height: 512, transparent: true, sampling: 'linear' },
    }] };
    const documents = { 'life.json': { visuals: { player: player.assetKey } } };
    expect(validateAssetSlotClosure(parsed, documents, exact, [player.assetKey])).toEqual([]);
    const drift: AssetIndex = { ...exact, assets: exact.assets.map((entry) => ({ ...entry, style: 'pixel', spec: { ...entry.spec, sampling: 'nearest' } })) };
    expect(validateAssetSlotClosure(parsed, documents, drift, [player.assetKey]).map((entry) => entry.code)).toEqual(expect.arrayContaining(['style', 'sampling']));
  });
});
