// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getCameraView } from '@zerocraft/engine/engine/protocol/camera-view.js';
import { WorldUi2DLayer } from '@zerocraft/engine/renderer/index.js';
import { validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { createLifeDemoSession } from './game-simlife.js';
import { installLifeDemoKeyboard } from './keyboard.js';
import type { LifeDemoViewModel } from './view-model.js';
import { selectLifeDemoView } from './view-model.js';
import { buildLifeInteractionNode, buildLifeInteractionOptions, buildLifeInteractionPresentation, LIFE_INTERACTION_ACTIVATE_ACTION, LifeInteractionController } from './world-interaction.js';

function view(overrides: Partial<LifeDemoViewModel> = {}): LifeDemoViewModel {
  return {
    scene: 'little-valley', x: 20, y: 8, poseX: 20, poseY: 8, date: 'spring 1日（第1天）', slot: '清晨', placeLabel: '小镇广场',
    canInteract: true, interactionSummary: '', inventory: [], inventoryItems: [], inventoryCapacity: { usedSlots: 0, freeSlots: 0, totalSlots: 0 }, allowedActions: [], nearby: [], nearbyWarps: [], affordances: [],
    results: {}, objective: '目标：收获一份成熟芜菁后去找镇长', questItems: [], relationships: [], ...overrides,
  };
}

describe('Little Valley render-local world interaction', () => {
  it.each(['KeyE', 'Tab', 'Enter', 'Escape'])('preserves the real held direction through %s until the physical KeyUp', (interactionCode) => {
    const target = new EventTarget(); const calls: string[] = [];
    const dispose = installLifeDemoKeyboard(target, {
      enqueueAction: (name, arg) => calls.push(`${name}:${arg?.arg}`), requestInteraction: () => {}, cycleInteraction: () => {}, confirmInteraction: () => {}, backInteraction: () => {}, closeInteraction: () => {},
    });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    target.dispatchEvent(new KeyboardEvent('keydown', { code: interactionCode }));
    expect(calls).toEqual(['life.move.state:1']);
    target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(calls).toEqual(['life.move.state:1', 'life.move.state:0']); dispose();
  });

  it('queues a sole executable choice directly on E without opening the menu', () => {
    const model = view({ affordances: [{ id: 'placement:mayor:talk', action: 'talk', targetKind: 'placement', targetId: 'mayor', available: true }] });
    const options = buildLifeInteractionOptions(model);
    const controller = new LifeInteractionController();
    expect(options).toHaveLength(1);
    expect(controller.interact(options)).toEqual([
      { name: 'life.select-target', arg: 'mayor' }, { name: 'life.action', arg: 'talk' },
    ]);
    expect(controller.current.open).toBe(false);
    expect(JSON.stringify(buildLifeInteractionNode(options, controller.current))).not.toContain('"type":"Modal"');
  });

  it('opens multiple choices, cycles with Tab and confirms the selected semantic action', () => {
    const model = view({ affordances: [
      { id: 'tile:a:till', action: 'till', targetKind: 'tile', targetId: 'a', available: true },
      { id: 'tile:a:water', action: 'water', targetKind: 'tile', targetId: 'a', available: true },
    ] });
    const options = buildLifeInteractionOptions(model);
    const controller = new LifeInteractionController();
    expect(controller.interact(options)).toEqual([]); expect(controller.current.open).toBe(true);
    controller.cycle(options, 1);
    expect(controller.confirm(options)).toEqual([{ name: 'life.action', arg: 'water' }]);
    expect(controller.current.open).toBe(false);
  });

  it('uses affordance availability instead of contradictory authored allowedActions', () => {
    const model = view({
      allowedActions: ['till', 'talk'], nearby: ['mayor'],
      affordances: [
        { id: 'tile:a:water', action: 'water', targetKind: 'tile', targetId: 'a', available: true },
        { id: 'placement:mayor:talk', action: 'talk', targetKind: 'placement', targetId: 'mayor', available: false, reason: 'dialogue-open' },
      ],
    });
    const options = buildLifeInteractionOptions(model);
    expect(options.map((option) => [option.id, option.enabled])).toEqual([['water', true], ['talk:mayor', false]]);
    expect(new LifeInteractionController().interact(options)).toEqual([{ name: 'life.action', arg: 'water' }]);
    expect(JSON.stringify(options)).not.toContain('"life.action","arg":"till"');
  });

  it('shows unavailable engine reasons but never selects or confirms them', () => {
    const options = buildLifeInteractionOptions(view({ affordances: [
      { id: 'placement:ore-vein:mine', action: 'mine', targetKind: 'placement', targetId: 'ore-vein', available: false, reason: 'depleted' },
      { id: 'warp:mine-gate:warp', action: 'warp', targetKind: 'warp', targetId: 'mine-gate', available: false, reason: 'locked' },
    ] }));
    const controller = new LifeInteractionController();
    expect(controller.interact(options)).toEqual([]);
    expect(controller.confirm(options)).toEqual([]);
    const node = buildLifeInteractionNode(options, controller.current)!;
    expect(JSON.stringify(node)).toContain('Ore Vein · 资源已枯竭');
    expect(JSON.stringify(node)).toContain('Mine Gate · 尚未开启');
    expect(JSON.stringify(node)).not.toContain('（E）');
  });

  it('skips unavailable rows in both Tab directions and confirms only an available row', () => {
    const options = buildLifeInteractionOptions(view({ affordances: [
      { id: 'placement:ore-vein:mine', action: 'mine', targetKind: 'placement', targetId: 'ore-vein', available: false, reason: 'depleted' },
      { id: 'tile:a:till', action: 'till', targetKind: 'tile', targetId: 'a', available: true },
      { id: 'placement:mayor:talk', action: 'talk', targetKind: 'placement', targetId: 'mayor', available: true },
    ] }));
    const controller = new LifeInteractionController(); controller.interact(options);
    expect(controller.current.selected).toBe(1);
    controller.cycle(options, -1); expect(controller.current.selected).toBe(2);
    controller.cycle(options, 1); expect(controller.current.selected).toBe(1);
    expect(controller.confirm(options)).toEqual([{ name: 'life.action', arg: 'till' }]);
  });

  it('enters the plant submenu and resolves a seed leaf as select-item then plant', () => {
    const model = view({ inventory: [], affordances: [{ id: 'tile:a:plant', action: 'plant', targetKind: 'tile', targetId: 'a', available: true, candidateItemIds: ['seed.bean', 'seed.turnip'] }] });
    const options = buildLifeInteractionOptions(model);
    const controller = new LifeInteractionController();
    controller.interact(options);
    expect(controller.confirm(options)).toEqual([]); expect(controller.current.path).toEqual(['plant']);
    controller.cycle(options, 1);
    expect(controller.confirm(options)).toEqual([
      { name: 'life.select-item', arg: 'seed.turnip' }, { name: 'life.action', arg: 'plant' },
    ]);
  });

  it('makes mouse parent/leaf activation exactly equivalent to Enter on the same recursive choice', () => {
    const options = buildLifeInteractionOptions(view({ affordances: [
      { id: 'tile:a:plant', action: 'plant', targetKind: 'tile', targetId: 'a', available: true, candidateItemIds: ['seed.bean', 'seed.turnip'] },
      { id: 'tile:a:till', action: 'till', targetKind: 'tile', targetId: 'a', available: true },
    ] }));
    const keyboard = new LifeInteractionController(); keyboard.interact(options); keyboard.confirm(options); keyboard.cycle(options, 1);
    const keyboardActions = keyboard.confirm(options);
    const mouse = new LifeInteractionController(); mouse.interact(options);
    expect(mouse.activate(options, 'plant')).toEqual([]); expect(mouse.current.path).toEqual(['plant']);
    expect(mouse.activate(options, 'plant:seed.turnip')).toEqual(keyboardActions);
    expect(mouse.current.open).toBe(false);
  });

  it('does not expose a mouse action for disabled rows and ignores forged activation', () => {
    const model = view({ affordances: [
      { id: 'placement:ore-vein:mine', action: 'mine', targetKind: 'placement', targetId: 'ore-vein', available: false, reason: 'depleted' },
      { id: 'tile:a:till', action: 'till', targetKind: 'tile', targetId: 'a', available: true },
      { id: 'placement:mayor:talk', action: 'talk', targetKind: 'placement', targetId: 'mayor', available: true },
    ] });
    const options = buildLifeInteractionOptions(model); const controller = new LifeInteractionController(); controller.interact(options);
    const node = buildLifeInteractionNode(options, controller.current)!;
    const disabled = node.children?.find((child) => child.id.endsWith('placement:ore-vein:mine'));
    expect('action' in (disabled?.props ?? {})).toBe(false);
    expect(controller.activate(options, 'placement:ore-vein:mine')).toEqual([]);
    expect(controller.current.open).toBe(true);
  });

  it('routes real world-overlay clicks through the generic handler and removes the target after walking away', () => {
    const model = view({ affordances: [
      { id: 'tile:a:plant', action: 'plant', targetKind: 'tile', targetId: 'a', available: true, candidateItemIds: ['seed.turnip'] },
      { id: 'tile:a:till', action: 'till', targetKind: 'tile', targetId: 'a', available: true },
    ] });
    const options = buildLifeInteractionOptions(model); const controller = new LifeInteractionController(); controller.interact(options);
    const emitted: Array<{ readonly name: string; readonly arg?: string }> = [];
    let source = [buildLifeInteractionPresentation(model, options, controller.current)!];
    const overlay = document.createElement('div'); const layer = new WorldUi2DLayer({
      source: () => source,
      handlers: { [LIFE_INTERACTION_ACTIVATE_ACTION]: (id) => { emitted.push(...controller.activate(options, id)); } },
    });
    layer.init(overlay); layer.sync(createLifeDemoSession().engine.world.readView(), null, 900, 620);
    overlay.querySelector<HTMLElement>('[data-arg="plant"]')!.click();
    expect(controller.current.path).toEqual(['plant']);
    source = [buildLifeInteractionPresentation(model, options, controller.current)!]; layer.sync(createLifeDemoSession().engine.world.readView(), null, 900, 620);
    overlay.querySelector<HTMLElement>('[data-arg="plant:seed.turnip"]')!.click();
    expect(emitted).toEqual([{ name: 'life.select-item', arg: 'seed.turnip' }, { name: 'life.action', arg: 'plant' }]);
    controller.reconcile(view({ canInteract: false, affordances: [] }), []); source = [];
    layer.sync(createLifeDemoSession().engine.world.readView(), null, 900, 620);
    expect(overlay.querySelector('[data-entity-anchor="life:player"]')).toBeNull(); layer.dispose();
  });

  it('keeps compiled dialogue text and choices in the same player-anchored keyboard path', () => {
    const model = view({
      allowedActions: ['talk'], nearby: ['mayor'], selectedTarget: 'mayor', dialogueTarget: 'mayor', dialogue: '梅尔镇长：需要什么建议？', dialogueKind: 'choice',
      dialogueOptions: [{ index: 0, label: '从哪里开始？', available: true }, { index: 1, label: '汇报丰收', available: true }],
    });
    const options = buildLifeInteractionOptions(model); const controller = new LifeInteractionController();
    controller.interact(options); controller.cycle(options, 1);
    expect(controller.confirm(options)).toEqual([{ name: 'dialogue.choose', arg: '1' }]);
    const node = buildLifeInteractionNode(options, { open: true, path: [], selected: 0, sourceKey: '' }, model.dialogue)!;
    expect(node.children?.some((child) => child.id === 'life-host-world-menu-context')).toBe(true);
    expect(validateLayoutNode(node)).toEqual([]);
  });

  it('Escape returns one level then closes, movement closes, and loss of context auto-closes', () => {
    const model = view({ affordances: [{ id: 'tile:a:plant', action: 'plant', targetKind: 'tile', targetId: 'a', available: true, candidateItemIds: ['seed.turnip'] }] });
    const options = buildLifeInteractionOptions(model);
    const controller = new LifeInteractionController(); controller.interact(options); controller.confirm(options);
    controller.back(options); expect(controller.current).toMatchObject({ open: true, path: [] });
    controller.back(options); expect(controller.current.open).toBe(false);

    controller.interact(options);
    const target = new EventTarget();
    const dispose = installLifeDemoKeyboard(target, {
      enqueueAction: () => {}, requestInteraction: () => {}, cycleInteraction: () => {}, confirmInteraction: () => {}, backInteraction: () => controller.back(), closeInteraction: () => controller.close(),
    });
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(controller.current.open).toBe(false); dispose();

    controller.interact(options); controller.reconcile(view({ canInteract: false, affordances: [] }), []);
    expect(controller.current.open).toBe(false);
  });

  it('closes an open menu when affordance identity or availability refreshes', () => {
    const initial = buildLifeInteractionOptions(view({ affordances: [
      { id: 'tile:a:till', action: 'till', targetKind: 'tile', targetId: 'a', available: true },
      { id: 'placement:mayor:talk', action: 'talk', targetKind: 'placement', targetId: 'mayor', available: true },
    ] }));
    const refreshedView = view({ canInteract: true, affordances: [
      { id: 'tile:a:water', action: 'water', targetKind: 'tile', targetId: 'a', available: true },
      { id: 'placement:mayor:talk', action: 'talk', targetKind: 'placement', targetId: 'mayor', available: false, reason: 'dialogue-open' },
    ] });
    const controller = new LifeInteractionController(); controller.interact(initial);
    controller.reconcile(refreshedView, buildLifeInteractionOptions(refreshedView));
    expect(controller.current.open).toBe(false);
  });

  it('builds a valid non-Modal tree without changing the snapshot and projects its player descriptor through the bridge', () => {
    const session = createLifeDemoSession(); const before = session.engine.world.snapshot(); const actual = selectLifeDemoView(session.engine.world);
    const model = view({ x: actual.x, y: actual.y, poseX: actual.poseX, poseY: actual.poseY, affordances: [
      { id: 'tile:a:till', action: 'till', targetKind: 'tile', targetId: 'a', available: true },
      { id: 'tile:a:water', action: 'water', targetKind: 'tile', targetId: 'a', available: true },
    ] });
    const options = buildLifeInteractionOptions(model); const controller = new LifeInteractionController(); controller.interact(options);
    const descriptor = buildLifeInteractionPresentation(model, options, controller.current)!;
    expect(descriptor.transform).toEqual({ x: actual.poseX, y: actual.poseY });
    expect(validateLayoutNode(descriptor.node)).toEqual([]); expect(JSON.stringify(descriptor.node)).not.toContain('"type":"Modal"');
    const overlay = document.createElement('div'); const layer = new WorldUi2DLayer({ source: () => [descriptor] }); layer.init(overlay);
    layer.sync(session.engine.world.readView(), getCameraView(session.engine.world), 900, 620, { kind: 'life-cell', options: { cellSize: 32 } });
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="life:player"]')!;
    expect(host).toBeTruthy(); expect(host.style.display).toBe('block'); expect(host.textContent).toContain('选择互动');
    expect(descriptor.interactive).toBe(true); expect(host.style.pointerEvents).toBe('auto');
    expect(host.querySelector(`[data-action="${LIFE_INTERACTION_ACTIVATE_ACTION}"]`)).toBeTruthy();
    expect(session.engine.world.snapshot()).toEqual(before); layer.dispose();
  });

  it('uses responsive maximum widths for closed prompts and recursive menus', () => {
    const model = view({ affordances: [{ id: 'tile:a:plant', action: 'plant', targetKind: 'tile', targetId: 'a', available: true, candidateItemIds: ['seed.turnip'] }] });
    const options = buildLifeInteractionOptions(model); const controller = new LifeInteractionController();
    const prompt = buildLifeInteractionNode(options, controller.current)!;
    expect(prompt.layout).toMatchObject({ maxWidth: 260 }); expect(prompt.layout?.width).toBeUndefined();
    controller.interact(options);
    const root = buildLifeInteractionNode(options, controller.current)!;
    expect(root.layout).toMatchObject({ maxWidth: 244 }); expect(root.layout?.width).toBeUndefined();
    controller.activate(options, 'plant');
    const child = buildLifeInteractionNode(options, controller.current)!;
    expect(child.layout).toMatchObject({ maxWidth: 244 }); expect(child.layout?.width).toBeUndefined();
  });
});
