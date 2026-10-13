import { createHash } from 'node:crypto';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { validateLifeGamePackage } from '@assembly/life-package-validate.js';
import { validateLifeWorldVisualSemantics } from '@assembly/life-world-visual-semantics.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';
import { Engine } from '@runtime/engine.js';
import { hashWithOrder } from '@net/determinism.js';
import type { Flag, LifeActivityContext, LifeContinuousMotion, LifePlacement as RuntimeLifePlacement, LifePosition, Resource, Transform } from '@engine/protocol/components.js';
import { isLifeWalkable } from '@engine/protocol/life-tilemap.js';
import type { LifeAccessRequirement, LifeGamePackage } from '@engine/protocol/life-sim.js';
import { LIFE_VIEWPORT_PROFILE_ID, lifePackageViewportProfileId } from '@engine/protocol/life-viewport-profile.js';
import type { Inventory } from '@skills/tier2/inventory.js';
import {
  deriveAssetSlotBriefFingerprint,
  resolveJsonPointer,
  validateAssetSlotManifest,
  type AssetSlotBrief,
  type AssetSlotManifest,
} from '@assets/asset-slot-brief.js';

export const LIFE_GENERATION_SCHEMA = 'zerocraft.life-generation-bundle.v1' as const;
export const LIFE_GENERATION_PROMPT_VERSION = 'life-generation.prompt.v1' as const;
export const LIFE_GENERATION_MAX_ROUND = 8;

export type LifeGenerationSource = 'bundle' | 'world' | 'actors' | 'plot' | 'compile' | 'runtime' | 'assets' | 'repair';
export interface LifeGenerationDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly source: LifeGenerationSource;
  readonly round: number;
}

export interface LifeGenerationBundleV1 {
  readonly schemaVersion: typeof LIFE_GENERATION_SCHEMA;
  readonly session: {
    readonly id: string;
    readonly round: number;
    readonly createdBy: 'human' | 'model' | 'mixed';
    readonly promptContractVersion: typeof LIFE_GENERATION_PROMPT_VERSION;
  };
  readonly game: { readonly slug: string; readonly lifePackage: unknown };
  readonly assetSlots: { readonly draft: AssetSlotManifest };
  readonly provenance: {
    readonly baseHash: string;
    readonly sourceHashes: Readonly<Record<'lifePackage' | 'assetSlotsDraft', string>>;
  };
}

export interface LifeMaterializationPlanEntry {
  readonly path: string;
  readonly action: 'create' | 'template' | 'handoff';
  readonly contentHash: string;
  readonly owner: 'life-authoring' | 'host-template' | 'launcher' | 'asset-manager';
}

export interface LifeMaterializationPlan {
  readonly mode: 'dry-run';
  readonly writesPerformed: false;
  readonly entries: readonly LifeMaterializationPlanEntry[];
}

export interface LifeGenerationCheckResult {
  readonly ok: boolean;
  readonly diagnostics: readonly LifeGenerationDiagnostic[];
  readonly canonicalHash?: string;
  readonly runtimeHash?: string;
  readonly plan?: LifeMaterializationPlan;
  readonly worldVisualReview?: LifeWorldVisualReview;
}

export interface LifeWarpVisualReviewRow {
  readonly sceneId: string; readonly warpId: string; readonly landmarkPlacementId: string;
  readonly destination: string; readonly relation: 'overlap' | 'adjacent' | 'invalid';
  readonly assetKey?: string; readonly assetSlotId?: string; readonly candidateStatus?: string;
  readonly mapLocation: string; readonly size: string; readonly anchor?: string;
}
export interface LifeSurfaceVisualReviewRow {
  readonly state: string; readonly actions: readonly string[]; readonly assetKey: string;
  readonly assetSlotId?: string; readonly candidateStatus?: string; readonly mapLocations: readonly string[];
  readonly size?: string; readonly anchor?: string;
}
export interface LifeWorldVisualReview {
  readonly warps: readonly LifeWarpVisualReviewRow[];
  readonly surfaces: readonly LifeSurfaceVisualReviewRow[];
}

export interface LifePromptPacket {
  readonly packet: 0 | 1 | 2 | 3 | 4;
  readonly artifactKind: 'contract' | 'world' | 'actors' | 'plot' | 'asset-slots';
  readonly schema: Readonly<Record<string, unknown>>;
  readonly allowlist: readonly string[];
  readonly references: Readonly<Record<string, readonly string[]>>;
  readonly forbidden: readonly string[];
  readonly output: Readonly<Record<string, unknown>>;
}

export type LifeGenerationRepair =
  | { readonly artifactKind: 'life-generation-bundle'; readonly baseHash: string; readonly document: unknown }
  | { readonly artifactKind: 'life-generation-patch'; readonly baseHash: string; readonly patch: readonly { readonly op: 'add' | 'remove' | 'replace'; readonly path: string; readonly value?: unknown }[] };

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const safeId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const safeSlug = /^game-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const sha = /^sha256:[0-9a-f]{64}$/;
const forbiddenKey = /^(?:secret|password|authorization|api[-_]?key|provider[-_]?key|bytes|base64|binary|credential)$/i;
const unsafePath = /(?:^|[\\/])\.\.(?:[\\/]|$)|^[A-Za-z]:[\\/]|^[/\\]|^(?:https?|file|data):/i;
const pointerEscape = (value: string): string => value.replace(/~/g, '~0').replace(/\//g, '~1');

/** Stable JSON: object keys sorted, array order preserved, finite JSON only. */
export function canonicalLifeGenerationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalLifeGenerationJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalLifeGenerationJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function sha256Canonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalLifeGenerationJson(value)).digest('hex')}`;
}

export function lifeGenerationPayload(bundle: Pick<LifeGenerationBundleV1, 'game' | 'assetSlots'>): unknown {
  return { game: bundle.game, assetSlots: bundle.assetSlots };
}

function sourceForLifePath(path: string): LifeGenerationSource {
  if (/\/(?:world|tileCatalog|scenes|camera|movement|interaction|constructionProjects)(?:\/|$)/.test(path)) return 'world';
  if (/\/(?:itemCatalog|playerInventory|cropCatalog|calendar|playerVisual|relationships)(?:\/|$)/.test(path)) return 'actors';
  if (/\/(?:logic|milestones|dialogueCatalog|quests)(?:\/|$)/.test(path)) return 'plot';
  return 'world';
}

function lifePathToPointer(path: string): string {
  if (path === '$') return '/game/lifePackage';
  return `/game/lifePackage${path.slice(1).replace(/\.([^.[\]]+)/g, '/$1').replace(/\[(\d+)\]/g, '/$1')}`;
}

function stableDiagnostics(values: readonly LifeGenerationDiagnostic[]): LifeGenerationDiagnostic[] {
  return [...values].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.source.localeCompare(b.source) || a.message.localeCompare(b.message));
}

function collectVisualReferences(raw: unknown): Array<{ key: string; pointer: string }> {
  if (!record(raw)) return [];
  const out: Array<{ key: string; pointer: string }> = [];
  const add = (key: unknown, pointer: string): void => { if (typeof key === 'string' && key.length > 0) out.push({ key, pointer }); };
  if (record(raw.playerVisual)) add(raw.playerVisual.skinKey, '/playerVisual/skinKey');
  if (record(raw.tileCatalog)) for (const id of Object.keys(raw.tileCatalog).sort()) {
    const entry = raw.tileCatalog[id];
    if (record(entry) && record(entry.visual)) add(entry.visual.skinKey, `/tileCatalog/${pointerEscape(id)}/visual/skinKey`);
  }
  if (record(raw.visualSemantics) && record(raw.visualSemantics.farm)) {
    add(raw.visualSemantics.farm.tilledDrySkinKey, '/visualSemantics/farm/tilledDrySkinKey');
    add(raw.visualSemantics.farm.wateredSkinKey, '/visualSemantics/farm/wateredSkinKey');
  }
  if (Array.isArray(raw.itemCatalog)) raw.itemCatalog.forEach((entry, index) => { if (record(entry)) add(entry.skinKey, `/itemCatalog/${index}/skinKey`); });
  if (Array.isArray(raw.cropCatalog)) raw.cropCatalog.forEach((entry, index) => {
    if (!record(entry) || !record(entry.visual)) return;
    add(entry.visual.seededSkinKey, `/cropCatalog/${index}/visual/seededSkinKey`);
    add(entry.visual.growingSkinKey, `/cropCatalog/${index}/visual/growingSkinKey`);
    add(entry.visual.matureSkinKey, `/cropCatalog/${index}/visual/matureSkinKey`);
  });
  if (Array.isArray(raw.constructionProjects)) raw.constructionProjects.forEach((entry, index) => { if (record(entry)) add(entry.completedSkinKey, `/constructionProjects/${index}/completedSkinKey`); });
  if (Array.isArray(raw.scenes)) raw.scenes.forEach((scene, sceneIndex) => {
    if (!record(scene) || !Array.isArray(scene.placements)) return;
    scene.placements.forEach((placement, placementIndex) => { if (record(placement)) add(placement.skinKey, `/scenes/${sceneIndex}/placements/${placementIndex}/skinKey`); });
  });
  return out.sort((a, b) => a.pointer.localeCompare(b.pointer));
}

function validateEnvelope(raw: unknown): LifeGenerationDiagnostic[] {
  const diagnostics: LifeGenerationDiagnostic[] = [];
  const round = record(raw) && record(raw.session) && Number.isInteger(raw.session.round) ? Number(raw.session.round) : 0;
  const add = (path: string, code: string, message: string): void => { diagnostics.push({ path, code, message, severity: 'error', source: 'bundle', round }); };
  const closed = (value: unknown, path: string, required: readonly string[]): void => {
    if (!record(value)) { add(path, 'type', 'must be an object'); return; }
    const allowed = new Set(required);
    for (const key of Object.keys(value).sort()) if (!allowed.has(key)) add(`${path}/${pointerEscape(key)}`, 'unknown_field', 'field is not allowed');
    for (const key of required) if (!(key in value)) add(`${path}/${pointerEscape(key)}`, 'missing_field', 'field is required');
  };
  closed(raw, '', ['schemaVersion', 'session', 'game', 'assetSlots', 'provenance']);
  if (!record(raw)) return diagnostics;
  closed(raw.session, '/session', ['id', 'round', 'createdBy', 'promptContractVersion']);
  closed(raw.game, '/game', ['slug', 'lifePackage']);
  closed(raw.assetSlots, '/assetSlots', ['draft']);
  closed(raw.provenance, '/provenance', ['baseHash', 'sourceHashes']);
  if (record(raw.provenance)) closed(raw.provenance.sourceHashes, '/provenance/sourceHashes', ['lifePackage', 'assetSlotsDraft']);
  if (raw.schemaVersion !== LIFE_GENERATION_SCHEMA) add('/schemaVersion', 'schema_version', `must equal ${LIFE_GENERATION_SCHEMA}`);
  if (record(raw.session)) {
    if (typeof raw.session.id !== 'string' || !safeId.test(raw.session.id)) add('/session/id', 'id', 'must be a safe 1..128 character id');
    if (!Number.isInteger(raw.session.round) || Number(raw.session.round) < 0 || Number(raw.session.round) > LIFE_GENERATION_MAX_ROUND) add('/session/round', 'round', `must be an integer from 0 to ${LIFE_GENERATION_MAX_ROUND}`);
    if (!['human', 'model', 'mixed'].includes(String(raw.session.createdBy))) add('/session/createdBy', 'enum', 'must be human|model|mixed');
    if (raw.session.promptContractVersion !== LIFE_GENERATION_PROMPT_VERSION) add('/session/promptContractVersion', 'prompt_version', `must equal ${LIFE_GENERATION_PROMPT_VERSION}`);
  }
  if (record(raw.game) && (typeof raw.game.slug !== 'string' || !safeSlug.test(raw.game.slug))) add('/game/slug', 'slug', 'must match game-<lowercase-kebab>, max 52 characters');
  if (record(raw.provenance)) {
    if (typeof raw.provenance.baseHash !== 'string' || !sha.test(raw.provenance.baseHash)) add('/provenance/baseHash', 'hash', 'must be sha256:<64 lowercase hex>');
    if (record(raw.provenance.sourceHashes)) for (const key of ['lifePackage', 'assetSlotsDraft']) if (!sha.test(String(raw.provenance.sourceHashes[key] ?? ''))) add(`/provenance/sourceHashes/${key}`, 'hash', 'must be sha256:<64 lowercase hex>');
  }
  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > 64) { add(path, 'depth_limit', 'JSON depth exceeds 64'); return; }
    if (typeof value === 'string') {
      if (value.length > 16_384) add(path, 'text_limit', 'string exceeds 16384 characters');
      if (/(?:path|document)$/i.test(path) && !path.endsWith('/jsonPointer') && unsafePath.test(value)) add(path, 'unsafe_path', 'absolute, URL, data, and traversal paths are forbidden');
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) { add(path, 'non_json', 'numbers must be finite'); return; }
    if (Array.isArray(value)) {
      if (value.length > 4096) add(path, 'array_limit', 'array exceeds 4096 items');
      value.forEach((entry, index) => walk(entry, `${path}/${index}`, depth + 1));
      return;
    }
    if (!record(value)) { if (value !== null && !['boolean', 'number'].includes(typeof value)) add(path, 'non_json', 'must contain JSON values only'); return; }
    const keys = Object.keys(value);
    if (keys.length > 4096) add(path, 'map_limit', 'object exceeds 4096 fields');
    for (const key of keys.sort()) {
      if (key.length > 128) add(`${path}/${pointerEscape(key)}`, 'key_limit', 'field name exceeds 128 characters');
      if (forbiddenKey.test(key)) add(`${path}/${pointerEscape(key)}`, 'forbidden_field', 'secrets, provider keys, binary bytes, and credentials are forbidden');
      walk(value[key], `${path}/${pointerEscape(key)}`, depth + 1);
    }
  };
  walk(raw, '', 0);
  return stableDiagnostics(diagnostics);
}

function validateAssetDraft(bundle: LifeGenerationBundleV1): LifeGenerationDiagnostic[] {
  const round = bundle.session.round;
  const out: LifeGenerationDiagnostic[] = [];
  const add = (path: string, code: string, message: string): void => { out.push({ path, code, message, severity: 'error', source: 'assets', round }); };
  const manifest = bundle.assetSlots.draft;
  for (const issue of validateAssetSlotManifest(manifest)) add(`/assetSlots/draft${issue.path === '$' ? '' : issue.path.slice(1).replace(/\.([^.[\]]+)/g, '/$1').replace(/\[(\d+)\]/g, '/$1')}`, `asset_${issue.code}`, issue.message);
  if (!record(manifest)) return out;
  if (manifest.game !== bundle.game.slug) add('/assetSlots/draft/game', 'asset_game', 'must equal game.slug');
  const slots = Array.isArray(manifest.slots) ? manifest.slots as readonly AssetSlotBrief[] : [];
  const refs = collectVisualReferences(bundle.game.lifePackage);
  const expected = new Set(refs.map((ref) => ref.key));
  const covered = new Map<string, string[]>();
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    if (record(slot.governance) && slot.governance.approval !== 'placeholder') add(`/assetSlots/draft/slots/${i}/governance/approval`, 'approved_forbidden', 'generation intake accepts placeholder drafts only');
    if (record(slot.governance) && slot.governance.contentHash !== undefined) add(`/assetSlots/draft/slots/${i}/governance/contentHash`, 'content_hash_forbidden', 'drafts must not claim generated file content');
    if (slot.governance?.briefFingerprint !== deriveAssetSlotBriefFingerprint(slot)) add(`/assetSlots/draft/slots/${i}/governance/briefFingerprint`, 'asset_fingerprint', 'must equal the derived brief fingerprint');
    if (!expected.has(slot.assetKey)) add(`/assetSlots/draft/slots/${i}/assetKey`, 'orphan_slot', 'assetKey has no Life visual consumer');
    for (let j = 0; j < (slot.consumers?.length ?? 0); j++) {
      const consumer = slot.consumers[j]!;
      if (consumer.document !== 'life.json') add(`/assetSlots/draft/slots/${i}/consumers/${j}/document`, 'consumer_document', 'bundle consumers must target life.json');
      if (resolveJsonPointer(bundle.game.lifePackage, consumer.jsonPointer) !== slot.assetKey) add(`/assetSlots/draft/slots/${i}/consumers/${j}`, 'consumer_mismatch', 'consumer pointer must resolve to assetKey');
      const pointers = covered.get(slot.assetKey) ?? [];
      pointers.push(consumer.jsonPointer);
      covered.set(slot.assetKey, pointers);
    }
  }
  for (const ref of refs) if (!(covered.get(ref.key) ?? []).includes(ref.pointer)) add(`/game/lifePackage${ref.pointer}`, 'missing_slot', `visual reference ${ref.key} is not covered by a matching slot consumer`);
  return stableDiagnostics(out);
}

function pointInRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function placementDistance(x: number, y: number, placement: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): number {
  const dx = x < placement.x ? placement.x - x : x >= placement.x + placement.width ? x - (placement.x + placement.width - 1) : 0;
  const dy = y < placement.y ? placement.y - y : y >= placement.y + placement.height ? y - (placement.y + placement.height - 1) : 0;
  return dx + dy;
}

function setProbeAccess(engine: Engine, requirements: readonly (LifeAccessRequirement | undefined)[]): boolean {
  const flags = new Map<string, boolean>();
  const resources = new Map<string, number>();
  for (const requirement of requirements) {
    if (!requirement) continue;
    if (requirement.kind === 'flag') {
      const prior = flags.get(requirement.id);
      if (prior !== undefined && prior !== requirement.equals) return false;
      flags.set(requirement.id, requirement.equals);
    } else resources.set(requirement.id, Math.max(resources.get(requirement.id) ?? Number.NEGATIVE_INFINITY, requirement.value));
  }
  for (const [id, active] of flags) {
    let found = false;
    for (const [entityId] of engine.world.query('Flag')) {
      const flag = engine.world.getComponent<Flag>(entityId, 'Flag');
      if (flag?.id !== id) continue;
      engine.world.addComponent(entityId, { ...flag, active } as Flag);
      found = true;
      break;
    }
    if (!found) return false;
  }
  for (const [id, minimum] of resources) {
    let found = false;
    for (const [entityId] of engine.world.query('Resource')) {
      const resource = engine.world.getComponent<Resource>(entityId, 'Resource');
      if (resource?.id !== id) continue;
      if (minimum > resource.max) return false;
      engine.world.addComponent(entityId, { ...resource, current: Math.max(resource.current, minimum) } as Resource);
      found = true;
      break;
    }
    if (!found) return false;
  }
  return true;
}

function constructionAffordanceAvailable(
  blueprint: Parameters<Engine['load']>[0],
  project: NonNullable<LifeGamePackage['constructionProjects']>[number],
  placement: RuntimeLifePlacement,
  zoneRequires: LifeAccessRequirement | undefined,
  x: number,
  y: number,
): boolean {
  const engine = new Engine();
  engine.load(blueprint);
  if (!setProbeAccess(engine, [placement.requires, project.requires, zoneRequires])) return false;
  const inventory = engine.world.getComponent<Inventory>('life:player', 'Inventory');
  const position = engine.world.getComponent<LifePosition>('life:player', 'LifePosition');
  const transform = engine.world.getComponent<Transform>('life:player', 'Transform');
  const motion = engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion');
  if (!inventory || !position || !transform || !motion) return false;
  engine.world.addComponent('life:player', {
    ...inventory,
    slots: Math.max(inventory.slots, project.materials.length),
    maxStack: Math.max(inventory.maxStack, ...project.materials.map((entry) => entry.count)),
    items: project.materials.map((entry) => ({ kind: entry.itemId, count: entry.count })),
  } as Inventory);
  engine.world.addComponent('life:player', { ...position, sceneId: placement.sceneId, x, y } as LifePosition);
  engine.world.addComponent('life:player', { ...transform, x, y } as Transform);
  engine.world.addComponent('life:player', { ...motion, sceneId: placement.sceneId, up: false, down: false, left: false, right: false } as LifeContinuousMotion);
  engine.world.tick();
  engine.world.tick();
  const context = engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext');
  return context?.nearbyPlacementIds.includes(project.placementId) === true
    && context.allowedActions.includes('build')
    && context.affordances.some((entry) => entry.action === 'build' && entry.targetId === project.placementId && entry.available);
}

/** Authoring-only reachability contract for fixed-site construction. */
function validateConstructionReachability(pkg: LifeGamePackage, blueprint: Parameters<Engine['load']>[0], round: number): LifeGenerationDiagnostic[] {
  const out: LifeGenerationDiagnostic[] = [];
  const catalog = Object.keys(pkg.tileCatalog).sort().map((tileId) => ({ tileId, tags: [...pkg.tileCatalog[tileId]!.tags] }));
  const placements = new Map<string, { scene: LifeGamePackage['scenes'][number]; authored: LifeGamePackage['scenes'][number]['placements'][number]; placement: RuntimeLifePlacement }>();
  for (const scene of pkg.scenes) for (const authored of scene.placements) placements.set(authored.id, {
    scene,
    authored,
    placement: {
      type: 'LifePlacement', sceneId: scene.id, placementId: authored.id, kind: authored.kind,
      x: authored.x, y: authored.y, width: authored.width, height: authored.height,
      prefabRef: authored.prefabRef, skinKey: authored.skinKey,
      interactionRange: authored.interactionRange ?? pkg.interaction?.nearbyRange ?? 1,
      ...(authored.requires ? { requires: authored.requires } : {}),
    },
  });
  for (let index = 0; index < (pkg.constructionProjects?.length ?? 0); index++) {
    const project = pkg.constructionProjects![index]!;
    const found = placements.get(project.placementId);
    if (!found) continue; // The strict Life schema already emits the canonical reference diagnostic.
    const { scene, authored, placement } = found;
    const path = `/game/lifePackage/constructionProjects/${index}/placementId`;
    if (authored.schedule !== undefined) {
      out.push({ path, code: 'construction_placement_not_fixed', message: `construction project ${project.id} must reference a fixed placement without a schedule`, severity: 'error', source: 'world', round });
      continue;
    }
    const buildZones = scene.zones.filter((zone) => zone.allowedActions.includes('build'));
    if (buildZones.length === 0) {
      out.push({ path, code: 'construction_build_zone_missing', message: `construction placement ${project.placementId} has no build-enabled zone in scene ${scene.id}`, severity: 'error', source: 'world', round });
      continue;
    }
    const range = placement.interactionRange;
    const candidates: Array<{ x: number; y: number; requires?: LifeAccessRequirement }> = [];
    for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
      if (placementDistance(x, y, placement) > range || !isLifeWalkable(scene.layers, catalog, scene.width, x, y)) continue;
      for (const zone of buildZones) if (pointInRect(x, y, zone.rect)) candidates.push({ x, y, ...(zone.requires ? { requires: zone.requires } : {}) });
    }
    if (candidates.length === 0) {
      out.push({ path, code: 'construction_build_zone_unreachable', message: `construction placement ${project.placementId} has no walkable build-enabled cell within interaction range ${range}`, severity: 'error', source: 'world', round });
      continue;
    }
    if (!candidates.some((candidate) => constructionAffordanceAvailable(blueprint, project, placement, candidate.requires, candidate.x, candidate.y))) {
      out.push({ path, code: 'construction_affordance_unavailable', message: `construction placement ${project.placementId} cannot project an available build affordance at any legal interaction cell`, severity: 'error', source: 'runtime', round });
    }
  }
  return stableDiagnostics(out);
}

export function buildLifeMaterializationPlan(bundle: LifeGenerationBundleV1): LifeMaterializationPlan {
  const slug = bundle.game.slug;
  const descriptors: Array<Omit<LifeMaterializationPlanEntry, 'contentHash'> & { content: unknown }> = [
    { path: `games/${slug}/life.json`, action: 'create', owner: 'life-authoring', content: bundle.game.lifePackage },
    { path: `games/${slug}/asset-slots.json`, action: 'create', owner: 'life-authoring', content: bundle.assetSlots.draft },
    { path: `games/${slug}/game.ts`, action: 'template', owner: 'host-template', content: { template: 'life-host.v1', slug } },
    { path: `src/launcher/game-runner.tsx`, action: 'handoff', owner: 'launcher', content: { registration: slug, mode: 'manual-reviewed' } },
    { path: `public/games/${slug}/art/index.json`, action: 'handoff', owner: 'asset-manager', content: { source: `games/${slug}/asset-slots.json`, approvalRequired: true } },
  ];
  return { mode: 'dry-run', writesPerformed: false, entries: descriptors.map(({ content, ...entry }) => ({ ...entry, contentHash: sha256Canonical(content) })) };
}

function buildWorldVisualReview(life: LifeGamePackage, manifest: AssetSlotManifest): LifeWorldVisualReview {
  const slotByKey = new Map(manifest.slots.map((slot) => [slot.assetKey, slot]));
  const slotFields = (key: string): Partial<Pick<LifeSurfaceVisualReviewRow, 'assetSlotId' | 'candidateStatus' | 'size' | 'anchor'>> => {
    const slot = slotByKey.get(key);
    return slot ? {
      assetSlotId: slot.slotId,
      candidateStatus: slot.governance.approval,
      size: `${slot.render.display.width}x${slot.render.display.height}${slot.render.display.unit}`,
      anchor: `${slot.render.anchor.x},${slot.render.anchor.y}`,
    } : {};
  };
  const warps: LifeWarpVisualReviewRow[] = [];
  for (const scene of life.scenes) for (const warp of scene.warps) {
    const landmark = scene.placements.find((placement) => placement.id === warp.landmarkPlacementId);
    const distance = landmark ? placementDistance(warp.at.x, warp.at.y, landmark) : Number.POSITIVE_INFINITY;
    const key = landmark?.skinKey;
    const slot = key ? slotByKey.get(key) : undefined;
    warps.push({
      sceneId: scene.id, warpId: warp.id, landmarkPlacementId: warp.landmarkPlacementId ?? '', destination: warp.label ?? '',
      relation: distance === 0 ? 'overlap' : distance === 1 ? 'adjacent' : 'invalid',
      ...(key ? { assetKey: key } : {}), ...(slot ? { assetSlotId: slot.slotId, candidateStatus: slot.governance.approval, anchor: `${slot.render.anchor.x},${slot.render.anchor.y}` } : {}),
      mapLocation: `${scene.id}@${warp.at.x},${warp.at.y}`,
      size: landmark ? `${landmark.width}x${landmark.height}cell` : 'missing',
    });
  }
  const locationsByTile = new Map<string, string[]>();
  for (const scene of life.scenes) {
    const ground = scene.layers.find((layer) => layer.name === 'ground'); let cell = 0;
    for (const run of ground?.tiles ?? []) {
      const locations = locationsByTile.get(run.tileId) ?? [];
      for (let i = 0; i < run.count; i++, cell++) locations.push(`${scene.id}@${cell % scene.width},${Math.floor(cell / scene.width)}`);
      locationsByTile.set(run.tileId, locations);
    }
  }
  const surfaces: LifeSurfaceVisualReviewRow[] = [];
  const addSurface = (state: string, actions: readonly string[], key: string | undefined, mapLocations: readonly string[]): void => {
    if (key) surfaces.push({ state, actions, assetKey: key, mapLocations, ...slotFields(key) });
  };
  for (const [tileId, definition] of Object.entries(life.tileCatalog).sort(([a], [b]) => a.localeCompare(b))) {
    const surface = definition.visual?.surface;
    if (!surface) continue;
    const actions = surface === 'plantable' ? ['till'] : surface === 'water' ? ['fish'] : surface === 'forage' ? ['forage'] : surface === 'mineable' ? ['mine'] : [];
    addSurface(`tile:${tileId}:${surface}`, actions, definition.visual?.skinKey, locationsByTile.get(tileId) ?? []);
  }
  const farmLocations = life.scenes.flatMap((scene) => scene.zones.filter((zone) => zone.kind === 'farm').map((zone) => `${scene.id}@${zone.rect.x},${zone.rect.y}+${zone.rect.width}x${zone.rect.height}`));
  addSurface('farm:tilled-dry', ['water'], life.visualSemantics?.farm.tilledDrySkinKey, farmLocations);
  addSurface('farm:watered', ['plant'], life.visualSemantics?.farm.wateredSkinKey, farmLocations);
  for (const crop of life.cropCatalog ?? []) {
    addSurface(`crop:${crop.id}:seeded`, [], crop.visual?.seededSkinKey, farmLocations);
    addSurface(`crop:${crop.id}:growing`, [], crop.visual?.growingSkinKey, farmLocations);
    addSurface(`crop:${crop.id}:mature`, ['harvest'], crop.visual?.matureSkinKey, farmLocations);
  }
  return { warps, surfaces };
}

export function checkLifeGenerationBundle(raw: unknown): LifeGenerationCheckResult {
  const diagnostics = validateEnvelope(raw);
  if (diagnostics.some((entry) => entry.severity === 'error')) return { ok: false, diagnostics };
  const bundle = raw as LifeGenerationBundleV1;
  const round = bundle.session.round;
  const add = (path: string, code: string, message: string, source: LifeGenerationSource, severity: 'error' | 'warning' = 'error'): void => {
    diagnostics.push({ path, code, message, severity, source, round });
  };
  const canonicalHash = sha256Canonical(lifeGenerationPayload(bundle));
  if (bundle.provenance.baseHash !== canonicalHash) add('/provenance/baseHash', 'base_hash_mismatch', 'baseHash does not match canonical game + assetSlots payload', 'bundle');
  const expectedSources = {
    lifePackage: sha256Canonical(bundle.game.lifePackage),
    assetSlotsDraft: sha256Canonical(bundle.assetSlots.draft),
  };
  for (const key of Object.keys(expectedSources) as Array<keyof typeof expectedSources>) if (bundle.provenance.sourceHashes[key] !== expectedSources[key]) add(`/provenance/sourceHashes/${key}`, 'source_hash_mismatch', `does not match canonical ${key}`, 'bundle');

  const life = validateLifeGamePackage(bundle.game.lifePackage);
  if (lifePackageViewportProfileId(bundle.game.lifePackage) !== LIFE_VIEWPORT_PROFILE_ID) {
    add('/game/lifePackage/camera/profile', 'viewport_profile_required', `generated Life packages must select ${LIFE_VIEWPORT_PROFILE_ID}`, 'world');
  }
  for (const issue of life.issues) {
    const path = lifePathToPointer(issue.path);
    add(path, `life_${issue.code}`, issue.message, sourceForLifePath(path));
  }
  if (life.ok) for (const issue of validateLifeWorldVisualSemantics(bundle.game.lifePackage as LifeGamePackage).issues) {
    add(`/game/lifePackage${issue.path}`, issue.code, issue.message, 'world');
  }
  diagnostics.push(...validateAssetDraft(bundle));
  let runtimeHash: string | undefined;
  if (life.ok) {
    try {
      const parsed = compileAndParseLifeGamePackage(bundle.game.lifePackage);
      diagnostics.push(...validateConstructionReachability(bundle.game.lifePackage as LifeGamePackage, parsed.blueprint, round));
      for (const warning of parsed.warnings) add('/game/lifePackage', 'compile_warning', warning, 'compile', 'warning');
      const graph = analyzeSystemGraph(parsed.blueprint.capabilities);
      for (const duplicate of graph.duplicateIds) add('/game/lifePackage', 'system_duplicate', `${duplicate.id}: ${duplicate.caps.join(',')}`, 'compile');
      // A Life package loads a capability subset; many registered systems intentionally name
      // optional peers that are absent from that subset. Preserve the graph evidence, but let
      // the real strict two-tick sort below decide whether the loaded subset is invalid.
      for (const dangling of graph.danglingEdges) add('/game/lifePackage', 'system_dangling', `${dangling.system}.${dangling.kind} -> ${dangling.ref}`, 'compile', 'warning');
      for (const scc of graph.sccs) add('/game/lifePackage', 'system_cycle', `phase ${scc.phase}: ${scc.systems.map((entry) => entry.id).join(' -> ')}`, 'compile', 'warning');
      const engine = new Engine();
      engine.load(parsed.blueprint);
      engine.world.tick(); engine.world.tick();
      const snapshot = engine.world.snapshot(); const order = engine.world.snapshotOrder();
      runtimeHash = hashWithOrder(snapshot, order);
      engine.world.restore(snapshot, order);
      if (hashWithOrder(engine.world.snapshot(), engine.world.snapshotOrder()) !== runtimeHash) add('/game/lifePackage', 'restore_hash_mismatch', 'snapshot/order restore changed the deterministic hash', 'runtime');
    } catch (error) {
      add('/game/lifePackage', 'compile_or_runtime', error instanceof Error ? error.message : String(error), 'runtime');
    }
  }
  const ordered = stableDiagnostics(diagnostics);
  const ok = !ordered.some((entry) => entry.severity === 'error');
  const worldVisualReview = life.ok ? buildWorldVisualReview(bundle.game.lifePackage as LifeGamePackage, bundle.assetSlots.draft) : undefined;
  return { ok, diagnostics: ordered, canonicalHash, ...(runtimeHash ? { runtimeHash } : {}), ...(worldVisualReview ? { worldVisualReview } : {}), ...(ok ? { plan: buildLifeMaterializationPlan(bundle) } : {}) };
}

function ids(raw: unknown, key: string): string[] {
  return Array.isArray(raw) ? raw.flatMap((entry) => record(entry) && typeof entry[key] === 'string' ? [entry[key] as string] : []).sort() : [];
}

export function buildLifePromptPackets(bundle: LifeGenerationBundleV1): readonly LifePromptPacket[] {
  const life = record(bundle.game.lifePackage) ? bundle.game.lifePackage : {};
  const scenes = Array.isArray(life.scenes) ? life.scenes : [];
  const placements = scenes.flatMap((scene) => record(scene) && Array.isArray(scene.placements) ? scene.placements : []);
  const refs = {
    sceneIds: ids(scenes, 'id'),
    itemIds: ids(life.itemCatalog, 'id'),
    cropIds: ids(life.cropCatalog, 'id'),
    actorIds: ids(placements, 'id'),
    dialogueIds: ids(life.dialogueCatalog, 'id'),
    questIds: Array.isArray(life.quests) ? life.quests.flatMap((chapter) => record(chapter) ? ids(chapter.quests, 'id') : []).sort() : [],
    assetKeys: [...new Set(collectVisualReferences(life).map((entry) => entry.key))].sort(),
  };
  const forbidden = ['prose outside the JSON artifact', 'unknown fields', 'secrets or provider keys', 'absolute/URL/traversal paths', 'binary/base64 bytes', 'approved asset claims', 'runtime provenance'];
  const output = { oneOf: [
    { required: ['artifactKind', 'baseHash', 'document'], additionalProperties: false },
    { required: ['artifactKind', 'baseHash', 'patch'], additionalProperties: false, patchOps: ['add', 'remove', 'replace'] },
  ], baseHash: bundle.provenance.baseHash };
  const make = (packet: LifePromptPacket['packet'], artifactKind: LifePromptPacket['artifactKind'], allowlist: string[], references: Record<string, readonly string[]>, schema: Record<string, unknown>): LifePromptPacket => ({ packet, artifactKind, schema, allowlist, references, forbidden, output });
  return [
    make(0, 'contract', ['/schemaVersion', '/session', '/game', '/assetSlots', '/provenance'], { sessionId: [bundle.session.id], gameSlug: [bundle.game.slug] }, { type: 'object', closed: true, schemaVersion: LIFE_GENERATION_SCHEMA, promptContractVersion: LIFE_GENERATION_PROMPT_VERSION, maxRound: LIFE_GENERATION_MAX_ROUND }),
    make(1, 'world', ['/game/lifePackage/meta', '/game/lifePackage/world', '/game/lifePackage/visualSemantics', '/game/lifePackage/tileCatalog', '/game/lifePackage/scenes', '/game/lifePackage/camera', '/game/lifePackage/movement', '/game/lifePackage/interaction', '/game/lifePackage/constructionProjects'], { sceneIds: refs.sceneIds, assetKeys: refs.assetKeys }, { schemaRef: 'LifeGamePackage.v1', section: 'world', closed: true, requiresWorldVisualSemantics: true }),
    make(2, 'actors', ['/game/lifePackage/itemCatalog', '/game/lifePackage/playerInventory', '/game/lifePackage/cropCatalog', '/game/lifePackage/calendar', '/game/lifePackage/playerVisual', '/game/lifePackage/relationships'], { actorIds: refs.actorIds, itemIds: refs.itemIds, cropIds: refs.cropIds, dialogueIds: refs.dialogueIds }, { schemaRef: 'LifeGamePackage.v1', section: 'actors', closed: true }),
    make(3, 'plot', ['/game/lifePackage/logic', '/game/lifePackage/milestones', '/game/lifePackage/dialogueCatalog', '/game/lifePackage/quests'], { actorIds: refs.actorIds, itemIds: refs.itemIds, dialogueIds: refs.dialogueIds, questIds: refs.questIds }, { schemaRef: 'LifeGamePackage.v1', section: 'plot', closed: true }),
    make(4, 'asset-slots', ['/assetSlots/draft'], { assetKeys: refs.assetKeys, documents: ['life.json'] }, { schemaRef: 'AssetSlotManifest.v1', approval: 'placeholder', closed: true }),
  ];
}

function diffPointers(before: unknown, after: unknown, path = ''): string[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const out: string[] = [];
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i++) out.push(...diffPointers(before[i], after[i], `${path}/${i}`));
    return out;
  }
  if (record(before) && record(after)) {
    const out: string[] = [];
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) out.push(...diffPointers(before[key], after[key], `${path}/${pointerEscape(key)}`));
    return out;
  }
  return [path || ''];
}

export function validateLifeGenerationRepair(bundle: LifeGenerationBundleV1, repair: unknown, diagnosticPaths: readonly string[]): readonly LifeGenerationDiagnostic[] {
  const out: LifeGenerationDiagnostic[] = [];
  const add = (path: string, code: string, message: string): void => { out.push({ path, code, message, severity: 'error', source: 'repair', round: bundle.session.round }); };
  if (!record(repair)) return [{ path: '', code: 'repair_type', message: 'repair must be an object', severity: 'error', source: 'repair', round: bundle.session.round }];
  const kind = repair.artifactKind;
  const allowed = kind === 'life-generation-bundle' ? ['artifactKind', 'baseHash', 'document'] : kind === 'life-generation-patch' ? ['artifactKind', 'baseHash', 'patch'] : [];
  if (allowed.length === 0) add('/artifactKind', 'repair_kind', 'must be life-generation-bundle or life-generation-patch');
  for (const key of Object.keys(repair).sort()) if (!allowed.includes(key)) add(`/${pointerEscape(key)}`, 'repair_unknown', 'field is not allowed');
  if (repair.baseHash !== bundle.provenance.baseHash) add('/baseHash', 'repair_base_hash', 'must match the checked bundle baseHash');
  if (bundle.session.round >= LIFE_GENERATION_MAX_ROUND) add('/session/round', 'repair_round_limit', `no repairs are accepted at round ${LIFE_GENERATION_MAX_ROUND}`);
  const permitted = (path: string): boolean => diagnosticPaths.some((candidate) => path === candidate || path.startsWith(`${candidate}/`) || candidate.startsWith(`${path}/`));
  if (kind === 'life-generation-bundle') {
    if (!('document' in repair)) add('/document', 'repair_document', 'document is required');
    else for (const path of diffPointers(bundle, repair.document)) if (!permitted(path)) add(`/document${path}`, 'repair_scope', `change is outside diagnostic paths: ${path || '/'}`);
  }
  if (kind === 'life-generation-patch') {
    if (!Array.isArray(repair.patch) || repair.patch.length === 0 || repair.patch.length > 64) add('/patch', 'repair_patch', 'patch must contain 1..64 operations');
    else repair.patch.forEach((operation, index) => {
      if (!record(operation)) { add(`/patch/${index}`, 'repair_operation', 'operation must be an object'); return; }
      const op = operation.op; const keys = op === 'remove' ? ['op', 'path'] : ['op', 'path', 'value'];
      for (const key of Object.keys(operation).sort()) if (!keys.includes(key)) add(`/patch/${index}/${pointerEscape(key)}`, 'repair_unknown', 'field is not allowed');
      if (!['add', 'remove', 'replace'].includes(String(op))) add(`/patch/${index}/op`, 'repair_op', 'must be add|remove|replace');
      if (typeof operation.path !== 'string' || !operation.path.startsWith('/') || operation.path.includes('..')) add(`/patch/${index}/path`, 'repair_path', 'must be an absolute JSON pointer without traversal');
      else if (!permitted(operation.path)) add(`/patch/${index}/path`, 'repair_scope', 'path is outside this round diagnostic paths');
      if (op !== 'remove' && !('value' in operation)) add(`/patch/${index}/value`, 'repair_value', 'value is required');
    });
  }
  return stableDiagnostics(out);
}
