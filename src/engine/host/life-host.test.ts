// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from '../../assembly/life-package-compile.js';
import { threeSceneLifePackage } from '../../assembly/life-package.fixture.js';
import { seasideMarketHostDescriptorFixture } from '../../authoring/life-host-descriptor.fixture.js';
import type { DebugTrace } from '../protocol/components.js';
import { World } from '../core/world.js';
import { Engine } from '../../runtime/engine.js';
import { hashSnapshot } from '../../net/determinism.js';
import { validateLayoutNode, type LayoutNode } from '../../ui/components/index.js';
import { buildLifeInventoryPanel, buildLifeProfilePanel, buildLifeQuestPanel, buildLifeStandardHud, buildLifeStandardUi } from '../../assembly/life-host/life-hud.js';
import { EMPTY_LIFE_INPUT_STATE, installLifeKeyboard, reduceLifeInput } from './life-input.js';
import { buildLifeInteractionNode, buildLifeInteractionOptions, buildLifeInteractionPresentation, createLifeInteractionTraceSink, LifeInteractionController, type LifeInteractionOption } from '../../assembly/life-host/life-interaction.js';
import { humanizeLifeId, selectLifeHostView, type LifeHostViewModel } from '../../assembly/life-host/life-presenter.js';

function alienPackage(): Record<string, unknown> {
  const source = JSON.stringify(threeSceneLifePackage());
  return JSON.parse(source
    .replaceAll('three-scene-life', 'orbital-bazaar')
    .replaceAll('Three Scene Life', 'Orbital Bazaar')
    .replaceAll('Harbor Town', 'Orbital Hub Forage')
    .replaceAll('town', 'orbital-hub')
    .replaceAll('farm', 'glasshouse')
    .replaceAll('river', 'tidal-canal')
    .replaceAll('mayor', 'archivist')
    .replaceAll('berry', 'moonfruit')
    .replaceAll('"kind":"orbital-hub"', '"kind":"town"')
    .replaceAll('"kind":"glasshouse"', '"kind":"farm"')) as Record<string, unknown>;
}

function view(overrides: Partial<LifeHostViewModel> = {}): LifeHostViewModel {
  return {
    scene: 'orbital-hub', x: 2, y: 3, poseX: 2, poseY: 3, date: 'Cycle 4', slot: 'Blue Shift', placeLabel: 'Orbital Hub', canInteract: true,
    interactionSummary: '', inventory: [], inventoryItems: [], inventoryCapacity: { usedSlots: 0, freeSlots: 12, totalSlots: 12 }, allowedActions: [], nearby: [], nearbyWarps: [], affordances: [], results: {}, objective: 'Serve the first visitor', questItems: [], relationships: [],
    ...overrides,
  };
}

describe('generic Life host', () => {
  it('projects a second package with arbitrary ids without content branches or World writes', () => {
    const engine = new Engine();
    engine.load(compileAndParseLifeGamePackage(alienPackage()).blueprint);
    engine.world.tick();
    const before = engine.world.snapshot();
    const projected = selectLifeHostView(engine.world);
    expect(projected).toMatchObject({ scene: 'orbital-hub', placeLabel: 'Orbital Hub Forage' });
    expect(projected.interactionSummary).not.toContain('镇长');
    expect(engine.world.snapshot()).toEqual(before);
  });

  it('anchors render-local WorldUI to the continuous player foot while keeping interaction context discrete', () => {
    const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(alienPackage()).blueprint);
    const position = engine.world.getComponent<any>('life:player', 'LifePosition')!;
    const transform = engine.world.getComponent<any>('life:player', 'Transform')!;
    transform.x = 2.75; transform.y = 3.25;
    const before = engine.world.snapshot(); const projected = selectLifeHostView(engine.world);
    const root: readonly LifeInteractionOption[] = [{ id: 'probe', label: 'Probe', enabled: true, actions: [{ name: 'life.action', arg: 'talk' }] }];
    const presentation = buildLifeInteractionPresentation(projected, root, { open: false, path: [], selected: 0, sourceKey: '' })!;
    expect(projected).toMatchObject({ x: position.x, y: position.y, poseX: 2.75, poseY: 3.25 });
    expect(presentation.transform).toEqual({ x: 2.75, y: 3.25 });
    expect(engine.world.snapshot()).toEqual(before);
  });

  it('projects held item metadata in catalog order without mutating World state', () => {
    const authored = alienPackage() as any;
    authored.itemCatalog.push({ id: 'resource.starlight', kind: 'resource', skinKey: 'item:starlight' });
    const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(authored).blueprint); engine.world.tick();
    const catalog = engine.world.getComponent<any>('life:item-catalog', 'LifeItemCatalog')!;
    const bag = engine.world.getComponent<any>('life:player', 'Inventory')!;
    const first = catalog.items[0]!; const second = catalog.items[1]!;
    bag.items = [{ kind: second.id, count: 2 }, { kind: first.id, count: 1 }, { kind: second.id, count: 3 }];
    const before = engine.world.snapshot(); const projected = selectLifeHostView(engine.world);
    expect(projected.inventoryItems).toEqual([
      { id: first.id, title: humanizeLifeId(first.id), kind: first.kind, count: 1, skinKey: first.skinKey },
      { id: second.id, title: humanizeLifeId(second.id), kind: second.kind, count: 5, skinKey: second.skinKey },
    ]);
    expect(projected.inventory).toEqual([{ itemId: second.id, count: 2 }, { itemId: first.id, count: 1 }, { itemId: second.id, count: 3 }]);
    expect(projected.inventoryCapacity).toEqual({ usedSlots: 3, freeSlots: bag.slots - 3, totalSlots: bag.slots });
    expect(engine.world.snapshot()).toEqual(before);
  });

  it('joins authoritative quest catalog and projection in stable priority order without persisting tracking', () => {
    const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(alienPackage()).blueprint); engine.world.tick();
    engine.world.createEntity('life:quest-catalog');
    engine.world.addComponent('life:quest-catalog', { type: 'LifeQuestCatalog', chapters: [{ id: 'chapter.one', titleKey: '第一章', quests: [
      { id: 'quest.low', chapterId: 'chapter.one', priority: 1, initialNodeId: 'done', terminalNodeIds: ['done'], nodes: [{ id: 'done', titleKey: '旧事', objectiveKey: '旧事已了', trigger: { kind: 'game-start' }, effects: [] }] },
      { id: 'quest.high', chapterId: 'chapter.one', priority: 10, initialNodeId: 'now', terminalNodeIds: ['later'], nodes: [
        { id: 'now', titleKey: '眼前之事', objectiveKey: '去月井', trigger: { kind: 'game-start' }, effects: [] },
        { id: 'later', titleKey: '后来之事', objectiveKey: '打开月门', trigger: { kind: 'game-start' }, effects: [] },
      ] },
      { id: 'quest.locked', chapterId: 'chapter.one', priority: 5, initialNodeId: 'hidden', terminalNodeIds: ['hidden'], nodes: [{ id: 'hidden', titleKey: '未启之事', objectiveKey: '等待月圆', trigger: { kind: 'game-start' }, effects: [] }] },
    ] }] });
    engine.world.createEntity('life:quest-projection');
    engine.world.addComponent('life:quest-projection', { type: 'LifeQuestProjection', entries: [
      { chapterId: 'chapter.one', questId: 'quest.low', nodeId: 'done', state: 'completed', titleKey: '旧事', objectiveKey: '旧事已了' },
      { chapterId: 'chapter.one', questId: 'quest.high', nodeId: 'later', state: 'locked', titleKey: '后来之事', objectiveKey: '打开月门' },
      { chapterId: 'chapter.one', questId: 'quest.high', nodeId: 'now', state: 'active', titleKey: '眼前之事', objectiveKey: '去月井' },
      { chapterId: 'chapter.one', questId: 'quest.locked', nodeId: 'hidden', state: 'locked', titleKey: '未启之事', objectiveKey: '等待月圆' },
    ] });
    const before = engine.world.snapshot(); const beforeHash = hashSnapshot(before);
    const projected = selectLifeHostView(engine.world, {}, { defaultPolicy: 'first-active' });
    expect(projected.questItems.map((item) => [item.questId, item.state, item.tracked])).toEqual([
      ['quest.high', 'active', true], ['quest.locked', 'locked', false], ['quest.low', 'completed', false],
    ]);
    expect(projected.questItems[0]).toMatchObject({ completedNodes: 0, visibleNodes: 2, nextObjective: '去月井' });
    expect(projected.objective).toBe('去月井');
    const retargeted = selectLifeHostView(engine.world, {}, { questId: 'quest.locked', defaultPolicy: 'first-active' });
    expect(retargeted.questItems.find((item) => item.tracked)?.questId).toBe('quest.locked');
    expect(retargeted.objective).toBe('等待月圆');
    expect(engine.world.snapshot()).toEqual(before);
    expect(hashSnapshot(engine.world.snapshot())).toBe(beforeHash);
  });

  it('consumes the 17A descriptor HUD title and labels into a valid LayoutNode tree', () => {
    const descriptor = seasideMarketHostDescriptorFixture();
    const model = view({ inventory: [{ itemId: 'cargo.star-fruit', count: 3 }], relationships: [{ npcId: 'dock-keeper', value: 7, levelId: 'trusted', levelTitle: 'Trusted' }] });
    const hud = buildLifeStandardHud(model, descriptor.hud);
    const ui = buildLifeStandardUi(model, descriptor.hud, null);
    const text = JSON.stringify(hud);
    expect(text).toContain('海风集市');
    expect(text).toContain('营业日');
    expect(text).toContain('货箱');
    expect(text).not.toContain('Dock Keeper');
    expect(validateLayoutNode(ui)).toEqual([]);
  });

  /* AI START */
  it('paints resolved frame skins over dynamic labels and leaves missing art on the default chrome', () => {
    const descriptor = seasideMarketHostDescriptorFixture();
    const uiSkin = {
      id: 'moonshadow',
      slots: {
        trackedQuestFrame: 'art:game-seaside-market:ui:tracked',
        worldStatusRibbon: 'art:game-seaside-market:ui:ribbon',
        panelFrame: 'art:game-seaside-market:ui:panel',
        hudChrome: 'art:game-seaside-market:ui:chrome',
      },
      slices: { trackedQuestFrame: { source: 40, display: 18 }, panelFrame: { source: 64, display: 28 } },
    } as const;
    const model = view({
      date: 'Cycle 8', slot: 'Night', placeLabel: 'Moon Court',
      questItems: [{ chapterId: 'one', chapterTitle: 'One', questId: 'q', title: 'Restore the gate', summary: 'One', state: 'active', completedNodes: 0, visibleNodes: 1, tracked: true, nextObjective: 'Find moonwood' }],
      profile: { title: 'Keeper', attributes: [] },
    });
    const resolveSkin = (key: string) => key.endsWith(':panel') ? undefined : `/skins/${key}.png`;
    const missing = JSON.stringify(buildLifeStandardUi(model, descriptor.hud, null, {
      descriptor: { enabled: true, columns: 3, titleLabelKey: 'inventory' }, open: true, resolveSkin,
    }, {
      descriptor: { enabled: true, titleLabelKey: 'quests', defaultTracking: 'none' }, open: true,
    }, {
      descriptor: { enabled: true, titleLabelKey: 'profile' }, open: true, resolveSkin,
    }, uiSkin));
    expect(missing).toContain('/skins/art:game-seaside-market:ui:tracked.png');
    expect(missing).toContain('/skins/art:game-seaside-market:ui:ribbon.png');
    expect(missing).toContain('/skins/art:game-seaside-market:ui:chrome.png');
    expect(missing).toContain('Restore the gate');
    const missingTree = JSON.parse(missing) as LayoutNode;
    const flatten = (node: LayoutNode): LayoutNode[] => [node, ...(node.children ?? []).flatMap(flatten)];
    // Another loaded frame enables the overlay skeleton. A missing panel image
    // must retain opaque paper, not delete its entire sidebar or hide content.
    for (const kind of ['inventory', 'quest', 'profile']) {
      const frame = flatten(missingTree).find((node) => node.id === `life-host-${kind}-frame`);
      expect(frame?.props).toMatchObject({ bg: { custom: '#f6e7c8' } });
      expect(frame?.props).not.toHaveProperty('skin');
      expect(frame?.props).not.toHaveProperty('skinSlice');
    }
    expect(missing).not.toContain('/skins/art:game-seaside-market:ui:panel.png');
    expect(validateLayoutNode(missingTree)).toEqual([]);
    const painted = buildLifeStandardUi(model, descriptor.hud, null, {
      descriptor: { enabled: true, columns: 3, titleLabelKey: 'inventory' }, open: true, resolveSkin: (key) => `/skins/${key}.png`,
    }, {
      descriptor: { enabled: true, titleLabelKey: 'quests', defaultTracking: 'none' }, open: true,
    }, {
      descriptor: { enabled: true, titleLabelKey: 'profile' }, open: true,
    }, uiSkin);
    const text = JSON.stringify(painted);
    expect(text).toContain('life-host-inventory-frame');
    expect(text).toContain('life-host-quest-frame');
    expect(text).toContain('life-host-profile-frame');
    expect(text).toContain('Restore the gate');
    expect(text).toContain('"skinSlice":64');
    expect(validateLayoutNode(painted)).toEqual([]);
    expect(JSON.stringify(buildLifeStandardHud(model, descriptor.hud))).not.toContain('"skin"');
  });
  /* AI END */

  it('builds independent tracked-quest, world-status and resource-actions chrome from read-only projections', () => {
    const descriptor = seasideMarketHostDescriptorFixture();
    const model = view({ date: 'Cycle 8', slot: 'Night', placeLabel: 'Moon Court', questItems: [{ chapterId: 'one', chapterTitle: 'One', questId: 'q', title: 'Restore the gate', summary: 'One', state: 'active', completedNodes: 0, visibleNodes: 1, tracked: true, nextObjective: 'Find moonwood' }] });
    const text = JSON.stringify(buildLifeStandardHud(model, descriptor.hud));
    expect(text).toContain('life-host-tracked-quest'); expect(text).toContain('life-host-world-status'); expect(text).toContain('life-host-resource-actions');
    expect(text).toContain('Restore the gate'); expect(text).toContain('Cycle 8'); expect(text).toContain('Moon Court');
    const empty = JSON.stringify(buildLifeStandardHud(view(), descriptor.hud));
    expect(empty).toContain('当前没有追踪任务');
  });

  it('builds an opaque closeable inventory Drawer with catalog visuals and a generic fallback', () => {
    const descriptor = seasideMarketHostDescriptorFixture();
    const panel = { enabled: true, columns: 3, titleLabelKey: 'inventory' } as const;
    const model = view({
      inventoryItems: [
        { id: 'cargo.star-fruit', title: 'Star Fruit', kind: 'crop', count: 3, skinKey: 'art:fruit' },
        { id: 'ore.moon', title: 'Moon Ore', kind: 'resource', count: 2, skinKey: 'art:missing' },
      ],
      inventoryCapacity: { usedSlots: 2, freeSlots: 10, totalSlots: 12 },
    });
    const drawer = buildLifeInventoryPanel(model, descriptor.hud, panel, (key) => key === 'art:fruit' ? '/fruit.png' : undefined);
    const tree = buildLifeStandardUi(model, descriptor.hud, null, { descriptor: panel, open: true, resolveSkin: (key) => key === 'art:fruit' ? '/fruit.png' : undefined });
    const text = JSON.stringify(drawer);
    expect(drawer).toMatchObject({ type: 'Drawer', props: { side: 'right', title: '货箱' } });
    expect(text).toContain('life.host.inventory.close');
    expect(text).toContain('/fruit.png'); expect(text).toContain('life-host-inventory-placeholder-ore.moon');
    expect(text).toContain('空格 10'); expect(text).toContain('已用 2/12');
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it('builds a valid quest Drawer with state, progress, tracking and explicit no-active state', () => {
    const descriptor = seasideMarketHostDescriptorFixture();
    const panel = { enabled: true, titleLabelKey: 'quests', defaultTracking: 'first-active' } as const;
    const model = view({ questItems: [{
      chapterId: 'chapter.one', chapterTitle: '第一章', questId: 'quest.done', title: '归航', summary: '第一章', state: 'completed', completedNodes: 2, visibleNodes: 2, tracked: false, nextObjective: '已完成',
    }] });
    const drawer = buildLifeQuestPanel(model, descriptor.hud, panel);
    const tree = buildLifeStandardUi(model, descriptor.hud, null, {}, { descriptor: panel, open: true });
    const text = JSON.stringify(drawer);
    expect(drawer).toMatchObject({ type: 'Drawer', props: { side: 'right', title: '任务日志' } });
    expect(text).toContain('当前没有进行中的任务');
    expect(text).toContain('life.host.quest.track');
    expect(text).toContain('quest.done');
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it('projects authoritative profile values read-only and builds a valid resolved/fallback Drawer',()=>{
    const authored=alienPackage() as any;
    authored.playerVisual={skinKey:'art:player',anchor:'bottom-center'};
    authored.logic={resources:[{id:'renown',initial:4,min:0,max:10}]};
    authored.relationships=[{npcId:'archivist',min:0,max:100,initial:20,levels:[{id:'known',min:0,titleKey:'相识'},{id:'trusted',min:40,titleKey:'信赖'}],dailyCaps:{talk:1,gift:1,action:1},rules:[]}];
    authored.profile={titleKey:'Star Captain',attributes:[{id:'renown',titleKey:'Renown',display:'gauge',source:{kind:'resource',id:'renown'},iconSkinKey:'art:renown',surfaces:['profile','hud']},{id:'bond',titleKey:'Bond',display:'value',source:{kind:'relationship',npcId:'archivist'},iconSkinKey:'art:missing',surfaces:['profile','hud']}]};
    const engine=new Engine();engine.load(compileAndParseLifeGamePackage(authored).blueprint);engine.world.tick();
    let before=engine.world.snapshot();let model=selectLifeHostView(engine.world);
    expect(model.profile).toMatchObject({title:'Star Captain',playerSkinKey:'art:player',attributes:[{id:'renown',surfaces:['profile','hud'],value:4,min:0,max:10},{id:'bond',surfaces:['profile','hud'],value:20,levelId:'known',levelTitle:'相识'}]});
    const resource=engine.world.getComponent<any>('life:logic:resource:renown','Resource')!;
    engine.world.addComponent('life:logic:resource:renown',{...resource,current:7});
    const projection=engine.world.getComponent<any>('life:relationship-projection','LifeRelationshipProjection')!;
    engine.world.addComponent('life:relationship-projection',{...projection,entries:projection.entries.map((entry:any)=>entry.npcId==='archivist'?{...entry,value:55,levelId:'trusted',levelTitleKey:'信赖'}:entry)});
    before=engine.world.snapshot();model=selectLifeHostView(engine.world);
    expect(model.profile?.attributes).toMatchObject([{id:'renown',value:7},{id:'bond',value:55,levelId:'trusted',levelTitle:'信赖'}]);
    const descriptor=seasideMarketHostDescriptorFixture();const panel={enabled:true,titleLabelKey:'profile'} as const;
    const drawer=buildLifeProfilePanel(model,descriptor.hud,panel,(key)=>key==='art:player'?'/player.png':key==='art:renown'?'/renown.png':undefined);
    const tree=buildLifeStandardUi(model,descriptor.hud,null,{}, {},{descriptor:panel,open:true,resolveSkin:(key)=>key==='art:player'?'/player.png':key==='art:renown'?'/renown.png':undefined});
    expect(JSON.stringify(drawer)).toContain('/player.png');expect(JSON.stringify(drawer)).toContain('/renown.png');expect(JSON.stringify(drawer)).toContain('life-host-profile-icon-placeholder-1');
    const hud=buildLifeStandardHud(model,descriptor.hud,undefined,undefined,panel,(key)=>key==='art:renown'?'/renown.png':undefined);
    expect(JSON.stringify(hud)).toContain('life-host-resource-0');expect(JSON.stringify(hud)).toContain('life-host-resource-1');expect(JSON.stringify(hud)).toContain('/renown.png');
    expect(validateLayoutNode(tree)).toEqual([]);expect(engine.world.snapshot()).toEqual(before);
  });

  it('humanizes arbitrary authored ids deterministically', () => {
    expect(humanizeLifeId('npc:deep_space.vendor')).toBe('Deep Space Vendor');
    expect(humanizeLifeId('潮汐-集市')).toBe('潮汐 集市');
  });

  it('supports recursive item choice and identical keyboard/pointer leaf results', () => {
    const model = view({ affordances: [
      { id: 'placement:archive-terminal:gift', action: 'gift', targetKind: 'placement', targetId: 'archive-terminal', available: true, candidateItemIds: ['relic.blue-key', 'relic.red-key'] },
      { id: 'placement:archivist:talk', action: 'talk', targetKind: 'placement', targetId: 'archivist', available: true },
    ] });
    const options = buildLifeInteractionOptions(model);
    const keyboard = new LifeInteractionController(); keyboard.interact(options, model); keyboard.confirm(options); keyboard.cycle(options, 1);
    const expected = keyboard.confirm(options);
    const pointer = new LifeInteractionController(); pointer.interact(options, model); pointer.activate(options, 'gift:archive-terminal');
    expect(pointer.activate(options, 'gift:relic.red-key')).toEqual(expected);
    expect(expected).toEqual([
      { name: 'life.select-target', arg: 'archive-terminal' },
      { name: 'life.select-item', arg: 'relic.red-key' },
      { name: 'life.action', arg: 'gift' },
    ]);
  });

  it('closes an open menu when position or recursive content changes', () => {
    const root: readonly LifeInteractionOption[] = [
      { id: 'a', label: 'A', enabled: true, children: [{ id: 'a.1', label: 'One', enabled: true, actions: [{ name: 'life.action', arg: 'talk' }] }] },
      { id: 'b', label: 'B', enabled: true, actions: [{ name: 'life.action', arg: 'mine' }] },
    ];
    const controller = new LifeInteractionController(); controller.interact(root, view());
    controller.reconcile(view({ x: 4 }), root);
    expect(controller.current.open).toBe(false);
    controller.interact(root, view());
    const changed = [{ ...root[0]!, children: [{ ...root[0]!.children![0]!, label: 'Changed' }] }, root[1]!] as const;
    controller.reconcile(view(), changed);
    expect(controller.current.open).toBe(false);
  });

  it('builds valid prompt and recursive menu nodes without Modal', () => {
    const model = view({ affordances: [{ id: 'tile:x:plant', action: 'plant', targetKind: 'tile', targetId: 'x', available: true, candidateItemIds: ['seed.nebula'] }] });
    const options = buildLifeInteractionOptions(model);
    expect(validateLayoutNode(buildLifeInteractionNode(options, { open: false, path: [], selected: 0, sourceKey: '' })!)).toEqual([]);
    const controller = new LifeInteractionController(); controller.interact(options, model);
    expect(validateLayoutNode(buildLifeInteractionNode(options, controller.current)!)).toEqual([]);
    expect(JSON.stringify(buildLifeInteractionNode(options, controller.current))).not.toContain('Modal');
  });

  it('reduces aliases, repeat, edge controls and release events without DOM state', () => {
    let result = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyW' });
    expect(result).toMatchObject({ preventDefault: true, effects: [{ kind: 'interaction', operation: 'close' }, { kind: 'action', name: 'life.move.state', arg: '1' }] });
    const repeated = reduceLifeInput(result.state, { kind: 'keydown', code: 'KeyW', repeat: true });
    expect(repeated).toMatchObject({ state: result.state, preventDefault: true, effects: [] });
    result = reduceLifeInput(result.state, { kind: 'keydown', code: 'ArrowUp' });
    expect(result.effects).toEqual([{ kind: 'interaction', operation: 'close' }, { kind: 'action', name: 'life.move.state', arg: '1' }]);
    result = reduceLifeInput(result.state, { kind: 'keyup', code: 'KeyW' });
    expect(result.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '1' }]);
    result = reduceLifeInput(result.state, { kind: 'keydown', code: 'Tab', shiftKey: true });
    expect(result.effects).toEqual([{ kind: 'interaction', operation: 'previous' }]);
    expect(result.state.heldCodes).toEqual(['ArrowUp']);
    expect(reduceLifeInput(result.state, { kind: 'keydown', code: 'KeyN', repeat: true })).toMatchObject({ preventDefault: true, effects: [] });
  });

  it.each([
    ['KeyE', { kind: 'interaction', operation: 'request' }],
    ['Tab', { kind: 'interaction', operation: 'next' }],
    ['Enter', { kind: 'interaction', operation: 'confirm' }],
  ] as const)('preserves held movement through %s once and ignores its repeat', (code, effect) => {
    const held = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyD' });
    const first = reduceLifeInput(held.state, { kind: 'keydown', code });
    expect(first).toMatchObject({ state: held.state, effects: [effect] });
    expect(reduceLifeInput(first.state, { kind: 'keydown', code, repeat: true })).toMatchObject({ state: held.state, effects: [] });
  });

  it('toggles and closes inventory, quest and profile chrome without releasing held movement', () => {
    const held = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyD' });
    expect(reduceLifeInput(held.state, { kind: 'keydown', code: 'KeyI' })).toMatchObject({
      state: held.state, effects: [{ kind: 'host', operation: 'inventory-toggle' }], preventDefault: true,
    });
    expect(reduceLifeInput(held.state, { kind: 'keydown', code: 'Escape' })).toMatchObject({
      state: held.state,
      effects: [{ kind: 'host', operation: 'inventory-close' }, { kind: 'host', operation: 'quest-close' }, {kind:'host',operation:'profile-close'}, { kind: 'interaction', operation: 'back' }],
      preventDefault: true,
    });
    expect(reduceLifeInput(held.state, { kind: 'keydown', code: 'KeyJ' })).toMatchObject({
      state: held.state, effects: [{ kind: 'host', operation: 'quest-toggle' }], preventDefault: true,
    });
    expect(reduceLifeInput(held.state,{kind:'keydown',code:'KeyC'})).toMatchObject({state:held.state,effects:[{kind:'host',operation:'profile-toggle'}],preventDefault:true});
    expect(reduceLifeInput(held.state, { kind: 'keydown', code: 'KeyI', repeat: true }).effects).toEqual([]);
    expect(reduceLifeInput(held.state, { kind: 'keydown', code: 'KeyJ', repeat: true }).effects).toEqual([]);
    expect(reduceLifeInput(held.state,{kind:'keydown',code:'KeyC',repeat:true}).effects).toEqual([]);
  });

  it.each([
    ['KeyN', { kind: 'action', name: 'life.advance-day' }],
    ['KeyT', { kind: 'action', name: 'life.advance-time' }],
  ] as const)('retains the existing release-before-time-action behavior for %s', (code, effect) => {
    const held = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyD' });
    expect(reduceLifeInput(held.state, { kind: 'keydown', code })).toMatchObject({ state: EMPTY_LIFE_INPUT_STATE, effects: [{ kind: 'action', name: 'life.move.state', arg: '0' }, effect] });
  });

  it('keeps the physical direction active across interaction repeat and stops only on keyup', () => {
    const held = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyD' });
    const interaction = reduceLifeInput(held.state, { kind: 'keydown', code: 'KeyE' });
    const staleRepeat = reduceLifeInput(interaction.state, { kind: 'keydown', code: 'KeyD', repeat: true });
    expect(staleRepeat).toMatchObject({ state: held.state, effects: [] });
    expect(reduceLifeInput(staleRepeat.state, { kind: 'keyup', code: 'KeyD' })).toMatchObject({ state: EMPTY_LIFE_INPUT_STATE, effects: [{ kind: 'action', name: 'life.move.state', arg: '0' }] });
  });

  it('does not let stale alias releases stop a fresh same-direction key', () => {
    const first = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyW' });
    const alias = reduceLifeInput(first.state, { kind: 'keydown', code: 'ArrowUp' });
    const afterBlur = reduceLifeInput(alias.state, { kind: 'blur' });
    const fresh = reduceLifeInput(afterBlur.state, { kind: 'keydown', code: 'ArrowUp' });
    expect(reduceLifeInput(fresh.state, { kind: 'keyup', code: 'KeyW' })).toMatchObject({ state: fresh.state, effects: [] });
    expect(reduceLifeInput(fresh.state, { kind: 'keyup', code: 'ArrowUp' }).effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '0' }]);
  });

  it('preserves Up+Left through E and its repeat, then emits complete states in physical keyup order', () => {
    const up = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyW' });
    const diagonal = reduceLifeInput(up.state, { kind: 'keydown', code: 'KeyA' });
    const interact = reduceLifeInput(diagonal.state, { kind: 'keydown', code: 'KeyE' });
    expect(interact).toMatchObject({ state: diagonal.state, effects: [{ kind: 'interaction', operation: 'request' }] });
    expect(reduceLifeInput(interact.state, { kind: 'keydown', code: 'KeyE', repeat: true })).toMatchObject({ state: diagonal.state, effects: [] });
    const leftReleased = reduceLifeInput(interact.state, { kind: 'keyup', code: 'KeyA' });
    expect(leftReleased.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '1' }]);
    expect(reduceLifeInput(leftReleased.state, { kind: 'keyup', code: 'KeyW' }).effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '0' }]);
  });

  it('projects each direction transition as one complete physical held-state snapshot', () => {
    const left = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyA' });
    expect(left.effects).toEqual([
      { kind: 'interaction', operation: 'close' },
      { kind: 'action', name: 'life.move.state', arg: '4' },
    ]);
    const diagonal = reduceLifeInput(left.state, { kind: 'keydown', code: 'KeyW' });
    expect(diagonal.effects.at(-1)).toEqual({ kind: 'action', name: 'life.move.state', arg: '5' });
    const opposed = reduceLifeInput(diagonal.state, { kind: 'keydown', code: 'KeyD' });
    expect(opposed.effects.at(-1)).toEqual({ kind: 'action', name: 'life.move.state', arg: '13' });
    const rightReleased = reduceLifeInput(opposed.state, { kind: 'keyup', code: 'KeyD' });
    expect(rightReleased.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '5' }]);
    const upReleased = reduceLifeInput(rightReleased.state, { kind: 'keyup', code: 'KeyW' });
    expect(upReleased.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '4' }]);
    expect(reduceLifeInput(upReleased.state, { kind: 'keyup', code: 'KeyA' })).toMatchObject({
      state: EMPTY_LIFE_INPUT_STATE,
      effects: [{ kind: 'action', name: 'life.move.state', arg: '0' }],
    });
  });

  it('auto-opens an authoritative dialogue panel and closes it when the session projection disappears', () => {
    const events: string[] = [];
    const controller = new LifeInteractionController({ record: (kind, what) => events.push(`${kind}:${what}`) });
    const active = view({ dialogueActive: true, dialogueTarget: 'archivist', dialogue: '档案员：请继续。', dialogueKind: 'line', nearby: ['archivist'] });
    const options = buildLifeInteractionOptions(active);
    controller.reconcile(active, options);
    expect(controller.current).toMatchObject({ open: true, selected: 0 });
    const closed = view({ x: 9, nearby: [] });
    controller.reconcile(closed, buildLifeInteractionOptions(closed));
    expect(controller.current.open).toBe(false);
    expect(events).toContain('transition:dialogue:active→closed');
  });

  it.each(['blur', 'visibility'] as const)('releases every active direction on %s', (kind) => {
    const state = { heldCodes: ['KeyW', 'ArrowUp', 'KeyD'] };
    expect(reduceLifeInput(state, { kind }).effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '0' }]);
  });

  it('keeps DOM installation a thin adapter and prevents handled page keys', () => {
    const target = new EventTarget(); const calls: string[] = [];
    const dispose = installLifeKeyboard(target, {
      enqueueAction: (name, arg) => calls.push(`${name}:${arg?.arg ?? ''}`), requestInteraction: () => calls.push('request'), cycleInteraction: (delta) => calls.push(`cycle:${delta}`), confirmInteraction: () => calls.push('confirm'), backInteraction: () => calls.push('back'), closeInteraction: () => calls.push('close'), toggleInventory: () => calls.push('inventory-toggle'), closeInventory: () => calls.push('inventory-close'), toggleQuests: () => calls.push('quest-toggle'), closeQuests: () => calls.push('quest-close'),
    });
    const event = new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true }); target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', cancelable: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', cancelable: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', cancelable: true }));
    expect(calls).toEqual(['close', 'life.move.state:2', 'request', 'inventory-toggle', 'quest-toggle', 'inventory-close', 'quest-close', 'back']);
    dispose();
  });

  it('records optional bounded host trace while leaving deterministic hash unchanged', () => {
    const world = new World(); world.createEntity('trace');
    world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 9, max: 8 } satisfies DebugTrace);
    const before = hashSnapshot(world.snapshot());
    const controller = new LifeInteractionController(createLifeInteractionTraceSink(world));
    controller.interact([]);
    const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    expect(trace.events).toEqual([expect.objectContaining({ tick: 9, system: 'life-host-interaction', kind: 'reject', what: 'interaction:none' })]);
    expect(hashSnapshot(world.snapshot())).toBe(before);
    expect(new LifeInteractionController().interact([])).toEqual([]);
  });

  it('records dialogue panel lifecycle with opt-in trace, but is a true no-op when trace is absent', () => {
    const active = view({ dialogueActive: true, dialogueTarget: 'archivist', dialogue: '档案员：请继续。', dialogueKind: 'line', nearby: ['archivist'] });
    const options = buildLifeInteractionOptions(active);
    const traced = new World(); traced.createEntity('trace'); traced.addComponent('trace', { type: 'DebugTrace', events: [], tick: 12, max: 8 } satisfies DebugTrace);
    const beforeHash = hashSnapshot(traced.snapshot()); const controller = new LifeInteractionController(createLifeInteractionTraceSink(traced));
    controller.reconcile(active, options); controller.reconcile(view(), []);
    const events = traced.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events).toContainEqual(expect.objectContaining({ kind: 'transition', what: 'dialogue:panel-open' }));
    expect(events).toContainEqual(expect.objectContaining({ kind: 'transition', what: 'dialogue:active→closed' }));
    expect(events.filter((event) => event.tick === 12 && event.system === 'life-host-interaction')).toHaveLength(3);
    expect(hashSnapshot(traced.snapshot())).toBe(beforeHash);

    const silent = new World(); const silentBefore = silent.snapshot(); const silentController = new LifeInteractionController(createLifeInteractionTraceSink(silent));
    silentController.reconcile(active, options); silentController.reconcile(view(), []); expect(silent.snapshot()).toEqual(silentBefore);
  });
});
