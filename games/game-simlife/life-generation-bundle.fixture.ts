import { deriveAssetSlotBriefFingerprint, type AssetSlotBrief, type AssetSlotManifest } from '@assets/asset-slot-brief.js';
import lifePackage from './little-valley.life.json';
import assetSlots from './little-valley.asset-slots.json';
import {
  LIFE_GENERATION_PROMPT_VERSION,
  LIFE_GENERATION_SCHEMA,
  lifeGenerationPayload,
  sha256Canonical,
  type LifeGenerationBundleV1,
} from '@zerocraft/engine/authoring/life-generation-bundle.js';

/** Test/authoring fixture converted from Little Valley's single-source JSON exports. */
export function littleValleyGenerationBundle(): LifeGenerationBundleV1 {
  const life = structuredClone(lifePackage) as unknown;
  const placementBySkinKey = new Map<string, { width: number; height: number }>();
  for (const scene of (life as typeof lifePackage).scenes) for (const placement of scene.placements) {
    if (placement.kind === 'building' || placement.kind === 'decoration') placementBySkinKey.set(placement.skinKey, { width: placement.width, height: placement.height });
  }
  const rawSlots = structuredClone(assetSlots) as unknown as AssetSlotManifest;
  const slots = rawSlots.slots.map((source) => {
    const footprint = source.kind === 'building' ? placementBySkinKey.get(source.assetKey) : undefined;
    const slot = {
      ...source,
      ...(footprint === undefined ? {} : { render: { ...source.render, display: { unit: 'pixel' as const, width: footprint.width * 32, height: footprint.height * 32 } } }),
      consumers: source.consumers.map((consumer) => ({ ...consumer, document: 'life.json' })),
      governance: {
        approval: 'placeholder' as const,
        humanApprovalRequired: true as const,
        licenseRequired: true as const,
        briefFingerprint: '',
      },
    } as AssetSlotBrief;
    return { ...slot, governance: { ...slot.governance, briefFingerprint: deriveAssetSlotBriefFingerprint(slot) } };
  });
  const draft: AssetSlotManifest = { ...rawSlots, game: 'game-little-valley-generated', slots };
  const partial = {
    schemaVersion: LIFE_GENERATION_SCHEMA,
    session: { id: 'little-valley-fixture', round: 0, createdBy: 'mixed' as const, promptContractVersion: LIFE_GENERATION_PROMPT_VERSION },
    game: { slug: 'game-little-valley-generated', lifePackage: life },
    assetSlots: { draft },
  };
  return {
    ...partial,
    provenance: {
      baseHash: sha256Canonical(lifeGenerationPayload(partial)),
      sourceHashes: { lifePackage: sha256Canonical(life), assetSlotsDraft: sha256Canonical(draft) },
    },
  };
}
