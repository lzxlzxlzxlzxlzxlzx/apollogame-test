// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssetManager,
  type AssetDescriptor,
  type AssetLoader,
} from '@zerocraft/engine/assets/index.js';
import { applyCommands } from '@zerocraft/engine/net/commands.js';
import { hashWithOrder } from '@zerocraft/engine/net/index.js';
import { collectLifeSceneRender } from '@zerocraft/engine/renderer/life-scene-render.js';
import localIndex from '../../public/games/game-simlife/art/index.json';
import { CanvasRenderer, planLifeVisualDraw } from '../../src/renderer/canvas-renderer.js';
import {
  createLifeDemoSession,
  LITTLE_VALLEY_VISUAL_CATALOG,
  loadLifeDemoArtInto,
} from './game-simlife.js';

const PLAYER = 'art:little-valley:player:farmer';
const GRASS = 'art:little-valley:tile:meadow-grass';
const MAYOR = 'art:little-valley:placement:mayor';
const MATURE_TURNIP = 'art:little-valley:crop:turnip-mature';
const FOUR_VISIBLE_KEYS = [PLAYER, GRASS, MAYOR, MATURE_TURNIP] as const;

interface TaggedImage {
  readonly assetKey: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

class TaggedImageLoader implements AssetLoader {
  async load(descriptor: AssetDescriptor): Promise<{ handle: { image: TaggedImage }; width: number; height: number }> {
    if (descriptor.kind !== 'texture') throw new Error(`unexpected non-texture ${descriptor.key}`);
    const width = descriptor.width ?? 32;
    const height = descriptor.height ?? 32;
    return {
      handle: { image: { assetKey: descriptor.key, src: descriptor.src, width, height } },
      width,
      height,
    };
  }
}

interface RecordingContext {
  readonly drawImage: ReturnType<typeof vi.fn>;
  readonly arc: ReturnType<typeof vi.fn>;
  readonly fill: ReturnType<typeof vi.fn>;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  [key: string]: unknown;
}

function recordingContext(): RecordingContext {
  const target: RecordingContext = {
    drawImage: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
    imageSmoothingEnabled: false,
  };
  return new Proxy(target, {
    get(current, key) {
      if (typeof key === 'string' && !(key in current)) current[key] = vi.fn();
      return Reflect.get(current, key);
    },
    set(current, key, value) { return Reflect.set(current, key, value); },
  });
}

function tick(session: ReturnType<typeof createLifeDemoSession>): void {
  applyCommands(session.engine.world, session.input.commandsForTick(session.engine.world.getVersion() + 1));
  session.engine.world.tick();
}

function action(session: ReturnType<typeof createLifeDemoSession>, key: string, arg?: string): void {
  session.input.enqueueAction(key, arg === undefined ? undefined : { arg });
  tick(session);
}

function hold(session: ReturnType<typeof createLifeDemoSession>, direction: string, ticks: number): void {
  action(session, 'life.move.start', direction);
  for (let i = 1; i < ticks; i += 1) tick(session);
  action(session, 'life.move.stop', direction);
}

function growMatureTurnip(session: ReturnType<typeof createLifeDemoSession>): void {
  hold(session, 'up', 8);
  action(session, 'life.action', 'till');
  action(session, 'life.action', 'water');
  action(session, 'life.select-item', 'seed.turnip');
  action(session, 'life.action', 'plant');
  action(session, 'life.advance-day');
  action(session, 'life.action', 'water');
  action(session, 'life.advance-day');
}

function drawCall(context: RecordingContext, key: string): unknown[] | undefined {
  return context.drawImage.mock.calls.find((args) => (args[0] as TaggedImage | undefined)?.assetKey === key);
}

function lastDrawCall(context: RecordingContext, key: string): unknown[] | undefined {
  for (let i = context.drawImage.mock.calls.length - 1; i >= 0; i -= 1) {
    const args = context.drawImage.mock.calls[i]!;
    if ((args[0] as TaggedImage | undefined)?.assetKey === key) return args;
  }
  return undefined;
}

function lastDrawIndex(context: RecordingContext, key: string): number {
  for (let i = context.drawImage.mock.calls.length - 1; i >= 0; i -= 1) {
    if ((context.drawImage.mock.calls[i]![0] as TaggedImage | undefined)?.assetKey === key) return i;
  }
  return -1;
}

function expectDrawPlan(call: unknown[] | undefined, expected: ReturnType<typeof planLifeVisualDraw>): void {
  expect(call).toBeDefined();
  expect(call!.slice(1)).toEqual([
    expected.source.x, expected.source.y, expected.source.width, expected.source.height,
    expected.destination.x, expected.destination.y, expected.destination.width, expected.destination.height,
  ]);
}

describe('Little Valley registered art consumption vertical slice', () => {
  let context: RecordingContext;

  beforeEach(() => {
    context = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('loads the unchanged local index and draws grass, mature crop, mayor and player through their slot rules', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => structuredClone(localIndex) })));
    const assets = new AssetManager(new TaggedImageLoader());
    expect(await loadLifeDemoArtInto(assets)).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/games/game-simlife/art/index.json', { cache: 'no-store' });

    for (const key of FOUR_VISIBLE_KEYS) {
      const indexed = localIndex.assets.find((entry) => entry.id === key)!;
      const resolved = assets.resolve(key)!;
      expect(resolved.asset.descriptor).toMatchObject({ key, src: indexed.path });
      expect(resolved.asset.handle).toEqual(expect.objectContaining({ image: expect.objectContaining({ assetKey: key, src: indexed.path }) }));
    }

    const session = createLifeDemoSession(assets);
    growMatureTurnip(session);
    const projection = collectLifeSceneRender(session.engine.world, { cellSize: 32 })!;
    const grass = projection.tiles.find((entry) => entry.skinKey === GRASS)!;
    const crop = projection.farmOverlays.find((entry) => entry.skinKey === MATURE_TURNIP)!;
    const mayor = projection.placements.find((entry) => entry.skinKey === MAYOR)!;
    expect(projection.player.skinKey).toBe(PLAYER);
    expect(projection.placements.map((entry) => entry.depth)).toEqual([...projection.placements].map((entry) => entry.depth).sort((a, b) => a - b));

    const before = hashWithOrder(session.engine.world.snapshot(), session.engine.world.snapshotOrder());
    const renderer = new CanvasRenderer({
      width: 900,
      height: 568,
      assets,
      lifeVisualCatalog: LITTLE_VALLEY_VISUAL_CATALOG,
      lifePreviewOptions: { cellSize: 32 },
    });
    renderer.init(document.createElement('div'));
    renderer.sync(session.engine.world);
    renderer.destroy();
    expect(hashWithOrder(session.engine.world.snapshot(), session.engine.world.snapshotOrder())).toBe(before);

    expectDrawPlan(drawCall(context, GRASS), planLifeVisualDraw(
      { sx: 0, sy: 0, sw: 32, sh: 32 }, LITTLE_VALLEY_VISUAL_CATALOG.get(GRASS)!, grass.center.x, grass.center.y, grass.size,
    ));
    expectDrawPlan(drawCall(context, MATURE_TURNIP), planLifeVisualDraw(
      { sx: 0, sy: 0, sw: 32, sh: 32 }, LITTLE_VALLEY_VISUAL_CATALOG.get(MATURE_TURNIP)!, crop.center.x, crop.center.y, crop.size,
    ));
    expectDrawPlan(drawCall(context, MAYOR), planLifeVisualDraw(
      { sx: 0, sy: 0, sw: 32, sh: 48 }, LITTLE_VALLEY_VISUAL_CATALOG.get(MAYOR)!, mayor.center.x, mayor.center.y, mayor.size,
    ));
    // The farmer key is intentionally shared with an authored placement; the
    // player itself is the final draw for this key and must use the live foot anchor.
    expectDrawPlan(lastDrawCall(context, PLAYER), planLifeVisualDraw(
      { sx: 0, sy: 0, sw: 32, sh: 48 }, LITTLE_VALLEY_VISUAL_CATALOG.get(PLAYER)!, projection.player.center.x, projection.player.center.y, projection.cellSize,
    ));

    const grassIndex = context.drawImage.mock.calls.findIndex((args) => (args[0] as TaggedImage | undefined)?.assetKey === GRASS);
    const cropIndex = context.drawImage.mock.calls.findIndex((args) => (args[0] as TaggedImage | undefined)?.assetKey === MATURE_TURNIP);
    const mayorIndex = context.drawImage.mock.calls.findIndex((args) => (args[0] as TaggedImage | undefined)?.assetKey === MAYOR);
    const playerIndex = lastDrawIndex(context, PLAYER);
    expect([grassIndex, cropIndex, mayorIndex, playerIndex].every((index) => index >= 0)).toBe(true);
    expect(grassIndex).toBeLessThan(cropIndex);
    expect(cropIndex).toBeLessThan(mayorIndex); // ground/crop before depth-sorted placements
    expect(playerIndex).toBeGreaterThan(mayorIndex); // live player foot layer stays above placements
  });

  it('does not bypass the index: removing the player registration produces the semantic fallback instead of the SVG', async () => {
    const withoutPlayer = structuredClone(localIndex);
    withoutPlayer.assets = withoutPlayer.assets.filter((entry) => entry.id !== PLAYER);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => withoutPlayer })));
    const assets = new AssetManager(new TaggedImageLoader());
    expect(await loadLifeDemoArtInto(assets)).toBe(true);
    expect(assets.resolve(PLAYER)).toBeUndefined();

    const session = createLifeDemoSession(assets);
    const projection = collectLifeSceneRender(session.engine.world, { cellSize: 32 })!;
    expect(projection.player.skinKey).toBe(PLAYER);
    const before = hashWithOrder(session.engine.world.snapshot(), session.engine.world.snapshotOrder());
    const renderer = new CanvasRenderer({
      width: 900,
      height: 568,
      assets,
      lifeVisualCatalog: LITTLE_VALLEY_VISUAL_CATALOG,
      lifePreviewOptions: { cellSize: 32 },
    });
    renderer.init(document.createElement('div'));
    renderer.sync(session.engine.world);
    renderer.destroy();

    expect(drawCall(context, PLAYER)).toBeUndefined();
    expect(drawCall(context, GRASS)).toBeDefined();
    expect(context.arc).toHaveBeenCalledTimes(1);
    expect(context.arc).toHaveBeenCalledWith(
      projection.player.center.x,
      projection.player.center.y,
      projection.player.radius,
      0,
      Math.PI * 2,
    );
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(hashWithOrder(session.engine.world.snapshot(), session.engine.world.snapshotOrder())).toBe(before);
  });
});
