import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
  type BigIntStats,
  type Stats,
} from 'node:fs';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import {
  canonicalLifeGenerationJson,
  checkLifeGenerationBundle,
  sha256Canonical,
  type LifeGenerationBundleV1,
} from './life-generation-bundle.js';
import { parseLifeHostDescriptor, type LifeHostDescriptorV1 } from './life-host-descriptor-core.js';
import { LIFE_VIEWPORT_PROFILE_ID, lifePackageViewportProfileId } from '../engine/protocol/life-viewport-profile.js';
import {
  discoverLifeLauncherCatalog,
  parseLifeLauncherEntry,
  type LifeLauncherEntryV1,
} from '../launcher/life-launcher-catalog-core.js';

export const LIFE_MATERIALIZATION_PLAN_SCHEMA = 'zerocraft.life-materialization-plan.v1' as const;
export const LIFE_FORMAL_FILES_HASH_SCHEMA = 'zerocraft.life-formal-files-hash.v1' as const;
export const LIFE_MATERIALIZATION_FILES = [
  'life.json',
  'asset-slots.json',
  'life-host.json',
  'life-launcher.json',
] as const;

export interface LifeMaterializationInputs {
  readonly bundle: unknown;
  readonly descriptor: unknown;
  readonly entry: unknown;
}

export interface LifeMaterializationDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface LifeMaterializationFilePlan {
  readonly path: string;
  readonly contentHash: string;
  readonly bytes: number;
}

export interface LifeAuthoringMaterializationPlan {
  readonly schema: typeof LIFE_MATERIALIZATION_PLAN_SCHEMA;
  readonly mode: 'plan';
  readonly writesPerformed: false;
  readonly slug: string;
  readonly inputHashes: {
    readonly bundle: string;
    readonly descriptor: string;
    readonly entry: string;
  };
  readonly gates: readonly ['bundle-valid', 'placeholder-assets', 'identity-closed', 'launcher-discovery'];
  readonly conflicts: readonly LifeMaterializationDiagnostic[];
  readonly files: readonly LifeMaterializationFilePlan[];
  readonly filesHash: string;
  readonly confirmationHash: string;
}

export interface LifeFormalUpdatePlan extends Omit<LifeAuthoringMaterializationPlan, 'mode'> {
  readonly mode: 'plan-update';
  readonly targetDirectory: string;
  readonly currentFilesHash: string;
}

export interface LifeAuthoringApplyResult {
  readonly schema: typeof LIFE_MATERIALIZATION_PLAN_SCHEMA;
  readonly mode: 'apply-authoring';
  readonly slug: string;
  readonly confirmationHash: string;
  readonly targetDirectory: string;
  readonly writesPerformed: boolean;
  readonly writtenFiles: 0 | 4;
  readonly files: readonly LifeMaterializationFilePlan[];
  readonly filesHash: string;
}

export interface LifePromotionResult {
  readonly schema: typeof LIFE_MATERIALIZATION_PLAN_SCHEMA;
  readonly mode: 'promote';
  readonly slug: string;
  readonly confirmationHash: string;
  readonly targetDirectory: string;
  readonly writesPerformed: boolean;
  readonly writtenFiles: 0 | 4;
  readonly files: readonly LifeMaterializationFilePlan[];
  readonly filesHash: string;
}

export interface LifeFormalUpdateResult {
  readonly schema: typeof LIFE_MATERIALIZATION_PLAN_SCHEMA;
  readonly mode: 'update';
  readonly slug: string;
  readonly confirmationHash: string;
  readonly previousFilesHash: string;
  readonly filesHash: string;
  readonly targetDirectory: string;
  readonly writesPerformed: boolean;
  readonly writtenFiles: 0 | 4;
  readonly files: readonly LifeMaterializationFilePlan[];
}

export interface LifeMaterializerHooks {
  /** Test-only fault injection. Production callers leave hooks undefined. */
  readonly beforeWrite?: (absolutePath: string, index: number) => void;
  /** Test-only fault injection immediately before the one atomic directory rename. */
  readonly beforeRename?: (stagingDirectory: string, targetDirectory: string) => void;
  /** Test-only fault injection after rename, before strict post-write verification. */
  readonly afterRename?: (targetDirectory: string) => void;
  /** Test-only fault injection after the old formal directory moved to rollback storage. */
  readonly afterCurrentMoved?: (targetDirectory: string, rollbackDirectory: string) => void;
}

interface CheckedMaterialization {
  readonly slug: string;
  readonly bundle: LifeGenerationBundleV1;
  readonly descriptor: LifeHostDescriptorV1;
  readonly entry: LifeLauncherEntryV1;
  readonly contents: Readonly<Record<(typeof LIFE_MATERIALIZATION_FILES)[number], string>>;
  readonly plan: LifeAuthoringMaterializationPlan;
}

export class LifeMaterializationError extends Error {
  readonly diagnostics: readonly LifeMaterializationDiagnostic[];

  constructor(diagnostics: readonly LifeMaterializationDiagnostic[]) {
    const ordered = stableDiagnostics(diagnostics);
    super(ordered.map((issue) => `${issue.path || '/'} [${issue.code}] ${issue.message}`).join('; '));
    this.name = 'LifeMaterializationError';
    this.diagnostics = ordered;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function stableDiagnostics(values: readonly LifeMaterializationDiagnostic[]): LifeMaterializationDiagnostic[] {
  return [...values].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
}

function bytesHash(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function canonicalFile(value: unknown): string {
  return `${canonicalLifeGenerationJson(value)}\n`;
}

function formalFilesHash(slug: string, contents: Readonly<Record<(typeof LIFE_MATERIALIZATION_FILES)[number], string>>): string {
  return sha256Canonical({
    schema: LIFE_FORMAL_FILES_HASH_SCHEMA,
    slug,
    files: LIFE_MATERIALIZATION_FILES.map((name) => ({ name, contentHash: bytesHash(contents[name]), bytes: Buffer.byteLength(contents[name], 'utf8') })),
  });
}

function launcherMaps(slug: string, entry: unknown, descriptor: unknown, lifePackage: unknown, assetSlots: unknown) {
  const root = `../../games/${slug}`;
  return {
    entries: { [`${root}/life-launcher.json`]: entry },
    hosts: { [`${root}/life-host.json`]: descriptor },
    packages: { [`${root}/life.json`]: lifePackage },
    slots: { [`${root}/asset-slots.json`]: assetSlots },
  };
}

function validateInputs(inputs: LifeMaterializationInputs): CheckedMaterialization {
  const diagnostics: LifeMaterializationDiagnostic[] = [];
  const checkedBundle = checkLifeGenerationBundle(inputs.bundle);
  for (const issue of checkedBundle.diagnostics) if (issue.severity === 'error') {
    diagnostics.push({ path: `/bundle${issue.path}`, code: `bundle_${issue.code}`, message: issue.message });
  }

  let descriptor: LifeHostDescriptorV1 | undefined;
  try { descriptor = parseLifeHostDescriptor(inputs.descriptor); }
  catch (error) {
    diagnostics.push({ path: '/descriptor', code: 'invalid_descriptor', message: error instanceof Error ? error.message : String(error) });
  }

  const parsedEntry = parseLifeLauncherEntry(inputs.entry);
  for (const issue of parsedEntry.diagnostics) diagnostics.push({ path: `/entry${issue.path}`, code: `entry_${issue.code}`, message: issue.message });

  if (!checkedBundle.ok || !isRecord(inputs.bundle) || !isRecord(inputs.bundle.game)) {
    throw new LifeMaterializationError(diagnostics.length > 0 ? diagnostics : [{ path: '/bundle', code: 'invalid_bundle', message: 'bundle failed strict validation' }]);
  }
  const bundle = inputs.bundle as unknown as LifeGenerationBundleV1;
  const entry = parsedEntry.entry;
  if (!descriptor || !entry) throw new LifeMaterializationError(diagnostics);
  const slug = bundle.game.slug;
  const packageId = isRecord(bundle.game.lifePackage) && isRecord(bundle.game.lifePackage.meta) ? bundle.game.lifePackage.meta.id : undefined;
  const identities: Array<[string, unknown]> = [
    ['/descriptor/slug', descriptor.slug],
    ['/descriptor/artSlug', descriptor.artSlug],
    ['/descriptor/save/namespace', descriptor.save.namespace],
    ['/entry/id', entry.id],
    ['/bundle/game/lifePackage/meta/id', packageId],
    ['/bundle/assetSlots/draft/game', bundle.assetSlots.draft.game],
  ];
  const expectedNamespace = `life:${slug}:v1`;
  for (const [path, value] of identities) {
    const expected = path.endsWith('/namespace') ? expectedNamespace : slug;
    if (value !== expected) diagnostics.push({ path, code: 'identity_mismatch', message: `must equal ${expected}` });
  }
  const packageViewportProfile = lifePackageViewportProfileId(bundle.game.lifePackage);
  if (packageViewportProfile !== descriptor.viewport.profile) {
    diagnostics.push({ path: '/bundle/game/lifePackage/camera/profile', code: 'viewport_profile_mismatch', message: `must equal descriptor viewport profile ${descriptor.viewport.profile}` });
  }

  const maps = launcherMaps(slug, entry, descriptor, bundle.game.lifePackage, bundle.assetSlots.draft);
  const catalog = discoverLifeLauncherCatalog(maps.entries, maps.hosts, maps.packages, maps.slots);
  if (catalog.items.length !== 1 || catalog.items[0]?.bundle === undefined || catalog.items[0].diagnostics.length > 0) {
    const catalogIssues = catalog.items[0]?.diagnostics ?? [];
    if (catalogIssues.length === 0) diagnostics.push({ path: '/discovery', code: 'launcher_discovery', message: 'strict launcher discovery did not produce exactly one runnable item' });
    else for (const issue of catalogIssues) diagnostics.push({ path: `/discovery${issue.path}`, code: `launcher_${issue.code}`, message: issue.message });
  }
  if (diagnostics.length > 0) throw new LifeMaterializationError(diagnostics);

  const contents = {
    'life.json': canonicalFile(bundle.game.lifePackage),
    'asset-slots.json': canonicalFile(bundle.assetSlots.draft),
    'life-host.json': canonicalFile(descriptor),
    'life-launcher.json': canonicalFile(entry),
  } as const;
  const files = LIFE_MATERIALIZATION_FILES.map((name): LifeMaterializationFilePlan => ({
    path: `games/${slug}/${name}`,
    contentHash: bytesHash(contents[name]),
    bytes: Buffer.byteLength(contents[name], 'utf8'),
  }));
  const inputHashes = {
    bundle: sha256Canonical(bundle),
    descriptor: sha256Canonical(descriptor),
    entry: sha256Canonical(entry),
  };
  const filesHash = formalFilesHash(slug, contents);
  const confirmationHash = sha256Canonical({
    schema: LIFE_MATERIALIZATION_PLAN_SCHEMA,
    slug,
    inputHashes,
    files,
    filesHash,
    gates: ['bundle-valid', 'placeholder-assets', 'identity-closed', 'launcher-discovery'],
  });
  const plan: LifeAuthoringMaterializationPlan = {
    schema: LIFE_MATERIALIZATION_PLAN_SCHEMA,
    mode: 'plan',
    writesPerformed: false,
    slug,
    inputHashes,
    gates: ['bundle-valid', 'placeholder-assets', 'identity-closed', 'launcher-discovery'],
    conflicts: [],
    files,
    filesHash,
    confirmationHash,
  };
  return { slug, bundle, descriptor, entry, contents, plan };
}

export function buildLifeAuthoringMaterializationPlan(inputs: LifeMaterializationInputs): LifeAuthoringMaterializationPlan {
  return validateInputs(inputs).plan;
}

function pathEquals(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function assertSafeRoot(targetRoot: string, protectedWorkspaceRoot: string): string {
  if (!isAbsolute(targetRoot)) throw new LifeMaterializationError([{ path: '/target-root', code: 'absolute_required', message: 'target root must be absolute' }]);
  const resolved = resolve(targetRoot);
  if (!existsSync(resolved)) throw new LifeMaterializationError([{ path: '/target-root', code: 'missing_root', message: 'target root must already exist' }]);
  const stat = lstatSync(resolved);
  if (stat.isSymbolicLink()) throw new LifeMaterializationError([{ path: '/target-root', code: 'symlink_root', message: 'symbolic-link target roots are forbidden' }]);
  if (!stat.isDirectory()) throw new LifeMaterializationError([{ path: '/target-root', code: 'not_directory', message: 'target root must be a directory' }]);
  const real = realpathSync(resolved);
  if (!pathEquals(real, resolved)) throw new LifeMaterializationError([{ path: '/target-root', code: 'noncanonical_root', message: 'target root must equal its real path' }]);
  if (pathEquals(real, parse(real).root)) throw new LifeMaterializationError([{ path: '/target-root', code: 'filesystem_root', message: 'filesystem roots are forbidden' }]);
  const workspace = realpathSync(resolve(protectedWorkspaceRoot));
  if (isInside(workspace, real) || isInside(real, workspace)) {
    throw new LifeMaterializationError([{ path: '/target-root', code: 'workspace_forbidden', message: 'workspace roots and their ancestors or descendants are forbidden' }]);
  }
  return real;
}

function assertPlainDirectory(path: string, diagnosticPath: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new LifeMaterializationError([{ path: diagnosticPath, code: 'unsafe_directory', message: 'must be a real directory, not a file or symbolic link' }]);
  }
  if (!pathEquals(realpathSync(path), resolve(path))) {
    throw new LifeMaterializationError([{ path: diagnosticPath, code: 'noncanonical_directory', message: 'directory must remain inside its canonical target path' }]);
  }
}

function lstatIfPresent(path: string): Stats | undefined {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

interface FsEntryIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

function fsEntryIdentity(stat: BigIntStats): FsEntryIdentity {
  return { dev: stat.dev, ino: stat.ino };
}

function sameFsEntry(left: FsEntryIdentity, right: FsEntryIdentity): boolean {
  // Some filesystems expose no stable identity. In that case rollback must
  // preserve the path rather than risk deleting an entry created by a racer.
  if ((left.dev === 0n && left.ino === 0n) || (right.dev === 0n && right.ino === 0n)) return false;
  return left.dev === right.dev && left.ino === right.ino;
}

function pathStillNamesDirectory(path: string, identity: FsEntryIdentity): boolean {
  try {
    const stat = lstatSync(path, { bigint: true });
    return !stat.isSymbolicLink() && stat.isDirectory() && sameFsEntry(fsEntryIdentity(stat), identity);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertPromotionWorkspaceRoot(workspaceRoot: string): string {
  if (!isAbsolute(workspaceRoot)) {
    throw new LifeMaterializationError([{ path: '/workspace-root', code: 'absolute_required', message: 'workspace root must be absolute' }]);
  }
  const resolved = resolve(workspaceRoot);
  const stat = lstatIfPresent(resolved);
  if (!stat) throw new LifeMaterializationError([{ path: '/workspace-root', code: 'missing_root', message: 'workspace root must already exist' }]);
  if (stat.isSymbolicLink()) throw new LifeMaterializationError([{ path: '/workspace-root', code: 'symlink_root', message: 'symbolic-link workspace roots are forbidden' }]);
  if (!stat.isDirectory()) throw new LifeMaterializationError([{ path: '/workspace-root', code: 'not_directory', message: 'workspace root must be a directory' }]);
  const real = realpathSync(resolved);
  if (!pathEquals(real, resolved)) throw new LifeMaterializationError([{ path: '/workspace-root', code: 'noncanonical_root', message: 'workspace root must equal its real path' }]);
  if (pathEquals(real, parse(real).root)) throw new LifeMaterializationError([{ path: '/workspace-root', code: 'filesystem_root', message: 'filesystem roots are forbidden' }]);
  return real;
}

function assertPromotionDirectory(path: string, diagnosticPath: string, parent: string): string {
  const stat = lstatIfPresent(path);
  if (!stat) throw new LifeMaterializationError([{ path: diagnosticPath, code: 'missing_directory', message: 'directory must already exist' }]);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new LifeMaterializationError([{ path: diagnosticPath, code: 'unsafe_directory', message: 'must be a real directory, not a file or symbolic link' }]);
  }
  const resolved = resolve(path);
  const real = realpathSync(resolved);
  if (!pathEquals(real, resolved) || !isInside(parent, real)) {
    throw new LifeMaterializationError([{ path: diagnosticPath, code: 'noncanonical_directory', message: 'directory must remain inside its canonical parent path' }]);
  }
  return real;
}

function assertPromotionTargetIfPresent(targetDirectory: string, gamesRoot: string): boolean {
  const stat = lstatIfPresent(targetDirectory);
  if (!stat) return false;
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new LifeMaterializationError([{ path: '/target/game', code: 'unsafe_directory', message: 'must be a real directory, not a file or symbolic link' }]);
  }
  const resolved = resolve(targetDirectory);
  const real = realpathSync(resolved);
  if (!pathEquals(real, resolved) || !isInside(gamesRoot, real)) {
    throw new LifeMaterializationError([{ path: '/target/game', code: 'noncanonical_directory', message: 'target must remain inside the canonical games directory' }]);
  }
  return true;
}

interface FormalTargetState {
  readonly identity: FsEntryIdentity;
  readonly contents: Readonly<Record<(typeof LIFE_MATERIALIZATION_FILES)[number], string>>;
  readonly filesHash: string;
}

const LEGACY_HOST_VIEWPORT_KEYS = ['bottomBarH', 'cameraFit', 'cellSize', 'fieldH', 'fieldW', 'mode', 'topBarH'] as const;
const LEGACY_CAMERA_KEYS = ['follow', 'viewportHeightCells', 'viewportWidthCells'] as const;
const LEGACY_CAMERA_FOLLOW_KEYS = ['deadZone', 'marginCells', 'maxZoom', 'minZoom'] as const;
const LEGACY_DEAD_ZONE_KEYS = ['bottom', 'left', 'right', 'top'] as const;

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], required = allowed): boolean {
  const keys = Object.keys(value).sort();
  const allow = new Set(allowed);
  return keys.every((key) => allow.has(key)) && required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function finiteInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * One-way update bridge for already-materialized pre-profile groups. New inputs,
 * runtime discovery and authoring validators never pass through this bridge.
 * We normalize only the former closed viewport/camera shapes, then run current
 * strict discovery across every other byte before allowing an exact-hash swap.
 */
function normalizeLegacyFormalViewport(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw.viewport)) return raw;
  const viewport = raw.viewport;
  if (!hasOnlyKeys(viewport, LEGACY_HOST_VIEWPORT_KEYS, ['fieldW', 'fieldH', 'topBarH', 'cellSize', 'mode', 'cameraFit'])) return raw;
  if (!finiteInteger(viewport.fieldW, 320, 4096) || !finiteInteger(viewport.fieldH, 240, 2160)) return raw;
  if (!finiteInteger(viewport.topBarH, 0, 512) || !finiteInteger(viewport.bottomBarH ?? 0, 0, 512)) return raw;
  if ((viewport.topBarH as number) + ((viewport.bottomBarH as number | undefined) ?? 0) >= (viewport.fieldH as number)) return raw;
  if (!finiteInteger(viewport.cellSize, 8, 256) || viewport.mode !== 'responsive' || (viewport.cameraFit !== 'contain' && viewport.cameraFit !== 'cover')) return raw;
  return { ...raw, viewport: { profile: LIFE_VIEWPORT_PROFILE_ID } };
}

function normalizeLegacyFormalCamera(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw.camera)) return raw;
  const camera = raw.camera;
  if (!hasOnlyKeys(camera, LEGACY_CAMERA_KEYS) || !finiteInteger(camera.viewportWidthCells, 1, 256) || !finiteInteger(camera.viewportHeightCells, 1, 256)) return raw;
  if (!isRecord(camera.follow) || !hasOnlyKeys(camera.follow, LEGACY_CAMERA_FOLLOW_KEYS, ['marginCells', 'minZoom', 'maxZoom'])) return raw;
  const follow = camera.follow;
  if (!finiteInteger(follow.marginCells, 0, 64) || !finiteNumber(follow.minZoom, 0.05, 16) || !finiteNumber(follow.maxZoom, 0.05, 16) || follow.minZoom > follow.maxZoom) return raw;
  if (follow.deadZone !== undefined) {
    const deadZone = follow.deadZone;
    if (!isRecord(deadZone) || !hasOnlyKeys(deadZone, LEGACY_DEAD_ZONE_KEYS)) return raw;
    if (!LEGACY_DEAD_ZONE_KEYS.every((key) => finiteNumber(deadZone[key], 0, 0.49))) return raw;
  }
  return { ...raw, camera: { profile: LIFE_VIEWPORT_PROFILE_ID } };
}

function inspectFormalTarget(directory: string, slug: string): FormalTargetState {
  const actualNames = readdirSync(directory).sort();
  const expectedNames = [...LIFE_MATERIALIZATION_FILES].sort();
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new LifeMaterializationError([{ path: '/target', code: 'directory_conflict', message: 'formal target must contain exactly the four canonical Life files' }]);
  }
  const parsed: Record<string, unknown> = {};
  const contents = {} as Record<(typeof LIFE_MATERIALIZATION_FILES)[number], string>;
  for (const name of LIFE_MATERIALIZATION_FILES) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new LifeMaterializationError([{ path: `/target/${name}`, code: 'unsafe_file', message: 'must be a regular file, not a symbolic link' }]);
    const content = readFileSync(path, 'utf8');
    try { parsed[name] = JSON.parse(content) as unknown; }
    catch { throw new LifeMaterializationError([{ path: `/target/${name}`, code: 'invalid_json', message: 'formal file must contain valid JSON' }]); }
    if (canonicalFile(parsed[name]) !== content) {
      throw new LifeMaterializationError([{ path: `/target/${name}`, code: 'noncanonical_file', message: 'formal file bytes must equal canonical JSON plus one newline' }]);
    }
    contents[name] = content;
  }
  const discoveryDescriptor = normalizeLegacyFormalViewport(parsed['life-host.json']);
  const discoveryLifePackage = normalizeLegacyFormalCamera(parsed['life.json']);
  let descriptor: LifeHostDescriptorV1;
  try { descriptor = parseLifeHostDescriptor(discoveryDescriptor); }
  catch (error) { throw new LifeMaterializationError([{ path: '/target/life-host.json', code: 'invalid_descriptor', message: error instanceof Error ? error.message : String(error) }]); }
  const parsedEntry = parseLifeLauncherEntry(parsed['life-launcher.json']);
  if (!parsedEntry.entry || parsedEntry.diagnostics.length > 0) {
    throw new LifeMaterializationError(parsedEntry.diagnostics.map((issue) => ({ path: `/target/life-launcher.json${issue.path}`, code: `entry_${issue.code}`, message: issue.message })));
  }
  const packageId = isRecord(parsed['life.json']) && isRecord(parsed['life.json'].meta) ? parsed['life.json'].meta.id : undefined;
  const slotGame = isRecord(parsed['asset-slots.json']) ? parsed['asset-slots.json'].game : undefined;
  const identities: Array<[string, unknown, string]> = [
    ['/target/life-host.json/slug', descriptor.slug, slug],
    ['/target/life-host.json/artSlug', descriptor.artSlug, slug],
    ['/target/life-host.json/save/namespace', descriptor.save.namespace, `life:${slug}:v1`],
    ['/target/life-launcher.json/id', parsedEntry.entry.id, slug],
    ['/target/life.json/meta/id', packageId, slug],
    ['/target/asset-slots.json/game', slotGame, slug],
  ];
  const identityIssues = identities.filter(([, value, expected]) => value !== expected).map(([path, , expected]) => ({ path, code: 'identity_mismatch', message: `must equal ${expected}` }));
  if (identityIssues.length > 0) throw new LifeMaterializationError(identityIssues);
  const maps = launcherMaps(slug, parsedEntry.entry, descriptor, discoveryLifePackage, parsed['asset-slots.json']);
  const catalog = discoverLifeLauncherCatalog(maps.entries, maps.hosts, maps.packages, maps.slots);
  if (catalog.items.length !== 1 || catalog.items[0]?.bundle === undefined || catalog.items[0].diagnostics.length > 0) {
    const issues = catalog.items[0]?.diagnostics ?? [];
    throw new LifeMaterializationError(issues.length > 0
      ? issues.map((issue) => ({ path: `/target${issue.path}`, code: `launcher_${issue.code}`, message: issue.message }))
      : [{ path: '/target', code: 'launcher_discovery', message: 'formal target did not produce exactly one runnable item' }]);
  }
  return { identity: fsEntryIdentity(lstatSync(directory, { bigint: true })), contents, filesHash: formalFilesHash(slug, contents) };
}

/** Read-only update preflight: validates the new inputs and reports the exact current formal-group hash. */
export function buildLifeFormalUpdatePlan(
  inputs: LifeMaterializationInputs,
  options: { readonly workspaceRoot: string },
): LifeFormalUpdatePlan {
  const checked = validateInputs(inputs);
  const workspaceRoot = assertPromotionWorkspaceRoot(options.workspaceRoot);
  const gamesRoot = assertPromotionDirectory(join(workspaceRoot, 'games'), '/workspace-root/games', workspaceRoot);
  const targetDirectory = join(gamesRoot, checked.slug);
  if (!isInside(workspaceRoot, gamesRoot) || !isInside(gamesRoot, targetDirectory)) {
    throw new LifeMaterializationError([{ path: '/workspace-root', code: 'path_escape', message: 'computed target escaped the selected workspace' }]);
  }
  if (!assertPromotionTargetIfPresent(targetDirectory, gamesRoot)) {
    throw new LifeMaterializationError([{ path: '/target/game', code: 'missing_target', message: 'formal update requires an existing target; use promote for first publication' }]);
  }
  const current = inspectFormalTarget(targetDirectory, checked.slug);
  return { ...checked.plan, mode: 'plan-update', targetDirectory, currentFilesHash: current.filesHash };
}

function parseFiles(directory: string, checked: CheckedMaterialization): void {
  const actualNames = readdirSync(directory).sort();
  const expectedNames = [...LIFE_MATERIALIZATION_FILES].sort();
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new LifeMaterializationError([{ path: '/target', code: 'directory_conflict', message: 'target directory must contain exactly the four canonical Life files' }]);
  }
  const parsed: Record<string, unknown> = {};
  for (const name of LIFE_MATERIALIZATION_FILES) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new LifeMaterializationError([{ path: `/target/${name}`, code: 'unsafe_file', message: 'must be a regular file, not a symbolic link' }]);
    const content = readFileSync(path, 'utf8');
    if (content !== checked.contents[name]) throw new LifeMaterializationError([{ path: `/target/${name}`, code: 'content_conflict', message: 'existing bytes differ from the canonical plan' }]);
    try { parsed[name] = JSON.parse(content) as unknown; }
    catch { throw new LifeMaterializationError([{ path: `/target/${name}`, code: 'invalid_json', message: 'written canonical file could not be parsed' }]); }
  }
  const verified = validateInputs({
    bundle: {
      ...checked.bundle,
      game: { ...checked.bundle.game, lifePackage: parsed['life.json'] },
      assetSlots: { draft: parsed['asset-slots.json'] },
    },
    descriptor: parsed['life-host.json'],
    entry: parsed['life-launcher.json'],
  });
  if (verified.plan.confirmationHash !== checked.plan.confirmationHash) {
    throw new LifeMaterializationError([{ path: '/target', code: 'verification_hash', message: 'post-write parse/hash/discovery verification changed the confirmed plan' }]);
  }
}

export function applyLifeAuthoringMaterialization(
  inputs: LifeMaterializationInputs,
  options: {
    readonly targetRoot: string;
    readonly ownerConfirm: string;
    readonly protectedWorkspaceRoot?: string;
    readonly hooks?: LifeMaterializerHooks;
  },
): LifeAuthoringApplyResult {
  const checked = validateInputs(inputs);
  if (options.ownerConfirm !== checked.plan.confirmationHash) {
    throw new LifeMaterializationError([{ path: '/owner-confirm', code: 'confirmation_mismatch', message: 'must exactly equal the canonical plan confirmationHash' }]);
  }
  const root = assertSafeRoot(options.targetRoot, options.protectedWorkspaceRoot ?? process.cwd());
  const gamesRoot = join(root, 'games');
  const targetDirectory = join(gamesRoot, checked.slug);
  if (!isInside(root, gamesRoot) || !isInside(gamesRoot, targetDirectory)) {
    throw new LifeMaterializationError([{ path: '/target-root', code: 'path_escape', message: 'computed target escaped the selected root' }]);
  }
  assertPlainDirectory(gamesRoot, '/target/games');
  if (existsSync(targetDirectory)) {
    assertPlainDirectory(targetDirectory, '/target/game');
    parseFiles(targetDirectory, checked);
    return {
      schema: LIFE_MATERIALIZATION_PLAN_SCHEMA,
      mode: 'apply-authoring', slug: checked.slug, confirmationHash: checked.plan.confirmationHash,
      targetDirectory, writesPerformed: false, writtenFiles: 0, files: checked.plan.files, filesHash: checked.plan.filesHash,
    };
  }

  let madeGamesRoot = false;
  let stagingDirectory: string | undefined;
  let renamed = false;
  try {
    if (!existsSync(gamesRoot)) { mkdirSync(gamesRoot); madeGamesRoot = true; }
    assertPlainDirectory(gamesRoot, '/target/games');
    stagingDirectory = mkdtempSync(join(gamesRoot, `.${checked.slug}.stage-`));
    if (!isInside(gamesRoot, stagingDirectory)) throw new LifeMaterializationError([{ path: '/target', code: 'stage_escape', message: 'staging directory escaped games root' }]);
    for (let index = 0; index < LIFE_MATERIALIZATION_FILES.length; index++) {
      const name = LIFE_MATERIALIZATION_FILES[index]!;
      const filePath = join(stagingDirectory, name);
      options.hooks?.beforeWrite?.(filePath, index);
      writeFileSync(filePath, checked.contents[name], { encoding: 'utf8', flag: 'wx' });
    }
    parseFiles(stagingDirectory, checked);
    options.hooks?.beforeRename?.(stagingDirectory, targetDirectory);
    renameSync(stagingDirectory, targetDirectory);
    renamed = true;
    stagingDirectory = undefined;
    options.hooks?.afterRename?.(targetDirectory);
    parseFiles(targetDirectory, checked);
    return {
      schema: LIFE_MATERIALIZATION_PLAN_SCHEMA,
      mode: 'apply-authoring', slug: checked.slug, confirmationHash: checked.plan.confirmationHash,
      targetDirectory, writesPerformed: true, writtenFiles: 4, files: checked.plan.files, filesHash: checked.plan.filesHash,
    };
  } catch (error) {
    if (stagingDirectory && existsSync(stagingDirectory)) rmSync(stagingDirectory, { recursive: true, force: true });
    if (renamed && existsSync(targetDirectory)) rmSync(targetDirectory, { recursive: true, force: true });
    if (madeGamesRoot && existsSync(gamesRoot) && readdirSync(gamesRoot).length === 0) rmdirSync(gamesRoot);
    if (error instanceof LifeMaterializationError) throw error;
    throw new LifeMaterializationError([{ path: '/apply', code: 'io_failure', message: error instanceof Error ? error.message : String(error) }]);
  }
}

/**
 * Owner-only formal promotion into an explicitly selected workspace. This never
 * registers assets, launcher code, pipeline state, saves, databases, services,
 * Git state, or network resources; it publishes only the four canonical JSON files.
 */
export function promoteLifeAuthoringMaterialization(
  inputs: LifeMaterializationInputs,
  options: {
    readonly workspaceRoot: string;
    readonly ownerConfirm: string;
    readonly hooks?: LifeMaterializerHooks;
  },
): LifePromotionResult {
  const checked = validateInputs(inputs);
  // REQ-LIFE-FORMAL-PROMOTION: stale or mismatched M0 approval must fail before filesystem inspection.
  if (options.ownerConfirm !== checked.plan.confirmationHash) {
    throw new LifeMaterializationError([{ path: '/owner-confirm', code: 'confirmation_mismatch', message: 'must exactly equal the canonical plan confirmationHash' }]);
  }

  const workspaceRoot = assertPromotionWorkspaceRoot(options.workspaceRoot);
  const gamesRoot = assertPromotionDirectory(join(workspaceRoot, 'games'), '/workspace-root/games', workspaceRoot);
  const gamesRootIdentity = fsEntryIdentity(lstatSync(gamesRoot, { bigint: true }));
  const targetDirectory = join(gamesRoot, checked.slug);
  if (!isInside(workspaceRoot, gamesRoot) || !isInside(gamesRoot, targetDirectory)) {
    throw new LifeMaterializationError([{ path: '/workspace-root', code: 'path_escape', message: 'computed target escaped the selected workspace' }]);
  }
  if (assertPromotionTargetIfPresent(targetDirectory, gamesRoot)) {
    parseFiles(targetDirectory, checked);
    return {
      schema: LIFE_MATERIALIZATION_PLAN_SCHEMA,
      mode: 'promote', slug: checked.slug, confirmationHash: checked.plan.confirmationHash,
      targetDirectory, writesPerformed: false, writtenFiles: 0, files: checked.plan.files, filesHash: checked.plan.filesHash,
    };
  }

  let stagingDirectory: string | undefined;
  let stagingIdentity: FsEntryIdentity | undefined;
  let publishedIdentity: FsEntryIdentity | undefined;
  try {
    stagingDirectory = mkdtempSync(join(gamesRoot, `.${checked.slug}.promote-`));
    const stagingReal = assertPromotionDirectory(stagingDirectory, '/target/staging', gamesRoot);
    stagingIdentity = fsEntryIdentity(lstatSync(stagingReal, { bigint: true }));
    if (!isInside(gamesRoot, stagingReal)) {
      throw new LifeMaterializationError([{ path: '/target/staging', code: 'stage_escape', message: 'staging directory escaped games root' }]);
    }
    for (let index = 0; index < LIFE_MATERIALIZATION_FILES.length; index++) {
      const name = LIFE_MATERIALIZATION_FILES[index]!;
      const filePath = join(stagingDirectory, name);
      options.hooks?.beforeWrite?.(filePath, index);
      writeFileSync(filePath, checked.contents[name], { encoding: 'utf8', flag: 'wx' });
    }
    parseFiles(stagingDirectory, checked);
    options.hooks?.beforeRename?.(stagingDirectory, targetDirectory);
    const currentGamesRoot = assertPromotionDirectory(join(workspaceRoot, 'games'), '/workspace-root/games', workspaceRoot);
    if (!pathEquals(currentGamesRoot, gamesRoot) || !pathStillNamesDirectory(gamesRoot, gamesRootIdentity)) {
      throw new LifeMaterializationError([{ path: '/workspace-root/games', code: 'parent_race', message: 'games directory changed before atomic publication' }]);
    }
    if (!stagingIdentity || !pathStillNamesDirectory(stagingDirectory, stagingIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/staging', code: 'stage_race', message: 'staging directory changed before atomic publication' }]);
    }
    if (lstatIfPresent(targetDirectory)) {
      throw new LifeMaterializationError([{ path: '/target/game', code: 'target_race', message: 'target appeared before atomic publication' }]);
    }
    renameSync(stagingDirectory, targetDirectory);
    stagingDirectory = undefined;
    const publishedStat = lstatIfPresent(targetDirectory);
    if (!publishedStat || publishedStat.isSymbolicLink() || !publishedStat.isDirectory()
      || !sameFsEntry(fsEntryIdentity(lstatSync(targetDirectory, { bigint: true })), stagingIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/game', code: 'target_race', message: 'published target identity changed during atomic publication' }]);
    }
    publishedIdentity = fsEntryIdentity(lstatSync(targetDirectory, { bigint: true }));
    options.hooks?.afterRename?.(targetDirectory);
    if (!pathStillNamesDirectory(gamesRoot, gamesRootIdentity)) {
      throw new LifeMaterializationError([{ path: '/workspace-root/games', code: 'parent_race', message: 'games directory changed after atomic publication' }]);
    }
    assertPromotionTargetIfPresent(targetDirectory, gamesRoot);
    parseFiles(targetDirectory, checked);
    return {
      schema: LIFE_MATERIALIZATION_PLAN_SCHEMA,
      mode: 'promote', slug: checked.slug, confirmationHash: checked.plan.confirmationHash,
      targetDirectory, writesPerformed: true, writtenFiles: 4, files: checked.plan.files, filesHash: checked.plan.filesHash,
    };
  } catch (error) {
    if (stagingDirectory && stagingIdentity && pathStillNamesDirectory(stagingDirectory, stagingIdentity)) {
      rmSync(stagingDirectory, { recursive: true, force: true });
    }
    if (publishedIdentity && pathStillNamesDirectory(targetDirectory, publishedIdentity)) {
      rmSync(targetDirectory, { recursive: true, force: true });
    }
    if (error instanceof LifeMaterializationError) throw error;
    throw new LifeMaterializationError([{ path: '/promote', code: 'io_failure', message: error instanceof Error ? error.message : String(error) }]);
  }
}

/**
 * Owner-only replacement of one existing canonical formal four-file group.
 * The old exact group hash and the new M0 confirmation hash are independent
 * approvals; ordinary promote remains create-only/idempotent.
 */
export function updateLifeAuthoringMaterialization(
  inputs: LifeMaterializationInputs,
  options: {
    readonly workspaceRoot: string;
    readonly ownerConfirm: string;
    readonly currentFilesHash: string;
    readonly hooks?: LifeMaterializerHooks;
  },
): LifeFormalUpdateResult {
  const checked = validateInputs(inputs);
  if (options.ownerConfirm !== checked.plan.confirmationHash) {
    throw new LifeMaterializationError([{ path: '/owner-confirm', code: 'confirmation_mismatch', message: 'must exactly equal the new canonical plan confirmationHash' }]);
  }
  const workspaceRoot = assertPromotionWorkspaceRoot(options.workspaceRoot);
  const gamesRoot = assertPromotionDirectory(join(workspaceRoot, 'games'), '/workspace-root/games', workspaceRoot);
  const gamesRootIdentity = fsEntryIdentity(lstatSync(gamesRoot, { bigint: true }));
  const targetDirectory = join(gamesRoot, checked.slug);
  if (!isInside(workspaceRoot, gamesRoot) || !isInside(gamesRoot, targetDirectory)) {
    throw new LifeMaterializationError([{ path: '/workspace-root', code: 'path_escape', message: 'computed target escaped the selected workspace' }]);
  }
  if (!assertPromotionTargetIfPresent(targetDirectory, gamesRoot)) {
    throw new LifeMaterializationError([{ path: '/target/game', code: 'missing_target', message: 'formal update requires an existing target; use promote for first publication' }]);
  }
  const current = inspectFormalTarget(targetDirectory, checked.slug);
  const alreadyCurrent = LIFE_MATERIALIZATION_FILES.every((name) => current.contents[name] === checked.contents[name]);
  if (alreadyCurrent) {
    return {
      schema: LIFE_MATERIALIZATION_PLAN_SCHEMA, mode: 'update', slug: checked.slug,
      confirmationHash: checked.plan.confirmationHash, previousFilesHash: current.filesHash, filesHash: checked.plan.filesHash,
      targetDirectory, writesPerformed: false, writtenFiles: 0, files: checked.plan.files,
    };
  }
  if (options.currentFilesHash !== current.filesHash) {
    throw new LifeMaterializationError([{ path: '/current-files-hash', code: 'current_files_hash_mismatch', message: 'must exactly equal the current canonical formal four-file group hash' }]);
  }

  let stagingDirectory: string | undefined;
  let stagingIdentity: FsEntryIdentity | undefined;
  let rollbackDirectory: string | undefined;
  let rollbackIdentity: FsEntryIdentity | undefined;
  let publishedIdentity: FsEntryIdentity | undefined;
  try {
    stagingDirectory = mkdtempSync(join(gamesRoot, `.${checked.slug}.update-`));
    const stagingReal = assertPromotionDirectory(stagingDirectory, '/target/staging', gamesRoot);
    stagingIdentity = fsEntryIdentity(lstatSync(stagingReal, { bigint: true }));
    for (let index = 0; index < LIFE_MATERIALIZATION_FILES.length; index++) {
      const name = LIFE_MATERIALIZATION_FILES[index]!;
      const filePath = join(stagingDirectory, name);
      options.hooks?.beforeWrite?.(filePath, index);
      writeFileSync(filePath, checked.contents[name], { encoding: 'utf8', flag: 'wx' });
    }
    parseFiles(stagingDirectory, checked);
    options.hooks?.beforeRename?.(stagingDirectory, targetDirectory);
    const currentGamesRoot = assertPromotionDirectory(join(workspaceRoot, 'games'), '/workspace-root/games', workspaceRoot);
    if (!pathEquals(currentGamesRoot, gamesRoot) || !pathStillNamesDirectory(gamesRoot, gamesRootIdentity)) {
      throw new LifeMaterializationError([{ path: '/workspace-root/games', code: 'parent_race', message: 'games directory changed before update swap' }]);
    }
    if (!stagingIdentity || !pathStillNamesDirectory(stagingDirectory, stagingIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/staging', code: 'stage_race', message: 'staging directory changed before update swap' }]);
    }
    const beforeSwap = inspectFormalTarget(targetDirectory, checked.slug);
    if (!sameFsEntry(beforeSwap.identity, current.identity) || beforeSwap.filesHash !== current.filesHash) {
      throw new LifeMaterializationError([{ path: '/target/game', code: 'target_drift', message: 'formal target changed after preflight' }]);
    }
    rollbackDirectory = join(gamesRoot, `.${checked.slug}.rollback-${randomUUID()}`);
    if (lstatIfPresent(rollbackDirectory)) throw new LifeMaterializationError([{ path: '/target/rollback', code: 'rollback_conflict', message: 'rollback path unexpectedly exists' }]);
    renameSync(targetDirectory, rollbackDirectory);
    rollbackIdentity = current.identity;
    if (!pathStillNamesDirectory(rollbackDirectory, rollbackIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/rollback', code: 'rollback_race', message: 'old formal directory identity changed during update swap' }]);
    }
    options.hooks?.afterCurrentMoved?.(targetDirectory, rollbackDirectory);
    if (lstatIfPresent(targetDirectory)) {
      throw new LifeMaterializationError([{ path: '/target/game', code: 'target_race', message: 'external target appeared during update swap' }]);
    }
    if (!pathStillNamesDirectory(stagingDirectory, stagingIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/staging', code: 'stage_race', message: 'staging directory changed during update swap' }]);
    }
    renameSync(stagingDirectory, targetDirectory);
    stagingDirectory = undefined;
    const publishedStat = lstatIfPresent(targetDirectory);
    if (!publishedStat || publishedStat.isSymbolicLink() || !publishedStat.isDirectory()
      || !sameFsEntry(fsEntryIdentity(lstatSync(targetDirectory, { bigint: true })), stagingIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/game', code: 'target_race', message: 'published update identity changed during update swap' }]);
    }
    publishedIdentity = fsEntryIdentity(lstatSync(targetDirectory, { bigint: true }));
    options.hooks?.afterRename?.(targetDirectory);
    if (!pathStillNamesDirectory(gamesRoot, gamesRootIdentity)) {
      throw new LifeMaterializationError([{ path: '/workspace-root/games', code: 'parent_race', message: 'games directory changed after update swap' }]);
    }
    if (!pathStillNamesDirectory(targetDirectory, publishedIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/game', code: 'target_race', message: 'published update was externally replaced before verification' }]);
    }
    parseFiles(targetDirectory, checked);
    if (!rollbackIdentity || !pathStillNamesDirectory(rollbackDirectory, rollbackIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/rollback', code: 'rollback_race', message: 'rollback directory was externally replaced; it was preserved' }]);
    }
    const rollback = inspectFormalTarget(rollbackDirectory, checked.slug);
    if (rollback.filesHash !== current.filesHash || !sameFsEntry(rollback.identity, rollbackIdentity)) {
      throw new LifeMaterializationError([{ path: '/target/rollback', code: 'rollback_drift', message: 'rollback directory changed before cleanup; it was preserved' }]);
    }
    rmSync(rollbackDirectory, { recursive: true, force: true });
    rollbackDirectory = undefined;
    return {
      schema: LIFE_MATERIALIZATION_PLAN_SCHEMA, mode: 'update', slug: checked.slug,
      confirmationHash: checked.plan.confirmationHash, previousFilesHash: current.filesHash, filesHash: checked.plan.filesHash,
      targetDirectory, writesPerformed: true, writtenFiles: 4, files: checked.plan.files,
    };
  } catch (error) {
    if (stagingDirectory && stagingIdentity && pathStillNamesDirectory(stagingDirectory, stagingIdentity)) {
      rmSync(stagingDirectory, { recursive: true, force: true });
    }
    if (publishedIdentity && pathStillNamesDirectory(targetDirectory, publishedIdentity)) {
      rmSync(targetDirectory, { recursive: true, force: true });
      publishedIdentity = undefined;
    }
    if (rollbackDirectory && rollbackIdentity && pathStillNamesDirectory(rollbackDirectory, rollbackIdentity) && !lstatIfPresent(targetDirectory)) {
      try {
        renameSync(rollbackDirectory, targetDirectory);
        rollbackDirectory = undefined;
      } catch { /* Preserve the rollback directory for owner recovery. */ }
    }
    if (error instanceof LifeMaterializationError) throw error;
    throw new LifeMaterializationError([{ path: '/update', code: 'io_failure', message: error instanceof Error ? error.message : String(error) }]);
  }
}
