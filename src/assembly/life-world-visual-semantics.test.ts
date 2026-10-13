import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from './life-package-compile.js';
import { validateLifeWorldVisualSemantics } from './life-world-visual-semantics.js';
import type { LifeGamePackage } from '@engine/protocol/life-sim.js';
import { buildLifePromptPackets, checkLifeGenerationBundle, type LifeGenerationBundleV1 } from '../authoring/life-generation-bundle.js';

const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
const clone = <T>(value: T): T => structuredClone(value);

describe('World Visual Semantics v1', () => {
  it('accepts the Little Valley and Demon Castle migrations and emits both review matrices', () => {
    const little = read<LifeGamePackage>('games/game-simlife/little-valley.life.json');
    expect(validateLifeWorldVisualSemantics(little)).toEqual({ ok: true, issues: [] });

    const demon = read<LifeGenerationBundleV1>('docs/design/game-demon-castle/bundle.candidate.json');
    const checked = checkLifeGenerationBundle(demon);
    expect(checked.ok, JSON.stringify(checked.diagnostics, null, 2)).toBe(true);
    expect(checked.worldVisualReview?.warps).toHaveLength(4);
    expect(checked.worldVisualReview?.warps.every((row) => row.landmarkPlacementId && row.destination && row.relation !== 'invalid')).toBe(true);
    expect(checked.worldVisualReview?.surfaces.map((row) => row.state)).toEqual(expect.arrayContaining([
      'tile:courtyard-ground:ground', 'tile:courtyard-farm-ground:plantable', 'farm:tilled-dry', 'farm:watered', 'crop:moonbell:mature',
    ]));
    expect(checked.worldVisualReview?.surfaces.every((row) => row.assetSlotId && row.candidateStatus === 'placeholder')).toBe(true);
    expect(buildLifePromptPackets(demon)[1]!.allowlist).toContain('/game/lifePackage/visualSemantics');
  });

  it('fails with path-specific diagnostics for missing landmarks, invalid relation, missing surfaces, and non-equivalent key sharing', () => {
    const source = read<LifeGamePackage>('games/game-simlife/little-valley.life.json');
    const missing = clone(source); delete missing.scenes[0]!.warps[0]!.landmarkPlacementId;
    expect(validateLifeWorldVisualSemantics(missing).issues).toContainEqual(expect.objectContaining({ path: '/scenes/0/warps/0/landmarkPlacementId', code: 'warp_landmark_missing' }));

    const far = clone(source); far.scenes[0]!.placements.find((placement) => placement.id === 'mine-entrance')!.x = 1;
    expect(validateLifeWorldVisualSemantics(far).issues).toContainEqual(expect.objectContaining({ path: '/scenes/0/warps/0/landmarkPlacementId', code: 'warp_landmark_relation' }));

    const noSurface = clone(source); delete noSurface.tileCatalog.soil!.visual!.surface;
    expect(validateLifeWorldVisualSemantics(noSurface).issues).toContainEqual(expect.objectContaining({ path: '/tileCatalog/soil/visual/surface', code: 'surface_missing' }));

    const shared = clone(source); shared.visualSemantics!.farm.wateredSkinKey = shared.visualSemantics!.farm.tilledDrySkinKey;
    expect(validateLifeWorldVisualSemantics(shared).issues).toContainEqual(expect.objectContaining({ path: '/visualSemantics/farm/wateredSkinKey', code: 'visual_key_action_collision' }));
  });

  it('keeps visual-only semantics outside compiled World/snapshot authority', () => {
    const source = read<LifeGamePackage>('games/game-simlife/little-valley.life.json');
    const changed = clone(source);
    changed.visualSemantics!.farm.tilledDrySkinKey = 'art:test:dry';
    changed.visualSemantics!.farm.wateredSkinKey = 'art:test:wet';
    changed.tileCatalog.soil!.visual!.surface = 'ground';
    changed.scenes[0]!.warps[0]!.landmarkPlacementId = 'some-render-only-id';
    expect(compileAndParseLifeGamePackage(changed).blueprint).toEqual(compileAndParseLifeGamePackage(source).blueprint);
  });
});

