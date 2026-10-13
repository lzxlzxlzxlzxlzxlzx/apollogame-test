import { describe, expect, it } from 'vitest';
import { parseLifeGamePackage, validateLifeGamePackage } from './life-package.js';

const run = (tileId: string, count = 16) => [{ tileId, count }];
const layers = (ground: string) => [
  { name: 'ground', tiles: run(ground) },
  { name: 'collision', tiles: run('clear') },
  { name: 'interaction', tiles: run('clear') },
];

/** A complete v1 authoring fixture: town -> farm and river, with return doors. */
function threeScenePackage(): Record<string, unknown> {
  return {
    meta: { schema: 1, id: 'three-scene-life', title: 'Three Scene Life', tickRate: 20 },
    world: { startSceneId: 'town' },
    dialogueCatalog: [{ id: 'mayor.greeting', graph: { start: { kind: 'line', speaker: 'Mayor', text: 'Welcome.', next: null } } }],
    itemCatalog: [{ id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }],
    playerInventory: { slots: 10, maxStack: 99, items: [] },
    tileCatalog: {
      grass: { tags: ['walkable', 'forage'] },
      soil: { tags: ['walkable', 'plantable'] },
      water: { tags: ['walkable', 'water'] },
      clear: { tags: ['walkable'] },
      wall: { tags: ['blocked'] },
    },
    scenes: [
      {
        id: 'town', title: 'Harbor Town', width: 4, height: 4, layers: layers('grass'),
        spawnPoints: [{ id: 'town-player', x: 0, y: 0, kind: 'player' }, { id: 'town-npc', x: 1, y: 1, kind: 'npc' }],
        zones: [{ id: 'town-forage', kind: 'forage', rect: { x: 0, y: 0, width: 4, height: 4 }, allowedActions: ['forage', 'talk'] }],
        warps: [{ id: 'town-farm-door', label: '前往农场', at: { x: 3, y: 0 }, toSceneId: 'farm', toSpawnId: 'farm-door' }, { id: 'town-river-door', label: '前往河岸', at: { x: 3, y: 3 }, toSceneId: 'river', toSpawnId: 'river-door' }],
        placements: [{ id: 'mayor', kind: 'npc', x: 1, y: 1, width: 1, height: 1, prefabRef: 'npc.mayor', skinKey: 'npc:mayor', npcDialogue: { dialogueId: 'mayor.greeting' } }],
      },
      {
        id: 'farm', width: 4, height: 4, layers: layers('soil'),
        spawnPoints: [{ id: 'farm-door', x: 0, y: 0, kind: 'warp' }],
        zones: [{ id: 'farm-field', kind: 'farm', rect: { x: 0, y: 0, width: 4, height: 4 }, allowedActions: ['till', 'water', 'plant', 'harvest', 'forage'] }],
        warps: [{ id: 'farm-town-door', at: { x: 0, y: 0 }, toSceneId: 'town', toSpawnId: 'town-player' }],
        placements: [{ id: 'berry-bush', kind: 'resource', x: 2, y: 2, width: 1, height: 1, prefabRef: 'resource.berry', skinKey: 'resource:berry', resourceNode: { action: 'forage', itemId: 'resource.berry', quantity: 3 } }],
      },
      {
        id: 'river', width: 4, height: 4, layers: layers('water'),
        spawnPoints: [{ id: 'river-door', x: 0, y: 0, kind: 'warp' }],
        zones: [{ id: 'river-fishing', kind: 'fishing', rect: { x: 0, y: 0, width: 4, height: 4 }, allowedActions: ['fish'] }],
        warps: [{ id: 'river-town-door', at: { x: 0, y: 0 }, toSceneId: 'town', toSpawnId: 'town-player' }],
        placements: [],
      },
    ],
  };
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const paths = (value: unknown): string[] => validateLifeGamePackage(value).issues.map((x) => x.path);

describe('LifeGamePackage v1', () => {
  it('parses the farm/town/river fixture and returns isolated POD data', () => {
    const raw = threeScenePackage();
    const parsed = parseLifeGamePackage(raw);
    expect(validateLifeGamePackage(raw)).toEqual({ ok: true, issues: [] });
    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
  });

  it('reports every required fail-closed spatial and graph violation with a JSON path', () => {
    const cases: Array<[string, (p: any) => void, string]> = [
      ['unknown tile', (p) => { p.scenes[0].layers[0].tiles[0].tileId = 'invented'; }, '$.scenes[0].layers[0].tiles[0].tileId'],
      ['bad RLE length', (p) => { p.scenes[0].layers[0].tiles[0].count = 15; }, '$.scenes[0].layers[0].tiles'],
      ['out of bounds door', (p) => { p.scenes[0].warps[0].at.x = 4; }, '$.scenes[0].warps[0].at'],
      ['player on blocked ground', (p) => { p.scenes[0].layers[0].tiles[0].tileId = 'wall'; }, '$.scenes[0].spawnPoints[0]'],
      ['farm without plantable terrain', (p) => { p.scenes[1].layers[0].tiles[0].tileId = 'grass'; }, '$.scenes[1].zones[0].rect'],
      ['fishing without water', (p) => { p.scenes[2].layers[0].tiles[0].tileId = 'grass'; }, '$.scenes[2].zones[0].rect'],
      ['NPC on blocked terrain', (p) => { p.scenes[0].layers[0].tiles[0].tileId = 'wall'; p.scenes[0].placements[0].x = 0; p.scenes[0].placements[0].y = 0; }, '$.scenes[0].placements[0]'],
      ['duplicate id', (p) => { p.scenes[1].spawnPoints.push({ ...p.scenes[1].spawnPoints[0] }); }, '$.scenes[1].spawnPoints[1].id'],
      ['no player spawn', (p) => { p.scenes[0].spawnPoints[0].kind = 'npc'; }, '$.scenes'],
      ['multiple player spawns', (p) => { p.scenes[1].spawnPoints.push({ id: 'farm-player', x: 1, y: 1, kind: 'player' }); }, '$.scenes[1].spawnPoints[1].kind'],
      ['unreachable scene', (p) => { p.scenes[0].warps = p.scenes[0].warps.filter((x: any) => x.toSceneId !== 'river'); }, '$.scenes[2].id'],
    ];
    for (const [name, mutate, path] of cases) {
      const raw = copy(threeScenePackage()); mutate(raw);
      expect(paths(raw), name).toContain(path);
    }
  });

  it('has a deterministic, side-effect-free report', () => {
    const raw = threeScenePackage();
    (raw.scenes as any[])[0].layers[0].tiles[0].tileId = 'invented';
    const before = JSON.stringify(raw);
    const first = JSON.stringify(validateLifeGamePackage(raw));
    const second = JSON.stringify(validateLifeGamePackage(raw));
    expect(second).toBe(first);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('validates optional continuous movement speed as bounded package data', () => {
    const valid = threeScenePackage() as any; valid.movement = { speed: 0.25 };
    expect(validateLifeGamePackage(valid).ok).toBe(true);
    const invalid = copy(valid); invalid.movement.speed = 1.1;
    expect(paths(invalid)).toContain('$.movement.speed');
  });

  it('accepts only the engine-owned Life viewport profile and keeps omission compatible for legacy packages', () => {
    expect(validateLifeGamePackage(threeScenePackage()).ok).toBe(true);
    const valid = threeScenePackage() as any;
    valid.camera = { profile: 'life-standard-v1' };
    expect(validateLifeGamePackage(valid).ok).toBe(true);
    const invalid = copy(valid); invalid.camera = { profile: 'free-v9', viewportWidthCells: 16, viewportHeightCells: 10, cellSize: 48 };
    expect(paths(invalid)).toEqual(expect.arrayContaining([
      '$.camera.profile', '$.camera.viewportWidthCells', '$.camera.viewportHeightCells', '$.camera.cellSize',
    ]));
  });

  it('validates fail-closed data-authored harvest milestones and their logical targets', () => {
    const valid = threeScenePackage() as any;
    valid.itemCatalog.push({ id: 'seed.turnip', kind: 'seed', skinKey: 'item:seed' }, { id: 'crop.turnip', kind: 'crop', skinKey: 'item:crop' });
    valid.cropCatalog = [{ id: 'turnip', seedItemId: 'seed.turnip', harvestItemId: 'crop.turnip', growthDays: 1 }];
    valid.logic = { flags: [{ id: 'flag.first-harvest', initial: false }], resources: [{ id: 'resource.renown', initial: 0, min: 0, max: 10 }] };
    valid.milestones = [{ id: 'first-turnip', trigger: 'harvest.applied', cropId: 'turnip', itemId: 'crop.turnip', repeat: 'once', effects: { flags: [{ id: 'flag.first-harvest', value: true }], resources: [{ id: 'resource.renown', amount: 1 }] } }];
    expect(validateLifeGamePackage(valid).ok).toBe(true);
    const invalid = copy(valid); invalid.milestones[0].trigger = 'harvest.any'; invalid.milestones[0].repeat = 'sometimes'; invalid.milestones[0].effects.flags[0].id = 'flag.missing'; invalid.logic.resources[0].max = -1;
    expect(paths(invalid)).toEqual(expect.arrayContaining(['$.milestones[0].trigger', '$.milestones[0].repeat', '$.milestones[0].effects.flags[0].id', '$.logic.resources[0]']));
  });

  it('validates closed flag/resource access requirements on warps, zones, and placements', () => {
    const valid = threeScenePackage() as any;
    valid.logic = { flags: [{ id: 'story.open', initial: false }], resources: [{ id: 'renown', initial: 0, min: 0, max: 9 }] };
    valid.scenes[0].warps[0].requires = { kind: 'flag', id: 'story.open', equals: true };
    valid.scenes[0].zones[0].requires = { kind: 'resource', id: 'renown', op: '>=', value: 2 };
    valid.scenes[0].placements[0].requires = { kind: 'flag', id: 'story.open', equals: false };
    expect(validateLifeGamePackage(valid).ok).toBe(true);
    const invalid = copy(valid); invalid.scenes[0].warps[0].requires = { kind: 'resource', id: 'missing', op: '>', value: '2', callback: 'free-code' };
    expect(paths(invalid)).toEqual(expect.arrayContaining(['$.scenes[0].warps[0].requires.id', '$.scenes[0].warps[0].requires.op', '$.scenes[0].warps[0].requires.value', '$.scenes[0].warps[0].requires.callback']));
  });

  it('accepts optional scene titles and warp labels but rejects empty presentation copy', () => {
    expect(validateLifeGamePackage(threeScenePackage()).ok).toBe(true);
    const invalid = threeScenePackage() as any;
    invalid.scenes[0].title = '';
    invalid.scenes[0].warps[0].label = '';
    expect(paths(invalid)).toEqual(expect.arrayContaining(['$.scenes[0].title', '$.scenes[0].warps[0].label']));
  });

  it('validates complete, closed, walkable NPC schedules against authored calendar slots', () => {
    const valid=threeScenePackage() as any;
    valid.calendar={seasons:[{id:'spring',lengthDays:28}],initialSeasonId:'spring',initialDayOfSeason:1,slots:['morning','afternoon'],initialSlot:'morning'};
    valid.scenes[0].placements[0].schedule=[
      {slot:'morning',sceneId:'town',x:1,y:1,visible:true,interactive:true},
      {slot:'afternoon',sceneId:'farm',x:2,y:1,visible:false,interactive:false},
    ];
    expect(validateLifeGamePackage(valid).ok).toBe(true);
    const incomplete=copy(valid);incomplete.scenes[0].placements[0].schedule.pop();
    expect(paths(incomplete)).toContain('$.scenes[0].placements[0].schedule');
    const duplicate=copy(valid);duplicate.scenes[0].placements[0].schedule[1].slot='morning';
    expect(paths(duplicate)).toEqual(expect.arrayContaining(['$.scenes[0].placements[0].schedule[1].slot','$.scenes[0].placements[0].schedule']));
    const unknown=copy(valid);unknown.scenes[0].placements[0].schedule[1].sceneId='missing';
    expect(paths(unknown)).toContain('$.scenes[0].placements[0].schedule[1].sceneId');
    const malformed=copy(valid);malformed.scenes[0].placements[0].schedule[0].visible='yes';malformed.scenes[0].placements[0].schedule[0].callback='free-code';
    expect(paths(malformed)).toEqual(expect.arrayContaining(['$.scenes[0].placements[0].schedule[0].visible','$.scenes[0].placements[0].schedule[0].callback']));
    const withoutSlots=copy(valid);delete withoutSlots.calendar.slots;delete withoutSlots.calendar.initialSlot;
    expect(paths(withoutSlots)).toContain('$.scenes[0].placements[0].schedule');
  });

  it('rejects unknown fields throughout the closed Life package schema', () => {
    const invalid = copy(threeScenePackage()) as any;
    invalid.callback = 'root';
    invalid.meta.callback = 'meta';
    invalid.tileCatalog.grass.visual = { skinKey: 'tile:grass', callback: 'visual' };
    invalid.itemCatalog[0].callback = 'item';
    invalid.scenes[0].callback = 'scene';
    invalid.scenes[0].layers[0].tiles[0].callback = 'run';
    invalid.scenes[0].zones[0].rect.callback = 'rect';
    invalid.scenes[0].placements[0].npcDialogue.callback = 'dialogue';
    expect(paths(invalid)).toEqual(expect.arrayContaining([
      '$.callback', '$.meta.callback', '$.tileCatalog.grass.visual.callback', '$.itemCatalog[0].callback',
      '$.scenes[0].callback', '$.scenes[0].layers[0].tiles[0].callback',
      '$.scenes[0].zones[0].rect.callback', '$.scenes[0].placements[0].npcDialogue.callback',
    ]));
  });

  it('validates package interaction range, dialogue session policy, and placement override', () => {
    const valid = threeScenePackage() as any; valid.interaction = { nearbyRange: 2, dialogueSessionPolicy: 'proximity' }; valid.scenes[0].placements[0].interactionRange = 0;
    expect(validateLifeGamePackage(valid).ok).toBe(true);
    const badDefault = copy(valid); badDefault.interaction.nearbyRange = 9;
    expect(paths(badDefault)).toContain('$.interaction.nearbyRange');
    const badPolicy = copy(valid); badPolicy.interaction.dialogueSessionPolicy = 'host-hides-panel';
    expect(paths(badPolicy)).toContain('$.interaction.dialogueSessionPolicy');
    const unknownPolicyField = copy(valid); unknownPolicyField.interaction.dialogueSessionCallback = 'free-code';
    expect(paths(unknownPolicyField)).toContain('$.interaction.dialogueSessionCallback');
    const badOverride = copy(valid); badOverride.scenes[0].placements[0].interactionRange = -1;
    expect(paths(badOverride)).toContain('$.scenes[0].placements[0].interactionRange');
  });

  it('accepts opaque visual keys and rejects paths, URLs, and incomplete crop stages', () => {
    const valid = threeScenePackage() as any;
    valid.tileCatalog.grass.visual = { skinKey: 'tile:grass' }; valid.playerVisual = { skinKey: 'actor:farmer', anchor: 'bottom-center' };
    valid.cropCatalog = [{ id: 'turnip', seedItemId: 'seed.turnip', harvestItemId: 'crop.turnip', growthDays: 1, visual: { seededSkinKey: 'crop:seed', growingSkinKey: 'crop:growing', matureSkinKey: 'crop:mature' } }];
    valid.itemCatalog = [{ id: 'seed.turnip', kind: 'seed', skinKey: 'item:seed' }, { id: 'crop.turnip', kind: 'crop', skinKey: 'item:crop' }, { id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }]; valid.playerInventory = { slots: 1, maxStack: 1, items: [] };
    expect(validateLifeGamePackage(valid).ok).toBe(true);
    const invalid = copy(valid); invalid.tileCatalog.grass.visual.skinKey = '../grass.png'; invalid.playerVisual.anchor = 'center'; delete invalid.cropCatalog[0].visual.matureSkinKey;
    expect(paths(invalid)).toEqual(expect.arrayContaining(['$.tileCatalog.grass.visual.skinKey', '$.playerVisual.anchor', '$.cropCatalog[0].visual.matureSkinKey']));
  });
});
