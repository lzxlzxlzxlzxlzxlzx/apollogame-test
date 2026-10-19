// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { compileAndParseLifeGamePackage } from '@zerocraft/engine/assembly/life-package-compile.js';
import { validateLifeGamePackage } from '@zerocraft/engine/assembly/life-package-validate.js';
import { getCameraView } from '@zerocraft/engine/engine/protocol/camera-view.js';
import { applyCommands } from '@zerocraft/engine/net/commands.js';
import { WorldUi2DLayer } from '@zerocraft/engine/renderer/index.js';
import { mountUI, validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { STARTER_THEME } from '@zerocraft/engine/ui/starters/index.js';
import { LITTLE_VALLEY_PACKAGE } from './life-demo-package.js';
import { createLifeDemoSession, LIFE_DEMO_ART_SLUG, LIFE_DEMO_HOST_LAYOUT, loadLifeDemoArtInto } from './game-simlife.js';
import { installLifeDemoKeyboard } from './keyboard.js';
import { buildLifeDemoTopHud, buildLifeDemoUi } from './ui.js';
import { createLifeDemoDialogueSource, lifeWarpFeedback, selectLifeDemoView } from './view-model.js';
import { buildLifeInteractionNode, buildLifeInteractionOptions, buildLifeInteractionPresentation, LifeInteractionController, type LifeInteractionOption } from './world-interaction.js';
import type { Camera, Flag, LifeContinuousMotion, LifeQuestState, LifeResourceNode, State, Transform, Velocity } from '@zerocraft/engine/engine/protocol/components.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { optionAvailable } from '@zerocraft/engine/skills/tier3/dialogue.js';
import { AssetManager, StubAssetLoader } from '@zerocraft/engine/assets/index.js';
import { collectLifeSceneRender } from '@zerocraft/engine/renderer/life-scene-render.js';

function tick(session: ReturnType<typeof createLifeDemoSession>): void { applyCommands(session.engine.world, session.input.commandsForTick(session.engine.world.getVersion() + 1)); session.engine.world.tick(); }
function action(session: ReturnType<typeof createLifeDemoSession>, key: string, arg?: string): void { session.input.enqueueAction(key, arg === undefined ? undefined : { arg }); tick(session); }
function hold(session: ReturnType<typeof createLifeDemoSession>, direction: string, ticks: number): void { action(session, 'life.move.start', direction); for (let i = 1; i < ticks; i++) tick(session); action(session, 'life.move.stop', direction); }
function nodeById(node: LayoutNode, id: string): LayoutNode | undefined { return node.id === id ? node : node.children?.map((child) => nodeById(child, id)).find(Boolean); }
function optionById(options: readonly LifeInteractionOption[], id: string): LifeInteractionOption | undefined { for (const option of options) { if (option.id === id) return option; const nested = optionById(option.children ?? [], id); if (nested) return nested; } return undefined; }

describe('game-simlife Little Valley acceptance entry', () => {
  it('loads Little Valley art through its local AssetIndex by skin key, with optional fallback', async () => {
    const playerSkinKey = LITTLE_VALLEY_PACKAGE.playerVisual!.skinKey;
    const indexedArt = {
      version: 1,
      assets: [{
        id: playerSkinKey,
        type: 'texture',
        description: 'fixture player skin',
        status: 'filled',
        path: '/games/game-simlife/art/textures/player.png',
        spec: { usage: 'sprite', colorSpace: 'srgb', wrap: 'clamp', width: 32, height: 48 },
      }],
    };
    const fetchIndex = vi.fn(async () => ({ ok: true, json: async () => indexedArt }));
    vi.stubGlobal('fetch', fetchIndex);
    try {
      const assets = new AssetManager(new StubAssetLoader());
      expect(await loadLifeDemoArtInto(assets)).toBe(true);
      expect(LIFE_DEMO_ART_SLUG).toBe('game-simlife');
      expect(fetchIndex).toHaveBeenCalledWith('/games/game-simlife/art/index.json', { cache: 'no-store' });
      expect(assets.resolve(playerSkinKey)?.asset.descriptor.src).toBe('/games/game-simlife/art/textures/player.png');
      expect(assets.resolve('art:little-valley:missing-skin')).toBeUndefined();

      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('index unavailable'); }));
      const fallbackAssets = new AssetManager(new StubAssetLoader());
      expect(await loadLifeDemoArtInto(fallbackAssets)).toBe(false);
      expect(createLifeDemoSession(fallbackAssets).engine.world.getVersion()).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('validates and compiles one continuous RLE world with visual consumer keys', () => {
    expect(validateLifeGamePackage(LITTLE_VALLEY_PACKAGE).ok).toBe(true);
    expect(LITTLE_VALLEY_PACKAGE.scenes).toHaveLength(2);
    expect(LITTLE_VALLEY_PACKAGE.scenes[0]).toMatchObject({ width: 36, height: 26 });
    expect(LITTLE_VALLEY_PACKAGE.scenes[0]!.layers.every((layer) => layer.tiles.length < 36 * 26)).toBe(true);
    expect(LITTLE_VALLEY_PACKAGE.scenes[0]!.placements.find((placement) => placement.id === 'mine-entrance')).toMatchObject({
      kind: 'decoration', x: 33, y: 20, width: 2, height: 2,
      prefabRef: 'decoration.mine-entrance', skinKey: 'art:little-valley:placement:mine-entrance', interactionRange: 0,
    });
    expect(compileAndParseLifeGamePackage(LITTLE_VALLEY_PACKAGE).blueprint.capabilities.map((cap) => cap.id)).toEqual(expect.arrayContaining(['t2-life-continuous-motion', 'l5-camera', 't2-camera-follow']));
    const session = createLifeDemoSession();
    expect(session.engine.world.getComponent<Camera>('life:camera', 'Camera')).toMatchObject({
      zoom: 1, viewportW: 28, viewportH: 19, followMargin: 0, followMinZoom: 1, followMaxZoom: 1,
      followDeadZone: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3 },
    });
    expect(collectLifeSceneRender(session.engine.world)?.placements).toContainEqual(expect.objectContaining({
      placementId: 'mine-entrance', skinKey: 'art:little-valley:placement:mine-entrance',
    }));
  });

  it('uses held semantic movement, crosses the road, and cannot walk into the river', () => {
    const session = createLifeDemoSession();
    hold(session, 'right', 30);
    const beforeRiver = selectLifeDemoView(session.engine.world);
    expect(beforeRiver.x).toBeGreaterThan(10);
    hold(session, 'down', 40);
    const atRiver = selectLifeDemoView(session.engine.world);
    expect(atRiver.y).toBeLessThanOrEqual(17);
  });

  it('uses the tuned authored speed while preserving normalized diagonal motion and collision', () => {
    expect(LITTLE_VALLEY_PACKAGE.movement?.speed).toBe(0.3);

    const straight = createLifeDemoSession();
    const straightStart = { ...straight.engine.world.getComponent<Transform>('life:player', 'Transform')! };
    straight.input.enqueueAction('life.move.start', { arg: 'right' });
    for (let i = 0; i < 4; i++) tick(straight);
    const straightEnd = straight.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    expect(straightEnd.x - straightStart.x).toBeCloseTo(4 * 0.3, 8);
    expect(straightEnd.x - straightStart.x).toBeGreaterThan(4 * 0.18);

    const diagonal = createLifeDemoSession();
    const diagonalStart = { ...diagonal.engine.world.getComponent<Transform>('life:player', 'Transform')! };
    diagonal.input.enqueueAction('life.move.start', { arg: 'right' });
    diagonal.input.enqueueAction('life.move.start', { arg: 'down' });
    tick(diagonal);
    const diagonalEnd = diagonal.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    expect(Math.hypot(diagonalEnd.x - diagonalStart.x, diagonalEnd.y - diagonalStart.y)).toBeCloseTo(0.3, 8);

    const blocked = createLifeDemoSession();
    hold(blocked, 'left', 100);
    const atWall = selectLifeDemoView(blocked.engine.world);
    expect(atWall.x).toBeGreaterThanOrEqual(0);
    hold(blocked, 'left', 4);
    expect(selectLifeDemoView(blocked.engine.world).x).toBe(atWall.x);
  });

  it('drives the authored camera from dead-zone hold through scrolling to the map-edge clamp', () => {
    const session = createLifeDemoSession();
    const camera = session.engine.world.getComponent<Camera>('life:camera', 'Camera')!;
    expect(camera.offsetX).toBe(14); // 28-cell viewport clamped against the 36-cell map at spawn.

    session.input.enqueueAction('life.move.start', { arg: 'right' });
    for (let i = 0; i < 30; i++) tick(session);
    const inside = session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    expect(inside.x).toBeCloseTo(16, 8);
    expect(camera.offsetX).toBe(14); // focus 16.5 remains inside [8.4, 19.6].

    for (let i = 0; i < 30; i++) tick(session);
    const scrolling = session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    expect(camera.offsetX).toBeGreaterThan(14);
    expect(camera.offsetX).toBeLessThan(22);
    expect(scrolling.x + 0.5 - camera.offsetX).toBeCloseTo(28 * (0.5 - 0.3), 8);

    for (let i = 0; i < 80; i++) tick(session);
    action(session, 'life.move.stop', 'right');
    const edge = session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    expect(edge.x).toBeGreaterThan(35);
    expect(edge.x).toBeLessThan(36);
    expect(camera.offsetX).toBe(22); // maxX 36 - viewport half-width 14.
    expect(edge.x).toBeGreaterThan(camera.offsetX + 28 * (0.5 - 0.3)); // Bounds wins; player may approach the screen edge.
  });

  it('opens contextual farming via E-equivalent menu flow and harvests through queued actions', () => {
    const session = createLifeDemoSession();
    expect(selectLifeDemoView(session.engine.world).objective).toBe('收获一份成熟芜菁');
    hold(session, 'up', 8);
    let view = selectLifeDemoView(session.engine.world);
    expect(view.allowedActions).toEqual(expect.arrayContaining(['till', 'plant', 'harvest']));
    action(session, 'life.action', 'till'); action(session, 'life.action', 'water'); action(session, 'life.select-item', 'seed.turnip'); action(session, 'life.action', 'plant');
    action(session, 'life.advance-day'); action(session, 'life.action', 'water'); action(session, 'life.advance-day'); action(session, 'life.action', 'harvest');
    view = selectLifeDemoView(session.engine.world);
    expect(view.inventory).toContainEqual({ itemId: 'crop.turnip', count: 1 });
    expect(session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest', 'Flag')).toMatchObject({ active: true });
    const graph = LITTLE_VALLEY_PACKAGE.dialogueCatalog![0]!.graph as { start: { kind: 'choice'; options: readonly { requires?: unknown }[] } };
    expect(optionAvailable(session.engine.world, graph.start.options[1]! as Parameters<typeof optionAvailable>[1])).toBe(true);
    // Return to the known clear road corridor, then follow the same free-movement
    // route used by the NPC interaction acceptance path below.
    hold(session, 'down', 8); hold(session, 'right', 42); hold(session, 'up', 16);
    action(session, 'life.select-target', 'mayor'); action(session, 'life.action', 'talk');
    const dialogue = createLifeDemoDialogueSource(session.engine.world).current('life:dialogue-session:player');
    expect(dialogue?.options?.[1]).toMatchObject({ label: '我已经完成第一季收获。', available: true });
    action(session, 'dialogue.choose', '1');
    expect(session.engine.world.getComponent<State>('life:dialogue-session:player', 'State')).toMatchObject({ current: 'harvested' });
    expect(session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest_reported', 'Flag')).toMatchObject({ active: true });
    expect(selectLifeDemoView(session.engine.world).objective).toBe('在矿洞采集一份矿石');
    expect(createLifeDemoDialogueSource(session.engine.world).current('life:dialogue-session:player')?.text).toContain('去矿洞看看');
    action(session, 'life.dialogue.close');
    hold(session, 'down', 36); hold(session, 'down', 7); hold(session, 'right', 48); hold(session, 'up', 4); hold(session, 'right', 1);
    const gateView = selectLifeDemoView(session.engine.world); expect(gateView).toMatchObject({ scene: 'little-valley', x: 34, y: 20 });
    expect(optionById(buildLifeInteractionOptions(gateView), 'warp:mine-gate')?.actions).toContainEqual({ name: 'life.warp', arg: 'mine-gate' });
    action(session, 'life.warp', 'mine-gate'); expect(selectLifeDemoView(session.engine.world).scene).toBe('mine-interior');
    expect(buildLifeInteractionOptions(view).length).toBeGreaterThan(0);
  });

  it('drives the full farm E flow from refreshed engine affordances', () => {
    const session = createLifeDemoSession(); hold(session, 'up', 8);
    const controller = new LifeInteractionController();
    const run = (actions: readonly { name: string; arg?: string }[]): void => {
      for (const queued of actions) session.input.enqueueAction(queued.name, queued.arg === undefined ? undefined : { arg: queued.arg });
      tick(session);
    };
    let view = selectLifeDemoView(session.engine.world); let options = buildLifeInteractionOptions(view);
    expect(options.filter((option) => option.enabled).map((option) => option.id)).toEqual(['till']);
    run(controller.interact(options));

    view = selectLifeDemoView(session.engine.world); options = buildLifeInteractionOptions(view);
    expect(options.filter((option) => option.enabled).map((option) => option.id)).toEqual(['water']);
    run(controller.interact(options));

    view = selectLifeDemoView(session.engine.world); options = buildLifeInteractionOptions(view);
    expect(optionById(options, 'plant')).toMatchObject({ enabled: true });
    expect(controller.interact(options)).toEqual([]);
    expect(controller.confirm(options)).toEqual([]);
    run(controller.confirm(options));

    action(session, 'life.advance-day');
    view = selectLifeDemoView(session.engine.world); options = buildLifeInteractionOptions(view);
    expect(options.filter((option) => option.enabled).map((option) => option.id)).toEqual(['water']);
    run(controller.interact(options));
    action(session, 'life.advance-day');

    view = selectLifeDemoView(session.engine.world); options = buildLifeInteractionOptions(view);
    expect(options.filter((option) => option.enabled).map((option) => option.id)).toEqual(['harvest']);
    run(controller.interact(options));
    expect(selectLifeDemoView(session.engine.world).inventory).toContainEqual({ itemId: 'crop.turnip', count: 1 });
  });

  it('runs farm, mayor gate, mine depletion and safe exit through one queued player session', () => {
    const session = createLifeDemoSession();
    action(session, 'life.warp', 'mine-gate');
    expect(selectLifeDemoView(session.engine.world)).toMatchObject({ scene: 'little-valley', results: { warp: 'rejected:not-at-warp' } });
    hold(session, 'up', 8);
    action(session, 'life.action', 'till');
    action(session, 'life.action', 'water');
    action(session, 'life.select-item', 'seed.turnip');
    action(session, 'life.action', 'plant');
    action(session, 'life.advance-day');
    action(session, 'life.action', 'water');
    action(session, 'life.advance-day');
    action(session, 'life.action', 'harvest');
    expect(session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest', 'Flag')).toMatchObject({ active: true });

    hold(session, 'down', 8);
    hold(session, 'right', 42);
    hold(session, 'up', 16);
    action(session, 'life.select-target', 'mayor');
    action(session, 'life.action', 'talk');
    action(session, 'dialogue.choose', '1');
    expect(session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest_reported', 'Flag')).toMatchObject({ active: true });
    action(session, 'life.dialogue.close');

    hold(session, 'down', 36);
    hold(session, 'down', 7);
    hold(session, 'right', 48);
    hold(session, 'up', 4);
    hold(session, 'right', 1);
    const gateView = selectLifeDemoView(session.engine.world);
    expect(gateView).toMatchObject({ scene: 'little-valley', x: 34, y: 20 });
    const gate = optionById(buildLifeInteractionOptions(gateView), 'warp:mine-gate')!;
    expect(gate.actions).toContainEqual({ name: 'life.warp', arg: 'mine-gate' });
    for (const queued of gate.actions ?? []) action(session, queued.name, queued.arg);
    expect(selectLifeDemoView(session.engine.world)).toMatchObject({ scene: 'mine-interior', x: 1, y: 1 });

    hold(session, 'right', 77);
    let mineView = selectLifeDemoView(session.engine.world);
    expect(mineView).toMatchObject({ scene: 'mine-interior', x: 24, y: 1 });
    let mineOptions = buildLifeInteractionOptions(mineView);
    const vein = optionById(mineOptions, 'mine:ore-vein')!;
    expect(vein).toMatchObject({ enabled: true });
    expect(vein.actions).toEqual([{ name: 'life.select-target', arg: 'ore-vein' }, { name: 'life.action', arg: 'mine' }]);

    const descriptor = buildLifeInteractionPresentation(mineView, mineOptions, new LifeInteractionController().current)!;
    const overlay = document.createElement('div'); const layer = new WorldUi2DLayer({ source: () => [descriptor] }); layer.init(overlay);
    layer.sync(session.engine.world.readView(), getCameraView(session.engine.world), 900, 620, { kind: 'life-cell', options: { cellSize: 32 } });
    const prompt = overlay.querySelector<HTMLElement>('[data-entity-anchor="life:player"]')!;
    expect(prompt.style.display).toBe('block'); expect(prompt.textContent).toContain('采矿');
    expect(collectLifeSceneRender(session.engine.world)).toMatchObject({ sceneId: 'mine-interior', player: { cellX: 24, cellY: 1 } });
    expect(session.engine.world.getComponent<Camera>('life:camera', 'Camera')).toMatchObject({ zoom: 1, viewportW: 28, viewportH: 19 });
    expect(getCameraView(session.engine.world)).toMatchObject({ centerY: 9.5, zoom: 1 });
    expect(getCameraView(session.engine.world)!.centerX).toBeCloseTo(19, 8);
    layer.dispose();

    for (let i = 0; i < 2; i++) {
      for (const queued of vein.actions ?? []) session.input.enqueueAction(queued.name, queued.arg === undefined ? undefined : { arg: queued.arg });
      tick(session);
    }
    mineView = selectLifeDemoView(session.engine.world);
    expect(mineView.inventory).toContainEqual({ itemId: 'resource.ore', count: 2 });
    expect(session.engine.world.getComponent<LifeResourceNode>('life:placement:mine-interior:ore-vein', 'LifeResourceNode')).toMatchObject({ remaining: 0 });
    expect(session.engine.world.getComponent<LifeQuestState>('life:quest-state','LifeQuestState')).toMatchObject({receipts:['quest.first-season/harvest-turnip','quest.first-season/mine-ore','quest.first-season/report-to-mayor'],entries:expect.arrayContaining([{questId:'quest.first-season',nodeId:'mine-ore',state:'completed'}])});
    expect(mineView.objective).toBe('—');
    mineOptions = buildLifeInteractionOptions(mineView);
    const depleted = optionById(mineOptions, 'mine:ore-vein')!;
    expect(depleted).toMatchObject({ enabled: false, label: expect.stringContaining('资源已枯竭') });
    expect(new LifeInteractionController().interact([depleted])).toEqual([]);

    hold(session, 'left', 77);
    const exitView = selectLifeDemoView(session.engine.world);
    expect(exitView).toMatchObject({ scene: 'mine-interior', x: 1, y: 1 });
    const exit = optionById(buildLifeInteractionOptions(exitView), 'warp:mine-exit')!;
    expect(exit.actions).toEqual([{ name: 'life.warp', arg: 'mine-exit' }]);
    for (const queued of exit.actions ?? []) action(session, queued.name, queued.arg);
    expect(selectLifeDemoView(session.engine.world)).toMatchObject({ scene: 'little-valley', x: 7, y: 13 });
  });

  it('reaches nearby NPC/resource interactions through target selection then existing action signals', () => {
    const session = createLifeDemoSession();
    hold(session, 'right', 42); hold(session, 'up', 16);
    action(session, 'life.select-target', 'mayor'); action(session, 'life.action', 'talk');
    expect(selectLifeDemoView(session.engine.world).dialogue).toContain('梅尔镇长');
    expect(createLifeDemoDialogueSource(session.engine.world).current('life:dialogue-session:player')?.options?.[1]).toMatchObject({ available: false });
    action(session, 'dialogue.choose', '1');
    expect(session.engine.world.getComponent<State>('life:dialogue-session:player', 'State')).toMatchObject({ current: 'start' });
    action(session, 'dialogue.choose', '0'); action(session, 'dialogue.advance'); action(session, 'life.dialogue.close');
    hold(session, 'right', 29); hold(session, 'down', 4);
    action(session, 'life.select-target', 'berry-bush'); action(session, 'life.action', 'forage');
    expect(selectLifeDemoView(session.engine.world).inventory).toContainEqual({ itemId: 'resource.berry', count: 1 });
    action(session, 'life.action', 'forage'); action(session, 'life.action', 'forage'); tick(session);
    const depletedView = selectLifeDemoView(session.engine.world);
    expect(depletedView.affordances).toContainEqual(expect.objectContaining({ action: 'forage', targetId: 'berry-bush' }));
    const depleted = optionById(buildLifeInteractionOptions(depletedView), 'forage:berry-bush');
    expect(depleted).toMatchObject({ enabled: false, label: expect.stringContaining('资源已枯竭') });
    expect(new LifeInteractionController().interact(depleted ? [depleted] : [])).toEqual([]);
  });

  it('executes the controller mayor leaf as one real semantic queue batch and opens dialogue', () => {
    const session = createLifeDemoSession(); hold(session, 'right', 42); hold(session, 'up', 16);
    const view = selectLifeDemoView(session.engine.world); const options = buildLifeInteractionOptions(view);
    const controller = new LifeInteractionController(); const actions = controller.interact(options);
    expect(actions).toEqual([{ name: 'life.select-target', arg: 'mayor' }, { name: 'life.action', arg: 'talk' }]);
    for (const queued of actions) session.input.enqueueAction(queued.name, queued.arg === undefined ? undefined : { arg: queued.arg });
    tick(session);
    const opened = selectLifeDemoView(session.engine.world);
    expect(opened.dialogue).toContain('梅尔镇长');
    expect(opened.affordances.find((entry) => entry.action === 'talk')).toMatchObject({ available: false, reason: 'dialogue-open' });
    expect(buildLifeInteractionOptions(opened).some((option) => option.id === 'talk:mayor')).toBe(false);
  });

  it('keeps diagonal movement live during dialogue, expires out of range, and can re-enter to finish', () => {
    const session = createLifeDemoSession(); hold(session, 'right', 42); hold(session, 'up', 16);
    action(session, 'life.move.start', 'right');
    action(session, 'life.move.start', 'up');
    session.input.enqueueAction('life.select-target', { arg: 'mayor' }); session.input.enqueueAction('life.action', { arg: 'talk' }); tick(session);
    const motion = session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!;
    expect(motion).toMatchObject({ right: true, up: true });
    const openedVelocity = session.engine.world.getComponent<Velocity>('life:player', 'Velocity')!;
    expect(openedVelocity.vx).toBeGreaterThan(0);
    expect(openedVelocity.vy).toBeLessThan(0);
    const controller = new LifeInteractionController();
    let view = selectLifeDemoView(session.engine.world); let options = buildLifeInteractionOptions(view);
    controller.reconcile(view, options);
    expect(view.dialogueActive).toBe(true); expect(controller.current.open).toBe(true);
    expect(buildLifeInteractionNode(options, controller.current, view.dialogue)?.children?.map((child) => child.id)).toContain('life-host-world-menu-context');

    const openedAt = session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    const openedPosition = { x: openedAt.x, y: openedAt.y };
    for (let i = 0; i < 20 && selectLifeDemoView(session.engine.world).dialogueActive; i++) tick(session);
    view = selectLifeDemoView(session.engine.world); options = buildLifeInteractionOptions(view); controller.reconcile(view, options);
    const departed = session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    expect({ x: departed.x, y: departed.y }).not.toEqual(openedPosition);
    expect(view.nearby).not.toContain('mayor'); expect(view.dialogueActive).toBe(false); expect(controller.current.open).toBe(false);
    expect(motion).toMatchObject({ right: true, up: true });
    const departedVelocity = session.engine.world.getComponent<Velocity>('life:player', 'Velocity')!;
    expect(departedVelocity.vx).toBeGreaterThan(0);
    expect(departedVelocity.vy).toBeLessThan(0);

    action(session, 'life.move.stop', 'right'); action(session, 'life.move.stop', 'up');
    action(session, 'life.move.start', 'left'); action(session, 'life.move.start', 'down');
    for (let i = 0; i < 24 && !selectLifeDemoView(session.engine.world).nearby.includes('mayor'); i++) tick(session);
    action(session, 'life.move.stop', 'left'); action(session, 'life.move.stop', 'down');
    expect(selectLifeDemoView(session.engine.world).nearby).toContain('mayor');
    action(session, 'life.select-target', 'mayor'); action(session, 'life.action', 'talk');
    view = selectLifeDemoView(session.engine.world); options = buildLifeInteractionOptions(view); controller.reconcile(view, options);
    expect(view.dialogueActive).toBe(true); expect(controller.current.open).toBe(true);

    for (let i = 0; i < 3 && !view.dialogueTerminal; i++) {
      for (const queued of controller.confirm(options)) session.input.enqueueAction(queued.name, queued.arg === undefined ? undefined : { arg: queued.arg });
      tick(session); view = selectLifeDemoView(session.engine.world); options = buildLifeInteractionOptions(view); controller.reconcile(view, options);
    }
    expect(view.dialogueTerminal).toBe(true);
    const close = controller.activate(options, 'dialogue:close'); // Mouse-equivalent terminal continue.
    expect(close).toEqual([{ name: 'life.dialogue.close' }]);
    for (const queued of close) session.input.enqueueAction(queued.name, queued.arg === undefined ? undefined : { arg: queued.arg });
    tick(session);
    view = selectLifeDemoView(session.engine.world); controller.reconcile(view, buildLifeInteractionOptions(view));
    expect(view.dialogueActive).toBe(false); expect(session.engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
  });

  it('preserves two held directions and Velocity across E/repeat until matching keyup events', () => {
    const session = createLifeDemoSession(); const target = new EventTarget();
    const calls: Array<[string, string | undefined]> = [];
    const dispose = installLifeDemoKeyboard(target, {
      enqueueAction: (name, arg) => { calls.push([name, arg?.arg]); session.input.enqueueAction(name, arg); }, requestInteraction: () => { calls.push(['interaction.request', undefined]); }, cycleInteraction: () => {}, confirmInteraction: () => {}, backInteraction: () => {}, closeInteraction: () => {},
    });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); tick(session);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: true, left: true });
    const before = { ...session.engine.world.getComponent<Velocity>('life:player', 'Velocity')! };
    expect(before.vx).toBeLessThan(0);
    expect(before.vy).toBeLessThan(0);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); tick(session);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: true, left: true });
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: before.vx, vy: before.vy });
    target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: true, left: false });
    target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); tick(session);
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0, vy: 0 });
    expect(calls).toEqual([
      ['life.move.state', '1'], ['life.move.state', '5'], ['interaction.request', undefined], ['life.move.state', '1'], ['life.move.state', '0'],
    ]);
    dispose();
  });

  it('converges the real World to zero motion when opposed aliases all release before one tick', () => {
    const session = createLifeDemoSession(); const target = new EventTarget();
    const dispose = installLifeDemoKeyboard(target, {
      enqueueAction: (name, arg) => session.input.enqueueAction(name, arg), requestInteraction: () => {}, cycleInteraction: () => {}, confirmInteraction: () => {}, backInteraction: () => {}, closeInteraction: () => {},
    });
    const key = (type: 'keydown' | 'keyup', code: string, repeat = false) => target.dispatchEvent(new KeyboardEvent(type, { code, repeat }));

    key('keydown', 'KeyA'); tick(session);
    key('keydown', 'KeyW'); tick(session);
    key('keydown', 'KeyD'); tick(session);
    key('keydown', 'ArrowRight'); tick(session);
    key('keydown', 'KeyD', true); key('keydown', 'ArrowRight', true); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: true, down: false, left: true, right: true });
    const opposed = session.engine.world.getComponent<Velocity>('life:player', 'Velocity')!;
    expect(opposed).toMatchObject({ vx: 0 }); expect(opposed.vy).toBeLessThan(0);

    key('keyup', 'KeyD'); key('keyup', 'ArrowRight'); key('keyup', 'KeyW'); key('keyup', 'KeyA');
    tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: false, down: false, left: false, right: false });
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0, vy: 0 });
    const stopped = { ...session.engine.world.getComponent<Transform>('life:player', 'Transform')! };
    for (let i = 0; i < 5; i++) tick(session);
    expect(session.engine.world.getComponent<Transform>('life:player', 'Transform')).toMatchObject({ x: stopped.x, y: stopped.y });
    dispose();
  });

  it('does not let interaction-key auto-repeat duplicate actions or swallow a held direction', () => {
    const session = createLifeDemoSession(); const target = new EventTarget(); const calls: Array<[string, string | undefined]> = [];
    const dispose = installLifeDemoKeyboard(target, {
      enqueueAction: (name, arg) => { calls.push([name, arg?.arg]); session.input.enqueueAction(name, arg); }, requestInteraction: () => {}, cycleInteraction: () => {}, confirmInteraction: () => {}, backInteraction: () => {}, closeInteraction: () => {},
    });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')?.right).toBe(true);
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0.3, vy: 0 });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')?.right).toBe(true);
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0.3, vy: 0 });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', repeat: true })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')?.right).toBe(true);
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0.3, vy: 0 });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', repeat: true }));
    target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' })); tick(session);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')?.right).toBe(true);
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0.3, vy: 0 });
    target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' })); tick(session);
    expect(session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')?.right).toBe(false);
    expect(session.engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0, vy: 0 });
    expect(calls).toEqual([
      ['life.move.state', '8'], ['life.move.state', '0'], ['life.move.state', '8'], ['life.move.state', '0'],
    ]);
    dispose();
  });

  it('keeps a direction active until every physical key mapped to it is released', () => {
    const target = new EventTarget(); const calls: Array<[string, string | undefined]> = [];
    const dispose = installLifeDemoKeyboard(target, {
      enqueueAction: (name, arg) => calls.push([name, arg?.arg]), requestInteraction: () => {}, cycleInteraction: () => {}, confirmInteraction: () => {}, backInteraction: () => {}, closeInteraction: () => {},
    });
    for (const [type, code] of [['keydown', 'KeyW'], ['keydown', 'ArrowUp'], ['keyup', 'KeyW'], ['keyup', 'ArrowUp']] as const) {
      target.dispatchEvent(new KeyboardEvent(type, { code }));
    }
    expect(calls).toEqual([['life.move.state', '1'], ['life.move.state', '1'], ['life.move.state', '1'], ['life.move.state', '0']]); dispose();
  });

  it('releases held movement on visibility loss and before pointer-driven interaction', () => {
    const target=new EventTarget();const visibility=new EventTarget();const calls:Array<[string,string|undefined]>=[];
    const binding=installLifeDemoKeyboard(target,{enqueueAction:(name,arg)=>calls.push([name,arg?.arg]),requestInteraction:()=>{},cycleInteraction:()=>{},confirmInteraction:()=>{},backInteraction:()=>{},closeInteraction:()=>{}},visibility);
    target.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}));visibility.dispatchEvent(new Event('visibilitychange'));
    target.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));binding.releaseAll();
    expect(calls).toEqual([['life.move.state','8'],['life.move.state','0'],['life.move.state','1'],['life.move.state','0']]);
    binding();visibility.dispatchEvent(new Event('visibilitychange'));expect(calls).toHaveLength(4);
  });

  it('maps N to the existing advance-day semantic input and immediately updates the HUD date', () => {
    const session = createLifeDemoSession(); const target = new EventTarget(); const before = selectLifeDemoView(session.engine.world).date;
    const dispose = installLifeDemoKeyboard(target, {
      enqueueAction: (name, arg) => session.input.enqueueAction(name, arg), requestInteraction: () => {}, cycleInteraction: () => {}, confirmInteraction: () => {}, backInteraction: () => {}, closeInteraction: () => {},
    });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' })); tick(session);
    const after = selectLifeDemoView(session.engine.world); expect(after.date).not.toBe(before);
    const hud = buildLifeDemoTopHud(after);
    expect(nodeById(hud, 'life-host-advance-day')?.props).toMatchObject({ action: 'life.advance-day' });
    expect(nodeById(hud, 'life-host-advance-day-label')?.props).toMatchObject({ text: 'N：休息至明日' });
    dispose();
  });

  it('maps T to advance-time, updates the slot HUD, and swaps both NPC projections in one tick', () => {
    const session=createLifeDemoSession();const target=new EventTarget();const before=selectLifeDemoView(session.engine.world);
    const placements=()=>Object.fromEntries(session.engine.world.query('LifePlacement').map(([id])=>{const value=session.engine.world.getComponent<any>(id,'LifePlacement')!;return [value.placementId,{sceneId:value.sceneId,x:value.x,y:value.y}]}));
    expect(before.slot).toBe('Morning');expect(placements()).toMatchObject({mayor:{x:20,y:8},merchant:{x:22,y:8}});
    const dispose=installLifeDemoKeyboard(target,{enqueueAction:(name,arg)=>session.input.enqueueAction(name,arg),requestInteraction:()=>{},cycleInteraction:()=>{},confirmInteraction:()=>{},backInteraction:()=>{},closeInteraction:()=>{}});
    target.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT'}));tick(session);
    const after=selectLifeDemoView(session.engine.world);expect(after.date).toBe(before.date);expect(after.slot).toBe('Afternoon');
    expect(placements()).toMatchObject({mayor:{x:22,y:8},merchant:{x:20,y:8}});
    const hud=buildLifeDemoTopHud(after);
    expect(nodeById(hud,'life-host-slot')?.props).toMatchObject({text:'时段 Afternoon'});
    expect(nodeById(hud,'life-host-advance-time')?.props).toMatchObject({action:'life.advance-time'});
    expect(nodeById(hud,'life-host-advance-time-label')?.props).toMatchObject({text:'T：消磨时光'});
    dispose();
  });

  it('routes both always-visible HUD controls through the same queued semantic inputs', () => {
    const session = createLifeDemoSession(); const before = selectLifeDemoView(session.engine.world);
    const host = document.createElement('div'); const dispose = mountUI(host, buildLifeDemoTopHud(selectLifeDemoView(session.engine.world)), {}, STARTER_THEME, session.input);
    host.querySelector<HTMLElement>('#life-host-advance-time')!.click(); tick(session);
    expect(selectLifeDemoView(session.engine.world)).toMatchObject({ date: before.date, slot: 'Afternoon' });
    host.querySelector<HTMLElement>('#life-host-advance-day')!.click(); tick(session);
    expect(selectLifeDemoView(session.engine.world)).toMatchObject({ slot: 'Morning' });
    expect(selectLifeDemoView(session.engine.world).date).not.toBe(before.date);
    dispose();
  });

  it('maps keyboard held input and blur releases to semantic actions without mutating World', () => {
    const target = new EventTarget(); const calls: Array<[string, string | undefined]> = []; const ui: string[] = [];
    const dispose = installLifeDemoKeyboard(target, { enqueueAction: (name, arg) => calls.push([name, arg?.arg]), requestInteraction: () => ui.push('open'), cycleInteraction: (delta) => ui.push(`cycle:${delta}`), confirmInteraction: () => ui.push('confirm'), backInteraction: () => ui.push('back'), closeInteraction: () => ui.push('close') });
    const key = (type: 'keydown' | 'keyup', code: string, shiftKey = false) => target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, shiftKey }));
    key('keydown', 'KeyD'); key('keydown', 'KeyD'); target.dispatchEvent(new Event('blur')); key('keydown', 'KeyE'); key('keydown', 'Tab'); key('keydown', 'Tab', true); key('keydown', 'Enter'); key('keydown', 'Escape'); dispose();
    expect(calls).toEqual([['life.move.state', '8'], ['life.move.state', '0']]); expect(ui).toEqual(['close', 'open', 'cycle:1', 'cycle:-1', 'confirm', 'back']);
  });

  it('keeps the world projection read-only and validates compact HUD/world-menu LayoutNodes without a Modal', () => {
    const session = createLifeDemoSession(); const before = session.engine.world.snapshot(); const view = selectLifeDemoView(session.engine.world);
    const auditView = { ...view, canInteract: true, affordances: [
      { id: 'tile:a:till', action: 'till' as const, targetKind: 'tile' as const, targetId: 'a', available: true as const },
      { id: 'placement:mayor:talk', action: 'talk' as const, targetKind: 'placement' as const, targetId: 'mayor', available: true as const },
    ] };
    const options = buildLifeInteractionOptions(auditView); const controller = new LifeInteractionController(); controller.interact(options);
    const worldNode = buildLifeInteractionNode(options, controller.current); const presentation = buildLifeInteractionPresentation(auditView, options, controller.current)!;
    const top = buildLifeDemoTopHud(view); const tree = buildLifeDemoUi(view, worldNode); const serialized = JSON.stringify(tree);
    expect(session.engine.world.snapshot()).toEqual(before); expect(validateLayoutNode(tree)).toEqual([]);
    expect(LIFE_DEMO_HOST_LAYOUT).toMatchObject({ fieldW: 900, fieldH: 620, topBarH: 52, viewportMode: 'responsive' });
    expect('bottomBarH' in LIFE_DEMO_HOST_LAYOUT).toBe(false);
    expect(top.layout?.height).toBeLessThanOrEqual(52);
    expect(top.props).toMatchObject({ bg: 'raised', edge: 'gold' });
    expect('bare' in (top.props ?? {})).toBe(false);
    expect('shape' in (top.props ?? {})).toBe(false);
    expect(nodeById(top, 'life-host-name')?.props).toMatchObject({ text: '小山谷' });
    expect(nodeById(top, 'life-host-objective')).toBeTruthy();
    expect(nodeById(top, 'life-host-date')).toBeTruthy();
    expect(nodeById(top, 'life-host-slot')).toBeTruthy();
    expect(nodeById(top, 'life-host-bag')).toBeTruthy();
    expect(nodeById(top, 'life-host-advance-day')?.props).toMatchObject({ action: 'life.advance-day' });
    expect(nodeById(top, 'life-host-advance-day-label')?.props).toMatchObject({ text: 'N：休息至明日' });
    expect(nodeById(top, 'life-host-advance-time')?.props).toMatchObject({ action: 'life.advance-time' });
    expect(JSON.stringify(top)).not.toContain('"type":"Button"');
    expect(nodeById(tree, 'simlife-bottom-hud')).toBeUndefined();
    expect(nodeById(tree, 'simlife-open-interaction')).toBeUndefined();
    expect(nodeById(tree, 'life-host-world-menu')).toBeTruthy();
    expect(presentation.keepInViewport).toEqual({ padding: 10 });
    expect(serialized).not.toContain('"type":"Modal"');
    expect(serialized).not.toContain('innerHTML');
  });

  it('routes mine entrance and exit buttons through queued life.warp actions', () => {
    const session = createLifeDemoSession();
    // Position at the static entrance; the action itself still travels only through the queued input boundary.
    const motion = session.engine.world.getComponent<any>('life:player', 'LifeContinuousMotion')!; motion.sceneId = 'little-valley';
    session.engine.world.getComponent<any>('life:player', 'Transform')!.x = 34; session.engine.world.getComponent<any>('life:player', 'Transform')!.y = 20; tick(session);
    let view = selectLifeDemoView(session.engine.world); let options = buildLifeInteractionOptions(view);
    expect(optionById(options, 'warp:mine-gate')).toMatchObject({ enabled: false, label: expect.stringContaining('尚未开启') });
    action(session, 'life.warp', 'mine-gate');
    expect(view.scene).toBe('little-valley'); expect(selectLifeDemoView(session.engine.world).results.warp).toBe('rejected:locked');
    expect(lifeWarpFeedback(selectLifeDemoView(session.engine.world).results)).toBe('Warp: Locked');
    session.engine.world.getComponent<Flag>('life:logic:flag:flag.story.first_harvest_reported', 'Flag')!.active = true;
    tick(session); options = buildLifeInteractionOptions(selectLifeDemoView(session.engine.world));
    expect(optionById(options, 'warp:mine-gate')).toMatchObject({ enabled: true, actions: [{ name: 'life.warp', arg: 'mine-gate' }] });
    action(session, 'life.warp', 'mine-gate'); view = selectLifeDemoView(session.engine.world); expect(view.scene).toBe('mine-interior');
    options = buildLifeInteractionOptions(view); expect(optionById(options, 'warp:mine-exit')?.actions).toContainEqual({ name: 'life.warp', arg: 'mine-exit' });
    action(session, 'life.warp', 'mine-exit'); expect(selectLifeDemoView(session.engine.world).scene).toBe('little-valley');
  });
});
