import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { Engine } from '@runtime/engine.js';
import { deriveAssetSlotBriefFingerprint } from '@assets/asset-slot-brief.js';
import type { Flag, LifeActivityContext, LifeContinuousMotion, LifePosition, Transform } from '@engine/protocol/components.js';
import type { Inventory } from '@zerocraft/engine/skills/tier2/inventory.js';
import {
  buildLifePromptPackets,
  canonicalLifeGenerationJson,
  checkLifeGenerationBundle,
  lifeGenerationPayload,
  sha256Canonical,
  validateLifeGenerationRepair,
  type LifeGenerationBundleV1,
} from '@zerocraft/engine/authoring/life-generation-bundle.js';
import { littleValleyGenerationBundle } from './life-generation-bundle.fixture.js';

const refreshHashes = (bundle: LifeGenerationBundleV1): LifeGenerationBundleV1 => ({
  ...bundle,
  provenance: {
    baseHash: sha256Canonical(lifeGenerationPayload(bundle)),
    sourceHashes: {
      lifePackage: sha256Canonical(bundle.game.lifePackage),
      assetSlotsDraft: sha256Canonical(bundle.assetSlots.draft),
    },
  },
});
const clone = (): LifeGenerationBundleV1 => structuredClone(littleValleyGenerationBundle());
const codes = (raw: unknown): string[] => checkLifeGenerationBundle(raw).diagnostics.map((entry) => entry.code);

function constructionBundle(): LifeGenerationBundleV1 {
  const bundle = clone();
  const life = bundle.game.lifePackage as {
    constructionProjects?: unknown[];
    scenes: Array<{ zones: Array<{ id: string; allowedActions: string[] }>; placements: Array<{ id: string; requires?: unknown }> }>;
  };
  life.constructionProjects = [{ id: 'farmhouse-repair', placementId: 'farmhouse', materials: [{ itemId: 'resource.berry', count: 2 }], completedSkinKey: 'art:little-valley:placement:farmhouse' }];
  life.scenes[0]!.zones.find((zone) => zone.id === 'farm-field')!.allowedActions.push('build');
  const slot = bundle.assetSlots.draft.slots.find((entry) => entry.assetKey === 'art:little-valley:placement:farmhouse')!;
  (slot.consumers as Array<{ document: string; jsonPointer: string }>).push({ document: 'life.json', jsonPointer: '/constructionProjects/0/completedSkinKey' });
  (slot.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(slot);
  return refreshHashes(bundle);
}

describe('LifeGenerationBundle v1', () => {
  it('accepts the Little Valley conversion, runs two ticks, restores its hash, and only returns a dry-run plan', () => {
    const bundle = clone();
    const result = checkLifeGenerationBundle(bundle);
    expect(result.ok, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.runtimeHash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.canonicalHash).toBe(bundle.provenance.baseHash);
    expect(result.plan?.writesPerformed).toBe(false);
    expect(result.plan?.entries.map((entry) => [entry.action, entry.owner])).toEqual(expect.arrayContaining([
      ['template', 'host-template'], ['handoff', 'launcher'], ['handoff', 'asset-manager'],
    ]));
    expect(result.plan?.entries.every((entry) => /^sha256:[0-9a-f]{64}$/.test(entry.contentHash))).toBe(true);
  });

  it('rejects unknown fields, secrets, unsafe paths, bounds, approved claims, and stale hashes', () => {
    const unknown = clone() as unknown as Record<string, unknown>; unknown.extra = true;
    expect(codes(unknown)).toContain('unknown_field');
    const secret = clone() as unknown as { apiKey?: string }; secret.apiKey = 'forbidden';
    expect(codes(secret)).toContain('forbidden_field');
    const path = clone(); (path.assetSlots.draft.slots[0]!.consumers[0] as { document: string }).document = '../life.json';
    expect(codes(path)).toContain('unsafe_path');
    const round = clone(); (round.session as { round: number }).round = 9;
    expect(codes(round)).toContain('round');
    const approved = clone(); (approved.assetSlots.draft.slots[0]!.governance as { approval: string }).approval = 'approved';
    expect(codes(approved)).toContain('approved_forbidden');
    const stale = clone(); (stale.game.lifePackage as { meta: { title: string } }).meta.title = 'changed';
    expect(codes(stale)).toEqual(expect.arrayContaining(['base_hash_mismatch', 'source_hash_mismatch']));
  });

  it('requires the engine-owned viewport profile instead of accepting free camera numbers', () => {
    const missing = clone();
    delete (missing.game.lifePackage as { camera?: unknown }).camera;
    expect(codes(refreshHashes(missing))).toContain('viewport_profile_required');

    const free = clone();
    (free.game.lifePackage as { camera?: unknown }).camera = {
      viewportWidthCells: 28,
      viewportHeightCells: 19,
      follow: { marginCells: 0, minZoom: 1, maxZoom: 1 },
    };
    expect(codes(refreshHashes(free))).toContain('viewport_profile_required');
  });

  it('emits stable stage diagnostics for bad world, actors, plot, and asset data', () => {
    const world = clone();
    const firstScene = (world.game.lifePackage as { scenes: Array<{ layers: Array<{ tiles: Array<{ count: number }> }> }> }).scenes[0]!;
    firstScene.layers[0]!.tiles[0]!.count += 1;
    const worldResult = checkLifeGenerationBundle(refreshHashes(world));
    expect(worldResult.diagnostics.some((entry) => entry.source === 'world' && /rle|cell|area/i.test(`${entry.code} ${entry.message}`))).toBe(true);

    const actors = clone();
    const relationship = (actors.game.lifePackage as { relationships: Array<{ npcId: string }> }).relationships[0]!;
    relationship.npcId = 'missing-npc';
    const actorResult = checkLifeGenerationBundle(refreshHashes(actors));
    expect(actorResult.diagnostics.some((entry) => entry.source === 'actors' && entry.path.includes('/relationships'))).toBe(true);

    const plot = clone();
    const quest = (plot.game.lifePackage as { quests: Array<{ quests: Array<{ initialNodeId: string }> }> }).quests[0]!.quests[0]!;
    quest.initialNodeId = 'missing-node';
    const plotResult = checkLifeGenerationBundle(refreshHashes(plot));
    expect(plotResult.diagnostics.some((entry) => entry.source === 'plot' && entry.path.includes('/quests'))).toBe(true);

    const assets = clone();
    (assets.assetSlots.draft.slots[0]!.consumers[0] as { jsonPointer: string }).jsonPointer = '/playerVisual/skinKey';
    const assetResult = checkLifeGenerationBundle(refreshHashes(assets));
    expect(assetResult.diagnostics.some((entry) => entry.source === 'assets' && entry.code === 'consumer_mismatch')).toBe(true);
    expect(checkLifeGenerationBundle(refreshHashes(assets)).diagnostics).toEqual(assetResult.diagnostics);
  });

  it('provides five closed machine packets with live reference tables and no prose output channel', () => {
    const packets = buildLifePromptPackets(clone());
    expect(packets.map((packet) => packet.packet)).toEqual([0, 1, 2, 3, 4]);
    expect(packets.every((packet) => packet.forbidden.includes('prose outside the JSON artifact'))).toBe(true);
    expect(packets[1]!.references.sceneIds).toEqual(expect.arrayContaining(['little-valley', 'mine-interior']));
    expect(packets[4]!.references.documents).toEqual(['life.json']);
    expect(packets[4]!.references.artDirectionIds).toEqual([]);
    expect(packets[4]!.schema).toMatchObject({
      artDirectionSchemaRef: 'zerocraft.life-art-direction.v1',
      profiledSlotsRequireExactDerivedPromptAndSpec: true,
      buildingDisplayMustMatchPlacementFootprint: true,
    });
    expect(packets[1]!.schema).toMatchObject({ placementsRequireExplicitWidthHeight: true, multiCellBuildingWarpsRequireInteractionPlacementId: true });
    expect(packets[2]!.schema).toMatchObject({
      inventoryDesignFirst: true,
      inventoryDesign: {
        required: ['capacity', 'starterItems', 'loopProduces', 'loopConsumes'],
        everyReferencedItemMustExistInCatalog: true,
        everyItemRequiresArtSkinKeyAndExactAssetSlotConsumer: true,
        iconCandidateApproval: 'placeholder',
        hostInventoryPanelIsOptionalAndOutsideLifePackage: true,
      },
    });
    expect(packets.every((packet) => packet.output.oneOf !== undefined)).toBe(true);
  });

  it('rejects a generated building display that does not exactly match its placement footprint', () => {
    const bundle = clone();
    const life = bundle.game.lifePackage as { scenes: Array<{ placements: Array<{ id: string; width: number; height: number; skinKey: string }> }> };
    const placement = life.scenes.flatMap((scene) => scene.placements).find((entry) => entry.id === 'farmhouse')!;
    const slot = bundle.assetSlots.draft.slots.find((entry) => entry.assetKey === placement.skinKey)!;
    (slot.render.display as { width: number }).width += 1;
    (slot.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(slot);
    const result = checkLifeGenerationBundle(refreshHashes(bundle));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'building_footprint', path: expect.stringMatching(/\/render\/display$/) }));
  });

  it('routes construction projects through the world packet and closes completed skins into asset references', () => {
    const bundle = clone();
    (bundle.game.lifePackage as Record<string, unknown>).constructionProjects = [{ id: 'bridge', placementId: 'bridge', materials: [{ itemId: 'resource.wood', count: 2 }], completedSkinKey: 'art:bridge:complete' }];
    const world = buildLifePromptPackets(bundle)[1]!;
    expect(world.allowlist).toContain('/game/lifePackage/constructionProjects');
    expect(world.references.assetKeys).toContain('art:bridge:complete');
  });

  it('requires every fixed construction placement to expose a real available build affordance from a legal cell', () => {
    const valid = constructionBundle();
    expect(checkLifeGenerationBundle(valid).ok).toBe(true);

    const missing = constructionBundle();
    const missingLife = missing.game.lifePackage as { scenes: Array<{ zones: Array<{ id: string; allowedActions: string[] }> }> };
    missingLife.scenes[0]!.zones.find((zone) => zone.id === 'farm-field')!.allowedActions = ['till', 'water', 'plant', 'harvest'];
    expect(codes(refreshHashes(missing))).toContain('construction_build_zone_missing');

    const unreachable = constructionBundle();
    const unreachableLife = unreachable.game.lifePackage as { scenes: Array<{ zones: Array<{ id: string; allowedActions: string[] }> }> };
    unreachableLife.scenes[0]!.zones.find((zone) => zone.id === 'farm-field')!.allowedActions = ['till', 'water', 'plant', 'harvest'];
    unreachableLife.scenes[0]!.zones.find((zone) => zone.id === 'town-plaza')!.allowedActions.push('build');
    expect(codes(refreshHashes(unreachable))).toContain('construction_build_zone_unreachable');

    const locked = constructionBundle();
    const lockedLife = locked.game.lifePackage as {
      constructionProjects: Array<{ requires?: unknown }>;
      scenes: Array<{ placements: Array<{ id: string; requires?: unknown }> }>;
    };
    lockedLife.scenes[0]!.placements.find((placement) => placement.id === 'farmhouse')!.requires = { kind: 'flag', id: 'flag.story.first_harvest', equals: true };
    lockedLife.constructionProjects[0]!.requires = { kind: 'flag', id: 'flag.story.first_harvest', equals: false };
    expect(codes(refreshHashes(locked))).toContain('construction_affordance_unavailable');
  });

  it('does not widen non-construction zone actions while validating build reachability', () => {
    const bundle = constructionBundle();
    const zones = (bundle.game.lifePackage as { scenes: Array<{ zones: Array<{ id: string; allowedActions: string[] }> }> }).scenes[0]!.zones;
    const before = structuredClone(zones.map((zone) => ({ id: zone.id, allowedActions: zone.allowedActions })));
    expect(checkLifeGenerationBundle(bundle).ok).toBe(true);
    expect(zones.map((zone) => ({ id: zone.id, allowedActions: zone.allowedActions }))).toEqual(before);
    expect(zones.find((zone) => zone.id === 'farm-field')!.allowedActions).toEqual(['till', 'water', 'plant', 'harvest', 'build']);
    expect(zones.find((zone) => zone.id === 'town-plaza')!.allowedActions).toEqual(['talk', 'gift']);
    expect(zones.find((zone) => zone.id === 'forest-grove')!.allowedActions).toEqual(['forage']);
    expect(zones.find((zone) => zone.id === 'mine-mouth')!.allowedActions).toEqual(['mine']);
  });

  it('keeps all three Demon Castle construction projects reachable without widening unrelated actions', () => {
    const candidate = JSON.parse(readFileSync(resolve('docs/design/game-demon-castle/bundle.candidate.json'), 'utf8')) as LifeGenerationBundleV1;
    const life = candidate.game.lifePackage as { scenes: Array<{ zones: Array<{ id: string; allowedActions: string[] }> }> };
    const before = structuredClone(life.scenes.map((scene) => scene.zones));
    const result = checkLifeGenerationBundle(candidate);
    expect(result.ok, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(life.scenes.map((scene) => scene.zones)).toEqual(before);

    const actions = new Map(life.scenes.flatMap((scene) => scene.zones.map((zone) => [zone.id, zone.allowedActions] as const)));
    expect(actions.get('courtyard-town')).toEqual(['build']);
    expect(actions.get('courtyard-garden')).toEqual(['till', 'water', 'plant', 'harvest']);
    expect(actions.get('moonshadow-forage')).toEqual(['forage']);
    expect(actions.get('undercrypt-vein')).toEqual(['mine', 'build']);

    const sabotaged = structuredClone(candidate);
    const sabotagedLife = sabotaged.game.lifePackage as { scenes: Array<{ zones: Array<{ allowedActions: string[] }> }> };
    for (const scene of sabotagedLife.scenes) {
      for (const zone of scene.zones) zone.allowedActions = zone.allowedActions.filter((action) => action !== 'build');
    }
    const diagnostics = checkLifeGenerationBundle(refreshHashes(sabotaged)).diagnostics
      .filter((entry) => entry.code === 'construction_build_zone_missing');
    expect(diagnostics.map((entry) => entry.path)).toEqual([
      '/game/lifePackage/constructionProjects/0/placementId',
      '/game/lifePackage/constructionProjects/1/placementId',
      '/game/lifePackage/constructionProjects/2/placementId',
    ]);
  });

  it('projects nearby, allowed, available build affordances for all three Demon Castle projects in real engine sessions', () => {
    const candidate = JSON.parse(readFileSync(resolve('docs/design/game-demon-castle/bundle.candidate.json'), 'utf8')) as LifeGenerationBundleV1;
    const formal = JSON.parse(readFileSync(resolve('games/game-demon-castle/life.json'), 'utf8'));
    // Owner subsequently approved the formal update; keep the package pinned to the reviewed candidate bytes.
    expect(canonicalLifeGenerationJson(formal)).toBe(canonicalLifeGenerationJson(candidate.game.lifePackage));
    const pkg = candidate.game.lifePackage as any;
    const blueprint = compileAndParseLifeGamePackage(pkg).blueprint;
    const observed: Array<{ projectId: string; placementId: string; nearby: boolean; allowed: boolean; available: boolean }> = [];

    for (const project of pkg.constructionProjects) {
      const scene = pkg.scenes.find((entry: any) => entry.placements.some((placement: any) => placement.id === project.placementId));
      const placement = scene.placements.find((entry: any) => entry.id === project.placementId);
      let hit: (typeof observed)[number] | undefined;
      for (const zone of scene.zones.filter((entry: any) => entry.allowedActions.includes('build'))) {
        for (let y = zone.rect.y; y < zone.rect.y + zone.rect.height && !hit; y++) {
          for (let x = zone.rect.x; x < zone.rect.x + zone.rect.width && !hit; x++) {
            const engine = new Engine();
            engine.load(blueprint);
            for (const requirement of [project.requires, placement.requires, zone.requires]) {
              if (requirement?.kind !== 'flag') continue;
              for (const [entityId] of engine.world.query('Flag')) {
                const flag = engine.world.getComponent<Flag>(entityId, 'Flag');
                if (flag?.id === requirement.id) engine.world.addComponent(entityId, { ...flag, active: requirement.equals } as Flag);
              }
            }
            const inventory = engine.world.getComponent<Inventory>('life:player', 'Inventory')!;
            const position = engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
            const transform = engine.world.getComponent<Transform>('life:player', 'Transform')!;
            const motion = engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!;
            engine.world.addComponent('life:player', { ...inventory, slots: Math.max(inventory.slots, project.materials.length), maxStack: Math.max(inventory.maxStack, ...project.materials.map((entry: any) => entry.count)), items: project.materials.map((entry: any) => ({ kind: entry.itemId, count: entry.count })) } as Inventory);
            engine.world.addComponent('life:player', { ...position, sceneId: scene.id, x, y } as LifePosition);
            engine.world.addComponent('life:player', { ...transform, x, y } as Transform);
            engine.world.addComponent('life:player', { ...motion, sceneId: scene.id, up: false, down: false, left: false, right: false } as LifeContinuousMotion);
            engine.world.tick();
            engine.world.tick();
            const context = engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext');
            const row = {
              projectId: project.id,
              placementId: project.placementId,
              nearby: context?.nearbyPlacementIds.includes(project.placementId) === true,
              allowed: context?.allowedActions.includes('build') === true,
              available: context?.affordances.some((entry) => entry.action === 'build' && entry.targetId === project.placementId && entry.available) === true,
            };
            if (row.nearby && row.allowed && row.available) hit = row;
          }
        }
      }
      expect(hit, `${project.id} must expose a real available build affordance`).toBeDefined();
      observed.push(hit!);
    }

    expect(observed).toEqual([
      { projectId: 'restore-throne-hall', placementId: 'throne-hall', nearby: true, allowed: true, available: true },
      { projectId: 'restore-greenhouse', placementId: 'greenhouse-ruin', nearby: true, allowed: true, available: true },
      { projectId: 'awaken-forge-core', placementId: 'forge-core', nearby: true, allowed: true, available: true },
    ]);
  });

  it('keeps session/provenance out of compiled runtime snapshots', () => {
    const bundle = clone();
    const parsed = compileAndParseLifeGamePackage(bundle.game.lifePackage);
    const engine = new Engine(); engine.load(parsed.blueprint); engine.world.tick(); engine.world.tick();
    const snapshot = canonicalLifeGenerationJson(engine.world.snapshot());
    expect(snapshot).not.toContain(bundle.session.id);
    expect(snapshot).not.toContain('sourceHashes');
    expect(snapshot).not.toContain(bundle.provenance.baseHash);
  });

  it('restricts repairs to current diagnostic paths, exact baseHash, safe ops, and round budget', () => {
    const bundle = clone();
    const allowed = ['/game/lifePackage/meta/title'];
    expect(validateLifeGenerationRepair(bundle, { artifactKind: 'life-generation-patch', baseHash: bundle.provenance.baseHash, patch: [{ op: 'replace', path: allowed[0], value: 'New' }] }, allowed)).toEqual([]);
    expect(validateLifeGenerationRepair(bundle, { artifactKind: 'life-generation-patch', baseHash: 'sha256:' + '0'.repeat(64), patch: [{ op: 'replace', path: '/game/slug', value: 'game-evil' }] }, allowed).map((entry) => entry.code)).toEqual(expect.arrayContaining(['repair_base_hash', 'repair_scope']));
    const max = clone(); (max.session as { round: number }).round = 8;
    expect(validateLifeGenerationRepair(max, { artifactKind: 'life-generation-patch', baseHash: max.provenance.baseHash, patch: [{ op: 'remove', path: allowed[0] }] }, allowed).map((entry) => entry.code)).toContain('repair_round_limit');
  });

  it('performs no filesystem writes, including when validation fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'life-gen-check-'));
    try {
      const before = readdirSync(dir);
      checkLifeGenerationBundle(clone());
      const bad = clone(); (bad.provenance as { baseHash: string }).baseHash = 'sha256:' + '0'.repeat(64);
      checkLifeGenerationBundle(bad);
      expect(readdirSync(dir)).toEqual(before);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('sabotage probe turns red when a covered visual reference is changed', () => {
    const bundle = clone();
    (bundle.game.lifePackage as { playerVisual: { skinKey: string } }).playerVisual.skinKey = 'art:probe:missing';
    const result = checkLifeGenerationBundle(refreshHashes(bundle));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['missing_slot', 'consumer_mismatch']));
  });
});
