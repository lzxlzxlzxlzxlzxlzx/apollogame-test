import { World } from '@engine/core/world.js';
import type { Flag, RandomSeed, Resource } from '@engine/protocol/components.js';
import type { ConditionExpr } from '@engine/protocol/components.js';
import type { GalPackage, StoryEffect } from '@engine/protocol/galgame.js';
import { createStoryRuntime, narrativeDirectorCapability } from '@skills/tier3/narrative-director.js';
import { parseGalPackage, type GalPackageValidationOptions } from './gal-package.js';
import { parseManifest } from './manifest.js';

/** GAL's companion data is a restricted Manifest, not a second story schema. */
export interface GalInitialManifest {
  readonly schema?: 1;
  readonly templates?: Record<string, Record<string, unknown>>;
  readonly entities: Record<string, Record<string, unknown>>;
}

export interface GalWorldSession {
  readonly pkg: GalPackage;
  readonly world: World;
  readonly storyEntity: 'story';
}

const INITIAL_CAPABILITIES = ['f1-resource', 'f2-flag', 'w1-random'];
const INITIAL_COMPONENTS = new Set(['Resource', 'Flag', 'RandomSeed']);
const RESERVED_ENTITIES = new Set(['story', 'input']);

function fail(message: string): never { throw new Error(`GAL initial manifest: ${message}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function pureJson(value: unknown, seen = new WeakSet<object>(), depth = 0): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 64 || seen.has(value) || Object.getOwnPropertySymbols(value).length) return false;
  if (!Array.isArray(value) && !object(value)) return false;
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (value.length > 100_000 || Object.keys(descriptors).length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(descriptors, String(index))) return false;
  }
  return Object.values(descriptors).every(descriptor => 'value' in descriptor &&
    pureJson(descriptor.value, seen, depth + 1));
}
function checkStoryValues(pkg: GalPackage, resources: ReadonlySet<string>, flags: ReadonlySet<string>): void {
  const resource = (id: string, path: string) => { if (!resources.has(id)) fail(`${path} refers to missing Resource ${id}`); };
  const flag = (id: string, path: string) => { if (!flags.has(id)) fail(`${path} refers to missing Flag ${id}`); };
  const effects = (items: readonly StoryEffect[] | undefined, path: string) => {
    items?.forEach((effect, index) => {
      if (effect.kind === 'resource') resource(effect.id, `${path}[${index}]`);
      else if (effect.kind === 'flag') flag(effect.id, `${path}[${index}]`);
    });
  };
  const condition = (expr: ConditionExpr | undefined, path: string): void => {
    if (!expr) return;
    if (expr.kind === 'always') return;
    if (expr.kind === 'resource') {
      resource(expr.id, path);
      if (expr.vsResource) resource(expr.vsResource, `${path}.vsResource`);
    } else if (expr.kind === 'flag') flag(expr.id, path);
    else if (expr.kind === 'not') condition(expr.of, `${path}.of`);
    else if (expr.kind === 'and' || expr.kind === 'or') expr.of.forEach((part, index) => condition(part, `${path}.of[${index}]`));
    else fail(`${path} uses unsupported condition kind ${expr.kind}`);
  };
  for (const [chapterId, chapter] of Object.entries(pkg.chapters))
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      const path = `chapters.${chapterId}.nodes.${nodeId}`;
      effects(node.enter, `${path}.enter`);
      if (node.kind === 'choice') node.options.forEach((option, index) => {
        condition(option.when, `${path}.options[${index}].when`);
        effects(option.effects, `${path}.options[${index}].effects`);
      });
      else if (node.kind === 'check') {
        resource(node.check.attribute, `${path}.check.attribute`);
        if (node.check.bonusFrom) resource(node.check.bonusFrom, `${path}.check.bonusFrom`);
        effects(node.pass.effects, `${path}.pass.effects`);
        effects(node.fail.effects, `${path}.fail.effects`);
      } else if (node.kind === 'jump') condition(node.when, `${path}.when`);
    }
}

/** Validate first, then assemble a fresh deterministic World without executing unrelated Manifest systems. */
export function createGalWorld(rawPackage: unknown, rawInitial: unknown,
  options?: GalPackageValidationOptions): GalWorldSession {
  if (!pureJson(rawPackage)) fail('package must contain only finite JSON values');
  const pkg = parseGalPackage(rawPackage, options);
  if (!object(rawInitial)) fail('root must be a plain object');
  if (!pureJson(rawInitial)) fail('companion must contain only finite JSON values');
  for (const key of Object.keys(rawInitial))
    if (!['schema', 'templates', 'entities'].includes(key)) fail(`unsupported root field ${key}`);
  if (rawInitial.schema !== undefined && rawInitial.schema !== 1) fail('schema must be 1');
  if (object(rawInitial.entities)) {
    if (Object.keys(rawInitial.entities).length > 1000) fail('at most 1000 initial entities are allowed');
    for (const [entity, entry] of Object.entries(rawInitial.entities))
      if (object(entry) && Object.hasOwn(entry, '$repeat')) fail(`entity ${entity} cannot use $repeat`);
  }
  if (object(rawInitial.templates))
    for (const [name, template] of Object.entries(rawInitial.templates)) {
      if (!object(template) || Object.keys(template).length !== 1 ||
          !INITIAL_COMPONENTS.has(Object.keys(template)[0]!)) fail(`template ${name} must define one initial component`);
    }
  const blueprint = parseManifest({ ...rawInitial, capabilities: INITIAL_CAPABILITIES });
  const resourceIds = new Set<string>(), flagIds = new Set<string>();
  let seedCount = 0;
  for (const [entity, components] of Object.entries(blueprint.entities)) {
    if (RESERVED_ENTITIES.has(entity)) fail(`entity ${entity} is reserved`);
    const names = Object.keys(components);
    if (names.length !== 1 || !INITIAL_COMPONENTS.has(names[0]!))
      fail(`entity ${entity} must contain exactly one Resource, Flag, or RandomSeed`);
    if (components.Resource) {
      const r = components.Resource as unknown as Resource;
      if (Object.keys(r).sort().join(',') !== 'current,id,max,min' ||
          typeof r.id !== 'string' || !r.id ||
          ![r.current, r.min, r.max].every(v => typeof v === 'number' && Number.isFinite(v)) ||
          r.min > r.current || r.current > r.max || resourceIds.has(r.id)) fail(`invalid or duplicate Resource at ${entity}`);
      resourceIds.add(r.id);
    } else if (components.Flag) {
      const f = components.Flag as unknown as Flag;
      if (Object.keys(f).sort().join(',') !== 'active,id' ||
          typeof f.id !== 'string' || !f.id || typeof f.active !== 'boolean' || flagIds.has(f.id))
        fail(`invalid or duplicate Flag at ${entity}`);
      flagIds.add(f.id);
    } else {
      const s = components.RandomSeed as unknown as RandomSeed;
      if (Object.keys(s).sort().join(',') !== 'seed,sequence' ||
          !Number.isInteger(s.seed) || !Number.isInteger(s.sequence) || s.sequence !== 0) fail(`invalid RandomSeed at ${entity}`);
      seedCount++;
    }
  }
  if (seedCount !== 1) fail(`expected exactly one RandomSeed, found ${seedCount}`);
  checkStoryValues(pkg, resourceIds, flagIds);

  const world = new World();
  for (const system of narrativeDirectorCapability.systems) world.addSystem(system);
  for (const entity of Object.keys(blueprint.entities).sort()) {
    world.createEntity(entity);
    for (const [type, data] of Object.entries(blueprint.entities[entity]!)) world.addComponent(entity, { ...data, type });
  }
  world.createEntity('story');
  world.addComponent('story', { type: 'NarrativePackage', package: pkg });
  world.addComponent('story', createStoryRuntime(pkg));
  world.createEntity('input');
  world.addComponent('input', { type: 'InputQueue', actions: [] });
  world.tick();
  if (!world.getComponent('story', 'NarrativeProjection')) fail('entry did not produce a NarrativeProjection');
  return { pkg, world, storyEntity: 'story' };
}
