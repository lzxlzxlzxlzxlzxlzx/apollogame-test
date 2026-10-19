import type { IWorld } from '@engine/core/types.js';
import type { Camera, LifeActor, LifeConstructionProject, LifeCrop, LifeCropCatalog, LifeFarmPlot, LifePlacement, LifePlayerVisual, LifePosition, LifeScene, LifeTileCatalog, LifeWarp, Transform } from '@engine/protocol/components.js';
import type { CameraView } from '@engine/protocol/camera-view.js';
import { sortedIds } from '@engine/core/query.js';
import type { LifeGamePackage, LifeLayer, LifeTileCatalogEntry, LifeTileTag } from '@engine/protocol/life-sim.js';
import { clamp } from '@engine/math/scalar.js';
import { cellCenter, cellFloor } from '@engine/math/grid.js';
import { resolveLifePose } from '@engine/protocol/life-pose.js';

/** Fixed development-preview roles. These are renderer fallbacks, not authored art. */
export type LifePreviewRole = 'ground' | 'water' | 'plantable' | 'forage' | 'mineable' | 'blocked';

/** Semantic role → fixed fallback colour. No model-provided colour enters this path. */
export const LIFE_PREVIEW_PALETTE: Readonly<Record<LifePreviewRole, string>> = Object.freeze({
  ground: '#708b4a', water: '#3d7ea6', plantable: '#8c643f', forage: '#5c9f55', mineable: '#7c7880', blocked: '#3e4148',
});

export interface LifeSceneProjectionOptions { readonly cellSize?: number; readonly originX?: number; readonly originY?: number }
export interface LifeProjectionPoint { readonly x: number; readonly y: number }
export interface LifeTileDrawDescriptor { readonly x: number; readonly y: number; readonly center: LifeProjectionPoint; readonly size: number; readonly role: LifePreviewRole; readonly skinKey?: string }
export interface LifePlayerDrawDescriptor { readonly actorId: string; readonly cellX: number; readonly cellY: number; readonly center: LifeProjectionPoint; readonly radius: number; readonly skinKey?: string; readonly anchor: 'bottom-center' }
export interface LifePlayerCellHighlightDescriptor { readonly cellX: number; readonly cellY: number; readonly center: LifeProjectionPoint; readonly size: number }
export interface LifePlacementDrawDescriptor { readonly placementId: string; readonly center: LifeProjectionPoint; readonly size: number; readonly skinKey: string; readonly depth: number; readonly anchor: 'bottom-center' }
/** Renderer-only exit descriptor. Generic marker is a legacy/error fallback only. */
export interface LifeWarpDrawDescriptor { readonly warpId: string; readonly center: LifeProjectionPoint; readonly size: number; readonly landmarkPlacementId?: string; readonly fallbackMarker: boolean }
/** Sparse, renderer-only state overlay. It mirrors no state and never creates cells. */
export interface LifeFarmOverlayDescriptor { readonly x: number; readonly y: number; readonly center: LifeProjectionPoint; readonly size: number; readonly soil: 'tilled' | 'watered'; readonly cropStage?: 'seeded' | 'growing' | 'mature'; readonly soilSkinKey?: string; readonly cropSkinKey?: string; /** @deprecated crop alias retained for renderer consumers. */ readonly skinKey?: string; readonly depth: number }
export interface LifeSceneRenderProjection { readonly sceneId: string; readonly sceneWidth: number; readonly sceneHeight: number; readonly cellSize: number; readonly originX: number; readonly originY: number; readonly tiles: readonly LifeTileDrawDescriptor[]; readonly warps: readonly LifeWarpDrawDescriptor[]; readonly farmOverlays: readonly LifeFarmOverlayDescriptor[]; readonly placements: readonly LifePlacementDrawDescriptor[]; readonly playerHighlight: LifePlayerCellHighlightDescriptor; readonly player: LifePlayerDrawDescriptor }
export interface LifeCameraProjection { readonly scale: number; readonly translateX: number; readonly translateY: number }
export interface LifeWorldVisualCatalog {
  readonly farm?: { readonly tilledDrySkinKey: string; readonly wateredSkinKey: string };
  readonly warpLandmarks: ReadonlyMap<string, string>;
}

/** Compiles authoring-only visual semantics without adding data to World. */
export function compileLifeWorldVisualCatalog(life: LifeGamePackage): LifeWorldVisualCatalog {
  const warpLandmarks = new Map<string, string>();
  for (const scene of life.scenes) for (const warp of scene.warps) if (warp.landmarkPlacementId) warpLandmarks.set(`${scene.id}\u0000${warp.id}`, warp.landmarkPlacementId);
  return { ...(life.visualSemantics?.farm ? { farm: { ...life.visualSemantics.farm } } : {}), warpLandmarks };
}

const DEFAULT_CELL_SIZE = 32;
const rolePriority: readonly LifePreviewRole[] = ['blocked', 'water', 'mineable', 'plantable', 'forage', 'ground'];

function optionsOf(options: LifeSceneProjectionOptions = {}): Required<LifeSceneProjectionOptions> {
  return { cellSize: options.cellSize ?? DEFAULT_CELL_SIZE, originX: options.originX ?? 0, originY: options.originY ?? 0 };
}

/** Grid coordinates map to the centre of their visual cell. */
export function lifeCellToWorld(x: number, y: number, options: LifeSceneProjectionOptions = {}): LifeProjectionPoint {
  const o = optionsOf(options);
  return cellCenter(x, y, o.originX, o.originY, o.cellSize);
}

/** Inverse of lifeCellToWorld for a point inside a cell; boundaries belong to the cell on their positive side. */
export function lifeWorldToCell(x: number, y: number, options: LifeSceneProjectionOptions = {}): { x: number; y: number } {
  const o = optionsOf(options);
  const cell = cellFloor(x, y, o.originX, o.originY, o.cellSize);
  return { x: cell.col, y: cell.row };
}

/** The only Life grid-camera → renderer-pixel conversion. Camera offsets remain in grid units. */
export function projectLifeCamera(camera: Camera, canvasWidth: number, canvasHeight: number, options: LifeSceneProjectionOptions = {}): LifeCameraProjection {
  return projectLifeCameraView({ centerX: camera.offsetX, centerY: camera.offsetY, zoom: camera.zoom }, canvasWidth, canvasHeight, options);
}

export function projectLifeCameraView(camera: CameraView, canvasWidth: number, canvasHeight: number, options: LifeSceneProjectionOptions = {}): LifeCameraProjection {
  const o = optionsOf(options); const centerX = o.originX + camera.centerX * o.cellSize; const centerY = o.originY + camera.centerY * o.cellSize;
  return { scale: camera.zoom, translateX: canvasWidth / 2 - centerX * camera.zoom, translateY: canvasHeight / 2 - centerY * camera.zoom };
}

/**
 * Responsive Life camera policy. Cover changes the real visible cell count, so the
 * renderer re-clamps its private CameraView without mutating the authored Camera.
 * One cell of top clearance keeps the player-anchored WorldUI label visible.
 */
export function clampLifeCameraView(
  camera: CameraView,
  canvasWidth: number,
  canvasHeight: number,
  sceneWidth: number,
  sceneHeight: number,
  playerCenter: LifeProjectionPoint,
  options: LifeSceneProjectionOptions = {},
): CameraView {
  const o = optionsOf(options);
  if (!(camera.zoom > 0) || !(canvasWidth > 0) || !(canvasHeight > 0)) return camera;
  const visibleW = canvasWidth / (o.cellSize * camera.zoom);
  const visibleH = canvasHeight / (o.cellSize * camera.zoom);
  const sceneCenter = (size: number, visible: number, authored: number): number => size > visible
    ? clamp(authored, visible / 2, size - visible / 2)
    : size / 2;
  let centerX = sceneCenter(sceneWidth, visibleW, camera.centerX);
  let centerY = sceneCenter(sceneHeight, visibleH, camera.centerY);
  const focusX = (playerCenter.x - o.originX) / o.cellSize;
  const focusY = (playerCenter.y - o.originY) / o.cellSize;
  const halfW = visibleW / 2; const halfH = visibleH / 2;
  // Highlight occupies half a cell in every direction. The dialogue anchor is
  // above the player, hence the larger generic top clearance.
  const horizontalClearance = Math.min(0.5, halfW);
  const bottomClearance = Math.min(0.5, visibleH / 3);
  const topClearance = Math.min(1, Math.max(0, visibleH - bottomClearance));
  centerX = clamp(centerX, focusX - halfW + horizontalClearance, focusX + halfW - horizontalClearance);
  centerY = clamp(centerY, focusY - halfH + bottomClearance, focusY + halfH - topClearance);
  return { centerX, centerY, zoom: camera.zoom };
}

export function projectLifePointToScreen(point: LifeProjectionPoint, camera: LifeCameraProjection): LifeProjectionPoint {
  return { x: point.x * camera.scale + camera.translateX, y: point.y * camera.scale + camera.translateY };
}

function tagsFor(catalog: readonly LifeTileCatalogEntry[], tileId: string): readonly LifeTileTag[] {
  return catalog.find((entry) => entry.tileId === tileId)?.tags ?? [];
}

function roleFor(tags: readonly LifeTileTag[]): LifePreviewRole {
  return rolePriority.find((role) => role === 'ground' || tags.includes(role)) ?? 'ground';
}

/**
 * Reads a run-length encoded layer directly while producing renderer-local tile descriptors.
 * This is intentionally not an ECS expansion: descriptors only exist for this render frame.
 */
function projectGround(scene: LifeScene, catalog: readonly LifeTileCatalogEntry[], options: Required<LifeSceneProjectionOptions>): LifeTileDrawDescriptor[] {
  const ground = scene.layers.find((layer) => layer.name === 'ground');
  if (!ground) return [];
  const tiles: LifeTileDrawDescriptor[] = [];
  let cell = 0;
  for (const run of ground.tiles) {
    const role = roleFor(tagsFor(catalog, run.tileId));
    for (let i = 0; i < run.count; i++, cell++) {
      const x = cell % scene.width; const y = Math.floor(cell / scene.width);
      tiles.push({ x, y, center: lifeCellToWorld(x, y, options), size: options.cellSize, role, ...(catalog.find((entry) => entry.tileId === run.tileId)?.skinKey === undefined ? {} : { skinKey: catalog.find((entry) => entry.tileId === run.tileId)!.skinKey }) });
    }
  }
  return tiles;
}

function findPlayer(world: IWorld): { actor: LifeActor; position: LifePosition; transform?: Transform; visual?: LifePlayerVisual } | undefined {
for (const [entityId] of world.query('LifeActor', 'LifePosition')) {
    const actor = world.getComponent<LifeActor>(entityId, 'LifeActor');
    const position = world.getComponent<LifePosition>(entityId, 'LifePosition');
    const transform = world.getComponent<Transform>(entityId, 'Transform');
    if (actor?.kind === 'player' && position) return { actor, position, ...(transform === undefined ? {} : { transform }), visual: world.getComponent<LifePlayerVisual>(entityId, 'LifePlayerVisual') };
  }
  return undefined;
}

function projectFarmOverlays(world: IWorld, sceneId: string, options: Required<LifeSceneProjectionOptions>, visuals?: LifeWorldVisualCatalog): LifeFarmOverlayDescriptor[] {
  const catalogEntity = world.singleton('LifeCropCatalog'); const catalog = catalogEntity === undefined ? undefined : world.getComponent<LifeCropCatalog>(catalogEntity, 'LifeCropCatalog');
  const overlays: LifeFarmOverlayDescriptor[] = [];
  for (const entityId of sortedIds(world, 'LifeFarmPlot')) {
    const plot = world.getComponent<LifeFarmPlot>(entityId, 'LifeFarmPlot');
    if (!plot || plot.sceneId !== sceneId) continue;
    const crop = world.getComponent<LifeCrop>(entityId, 'LifeCrop');
    const cropSkinKey = crop ? catalog?.crops.find((entry) => entry.id === crop.cropId)?.visual?.[`${crop.stage}SkinKey` as const] : undefined;
    const soilSkinKey = plot.soil === 'watered' ? visuals?.farm?.wateredSkinKey : visuals?.farm?.tilledDrySkinKey;
    overlays.push({ x: plot.x, y: plot.y, center: lifeCellToWorld(plot.x, plot.y, options), size: options.cellSize, soil: plot.soil, ...(crop ? { cropStage: crop.stage } : {}), ...(soilSkinKey === undefined ? {} : { soilSkinKey }), ...(cropSkinKey === undefined ? {} : { cropSkinKey, skinKey: cropSkinKey }), depth: plot.y + 0.6 });
  }
  return overlays.sort((a, b) => a.y - b.y || a.x - b.x);
}

function projectPlacements(world: IWorld, sceneId: string, options: Required<LifeSceneProjectionOptions>): LifePlacementDrawDescriptor[] {
  const out: LifePlacementDrawDescriptor[] = [];
  const completedSkinByPlacement = new Map<string, string>();
  for (const entityId of sortedIds(world, 'LifeConstructionProject')) {
    const project = world.getComponent<LifeConstructionProject>(entityId, 'LifeConstructionProject');
    if (project?.completed && !completedSkinByPlacement.has(project.placementId)) completedSkinByPlacement.set(project.placementId, project.completedSkinKey);
  }
  for (const entityId of sortedIds(world, 'LifePlacement')) { const placement = world.getComponent<LifePlacement>(entityId, 'LifePlacement'); if (placement?.sceneId === sceneId && placement.visible !== false) out.push({ placementId: placement.placementId, center: lifeCellToWorld(placement.x + placement.width / 2 - 0.5, placement.y + placement.height - 0.5, options), size: options.cellSize, skinKey: completedSkinByPlacement.get(placement.placementId) ?? placement.skinKey, depth: placement.y + placement.height, anchor: 'bottom-center' }); }
  return out.sort((a, b) => a.depth - b.depth || a.placementId.localeCompare(b.placementId));
}

function projectWarps(world: IWorld, sceneId: string, options: Required<LifeSceneProjectionOptions>, visuals?: LifeWorldVisualCatalog): LifeWarpDrawDescriptor[] {
  const out: LifeWarpDrawDescriptor[] = [];
  for (const entityId of sortedIds(world, 'LifeWarp')) {
    const warp = world.getComponent<LifeWarp>(entityId, 'LifeWarp');
    if (warp?.sceneId !== sceneId) continue;
    const landmarkPlacementId = visuals?.warpLandmarks.get(`${sceneId}\u0000${warp.warpId}`);
    let visibleLandmark = false;
    if (landmarkPlacementId) for (const placementEntity of sortedIds(world, 'LifePlacement')) {
      const placement = world.getComponent<LifePlacement>(placementEntity, 'LifePlacement');
      if (placement?.sceneId === sceneId && placement.placementId === landmarkPlacementId && placement.visible !== false) { visibleLandmark = true; break; }
    }
    out.push({ warpId: warp.warpId, center: lifeCellToWorld(warp.x, warp.y, options), size: options.cellSize, ...(landmarkPlacementId ? { landmarkPlacementId } : {}), fallbackMarker: !visibleLandmark });
  }
  return out;
}

/** Pure, fail-soft render collector: it reads no scene outside the active player scene and never writes World. */
export function collectLifeSceneRender(world: IWorld, inputOptions: LifeSceneProjectionOptions = {}, visuals?: LifeWorldVisualCatalog): LifeSceneRenderProjection | null {
  const player = findPlayer(world);
  const catalogEntity = world.singleton('LifeTileCatalog');
  const catalog = catalogEntity === undefined ? undefined : world.getComponent<LifeTileCatalog>(catalogEntity, 'LifeTileCatalog');
  if (!player || !catalog) return null;
  let scene: LifeScene | undefined;
  for (const [entityId] of world.query('LifeScene')) {
    const candidate = world.getComponent<LifeScene>(entityId, 'LifeScene');
    if (candidate?.sceneId === player.position.sceneId) { scene = candidate; break; }
  }
  if (!scene) return null;
  const options = optionsOf(inputOptions);
  const pose = resolveLifePose(player.position, player.transform);
  const center = lifeCellToWorld(pose.x, pose.y, options);
  const playerHighlight = { cellX: pose.cellX, cellY: pose.cellY, center: lifeCellToWorld(pose.cellX, pose.cellY, options), size: options.cellSize };
  return {
    sceneId: scene.sceneId, sceneWidth: scene.width, sceneHeight: scene.height, cellSize: options.cellSize, originX: options.originX, originY: options.originY,
    tiles: projectGround(scene, catalog.tiles, options), warps: projectWarps(world, scene.sceneId, options, visuals), farmOverlays: projectFarmOverlays(world, scene.sceneId, options, visuals), placements: projectPlacements(world, scene.sceneId, options),
    playerHighlight,
    player: { actorId: player.actor.actorId, cellX: pose.cellX, cellY: pose.cellY, center, radius: Math.max(3, Math.floor(options.cellSize * 0.28)), ...(player.visual?.skinKey === undefined ? {} : { skinKey: player.visual.skinKey }), anchor: 'bottom-center' },
  };
}
