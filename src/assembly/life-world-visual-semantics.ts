import type {
  LifeAction, LifeGamePackage, LifePlacement, LifeScene, LifeSurfaceKind, LifeTileDefinition,
} from '@engine/protocol/life-sim.js';

export interface LifeWorldVisualIssue { readonly path: string; readonly code: string; readonly message: string }
export interface LifeWorldVisualReport { readonly ok: boolean; readonly issues: readonly LifeWorldVisualIssue[] }

const surfaceActions: Readonly<Record<LifeSurfaceKind | 'tilled-dry' | 'watered' | 'crop-seeded' | 'crop-growing' | 'crop-mature', readonly LifeAction[]>> = Object.freeze({
  ground: [], blocked: [], plantable: ['till'], water: ['fish'], forage: ['forage'], mineable: ['mine'],
  'tilled-dry': ['water'], watered: ['plant'], 'crop-seeded': [], 'crop-growing': [], 'crop-mature': ['harvest'],
});

const pointerKey = (value: string): string => value.replace(/~/g, '~0').replace(/\//g, '~1');
const actionSignature = (actions: readonly LifeAction[]): string => [...actions].sort().join('|');

function expectedSurface(definition: LifeTileDefinition): LifeSurfaceKind {
  const tags = new Set(definition.tags);
  if (tags.has('blocked')) return 'blocked';
  if (tags.has('water')) return 'water';
  if (tags.has('mineable')) return 'mineable';
  if (tags.has('forage')) return 'forage';
  if (tags.has('plantable')) return 'plantable';
  return 'ground';
}

function groundTileIds(scene: LifeScene): string[] {
  return [...new Set((scene.layers.find((layer) => layer.name === 'ground')?.tiles ?? []).map((run) => run.tileId))].sort();
}

function distanceToPlacement(x: number, y: number, placement: Pick<LifePlacement, 'x' | 'y' | 'width' | 'height'>): number {
  const dx = x < placement.x ? placement.x - x : x >= placement.x + placement.width ? x - (placement.x + placement.width - 1) : 0;
  const dy = y < placement.y ? placement.y - y : y >= placement.y + placement.height ? y - (placement.y + placement.height - 1) : 0;
  return dx + dy;
}

/** Strict generation-time gate. Base Life parsing stays legacy-compatible. */
export function validateLifeWorldVisualSemantics(life: LifeGamePackage): LifeWorldVisualReport {
  const issues: LifeWorldVisualIssue[] = [];
  const issue = (path: string, code: string, message: string): void => { issues.push({ path, code, message }); };
  const usedTiles = new Set(life.scenes.flatMap(groundTileIds));
  let plantable = false;

  for (const tileId of [...usedTiles].sort()) {
    const definition = life.tileCatalog[tileId];
    if (!definition) continue;
    const path = `/tileCatalog/${pointerKey(tileId)}/visual`;
    if (!definition.visual?.skinKey) issue(`${path}/skinKey`, 'surface_skin_missing', 'used ground tile must declare a visual skinKey');
    const expected = expectedSurface(definition);
    if (!definition.visual?.surface) issue(`${path}/surface`, 'surface_missing', `used ground tile must declare surface ${expected}`);
    else if (definition.visual.surface !== expected) issue(`${path}/surface`, 'surface_mismatch', `surface must be ${expected} for the authored tile tags`);
    if (expected === 'plantable') plantable = true;
  }

  if (plantable) {
    if (!life.visualSemantics?.farm) issue('/visualSemantics/farm', 'farm_visuals_missing', 'plantable ground requires tilled-dry and watered visual keys');
    else {
      if (!life.visualSemantics.farm.tilledDrySkinKey) issue('/visualSemantics/farm/tilledDrySkinKey', 'surface_skin_missing', 'tilled-dry surface requires a skin key');
      if (!life.visualSemantics.farm.wateredSkinKey) issue('/visualSemantics/farm/wateredSkinKey', 'surface_skin_missing', 'watered surface requires a skin key');
    }
  }

  for (let sceneIndex = 0; sceneIndex < life.scenes.length; sceneIndex++) {
    const scene = life.scenes[sceneIndex]!;
    const placementById = new Map(scene.placements.map((placement) => [placement.id, placement]));
    for (let warpIndex = 0; warpIndex < scene.warps.length; warpIndex++) {
      const warp = scene.warps[warpIndex]!;
      const path = `/scenes/${sceneIndex}/warps/${warpIndex}`;
      if (!warp.label?.trim()) issue(`${path}/label`, 'warp_destination_label_missing', 'warp requires player-facing destination text');
      if (!warp.landmarkPlacementId?.trim()) { issue(`${path}/landmarkPlacementId`, 'warp_landmark_missing', 'warp must bind a same-scene visible landmark placement'); continue; }
      const landmark = placementById.get(warp.landmarkPlacementId);
      if (!landmark) { issue(`${path}/landmarkPlacementId`, 'warp_landmark_reference', 'landmark must reference a placement in the same scene'); continue; }
      if (!['building', 'interactable', 'decoration'].includes(landmark.kind)) issue(`${path}/landmarkPlacementId`, 'warp_landmark_kind', 'landmark must be a building, interactable, or decoration');
      if (landmark.schedule) issue(`${path}/landmarkPlacementId`, 'warp_landmark_visibility', 'landmark must be statically visible and cannot have a schedule');
      if (!landmark.skinKey) issue(`${path}/landmarkPlacementId`, 'warp_landmark_skin', 'landmark must declare a skin key');
      if (distanceToPlacement(warp.at.x, warp.at.y, landmark) > 1) issue(`${path}/landmarkPlacementId`, 'warp_landmark_relation', 'warp cell must overlap or be Manhattan-adjacent to its landmark footprint');
    }
  }

  const uses = new Map<string, Array<{ state: string; actions: readonly LifeAction[]; path: string }>>();
  const addUse = (key: string | undefined, state: string, actions: readonly LifeAction[], path: string): void => {
    if (!key) return;
    const rows = uses.get(key) ?? [];
    rows.push({ state, actions, path }); uses.set(key, rows);
  };
  for (const tileId of [...usedTiles].sort()) {
    const visual = life.tileCatalog[tileId]?.visual;
    if (visual?.surface) addUse(visual.skinKey, `tile:${tileId}:${visual.surface}`, surfaceActions[visual.surface], `/tileCatalog/${pointerKey(tileId)}/visual/skinKey`);
  }
  addUse(life.visualSemantics?.farm.tilledDrySkinKey, 'farm:tilled-dry', surfaceActions['tilled-dry'], '/visualSemantics/farm/tilledDrySkinKey');
  addUse(life.visualSemantics?.farm.wateredSkinKey, 'farm:watered', surfaceActions.watered, '/visualSemantics/farm/wateredSkinKey');
  for (let cropIndex = 0; cropIndex < (life.cropCatalog?.length ?? 0); cropIndex++) {
    const visual = life.cropCatalog![cropIndex]!.visual;
    addUse(visual?.seededSkinKey, `crop:${cropIndex}:seeded`, surfaceActions['crop-seeded'], `/cropCatalog/${cropIndex}/visual/seededSkinKey`);
    addUse(visual?.growingSkinKey, `crop:${cropIndex}:growing`, surfaceActions['crop-growing'], `/cropCatalog/${cropIndex}/visual/growingSkinKey`);
    addUse(visual?.matureSkinKey, `crop:${cropIndex}:mature`, surfaceActions['crop-mature'], `/cropCatalog/${cropIndex}/visual/matureSkinKey`);
  }
  for (const [key, rows] of [...uses.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const signatures = new Set(rows.map((row) => actionSignature(row.actions)));
    if (signatures.size <= 1) continue;
    for (const row of rows) issue(row.path, 'visual_key_action_collision', `${key} is shared by non-equivalent action states: ${rows.map((entry) => `${entry.state}[${actionSignature(entry.actions)}]`).join(', ')}`);
  }

  return { ok: issues.length === 0, issues: issues.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)) };
}

