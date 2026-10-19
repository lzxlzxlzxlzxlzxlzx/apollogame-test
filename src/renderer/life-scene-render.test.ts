// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import { Engine } from '@runtime/engine.js';
import type { Camera, LifeActor, LifeCrop, LifeFarmPlot, LifePlacement, LifePosition, LifeScene, LifeTileCatalog, LifeWarp, Transform } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/determinism.js';
import { LIFE_VIEWPORT_PROFILE } from '@engine/protocol/life-viewport-profile.js';
import { lifePoseCell, resolveLifePose } from '@engine/protocol/life-pose.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { CanvasRenderer, responsiveCameraScale } from './canvas-renderer.js';
import { clampLifeCameraView, collectLifeSceneRender, lifeCellToWorld, lifeWorldToCell, projectLifeCamera, projectLifeCameraView, projectLifePointToScreen, type LifeWorldVisualCatalog } from './life-scene-render.js';

function lifeEngine(): Engine {
  const engine = new Engine();
  engine.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint);
  return engine;
}
function move(engine: Engine, dx: number, dy: number): void {
  engine.world.addComponent('life:player', { type: 'LifeMoveRequest', dx, dy }); engine.world.tick();
}
function warp(engine: Engine, warpId: string): void {
  engine.world.addComponent('life:player', { type: 'LifeWarpRequest', warpId }); engine.world.tick();
}

function paletteWorld(): World {
  const world = new World();
  world.createEntity('catalog');
  world.addComponent('catalog', { type: 'LifeTileCatalog', tiles: [
    { tileId: 'grass', tags: ['walkable'] }, { tileId: 'water', tags: ['water'] }, { tileId: 'soil', tags: ['plantable'] },
    { tileId: 'berry', tags: ['forage'] }, { tileId: 'ore', tags: ['mineable'] }, { tileId: 'wall', tags: ['blocked'] },
  ] } as LifeTileCatalog);
  world.createEntity('scene');
  world.addComponent('scene', { type: 'LifeScene', sceneId: 'palette', width: 6, height: 1, layers: [
    { name: 'ground', tiles: [{ tileId: 'grass', count: 1 }, { tileId: 'water', count: 1 }, { tileId: 'soil', count: 1 }, { tileId: 'berry', count: 1 }, { tileId: 'ore', count: 1 }, { tileId: 'wall', count: 1 }] },
    { name: 'collision', tiles: [{ tileId: 'grass', count: 6 }] }, { name: 'interaction', tiles: [{ tileId: 'grass', count: 6 }] },
  ], zones: [], warps: [], spawnPoints: [], placements: [] } as LifeScene);
  world.createEntity('player');
  world.addComponent('player', { type: 'LifeActor', actorId: 'player', kind: 'player' } as LifeActor);
  world.addComponent('player', { type: 'LifePosition', sceneId: 'palette', x: 0, y: 0 } as LifePosition);
  return world;
}

describe('renderer/life-scene-render', () => {
  it('projects only the LifePosition scene and player marker through navigation warps', () => {
    const engine = lifeEngine();
    expect(collectLifeSceneRender(engine.world)?.sceneId).toBe('town');
    move(engine, 1, 0); move(engine, 1, 0); move(engine, 1, 0); warp(engine, 'town-farm-door');
    let projection = collectLifeSceneRender(engine.world)!;
    expect(projection.sceneId).toBe('farm'); expect(projection.player).toMatchObject({ cellX: 0, cellY: 0 });
    expect(projection.warps).toEqual([expect.objectContaining({ warpId: 'farm-town-door', center: projection.player.center })]);
    warp(engine, 'farm-town-door');
    projection = collectLifeSceneRender(engine.world)!;
    expect(projection.sceneId).toBe('town'); expect(projection.player).toMatchObject({ cellX: 0, cellY: 0 });
  });

  it('uses closed tag roles, instant renderer descriptors, and leaves the world unchanged', () => {
    const world = paletteWorld(); const before = world.snapshot(); const hash = hashSnapshot(before); const entityCount = world.getAllEntities().length;
    const projection = collectLifeSceneRender(world, { cellSize: 10, originX: 5, originY: 7 })!;
    expect(projection.tiles.map((tile) => tile.role)).toEqual(['ground', 'water', 'plantable', 'forage', 'mineable', 'blocked']);
    expect(projection.tiles.map((tile) => tile.center.x)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(projection.warps).toEqual([]);
    expect(world.snapshot()).toEqual(before); expect(hashSnapshot(world.snapshot())).toBe(hash); expect(world.getAllEntities()).toHaveLength(entityCount);
  });

  it('uses continuous Transform for the player foot and sorts placements by world depth without writing state', () => {
    const world = paletteWorld(); world.addComponent('player', { type: 'Transform', x: 1.25, y: 0.5, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    for (const [id, placement] of [['b', { x: 2, y: 0 }], ['a', { x: 1, y: 0 }]] as const) { world.createEntity(id); world.addComponent(id, { type: 'LifePlacement', sceneId: 'palette', placementId: id, kind: 'decoration', x: placement.x, y: placement.y, width: 1, height: 1, prefabRef: 'test', skinKey: `place:${id}`, interactionRange: 0 } as LifePlacement); }
    const before = world.snapshot(); const projection = collectLifeSceneRender(world, { cellSize: 20 })!;
    expect(projection.player.center).toEqual({ x: 35, y: 20 });
    // SIMLIFE-POSE-ANCHOR-01-SABOTAGE: highlight must derive from the same continuous footpoint.
    expect(projection.playerHighlight).toMatchObject({ cellX: 1, cellY: 0, center: { x: 30, y: 10 }, size: 20 });
    expect(projection.placements.map((x) => x.placementId)).toEqual(['a', 'b']);
    expect(projection.placements.every((value) => value.anchor === 'bottom-center')).toBe(true);
    expect(world.snapshot()).toEqual(before);
  });

  it('uses one deterministic floor-cell boundary for pose, collision, interaction and rendering', () => {
    expect(lifePoseCell(0.999_999, 2.999_999)).toEqual({ x: 0, y: 2 });
    expect(lifePoseCell(1, 3)).toEqual({ x: 1, y: 3 });
    expect(lifePoseCell(-0.001, -1)).toEqual({ x: -1, y: -1 });
    expect(resolveLifePose({ type: 'LifePosition', sceneId: 'palette', x: 7, y: 8 }, { x: 1.25, y: 3 })).toEqual({ sceneId: 'palette', x: 1.25, y: 3, cellX: 1, cellY: 3 });
  });

  it('omits dynamically hidden placements while retaining visible non-interactive projections', () => {
    const world=paletteWorld();
    for(const [id,visible,interactive] of [['hidden',false,true],['display-only',true,false]] as const){
      world.createEntity(id);world.addComponent(id,{type:'LifePlacement',sceneId:'palette',placementId:id,kind:'npc',x:1,y:0,width:1,height:1,prefabRef:'npc',skinKey:'npc',interactionRange:1,visible,interactive} as LifePlacement);
    }
    expect(collectLifeSceneRender(world)!.placements.map((placement)=>placement.placementId)).toEqual(['display-only']);
  });

  it('installs the shared camera-follow bridge and follows the continuous player Transform', () => {
    const engine = lifeEngine(); const player = engine.world.getComponent<Transform>('life:player', 'Transform')!;
    player.x = 1.5; player.y = 2.25; engine.world.tick();
    expect(engine.world.getComponent<Camera>('life:camera', 'Camera')).toMatchObject({ offsetX: 1.5, offsetY: 2.25 });
  });

  it('projects only sparse current-scene farm plots and their crop stages in stable grid order', () => {
    const world = paletteWorld();
    expect(collectLifeSceneRender(world)!.farmOverlays).toEqual([]);
    world.createEntity('plot-b');
    world.addComponent('plot-b', { type: 'LifeFarmPlot', sceneId: 'palette', x: 4, y: 0, soil: 'watered' } as LifeFarmPlot);
    world.addComponent('plot-b', { type: 'LifeCrop', cropId: 'turnip', daysGrown: 2, stage: 'mature' } as LifeCrop);
    world.createEntity('plot-a');
    world.addComponent('plot-a', { type: 'LifeFarmPlot', sceneId: 'palette', x: 1, y: 0, soil: 'tilled' } as LifeFarmPlot);
    world.addComponent('plot-a', { type: 'LifeCrop', cropId: 'turnip', daysGrown: 0, stage: 'seeded' } as LifeCrop);
    world.createEntity('other-scene');
    world.addComponent('other-scene', { type: 'LifeFarmPlot', sceneId: 'other', x: 0, y: 0, soil: 'watered' } as LifeFarmPlot);
    const overlays = collectLifeSceneRender(world)!.farmOverlays;
    expect(overlays).toEqual([
      expect.objectContaining({ x: 1, y: 0, soil: 'tilled', cropStage: 'seeded' }),
      expect.objectContaining({ x: 4, y: 0, soil: 'watered', cropStage: 'mature' }),
    ]);
  });

  it('uses authored farm surface keys and suppresses the generic warp marker only for a visible bound landmark', () => {
    const world = paletteWorld();
    world.createEntity('warp');
    world.addComponent('warp', { type: 'LifeWarp', sceneId: 'palette', warpId: 'exit', x: 2, y: 0, width: 1, height: 1, toSceneId: 'other', toSpawnId: 'entry' } as LifeWarp);
    world.createEntity('landmark');
    world.addComponent('landmark', { type: 'LifePlacement', sceneId: 'palette', placementId: 'gate', kind: 'decoration', x: 2, y: 0, width: 1, height: 1, prefabRef: 'gate', skinKey: 'art:test:gate', interactionRange: 0, visible: true, interactive: false } as LifePlacement);
    world.createEntity('plot');
    world.addComponent('plot', { type: 'LifeFarmPlot', sceneId: 'palette', x: 1, y: 0, soil: 'watered' } as LifeFarmPlot);
    const visuals: LifeWorldVisualCatalog = { farm: { tilledDrySkinKey: 'art:test:dry', wateredSkinKey: 'art:test:wet' }, warpLandmarks: new Map([['palette\u0000exit', 'gate']]) };
    const projection = collectLifeSceneRender(world, {}, visuals)!;
    expect(projection.warps).toEqual([expect.objectContaining({ warpId: 'exit', landmarkPlacementId: 'gate', fallbackMarker: false })]);
    expect(projection.farmOverlays).toEqual([expect.objectContaining({ soil: 'watered', soilSkinKey: 'art:test:wet' })]);
    world.getComponent<LifePlacement>('landmark', 'LifePlacement')!.visible = false;
    expect(collectLifeSceneRender(world, {}, visuals)!.warps[0]!.fallbackMarker).toBe(true);
  });

  it('maps cell centres and world points with one shared inverse projection', () => {
    const options = { cellSize: 24, originX: -10, originY: 17 };
    const a = lifeCellToWorld(2, 3, options); const b = lifeCellToWorld(3, 3, options);
    expect(lifeWorldToCell(a.x, a.y, options)).toEqual({ x: 2, y: 3 });
    expect(b.x - a.x).toBe(24);
  });

  it('aligns an integral continuous Transform, logical-cell highlight and WorldUI cell anchor at arbitrary cell size', () => {
    const world = paletteWorld();
    world.getComponent<LifePosition>('player', 'LifePosition')!.x = 4;
    world.addComponent('player', { type: 'Transform', x: 4, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    const projection = collectLifeSceneRender(world, { cellSize: 37, originX: -11, originY: 9 })!;
    expect(projection.player.center).toEqual(lifeCellToWorld(4, 0, { cellSize: 37, originX: -11, originY: 9 }));
    expect(projection.playerHighlight.center).toEqual(projection.player.center);
  });

  it('uses responsive cover visible-cell counts to keep player, highlight and dialogue anchor onscreen at every edge', () => {
    const sizes = [[640, 668], [1060, 708], [1440, 900]] as const;
    const scene = { width: 36, height: 26 }; const cellSize = LIFE_VIEWPORT_PROFILE.host.cellSize;
    const { viewportWidthCells, viewportHeightCells } = LIFE_VIEWPORT_PROFILE.camera;
    const edges = [[0, 0], [35, 0], [0, 25], [35, 25]] as const;
    for (const [width, height] of sizes) for (const [x, y] of edges) {
      const cover = responsiveCameraScale(width, height, viewportWidthCells * cellSize, viewportHeightCells * cellSize, LIFE_VIEWPORT_PROFILE.host.cameraFit);
      const authored = { centerX: x < scene.width / 2 ? 14 : 22, centerY: y < scene.height / 2 ? 9.5 : 16.5, zoom: cover };
      const player = lifeCellToWorld(x, y, { cellSize });
      const effective = clampLifeCameraView(authored, width, height, scene.width, scene.height, player, { cellSize });
      const projection = projectLifeCameraView(effective, width, height, { cellSize });
      const playerScreen = projectLifePointToScreen(player, projection);
      const anchorScreen = projectLifePointToScreen(lifeCellToWorld(x, y - 0.7, { cellSize }), projection);
      for (const point of [playerScreen, anchorScreen]) {
        expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(width);
        expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(height);
      }
    }
  });

  it('projects a grid-unit camera once: interior player is centered and clamped edge viewport stays inside the scene', () => {
    const interior = { type: 'Camera', zoom: 1, offsetX: 20.5, offsetY: 11, rotation: 0, viewportW: 28, viewportH: 19 } as Camera;
    const transform = projectLifeCamera(interior, 900, 620, { cellSize: 32 });
    expect(projectLifePointToScreen({ x: 20.5 * 32, y: 11 * 32 }, transform)).toEqual({ x: 450, y: 310 });

    const leftEdge = { ...interior, offsetX: 14, offsetY: 9.5 } as Camera;
    const edge = projectLifeCamera(leftEdge, 900, 620, { cellSize: 32 });
    const visibleTopLeft = projectLifePointToScreen({ x: 0, y: 0 }, edge);
    const visibleBottomRight = projectLifePointToScreen({ x: 28 * 32, y: 19 * 32 }, edge);
    expect(visibleTopLeft).toEqual({ x: 2, y: 6 });
    expect(visibleBottomRight).toEqual({ x: 898, y: 614 });
  });

  it('fails softly for missing player, active scene, or tile catalog', () => {
    const empty = new World();
    expect(() => collectLifeSceneRender(empty)).not.toThrow(); expect(collectLifeSceneRender(empty)).toBeNull();
    const noScene = paletteWorld();
    noScene.getComponent<LifePosition>('player', 'LifePosition')!.sceneId = 'missing';
    expect(collectLifeSceneRender(noScene)).toBeNull();
    const noCatalog = paletteWorld(); noCatalog.removeComponent('catalog', 'LifeTileCatalog');
    expect(collectLifeSceneRender(noCatalog)).toBeNull();
  });
});

describe('CanvasRenderer LifeScene preview', () => {
  let context: { arc: ReturnType<typeof vi.fn>; fillRect: ReturnType<typeof vi.fn>; strokeRect: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    context = new Proxy({ globalAlpha: 1, imageSmoothingEnabled: true } as Record<string, unknown>, {
      get: (target, key: string) => target[key] ?? (target[key] = vi.fn()), set: (target, key: string, value) => { target[key] = value; return true; },
    }) as unknown as typeof context;
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => context;
  });

  it('draws the collector preview during sync without requiring render entities', () => {
    const engine = lifeEngine(); const renderer = new CanvasRenderer({ width: 128, height: 96 }); const host = document.createElement('div');
    renderer.init(host); renderer.sync(engine.world);
    expect(context.arc).toHaveBeenCalledTimes(1); // player marker
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(1); // background + RLE-projected tiles
    expect(context.strokeRect.mock.calls.length).toBeGreaterThan(1); // tile grid + scene boundary
    renderer.destroy();
  });

  it('draws sparse soil/crop overlays before the player marker', () => {
    const world = paletteWorld(); world.createEntity('plot');
    world.addComponent('plot', { type: 'LifeFarmPlot', sceneId: 'palette', x: 1, y: 0, soil: 'watered' } as LifeFarmPlot);
    world.addComponent('plot', { type: 'LifeCrop', cropId: 'turnip', daysGrown: 1, stage: 'growing' } as LifeCrop);
    const renderer = new CanvasRenderer({ width: 128, height: 96 }); const host = document.createElement('div');
    renderer.init(host); renderer.sync(world);
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(8); // background + tiles + soil + sprout
    expect(context.arc).toHaveBeenCalledTimes(1); // player is still rendered last as the top marker
    renderer.destroy();
  });

  it('draws a warp inner marker beneath the yellow player-cell outline when arrival and exit share one cell', () => {
    const engine = lifeEngine();
    move(engine, 1, 0); move(engine, 1, 0); move(engine, 1, 0); warp(engine, 'town-farm-door');
    const renderer = new CanvasRenderer({ width: 128, height: 96 }); const host = document.createElement('div');
    renderer.init(host); renderer.sync(engine.world);
    const marker = context.fillRect.mock.calls.findIndex((call) => call[0] === 6 && call[1] === 6 && call[2] === 20 && call[3] === 20);
    const highlight = context.fillRect.mock.calls.findIndex((call) => call[0] === 2 && call[1] === 2 && call[2] === 28 && call[3] === 28);
    expect(marker).toBeGreaterThanOrEqual(0);
    expect(highlight).toBeGreaterThan(marker);
    expect(context.arc).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it('keeps responsive render-local camera and highlight changes out of snapshot/hash across three sizes', () => {
    const engine = lifeEngine(); const before = engine.world.snapshot(); const hash = hashSnapshot(before);
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 668, configurable: true });
    const { host: viewport } = LIFE_VIEWPORT_PROFILE;
    const renderer = new CanvasRenderer({
      width: viewport.fieldW,
      height: viewport.fieldH - viewport.topBarH - viewport.bottomBarH,
      lifePreviewOptions: { cellSize: viewport.cellSize },
      viewport: { mode: viewport.mode, cameraFit: viewport.cameraFit },
    });
    renderer.init(host);
    for (const [width, height] of [[640, 668], [1060, 708], [1440, 900]] as const) {
      Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
      window.dispatchEvent(new Event('resize')); renderer.sync(engine.world.readView());
      expect(hashSnapshot(engine.world.snapshot())).toBe(hash); expect(engine.world.snapshot()).toEqual(before);
    }
    renderer.destroy();
  });
});
