import { deriveAssetSlotBriefFingerprint, type AssetSlotBrief, type AssetSlotManifest } from '@assets/asset-slot-brief.js';
import lifePackage from '../../games/game-simlife/little-valley.life.json';
import assetSlots from '../../games/game-simlife/little-valley.asset-slots.json';
import {
  LIFE_GENERATION_PROMPT_VERSION,
  LIFE_GENERATION_SCHEMA,
  lifeGenerationPayload,
  sha256Canonical,
  type LifeGenerationBundleV1,
} from './life-generation-bundle.js';

/** Test/authoring fixture converted from Little Valley's single-source JSON exports. */
export function littleValleyGenerationBundle(): LifeGenerationBundleV1 {
  const life = structuredClone(lifePackage) as unknown;
  const rawSlots = structuredClone(assetSlots) as unknown as AssetSlotManifest;
  const slots = rawSlots.slots.map((source) => {
    const slot = {
      ...source,
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
