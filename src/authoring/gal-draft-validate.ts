import { createHash } from 'node:crypto';
import type { StoryRef } from '../engine/protocol/galgame.js';
import type {
  GalBrief, GalDraftCheck, GalDraftIssue, GalDraftKind,
  NarrativeBible, RouteOutline, SceneBeatSheet, StoryGraphDraft,
} from './gal-draft-types.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_DEPTH = 24;
const MAX_NODES = 20_000;
const MAX_ARRAY = 2_000;
const MAX_TEXT = 10_000;
const MAX_BYTES = 512_000;
const owns = (value: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try { return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null; }
  catch { return false; }
};
const sortIssues = (issues: GalDraftIssue[]): GalDraftIssue[] => issues.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en') || a.message.localeCompare(b.message, 'en'));

/** Stable JSON for already checked finite JSON data; object order is irrelevant, array order is not. */
export function canonicalGalDraftJson(value: unknown): string {
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) throw new TypeError('sparse array is not finite JSON');
      items.push(canonicalGalDraftJson(value[i]));
    }
    return `[${items.join(',')}]`;
  }
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalGalDraftJson(value[key])}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('not finite JSON');
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('not finite JSON');
  return encoded;
}

export function galDraftContentHash(content: {
  readonly projectId: string; readonly kind: GalDraftKind; readonly schemaVersion: 1;
  readonly basedOn: readonly string[]; readonly data: unknown;
}): string {
  const payload = { projectId: content.projectId, kind: content.kind, schemaVersion: content.schemaVersion, basedOn: content.basedOn, data: content.data };
  return `sha256:${createHash('sha256').update(canonicalGalDraftJson(payload)).digest('hex')}`;
}

class Check {
  readonly issues: GalDraftIssue[] = [];
  add(path: string, code: string, message: string, severity: 'error' | 'warning' = 'error'): void {
    if (this.issues.length < 200) this.issues.push({ path, code, severity, message });
  }
  obj(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | undefined {
    if (!plain(value)) { this.add(path, 'object', 'must be a plain JSON object'); return undefined; }
    for (const key of Object.keys(value).sort()) if (![...required, ...optional].includes(key)) this.add(`${path}.${key}`, 'unknown_field', 'field is not in this closed schema');
    for (const key of required) if (!owns(value, key)) this.add(`${path}.${key}`, 'required', 'field is required');
    return value;
  }
  text(value: unknown, path: string, nonempty = true): string | undefined {
    if (typeof value !== 'string' || value.length > MAX_TEXT || (nonempty && value.trim().length === 0)) {
      this.add(path, 'text', nonempty ? 'must be non-empty text within limit' : 'must be text within limit'); return undefined;
    }
    if (/<\/?[A-Za-z][^>]*>/.test(value) || value.includes('```')) this.add(path, 'markup', 'authoring text must be plain text, not HTML or code fences');
    return value;
  }
  id(value: unknown, path: string): string | undefined {
    if (typeof value !== 'string' || !ID.test(value)) { this.add(path, 'id', 'must be a non-empty safe ID'); return undefined; }
    return value;
  }
  int(value: unknown, path: string, min = 0): number | undefined {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) { this.add(path, 'integer', `must be a safe integer >= ${min}`); return undefined; }
    return value;
  }
  oneOf(value: unknown, path: string, options: readonly string[]): string | undefined {
    if (typeof value !== 'string' || !options.includes(value)) { this.add(path, 'enum', `must be one of ${options.join(', ')}`); return undefined; }
    return value;
  }
  array(value: unknown, path: string, min = 0): readonly unknown[] | undefined {
    if (!Array.isArray(value) || value.length < min || value.length > MAX_ARRAY) { this.add(path, 'array', `must be an array of ${min}..${MAX_ARRAY} items`); return undefined; }
    return value;
  }
  strings(value: unknown, path: string, min = 0, ids = false): string[] {
    const items = this.array(value, path, min);
    if (!items) return [];
    const seen = new Set<string>(); const out: string[] = [];
    items.forEach((item, i) => {
      const at = `${path}[${i}]`; const checked = ids ? this.id(item, at) : this.text(item, at);
      if (checked === undefined) return;
      if (seen.has(checked)) this.add(at, 'duplicate', 'value must be unique');
      else { seen.add(checked); out.push(checked); }
    });
    return out;
  }
  ref(value: unknown, path: string, choices: ReadonlySet<string>, what: string): void {
    const id = this.id(value, path);
    if (id && !choices.has(id)) this.add(path, 'reference', `unknown ${what}`);
  }
  keyed(value: unknown, path: string, min = 0): Record<string, unknown> | undefined {
    if (!plain(value)) { this.add(path, 'object', 'must be a record'); return undefined; }
    const keys = Object.keys(value);
    if (keys.length < min || keys.length > MAX_ARRAY) this.add(path, 'size', `must contain ${min}..${MAX_ARRAY} entries`);
    for (const key of keys) this.id(key, `${path}.${key}`);
    return value;
  }
  result(): GalDraftCheck { const issues = sortIssues(this.issues); return { ok: !issues.some((issue) => issue.severity === 'error'), issues }; }
}

/** Reject non-JSON, cycles, huge payloads and dangerous record keys before semantic traversal. */
function finiteTree(value: unknown, check: Check): boolean {
  const seen = new WeakSet<object>(); let nodes = 0;
  const visit = (item: unknown, path: string, depth: number): void => {
    if (++nodes > MAX_NODES) { check.add(path, 'size', 'JSON node limit exceeded'); return; }
    if (depth > MAX_DEPTH) { check.add(path, 'depth', 'JSON depth limit exceeded'); return; }
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { if (item.length > MAX_TEXT) check.add(path, 'size', 'text limit exceeded'); return; }
    if (typeof item === 'number') { if (!Number.isFinite(item)) check.add(path, 'finite', 'number must be finite'); return; }
    if (typeof item !== 'object') { check.add(path, 'json', 'must be finite JSON'); return; }
    if (seen.has(item)) { check.add(path, 'cycle', 'JSON must be acyclic'); return; }
    seen.add(item);
    if (Array.isArray(item)) {
      if (item.length > MAX_ARRAY) check.add(path, 'size', 'array limit exceeded');
      for (let i = 0; i < Math.min(item.length, MAX_ARRAY); i++) {
        if (!Object.prototype.hasOwnProperty.call(item, i)) check.add(`${path}[${i}]`, 'json', 'sparse arrays are not finite JSON');
        else visit(item[i], `${path}[${i}]`, depth + 1);
      }
    } else if (plain(item)) {
      const entries = Object.keys(item).sort();
      if (entries.length > MAX_ARRAY) check.add(path, 'size', 'object key limit exceeded');
      for (const key of entries.slice(0, MAX_ARRAY)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') check.add(`${path}.${key}`, 'unsafe_key', 'unsafe object key');
        visit(item[key], `${path}.${key}`, depth + 1);
      }
    } else check.add(path, 'json', 'must be a plain JSON object');
    seen.delete(item);
  };
  try { visit(value, '$.data', 0); }
  catch { check.add('$.data', 'json', 'input cannot be read as finite JSON'); }
  if (check.issues.some((issue) => issue.severity === 'error')) return false;
  try { if (Buffer.byteLength(canonicalGalDraftJson(value), 'utf8') > MAX_BYTES) check.add('$.data', 'size', 'canonical JSON byte limit exceeded'); }
  catch { check.add('$.data', 'json', 'input cannot be serialized as finite JSON'); }
  return !check.issues.some((issue) => issue.severity === 'error');
}

export interface GalDraftReferences {
  readonly brief?: GalBrief;
  readonly bible?: NarrativeBible;
  readonly routes?: RouteOutline;
  readonly graph?: StoryGraphDraft;
  readonly briefDraftId?: string;
  readonly bibleDraftId?: string;
  readonly routesDraftId?: string;
  readonly graphDraftId?: string;
}

function brief(raw: unknown, c: Check): void {
  const d = c.obj(raw, '$.data', ['id', 'defaultLocale', 'locales', 'target', 'genre', 'audience', 'themes', 'prohibitedContent', 'artDirection', 'platforms', 'constraints'], ['titleHint']);
  if (!d) return;
  c.id(d.id, '$.data.id'); if (d.titleHint !== undefined) c.text(d.titleHint, '$.data.titleHint');
  const locales = c.strings(d.locales, '$.data.locales', 1, true);
  const defaultLocale = c.id(d.defaultLocale, '$.data.defaultLocale');
  if (defaultLocale && !locales.includes(defaultLocale)) c.add('$.data.defaultLocale', 'reference', 'must occur in locales');
  const target = c.obj(d.target, '$.data.target', ['minutes', 'routes', 'endings']);
  if (target) for (const key of ['minutes', 'routes', 'endings']) c.int(target[key], `$.data.target.${key}`, 1);
  c.strings(d.genre, '$.data.genre', 1); c.oneOf(d.audience, '$.data.audience', ['all-ages', 'teen', 'mature']);
  c.strings(d.themes, '$.data.themes'); c.strings(d.prohibitedContent, '$.data.prohibitedContent');
  const art = c.obj(d.artDirection, '$.data.artDirection', ['style', 'palette', 'referenceIds']);
  if (art) { c.text(art.style, '$.data.artDirection.style'); c.strings(art.palette, '$.data.artDirection.palette'); c.strings(art.referenceIds, '$.data.artDirection.referenceIds', 0, true); }
  const platforms = c.strings(d.platforms, '$.data.platforms', 1);
  platforms.forEach((item, i) => c.oneOf(item, `$.data.platforms[${i}]`, ['web', 'desktop']));
  c.strings(d.constraints, '$.data.constraints');
}

function bible(raw: unknown, c: Check, refs: GalDraftReferences): void {
  const d = c.obj(raw, '$.data', ['briefId', 'world', 'locations', 'characters', 'relationships', 'canonRules', 'narrativeProhibitions']);
  if (!d) return;
  const briefId = c.id(d.briefId, '$.data.briefId');
  if (refs.brief && briefId && briefId !== refs.brief.id) c.add('$.data.briefId', 'reference', 'must match approved brief data.id');
  const world = c.obj(d.world, '$.data.world', ['premise', 'rules']);
  if (world) { c.text(world.premise, '$.data.world.premise'); c.strings(world.rules, '$.data.world.rules'); }
  const locations = c.array(d.locations, '$.data.locations', 1) ?? [];
  const locationIds = new Set<string>();
  locations.forEach((item, i) => {
    const path = `$.data.locations[${i}]`, value = c.obj(item, path, ['id', 'name', 'description']); if (!value) return;
    const id = c.id(value.id, `${path}.id`); if (id) { if (locationIds.has(id)) c.add(`${path}.id`, 'duplicate', 'location ID must be unique'); locationIds.add(id); }
    c.text(value.name, `${path}.name`); c.text(value.description, `${path}.description`);
  });
  const characters = c.array(d.characters, '$.data.characters', 1) ?? [];
  const characterIds = new Set<string>();
  characters.forEach((item, i) => {
    const path = `$.data.characters[${i}]`, value = c.obj(item, path, ['id', 'name', 'role', 'motivation', 'traits', 'arc', 'visualNeed']); if (!value) return;
    const id = c.id(value.id, `${path}.id`); if (id) { if (characterIds.has(id)) c.add(`${path}.id`, 'duplicate', 'character ID must be unique'); characterIds.add(id); }
    for (const key of ['name', 'role', 'motivation', 'arc']) c.text(value[key], `${path}.${key}`);
    c.strings(value.traits, `${path}.traits`);
    const visual = c.obj(value.visualNeed, `${path}.visualNeed`, ['silhouette', 'costume', 'expressions']);
    if (visual) { c.text(visual.silhouette, `${path}.visualNeed.silhouette`); c.text(visual.costume, `${path}.visualNeed.costume`); c.strings(visual.expressions, `${path}.visualNeed.expressions`); }
  });
  const relationships = c.array(d.relationships, '$.data.relationships') ?? [];
  relationships.forEach((item, i) => {
    const path = `$.data.relationships[${i}]`, value = c.obj(item, path, ['from', 'to', 'kind', 'note']); if (!value) return;
    c.ref(value.from, `${path}.from`, characterIds, 'character'); c.ref(value.to, `${path}.to`, characterIds, 'character');
    c.oneOf(value.kind, `${path}.kind`, ['ally', 'rival', 'family', 'romance', 'other']); c.text(value.note, `${path}.note`);
  });
  c.strings(d.canonRules, '$.data.canonRules');
  const prohibitions = c.strings(d.narrativeProhibitions, '$.data.narrativeProhibitions');
  if (refs.brief) for (const item of refs.brief.prohibitedContent) if (!prohibitions.includes(item)) c.add('$.data.narrativeProhibitions', 'prohibition', 'must preserve all brief prohibitions');
}

function routes(raw: unknown, c: Check, refs: GalDraftReferences): void {
  const d = c.obj(raw, '$.data', ['bibleId', 'routes', 'forks', 'milestones', 'endings']); if (!d) return;
  const bibleId = c.id(d.bibleId, '$.data.bibleId');
  if (refs.bibleDraftId && bibleId && bibleId !== refs.bibleDraftId) c.add('$.data.bibleId', 'reference', 'must match approved bible draftId');
  const characterIds = new Set(refs.bible?.characters.map((item) => item.id) ?? []);
  const milestoneIds = new Set<string>();
  const milestones = c.array(d.milestones, '$.data.milestones', 1) ?? [];
  milestones.forEach((item, i) => {
    const path = `$.data.milestones[${i}]`, m = c.obj(item, path, ['id', 'summary']); if (!m) return;
    const id = c.id(m.id, `${path}.id`); if (id) { if (milestoneIds.has(id)) c.add(`${path}.id`, 'duplicate', 'milestone ID must be unique'); milestoneIds.add(id); }
    c.text(m.summary, `${path}.summary`);
  });
  const routeIds = new Set<string>();
  const routeEntries: { id: string; endingIds: string[]; path: string }[] = [];
  const routeList = c.array(d.routes, '$.data.routes', 1) ?? [];
  routeList.forEach((item, i) => {
    const path = `$.data.routes[${i}]`, route = c.obj(item, path, ['id', 'premise', 'milestoneIds', 'endingIds'], ['leadCharacterId']); if (!route) return;
    const id = c.id(route.id, `${path}.id`); if (id) { if (routeIds.has(id)) c.add(`${path}.id`, 'duplicate', 'route ID must be unique'); routeIds.add(id); }
    if (route.leadCharacterId !== undefined && refs.bible) c.ref(route.leadCharacterId, `${path}.leadCharacterId`, characterIds, 'character');
    else if (route.leadCharacterId !== undefined) c.id(route.leadCharacterId, `${path}.leadCharacterId`);
    c.text(route.premise, `${path}.premise`);
    c.strings(route.milestoneIds, `${path}.milestoneIds`, 1, true).forEach((value, n) => c.ref(value, `${path}.milestoneIds[${n}]`, milestoneIds, 'milestone'));
    const endingIds = c.strings(route.endingIds, `${path}.endingIds`, 1, true);
    if (id) routeEntries.push({ id, endingIds, path });
  });
  const endings = c.array(d.endings, '$.data.endings', 1) ?? [];
  const endingIds = new Set<string>(); const endingRoute = new Map<string, string>();
  endings.forEach((item, i) => {
    const path = `$.data.endings[${i}]`, ending = c.obj(item, path, ['id', 'routeId', 'outcome'], ['conditionIntent']); if (!ending) return;
    const id = c.id(ending.id, `${path}.id`); if (id) { if (endingIds.has(id)) c.add(`${path}.id`, 'duplicate', 'ending ID must be unique'); endingIds.add(id); }
    const routeId = c.id(ending.routeId, `${path}.routeId`);
    if (routeId && !routeIds.has(routeId)) c.add(`${path}.routeId`, 'reference', 'unknown route');
    if (id && routeId) endingRoute.set(id, routeId);
    c.text(ending.outcome, `${path}.outcome`); if (ending.conditionIntent !== undefined) c.text(ending.conditionIntent, `${path}.conditionIntent`);
  });
  routeEntries.forEach(({ id, endingIds: declared, path }) => declared.forEach((endingId, i) => {
    if (!endingIds.has(endingId) || endingRoute.get(endingId) !== id) c.add(`${path}.endingIds[${i}]`, 'reference', 'ending must belong to this route');
  }));
  for (const ending of endingIds) if (!routeEntries.some((route) => route.endingIds.includes(ending))) c.add('$.data.endings', 'coverage', 'every ending must be declared by its route');
  const forks = c.array(d.forks, '$.data.forks') ?? []; const forkIds = new Set<string>();
  forks.forEach((item, i) => {
    const path = `$.data.forks[${i}]`, fork = c.obj(item, path, ['id', 'sourceMilestoneId', 'options']); if (!fork) return;
    const id = c.id(fork.id, `${path}.id`); if (id) { if (forkIds.has(id)) c.add(`${path}.id`, 'duplicate', 'fork ID must be unique'); forkIds.add(id); }
    c.ref(fork.sourceMilestoneId, `${path}.sourceMilestoneId`, milestoneIds, 'milestone');
    const options = c.array(fork.options, `${path}.options`, 2) ?? []; const optionIds = new Set<string>();
    options.forEach((item, n) => {
      const at = `${path}.options[${n}]`, option = c.obj(item, at, ['id', 'targetMilestoneId', 'intent']); if (!option) return;
      const optionId = c.id(option.id, `${at}.id`); if (optionId) { if (optionIds.has(optionId)) c.add(`${at}.id`, 'duplicate', 'fork option ID must be unique'); optionIds.add(optionId); }
      c.ref(option.targetMilestoneId, `${at}.targetMilestoneId`, milestoneIds, 'milestone'); c.text(option.intent, `${at}.intent`);
    });
  });
  if (refs.brief) {
    if (routeList.length !== refs.brief.target.routes) c.add('$.data.routes', 'target', 'route count differs from approved brief');
    if (endings.length !== refs.brief.target.endings) c.add('$.data.endings', 'target', 'ending count differs from approved brief');
  }
}

const refKey = (ref: StoryRef): string => `${ref.chapterId}/${ref.nodeId}`;
function storyRef(value: unknown, path: string, c: Check): StoryRef | undefined {
  const ref = c.obj(value, path, ['chapterId', 'nodeId']); if (!ref) return undefined;
  const chapterId = c.id(ref.chapterId, `${path}.chapterId`), nodeId = c.id(ref.nodeId, `${path}.nodeId`);
  return chapterId && nodeId ? { chapterId, nodeId } : undefined;
}

/** Structural only: no checkIntent is evaluated here. */
export function reachableGalGraphNodes(graph: StoryGraphDraft): ReadonlySet<string> {
  const edges = new Map<string, string[]>();
  for (const [chapterId, chapter] of Object.entries(graph.chapters)) for (const [nodeId, node] of Object.entries(chapter.nodes)) {
    const targets = node.kind === 'line-slot' ? [node.next] : node.kind === 'choice' ? node.options.map((option) => option.next)
      : node.kind === 'check' ? [node.pass, node.fail] : node.kind === 'jump' ? [node.then, ...(node.otherwise ? [node.otherwise] : [])] : [];
    edges.set(`${chapterId}/${nodeId}`, targets.map(refKey));
  }
  const visited = new Set<string>(); const pending = [refKey(graph.entry)];
  for (let i = 0; i < pending.length; i++) {
    const key = pending[i]; if (!key || visited.has(key) || !edges.has(key)) continue;
    visited.add(key); pending.push(...(edges.get(key) ?? []));
  }
  return visited;
}

function graph(raw: unknown, c: Check, refs: GalDraftReferences): void {
  const d = c.obj(raw, '$.data', ['routesDraftId', 'entry', 'chapters', 'sceneSlots']); if (!d) return;
  const draftId = c.id(d.routesDraftId, '$.data.routesDraftId');
  if (draftId && refs.routesDraftId && draftId !== refs.routesDraftId) c.add('$.data.routesDraftId', 'reference', 'must match approved routes draftId');
  const entry = storyRef(d.entry, '$.data.entry', c);
  const sceneSlots = c.array(d.sceneSlots, '$.data.sceneSlots', 1) ?? [];
  const sceneIds = new Set<string>(), locationIds = new Set(refs.bible?.locations.map((item) => item.id) ?? []);
  sceneSlots.forEach((item, i) => {
    const path = `$.data.sceneSlots[${i}]`, slot = c.obj(item, path, ['id', 'locationId']); if (!slot) return;
    const id = c.id(slot.id, `${path}.id`); if (id) { if (sceneIds.has(id)) c.add(`${path}.id`, 'duplicate', 'scene slot ID must be unique'); sceneIds.add(id); }
    if (refs.bible) c.ref(slot.locationId, `${path}.locationId`, locationIds, 'location'); else c.id(slot.locationId, `${path}.locationId`);
  });
  const chapters = c.keyed(d.chapters, '$.data.chapters', 1); if (!chapters) return;
  const keys = new Set<string>(); const edges = new Map<string, { key: string; path: string }[]>(); const endings = new Map<string, string>();
  const routeIds = new Set(refs.routes?.routes.map((item) => item.id) ?? []);
  const milestoneIds = new Set(refs.routes?.milestones.map((item) => item.id) ?? []);
  const endingIds = new Set(refs.routes?.endings.map((item) => item.id) ?? []);
  for (const [chapterId, rawChapter] of Object.entries(chapters).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const path = `$.data.chapters.${chapterId}`, chapter = c.obj(rawChapter, path, ['title', 'start', 'nodes'], ['sceneId']); if (!chapter) continue;
    c.text(chapter.title, `${path}.title`); if (chapter.sceneId !== undefined) c.ref(chapter.sceneId, `${path}.sceneId`, sceneIds, 'scene slot');
    const nodes = c.keyed(chapter.nodes, `${path}.nodes`, 1); if (!nodes) continue;
    const start = c.id(chapter.start, `${path}.start`);
    if (start && !owns(nodes, start)) c.add(`${path}.start`, 'reference', 'unknown start node');
    for (const [nodeId, rawNode] of Object.entries(nodes).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const at = `${path}.nodes.${nodeId}`;
      if (!plain(rawNode)) { c.add(at, 'object', 'must be a graph node'); continue; }
      const kind = c.oneOf(rawNode.kind, `${at}.kind`, ['line-slot', 'choice', 'check', 'jump', 'ending']);
      if (!kind) continue;
      const fields = kind === 'line-slot' ? ['kind', 'next'] : kind === 'choice' ? ['kind', 'options']
        : kind === 'check' ? ['kind', 'pass', 'fail', 'checkIntent'] : kind === 'jump' ? ['kind', 'then'] : ['kind', 'endingId'];
      const optional = kind === 'jump' ? ['otherwise', 'routeId', 'milestoneId'] : ['routeId', 'milestoneId'];
      const node = c.obj(rawNode, at, fields, optional); if (!node) continue;
      const key = `${chapterId}/${nodeId}`; keys.add(key); edges.set(key, []);
      if (node.routeId !== undefined && refs.routes) c.ref(node.routeId, `${at}.routeId`, routeIds, 'route');
      else if (node.routeId !== undefined) c.id(node.routeId, `${at}.routeId`);
      if (node.milestoneId !== undefined && refs.routes) c.ref(node.milestoneId, `${at}.milestoneId`, milestoneIds, 'milestone');
      else if (node.milestoneId !== undefined) c.id(node.milestoneId, `${at}.milestoneId`);
      const push = (value: unknown, edgePath: string): void => { const ref = storyRef(value, edgePath, c); if (ref) edges.get(key)?.push({ key: refKey(ref), path: edgePath }); };
      if (kind === 'line-slot') push(node.next, `${at}.next`);
      if (kind === 'choice') {
        const options = c.array(node.options, `${at}.options`, 2) ?? []; const ids = new Set<string>();
        options.forEach((item, i) => {
          const opath = `${at}.options[${i}]`, option = c.obj(item, opath, ['id', 'next']); if (!option) return;
          const id = c.id(option.id, `${opath}.id`); if (id) { if (ids.has(id)) c.add(`${opath}.id`, 'duplicate', 'option ID must be unique'); ids.add(id); }
          push(option.next, `${opath}.next`);
        });
      }
      if (kind === 'check') { c.text(node.checkIntent, `${at}.checkIntent`); push(node.pass, `${at}.pass`); push(node.fail, `${at}.fail`); c.add(`${at}.checkIntent`, 'intent_only', 'structural reachability does not prove condition feasibility', 'warning'); }
      if (kind === 'jump') { push(node.then, `${at}.then`); if (node.otherwise !== undefined) push(node.otherwise, `${at}.otherwise`); }
      if (kind === 'ending') {
        const endingId = c.id(node.endingId, `${at}.endingId`); if (endingId) {
          endings.set(key, endingId);
          const ending = refs.routes?.endings.find((item) => item.id === endingId);
          if (refs.routes && !ending) c.add(`${at}.endingId`, 'reference', 'unknown ending');
          if (ending && node.routeId !== undefined && node.routeId !== ending.routeId) c.add(`${at}.routeId`, 'reference', 'ending belongs to a different route');
        }
      }
    }
  }
  if (entry && !keys.has(refKey(entry))) c.add('$.data.entry', 'reference', 'unknown entry node');
  for (const links of edges.values()) for (const link of links) if (!keys.has(link.key)) c.add(link.path, 'reference', 'unknown graph node');
  if (!entry || !keys.has(refKey(entry))) return;
  const reachable = new Set<string>(), pending = [refKey(entry)];
  for (let i = 0; i < pending.length; i++) { const key = pending[i]; if (!key || reachable.has(key)) continue; reachable.add(key); pending.push(...(edges.get(key) ?? []).map((item) => item.key).filter((item) => keys.has(item))); }
  for (const key of keys) if (!reachable.has(key)) c.add(`$.data.chapters.${key.replace('/', '.nodes.')}`, 'unreachable', 'node is structurally unreachable from entry');
  const reachedEndings = new Set([...endings].filter(([key]) => reachable.has(key)).map(([, id]) => id));
  if (refs.routes) for (const endingId of endingIds) if (!reachedEndings.has(endingId)) c.add('$.data.chapters', 'ending_coverage', `approved ending ${endingId} is not structurally reachable`);
  const canEnd = new Set<string>([...endings.keys()]); let changed = true;
  while (changed) { changed = false; for (const [key, links] of edges) if (!canEnd.has(key) && links.some((link) => canEnd.has(link.key))) { canEnd.add(key); changed = true; } }
  for (const key of reachable) if (!canEnd.has(key)) c.add(`$.data.chapters.${key.replace('/', '.nodes.')}`, 'no_exit', 'reachable node cannot reach an ending');
}

function beats(raw: unknown, c: Check, refs: GalDraftReferences): void {
  const d = c.obj(raw, '$.data', ['graphDraftId', 'beats', 'mediaNeeds']); if (!d) return;
  const draftId = c.id(d.graphDraftId, '$.data.graphDraftId');
  if (draftId && refs.graphDraftId && draftId !== refs.graphDraftId) c.add('$.data.graphDraftId', 'reference', 'must match approved graph draftId');
  const needs = c.array(d.mediaNeeds, '$.data.mediaNeeds') ?? []; const needKinds = new Map<string, string>();
  needs.forEach((item, i) => {
    const path = `$.data.mediaNeeds[${i}]`, need = c.obj(item, path, ['id', 'kind', 'brief']); if (!need) return;
    const id = c.id(need.id, `${path}.id`), kind = c.oneOf(need.kind, `${path}.kind`, ['background', 'bgm', 'cg']);
    if (id) { if (needKinds.has(id)) c.add(`${path}.id`, 'duplicate', 'media need ID must be unique'); else if (kind) needKinds.set(id, kind); }
    c.text(need.brief, `${path}.brief`);
  });
  const entries = c.keyed(d.beats, '$.data.beats', 1); if (!entries) return;
  const sceneIds = new Set(refs.graph?.sceneSlots.map((item) => item.id) ?? []);
  const characterIds = new Set(refs.bible?.characters.map((item) => item.id) ?? []);
  const reachable = refs.graph ? reachableGalGraphNodes(refs.graph) : undefined;
  const orderKeys = new Set<string>(), coveredScenes = new Set<string>();
  for (const [beatId, rawBeat] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const path = `$.data.beats.${beatId}`;
    const beat = c.obj(rawBeat, path, ['anchor', 'sceneSlotId', 'castIds', 'mood', 'dramaticPurpose', 'presentationNeeds', 'order'], ['backgroundNeedId', 'bgmNeedId', 'cgNeedId']);
    if (!beat) continue;
    const anchor = storyRef(beat.anchor, `${path}.anchor`, c);
    if (anchor && reachable && !reachable.has(refKey(anchor))) c.add(`${path}.anchor`, 'reference', 'anchor must be a reachable graph node');
    const order = c.int(beat.order, `${path}.order`);
    if (anchor && order !== undefined) { const pair = `${refKey(anchor)}#${order}`; if (orderKeys.has(pair)) c.add(`${path}.order`, 'duplicate', 'anchor/order pair must be unique'); orderKeys.add(pair); }
    const sceneId = c.id(beat.sceneSlotId, `${path}.sceneSlotId`);
    if (sceneId) { if (refs.graph && !sceneIds.has(sceneId)) c.add(`${path}.sceneSlotId`, 'reference', 'unknown scene slot'); else coveredScenes.add(sceneId); }
    c.strings(beat.castIds, `${path}.castIds`, 0, true).forEach((id, i) => { if (refs.bible) c.ref(id, `${path}.castIds[${i}]`, characterIds, 'character'); });
    c.text(beat.mood, `${path}.mood`); c.text(beat.dramaticPurpose, `${path}.dramaticPurpose`);
    for (const [field, expected] of [['backgroundNeedId', 'background'], ['bgmNeedId', 'bgm'], ['cgNeedId', 'cg']] as const) {
      if (beat[field] === undefined) continue;
      const id = c.id(beat[field], `${path}.${field}`);
      if (id && needKinds.get(id) !== expected) c.add(`${path}.${field}`, 'reference', `must reference a ${expected} media need`);
    }
    const presentation = c.obj(beat.presentationNeeds, `${path}.presentationNeeds`, ['motions'], ['transition']);
    if (presentation) {
      if (presentation.transition !== undefined) c.oneOf(presentation.transition, `${path}.presentationNeeds.transition`, ['cut', 'fade', 'wipe', 'dissolve']);
      c.strings(presentation.motions, `${path}.presentationNeeds.motions`);
    }
  }
  if (refs.graph) for (const scene of refs.graph.sceneSlots) if (!coveredScenes.has(scene.id)) c.add('$.data.beats', 'coverage', `scene slot ${scene.id} has no beat`);
}

/** Pure closed-schema check. References are approved upstream data supplied by the trusted authoring caller. */
export function validateGalDraftData<K extends GalDraftKind>(kind: K, data: unknown, refs: GalDraftReferences = {}): GalDraftCheck {
  const c = new Check();
  if (!finiteTree(data, c)) return c.result();
  switch (kind) {
    case 'brief': brief(data, c); break;
    case 'bible': bible(data, c, refs); break;
    case 'routes': routes(data, c, refs); break;
    case 'graph': graph(data, c, refs); break;
    case 'beats': beats(data, c, refs); break;
    default: c.add('$.kind', 'enum', 'unknown draft kind');
  }
  return c.result();
}
