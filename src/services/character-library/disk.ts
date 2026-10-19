// 从 characters/ 读盘，交给 inspectCharacter。只被 vite 中间件使用，不进浏览器包。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  CHARACTER_ID_RE,
  checkCharacterLinks,
  inspectCharacter,
  projectRelations,
  type CatalogIssue,
  type CharacterGroup,
  type CharacterPage,
} from './catalog.js';

export interface LibraryIndex {
  groups: CharacterGroup[];
  characters: Array<{
    id: string;
    name: string;
    groupId: string;
    groupName: string;
    coverUrl: string | null;
    summary: string;
  }>;
  rejected: Array<{ id: string; issues: CatalogIssue[] }>;
}

export function loadCharacterLibrary(root: string): LibraryIndex {
  const loaded = loadAll(root);
  return { groups: loaded.groups, characters: loaded.characters, rejected: loaded.rejected };
}

export function loadCharacterPage(root: string, id: string): { ok: true; page: CharacterPage } | { ok: false; issues: CatalogIssue[] } {
  const loaded = loadAll(root);
  const page = loaded.pages.get(id);
  if (!page) {
    return { ok: false, issues: loaded.rejected.find((item) => item.id === id)?.issues ?? [{ path: id, message: '角色不在仓库里' }] };
  }
  return { ok: true, page };
}

export function characterFileUrl(id: string, file: string): string {
  return `/characters/${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function loadAll(root: string): {
  groups: CharacterGroup[];
  characters: LibraryIndex['characters'];
  pages: Map<string, CharacterPage>;
  rejected: LibraryIndex['rejected'];
} {
  const { groups, issues: groupIssues } = readGroups(root);
  const opened: CharacterPage[] = [];
  const rejected: LibraryIndex['rejected'] = [];
  if (groupIssues.length > 0) rejected.push({ id: 'groups', issues: groupIssues });
  let names: string[] = [];
  try { names = readdirSync(root); } catch { names = []; }
  for (const id of names.sort()) {
    const dir = join(root, id);
    let info;
    try { info = statSync(dir); } catch { continue; }
    if (!info.isDirectory()) continue;
    const loaded = loadOne(root, id);
    if (loaded.ok) opened.push(loaded.page);
    else rejected.push({ id, issues: loaded.issues });
  }
  const linkIssues = checkCharacterLinks({
    groups,
    characters: opened.map((page) => ({ id: page.id, groupId: page.groupId, relations: page.relations })),
  });
  const accepted = opened.filter((page) => !linkIssues.has(page.id));
  for (const [id, issues] of linkIssues) rejected.push({ id, issues });
  const pages = new Map<string, CharacterPage>();
  const characters: LibraryIndex['characters'] = [];
  const named = accepted.map((page) => ({ id: page.id, name: page.name, relations: page.relations }));
  for (const page of accepted) {
    const linked: CharacterPage = {
      ...page,
      groupName: groups.find((group) => group.id === page.groupId)?.name ?? page.groupId,
      relations: projectRelations(named, page.id),
    };
    pages.set(page.id, linked);
    characters.push({
      id: page.id,
      name: page.name,
      groupId: page.groupId,
      groupName: groups.find((group) => group.id === page.groupId)?.name ?? page.groupId,
      coverUrl: pageCover(page),
      summary: page.blocks.find((block) => block.kind === 'text' && block.file == null)?.text ?? page.blocks[0]?.description ?? '',
    });
  }
  return { groups, characters, pages, rejected };
}

function pageCover(page: CharacterPage): string | null {
  const file = page.costumes[0]?.blocks.find((block) => block.kind === 'image')?.file
    ?? page.blocks.find((block) => block.kind === 'image')?.file;
  return file ? characterFileUrl(page.id, file) : null;
}

function readGroups(root: string): { groups: CharacterGroup[]; issues: CatalogIssue[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, 'groups.json'), 'utf8'));
  } catch (error) {
    return { groups: [], issues: [{ path: 'groups.json', message: `分组表读不出来：${error instanceof Error ? error.message : String(error)}` }] };
  }
  const record = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!record || !Array.isArray(record.groups)) {
    return { groups: [], issues: [{ path: 'groups.json', message: '分组表必须是 { groups: [] }' }] };
  }
  const groups: CharacterGroup[] = [];
  const issues: CatalogIssue[] = [];
  for (const [index, item] of record.groups.entries()) {
    const row = item != null && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : null;
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    if (!CHARACTER_ID_RE.test(id) || name === '') {
      issues.push({ path: `$.groups[${index}]`, message: '分组必须有合法 id 和非空 name' });
      continue;
    }
    groups.push({ id, name });
  }
  return { groups, issues };
}

function loadOne(root: string, id: string) {
  const dir = join(root, id);
  let catalog: unknown = null;
  try {
    catalog = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
  } catch (error) {
    return { ok: false as const, issues: [{ path: 'catalog.json', message: `catalog.json 读不出来：${error instanceof Error ? error.message : String(error)}` }] };
  }
  const files = walk(dir, dir).filter((file) => file !== 'catalog.json');
  return inspectCharacter({
    id,
    catalog,
    files,
    readText: (file) => readFileSync(join(dir, ...file.split('/')), 'utf8'),
  });
}

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, base));
    else out.push(relative(base, abs).split(sep).join('/'));
  }
  return out;
}
