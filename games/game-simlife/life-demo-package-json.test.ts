import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from '@zerocraft/engine/assembly/life-package-compile.js';
import { validateLifeGamePackage } from '@zerocraft/engine/assembly/life-package-validate.js';
import rawPackage from './little-valley.life.json';
import { LITTLE_VALLEY_PACKAGE } from './life-demo-package.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const paths = (value: unknown): string[] => validateLifeGamePackage(value).issues.map((issue) => issue.path);
const runTotal = (sceneIndex: number, layerName: string): number => rawPackage.scenes[sceneIndex]!.layers
  .find((layer) => layer.name === layerName)!.tiles.reduce((sum, run) => sum + run.count, 0);
const expandedLayer = (sceneIndex: number, layerName: string): string[] => rawPackage.scenes[sceneIndex]!.layers
  .find((layer) => layer.name === layerName)!.tiles.flatMap((run) => Array.from({ length: run.count }, () => run.tileId));
const allStrings = (value: unknown): string[] => typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(allStrings)
    : value !== null && typeof value === 'object' ? Object.values(value).flatMap(allStrings) : [];
const skinKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(skinKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => key.toLowerCase().endsWith('skinkey') && typeof child === 'string' ? [child] : skinKeys(child));
};

describe('Little Valley raw JSON cartridge', () => {
  it('is the runtime package source and compiles through the existing strict Life pipeline', () => {
    expect(LITTLE_VALLEY_PACKAGE).toBe(rawPackage);
    expect(validateLifeGamePackage(rawPackage)).toEqual({ ok: true, issues: [] });
    const compiled = compileAndParseLifeGamePackage(rawPackage);
    expect(compiled.blueprint.meta).toMatchObject({ tickRate: 12 });
    expect(compiled.blueprint.capabilities.map((capability) => capability.id)).toContain('t3-life-world');
  });

  it('preserves the authored world, catalogs, visuals, story gate, and exact RLE dimensions', () => {
    expect(rawPackage).toMatchObject({
      meta: { schema: 1, id: 'little-valley', title: '小山谷', tickRate: 12 },
      world: { startSceneId: 'little-valley' },
      movement: { speed: 0.3 }, interaction: { nearbyRange: 1, dialogueSessionPolicy: 'proximity' },
      camera: { profile: 'life-standard-v1' },
      playerVisual: { skinKey: 'art:little-valley:player:farmer', anchor: 'bottom-center' },
    });
    expect(rawPackage.scenes.map((scene) => [scene.id, scene.width, scene.height])).toEqual([
      ['little-valley', 36, 26], ['mine-interior', 36, 26],
    ]);
    for (let scene = 0; scene < 2; scene++) for (const layer of ['ground', 'collision', 'interaction']) expect(runTotal(scene, layer)).toBe(36 * 26);
    expect(rawPackage.scenes[0]!.spawnPoints).toContainEqual({ id: 'player', kind: 'player', x: 7, y: 13 });
    expect(rawPackage.scenes[0]!.zones.map((zone) => zone.id)).toEqual(['farm-field', 'town-plaza', 'forest-grove', 'mine-mouth']);
    expect(rawPackage.scenes[0]!.placements.find((value) => value.id === 'mayor')).toMatchObject({ npcDialogue: { dialogueId: 'mayor.welcome' }, skinKey: 'art:little-valley:placement:mayor' });
    expect(rawPackage.scenes[0]!.placements.find((value) => value.id === 'berry-bush')).toMatchObject({ resourceNode: { action: 'forage', itemId: 'resource.berry', quantity: 3 } });
    expect(rawPackage.scenes[0]!.placements.some((value) => value.id === 'ore-vein')).toBe(false);
    expect(rawPackage.scenes[0]!.warps[0]).toMatchObject({ id: 'mine-gate', label: '进入矿洞', landmarkPlacementId: 'mine-entrance', toSceneId: 'mine-interior', toSpawnId: 'mine-entrance', requires: { kind: 'flag', id: 'flag.story.first_harvest_reported', equals: true } });
    expect(rawPackage.scenes[1]).toMatchObject({
      spawnPoints: [{ id: 'mine-entrance', kind: 'warp', x: 1, y: 1 }],
      zones: [{ id: 'deep-mine-vein', kind: 'mining', rect: { x: 23, y: 1, width: 5, height: 2 }, allowedActions: ['mine'] }],
      warps: [{ id: 'mine-exit', label: '返回小山谷', landmarkPlacementId: 'mine-exit-stairs', at: { x: 1, y: 1 }, toSceneId: 'little-valley', toSpawnId: 'player' }],
      placements: [
        expect.objectContaining({ id: 'mine-exit-stairs', kind: 'decoration', x: 0, y: 0, skinKey: 'art:little-valley:placement:mine-entrance' }),
        expect.objectContaining({ id: 'ore-vein', kind: 'resource', x: 25, y: 1, skinKey: 'art:little-valley:placement:ore-vein', resourceNode: { action: 'mine', itemId: 'resource.ore', quantity: 2 } }),
      ],
    });
    expect(expandedLayer(1, 'ground')).not.toEqual(expandedLayer(0, 'ground'));
    expect(expandedLayer(1, 'collision')).not.toEqual(expandedLayer(0, 'collision'));
    expect(expandedLayer(1, 'ground').slice(37, 71)).toEqual(Array(34).fill('mine-ground'));
    expect(expandedLayer(1, 'collision').slice(37, 71)).toEqual(Array(34).fill('clear'));
    expect(rawPackage.milestones[0]).toMatchObject({ id: 'story.first-turnip-harvest', trigger: 'harvest.applied', effects: { flags: [{ id: 'flag.story.first_harvest', value: true }] } });
    expect(rawPackage.dialogueCatalog[0]!.graph.start.options![1]).toMatchObject({ id:'report-first-harvest', requires: { kind: 'flag', id: 'flag.story.first_harvest', equals: true }, setFlag: 'flag.story.first_harvest_reported', next: 'harvested' });
    expect(rawPackage.quests[0]).toMatchObject({id:'chapter.first-season',quests:[{id:'quest.first-season',priority:100,initialNodeId:'harvest-turnip',terminalNodeIds:['mine-ore']}]});
    expect(rawPackage.quests[0]!.quests[0]!.nodes.map((node)=>node.id)).toEqual(['harvest-turnip','report-to-mayor','mine-ore']);
    expect(allStrings(rawPackage).filter((value) => /^(?:https?|data|file):|^(?:[A-Za-z]:)?[\\/]|^\.{1,2}[\\/]|\.(?:png|jpe?g|gif|webp|svg|mp3|wav|ogg)$/i.test(value))).toEqual([]);
    expect(skinKeys(rawPackage).length).toBeGreaterThan(0);
    expect(skinKeys(rawPackage).every((key) => key.startsWith('art:'))).toBe(true);
  });

  it('fails closed for unknown fields throughout the package and for an illegal action', () => {
    for (const [mutate, path] of [
      [(value: any) => { value.callback = 'free-code'; }, '$.callback'],
      [(value: any) => { value.scenes[0].callback = 'free-code'; }, '$.scenes[0].callback'],
      [(value: any) => { value.scenes[0].warps[0].requires.callback = 'free-code'; }, '$.scenes[0].warps[0].requires.callback'],
    ] as const) {
      const unknown = copy(rawPackage) as any; mutate(unknown);
      expect(paths(unknown)).toContain(path);
      expect(() => compileAndParseLifeGamePackage(unknown)).toThrow(path);
    }

    const illegal = copy(rawPackage) as any; illegal.scenes[0].zones[0].allowedActions[0] = 'teleport';
    expect(paths(illegal)).toContain('$.scenes[0].zones[0].allowedActions[0]');
    expect(() => compileAndParseLifeGamePackage(illegal)).toThrow('$.scenes[0].zones[0].allowedActions[0]');
  });
});
