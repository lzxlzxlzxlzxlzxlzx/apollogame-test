import { compileAndParseLifeGamePackage } from '../assembly/life-package-compile.js';
import { parseLifeHostDescriptor, validateLifeHostCalendarLabels, type LifeHostDescriptorV1 } from '../authoring/life-host-descriptor-core.js';
import type { LifeGamePackage } from '../engine/protocol/life-sim.js';
import { parseAssetSlotManifest, type AssetSlotManifest } from '../assets/asset-slot-brief.js';
import type { GameEntry } from '../studio/library-model.js';

export const LIFE_LAUNCHER_SCHEMA = 'zerocraft.life-launcher.v1' as const;
export const LIFE_LAUNCHER_ID_PREFIX = 'life:' as const;

export interface LifeLauncherEntryV1 {
  readonly schema: typeof LIFE_LAUNCHER_SCHEMA;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly color: string;
  readonly accentColor: string;
  readonly icon: string;
}

export interface LifeLauncherBundle {
  readonly entry: LifeLauncherEntryV1;
  readonly descriptor: LifeHostDescriptorV1;
  readonly lifePackage: unknown;
  readonly assetSlots: AssetSlotManifest;
}

export interface LifeLauncherDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface LifeLauncherCatalogItem {
  readonly directory: string;
  readonly runtimeId: string;
  readonly gameEntry: GameEntry;
  readonly diagnostics: readonly LifeLauncherDiagnostic[];
  readonly bundle?: LifeLauncherBundle;
}

export interface LifeLauncherCatalog {
  readonly items: readonly LifeLauncherCatalogItem[];
  readonly gameEntries: readonly GameEntry[];
}

type StaticJsonModules = Readonly<Record<string, unknown>>;

const ENTRY_FILE = /^\.\.\/\.\.\/games\/(game-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)\/life-launcher\.json$/;
const ROOT_KEYS = ['schema', 'id', 'title', 'subtitle', 'description', 'color', 'accentColor', 'icon'] as const;
const SAFE_ID = /^game-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const PLAIN_TEXT = /^[^\u0000-\u001f\u007f]*$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function moduleValue(value: unknown): unknown {
  if (isRecord(value) && Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, 'default')) return value.default;
  return value;
}

export function parseLifeLauncherEntry(raw: unknown): { entry?: LifeLauncherEntryV1; diagnostics: LifeLauncherDiagnostic[] } {
  const diagnostics: LifeLauncherDiagnostic[] = [];
  const add = (path: string, code: string, message: string): void => { diagnostics.push({ path, code, message }); };
  if (!isRecord(raw)) return { diagnostics: [{ path: '/', code: 'type', message: 'entry must be a plain object' }] };
  const allowed = new Set<string>(ROOT_KEYS);
  for (const key of Object.keys(raw).sort()) if (!allowed.has(key)) add(`/${key}`, 'unknown_field', 'field is not allowed');
  for (const key of ROOT_KEYS) if (!Object.prototype.hasOwnProperty.call(raw, key)) add(`/${key}`, 'missing_field', 'field is required');
  if (raw.schema !== LIFE_LAUNCHER_SCHEMA) add('/schema', 'schema', `must equal ${LIFE_LAUNCHER_SCHEMA}`);
  if (typeof raw.id !== 'string' || !SAFE_ID.test(raw.id)) add('/id', 'id', 'must match game-<lowercase-kebab>, max 52 characters');
  const boundedText = (key: 'title' | 'subtitle' | 'description' | 'icon', max: number): void => {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim().length === 0) add(`/${key}`, 'text', 'must be a non-empty string');
    else {
      if (value.length > max) add(`/${key}`, 'text_limit', `must be at most ${max} characters`);
      if (!PLAIN_TEXT.test(value)) add(`/${key}`, 'plain_text', 'must be single-line plain text without control characters');
    }
  };
  boundedText('title', 120); boundedText('subtitle', 160); boundedText('description', 600); boundedText('icon', 16);
  for (const key of ['color', 'accentColor'] as const) if (typeof raw[key] !== 'string' || !HEX_COLOR.test(raw[key])) add(`/${key}`, 'color', 'must be a six-digit hex color');
  diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  if (diagnostics.length > 0) return { diagnostics };
  return { entry: JSON.parse(JSON.stringify(raw)) as LifeLauncherEntryV1, diagnostics };
}

function diagnosticCard(directory: string, runtimeId: string, title: string, diagnostics: readonly LifeLauncherDiagnostic[]): GameEntry {
  const code = diagnostics[0]?.code ?? 'invalid';
  return {
    id: runtimeId,
    title,
    subtitle: 'Life 条目不可运行',
    description: `目录 ${directory} 的启动描述无效（${code}）。该条目已隔离，未创建 World 或运行循环。`,
    color: '#321b22', accentColor: '#e07070', icon: '⚠️', status: 'coming-soon',
  };
}

function modulePath(directory: string, file: 'life-host.json' | 'life.json' | 'asset-slots.json'): string {
  return `../../games/${directory}/${file}`;
}

/**
 * Pure discovery boundary. Production passes only Vite's fixed eager glob maps; tests pass
 * in-memory maps. No entry field is ever interpreted as a path, URL or module specifier.
 */
export function discoverLifeLauncherCatalog(
  entryModules: StaticJsonModules,
  hostModules: StaticJsonModules,
  packageModules: StaticJsonModules,
  slotModules: StaticJsonModules,
): LifeLauncherCatalog {
  const drafts: Array<{ directory: string; runtimeId: string; entry?: LifeLauncherEntryV1; diagnostics: LifeLauncherDiagnostic[]; bundle?: LifeLauncherBundle }> = [];
  for (const path of Object.keys(entryModules).sort()) {
    const match = ENTRY_FILE.exec(path);
    if (!match) continue;
    const directory = match[1]!;
    const parsedEntry = parseLifeLauncherEntry(moduleValue(entryModules[path]));
    const claimedId = parsedEntry.entry?.id;
    const runtimeId = `${LIFE_LAUNCHER_ID_PREFIX}${claimedId ?? directory}`;
    const diagnostics = [...parsedEntry.diagnostics];
    let bundle: LifeLauncherBundle | undefined;
    if (parsedEntry.entry) {
      const entry = parsedEntry.entry;
      if (entry.id !== directory) diagnostics.push({ path: '/id', code: 'directory_mismatch', message: 'entry id must equal its game directory' });
      const hostPath = modulePath(directory, 'life-host.json');
      const packagePath = modulePath(directory, 'life.json');
      const slotsPath = modulePath(directory, 'asset-slots.json');
      const missing = ([['host', hostPath, hostModules], ['package', packagePath, packageModules], ['slots', slotsPath, slotModules]] as const)
        .filter(([, fixedPath, modules]) => !Object.prototype.hasOwnProperty.call(modules, fixedPath));
      for (const [kind] of missing) diagnostics.push({ path: `/${kind}`, code: 'missing_module', message: `required same-directory ${kind} file is missing` });
      if (missing.length === 0) {
        let descriptor: LifeHostDescriptorV1 | undefined;
        let assetSlots: AssetSlotManifest | undefined;
        const lifePackage = moduleValue(packageModules[packagePath]);
        try { descriptor = parseLifeHostDescriptor(moduleValue(hostModules[hostPath])); }
        catch { diagnostics.push({ path: '/host', code: 'invalid_host', message: 'life-host.json failed strict validation' }); }
        try {
          compileAndParseLifeGamePackage(lifePackage);
          if (descriptor) for (const issue of validateLifeHostCalendarLabels(descriptor, (lifePackage as LifeGamePackage).calendar).diagnostics) {
            diagnostics.push({ ...issue, path: `/host${issue.path}` });
          }
        }
        catch { diagnostics.push({ path: '/package', code: 'invalid_package', message: 'life.json failed strict validation or compilation' }); }
        try { assetSlots = parseAssetSlotManifest(moduleValue(slotModules[slotsPath])); }
        catch { diagnostics.push({ path: '/slots', code: 'invalid_slots', message: 'asset-slots.json failed strict validation' }); }
        if (descriptor && descriptor.slug !== directory) diagnostics.push({ path: '/host/slug', code: 'slug_mismatch', message: 'descriptor slug must equal its game directory' });
        const packageId = isRecord(lifePackage) && isRecord(lifePackage.meta) ? lifePackage.meta.id : undefined;
        if (packageId !== directory) diagnostics.push({ path: '/package/meta/id', code: 'package_id_mismatch', message: 'package id must equal its game directory' });
        if (assetSlots && assetSlots.game !== directory) diagnostics.push({ path: '/slots/game', code: 'slots_game_mismatch', message: 'asset slot game must equal its game directory' });
        if (descriptor && assetSlots && diagnostics.length === 0) bundle = { entry, descriptor, lifePackage, assetSlots };
      }
    }
    drafts.push({ directory, runtimeId, entry: parsedEntry.entry, diagnostics, ...(bundle ? { bundle } : {}) });
  }

  const byClaimedId = new Map<string, number[]>();
  drafts.forEach((draft, index) => {
    if (!draft.entry) return;
    const indexes = byClaimedId.get(draft.entry.id) ?? [];
    indexes.push(index); byClaimedId.set(draft.entry.id, indexes);
  });
  for (const indexes of byClaimedId.values()) if (indexes.length > 1) for (const index of indexes) {
    const draft = drafts[index]!;
    draft.diagnostics.push({ path: '/id', code: 'duplicate_id', message: 'Life launcher id must be unique' });
    draft.bundle = undefined;
  }

  const items = drafts.map((draft): LifeLauncherCatalogItem => {
    draft.diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
    const valid = draft.bundle !== undefined && draft.entry !== undefined && draft.diagnostics.length === 0;
    const gameEntry: GameEntry = valid ? {
      id: draft.runtimeId,
      title: draft.entry!.title,
      subtitle: draft.entry!.subtitle,
      description: draft.entry!.description,
      color: draft.entry!.color,
      accentColor: draft.entry!.accentColor,
      icon: draft.entry!.icon,
      status: 'playable',
    } : diagnosticCard(draft.directory, draft.runtimeId, draft.entry?.title ?? draft.directory, draft.diagnostics);
    return { directory: draft.directory, runtimeId: draft.runtimeId, gameEntry, diagnostics: draft.diagnostics, ...(valid ? { bundle: draft.bundle } : {}) };
  }).sort((a, b) => a.directory.localeCompare(b.directory) || a.runtimeId.localeCompare(b.runtimeId));
  return { items, gameEntries: items.map((item) => item.gameEntry) };
}
