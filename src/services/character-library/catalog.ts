// 角色仓库目录校验与百科投影。规则：docs/playbooks/character-library.md。
// 纯函数：不读盘、不改序、不翻译标题。展示页只消费这里的结果。

export const CHARACTER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const TEXT_EXT = new Set(['.txt', '.md']);
const ROOT_KEYS = new Set(['name', 'group', 'entries', 'costumes', 'relations']);
const COSTUME_KEYS = new Set(['id', 'name', 'entries']);
const ENTRY_KEYS = new Set(['title', 'description', 'file', 'text']);
const RELATION_KEYS = new Set(['to', 'relation']);

export interface CatalogIssue {
  path: string;
  message: string;
}

export interface PageBlock {
  title: string;
  description: string;
  kind: 'image' | 'text';
  file?: string;
  text?: string;
}

export interface CharacterCard {
  id: string;
  name: string;
  groupId: string;
  coverFile: string | null;
  summary: string;
}

export interface CostumePage {
  id: string;
  name: string;
  blocks: PageBlock[];
}

export interface CharacterRelation {
  fromId: string;
  fromName: string;
  relation: string;
  toId: string;
  toName: string;
}

export interface CharacterPage {
  id: string;
  name: string;
  groupId: string;
  groupName?: string;
  blocks: PageBlock[];
  costumes: CostumePage[];
  relations: CharacterRelation[];
}

export interface CharacterGroup {
  id: string;
  name: string;
}

export type InspectResult =
  | { ok: true; card: CharacterCard; page: CharacterPage }
  | { ok: false; issues: CatalogIssue[] };

export function inspectCharacter(input: {
  id: string;
  catalog: unknown;
  files: readonly string[];
  readText: (relativePath: string) => string;
}): InspectResult {
  const issues: CatalogIssue[] = [];
  const id = input.id;
  if (!CHARACTER_ID_RE.test(id)) {
    issues.push({ path: 'id', message: '文件夹名只许小写英文、数字，并用单个 - 分隔' });
  }
  const files = input.files.map(normalizeRel);
  if (files.some((file) => file == null)) {
    issues.push({ path: 'files', message: '磁盘文件路径必须是本文件夹内的相对路径' });
  }
  const present = new Set(files.filter((file): file is string => file != null));

  const catalog = asRecord(input.catalog);
  if (!catalog) {
    issues.push({ path: '$', message: 'catalog.json 必须是对象' });
    return { ok: false, issues };
  }
  for (const key of Object.keys(catalog)) {
    if (!ROOT_KEYS.has(key)) issues.push({ path: `$.${key}`, message: '根上只许 name、group、entries、costumes 和 relations' });
  }
  const name = requiredText(catalog.name, '$.name', 'name', issues);
  const groupId = requiredText(catalog.group, '$.group', 'group', issues);
  if (groupId != null && !CHARACTER_ID_RE.test(groupId)) {
    issues.push({ path: '$.group', message: 'group 必须是分组表里的 id' });
  }
  const outgoing = readRelations(input.id, catalog.relations, issues);
  if (!Array.isArray(catalog.entries)) {
    issues.push({ path: '$.entries', message: 'entries 必须是数组' });
    return { ok: false, issues };
  }
  if (catalog.entries.length === 0) {
    issues.push({ path: '$.entries', message: 'entries 至少一条' });
  }

  const blocks: PageBlock[] = [];
  const registered = new Set<string>();
  readEntries(catalog.entries, '$.entries', issues, blocks, registered, present, input.readText);
  const costumes: CostumePage[] = [];
  if (catalog.costumes != null) {
    if (!Array.isArray(catalog.costumes)) {
      issues.push({ path: '$.costumes', message: 'costumes 必须是数组' });
    } else {
      const seen = new Set<string>();
      catalog.costumes.forEach((costume, index) => {
        const path = `$.costumes[${index}]`;
        const row = asRecord(costume);
        if (!row) {
          issues.push({ path, message: '时装必须是对象' });
          return;
        }
        for (const key of Object.keys(row)) {
          if (!COSTUME_KEYS.has(key)) issues.push({ path: `${path}.${key}`, message: '时装只许 id、name 和 entries' });
        }
        const costumeId = requiredText(row.id, `${path}.id`, 'id', issues);
        const costumeName = requiredText(row.name, `${path}.name`, 'name', issues);
        if (costumeId != null && !CHARACTER_ID_RE.test(costumeId)) {
          issues.push({ path: `${path}.id`, message: '时装 id 只许小写英文、数字，并用单个 - 分隔' });
        }
        if (costumeId != null && seen.has(costumeId)) issues.push({ path: `${path}.id`, message: '时装 id 不能重复' });
        if (costumeId != null) seen.add(costumeId);
        if (!Array.isArray(row.entries)) {
          issues.push({ path: `${path}.entries`, message: '时装 entries 必须是数组' });
          return;
        }
        const costumeBlocks: PageBlock[] = [];
        readEntries(row.entries, `${path}.entries`, issues, costumeBlocks, registered, present, input.readText);
        if (costumeId != null && costumeName != null) costumes.push({ id: costumeId, name: costumeName, blocks: costumeBlocks });
      });
    }
  }
  for (const file of present) {
    if (!registered.has(file)) issues.push({ path: file, message: '文件没有在 entries 里登记' });
  }
  if (issues.length > 0 || name == null || groupId == null) return { ok: false, issues };
  const summary = blocks.find((block) => block.kind === 'text' && block.file == null)?.text
    ?? blocks[0]?.description
    ?? '';
  const coverFile = costumes[0]?.blocks.find((block) => block.kind === 'image')?.file
    ?? blocks.find((block) => block.kind === 'image')?.file
    ?? null;
  const relations = outgoing.map((edge) => ({
    fromId: id,
    fromName: name,
    relation: edge.relation,
    toId: edge.to,
    toName: edge.to,
  }));
  return {
    ok: true,
    card: { id, name, groupId, coverFile, summary },
    page: { id, name, groupId, blocks, costumes, relations },
  };
}

function readEntries(
  entries: unknown[],
  base: string,
  issues: CatalogIssue[],
  blocks: PageBlock[],
  registered: Set<string>,
  present: Set<string>,
  readText: (relativePath: string) => string,
): void {
  entries.forEach((entry, index) => {
    const path = `${base}[${index}]`;
    const row = asRecord(entry);
    if (!row) {
      issues.push({ path, message: '条目必须是对象' });
      return;
    }
    for (const key of Object.keys(row)) {
      if (!ENTRY_KEYS.has(key)) issues.push({ path: `${path}.${key}`, message: '条目只许 title、description、file 或 text' });
    }
    const title = requiredText(row.title, `${path}.title`, 'title', issues);
    const description = requiredText(row.description, `${path}.description`, 'description', issues);
    const hasFile = Object.prototype.hasOwnProperty.call(row, 'file');
    const hasText = Object.prototype.hasOwnProperty.call(row, 'text');
    if (hasFile === hasText) {
      issues.push({ path, message: 'file 和 text 必须恰好有一个' });
      return;
    }
    if (hasText) {
      const text = requiredText(row.text, `${path}.text`, 'text', issues);
      if (title == null || description == null || text == null) return;
      blocks.push({ title, description, kind: 'text', text });
      return;
    }
    const file = normalizeRel(row.file);
    if (file == null) {
      issues.push({ path: `${path}.file`, message: 'file 必须是本文件夹内的相对路径' });
      return;
    }
    if (registered.has(file)) issues.push({ path: `${path}.file`, message: '同一个 file 只能登记一次' });
    registered.add(file);
    const ext = extensionOf(file);
    if (!IMAGE_EXT.has(ext) && !TEXT_EXT.has(ext)) {
      issues.push({ path: `${path}.file`, message: '扩展名只许 png、jpg、jpeg、webp、gif、txt、md' });
    }
    if (!present.has(file)) issues.push({ path: `${path}.file`, message: '文件不存在' });
    if (TEXT_EXT.has(ext) && present.has(file)) {
      let body = '';
      try {
        body = readText(file);
      } catch (error) {
        issues.push({ path: `${path}.file`, message: `文本读不出来：${error instanceof Error ? error.message : String(error)}` });
        return;
      }
      if (body.trim() === '') {
        issues.push({ path: `${path}.file`, message: '文本文件去掉空白后不能为空' });
        return;
      }
      if (title != null && description != null) blocks.push({ title, description, kind: 'text', file, text: body });
      return;
    }
    if (IMAGE_EXT.has(ext) && title != null && description != null && present.has(file)) {
      blocks.push({ title, description, kind: 'image', file });
    }
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredText(value: unknown, path: string, label: string, issues: CatalogIssue[]): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ path, message: `${label} 必须是非空字符串` });
    return null;
  }
  return label === 'text' ? value : value.trim();
}

export function normalizeRel(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const file = value.replaceAll('\\', '/');
  if (file.startsWith('/') || file.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  return file;
}

function extensionOf(file: string): string {
  const index = file.lastIndexOf('.');
  return index >= 0 ? file.slice(index).toLowerCase() : '';
}

function readRelations(id: string, raw: unknown, issues: CatalogIssue[]): Array<{ to: string; relation: string }> {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path: '$.relations', message: 'relations 必须是数组' });
    return [];
  }
  const seen = new Set<string>();
  const edges: Array<{ to: string; relation: string }> = [];
  raw.forEach((item, index) => {
    const path = `$.relations[${index}]`;
    const row = asRecord(item);
    if (!row) {
      issues.push({ path, message: '关系必须是对象' });
      return;
    }
    for (const key of Object.keys(row)) {
      if (!RELATION_KEYS.has(key)) issues.push({ path: `${path}.${key}`, message: '关系只许 to 和 relation' });
    }
    const to = requiredText(row.to, `${path}.to`, 'to', issues);
    const relation = requiredText(row.relation, `${path}.relation`, 'relation', issues);
    if (to == null || relation == null) return;
    if (!CHARACTER_ID_RE.test(to)) issues.push({ path: `${path}.to`, message: 'to 必须是另一个角色的 id' });
    if (to === id) issues.push({ path: `${path}.to`, message: '关系不能指向自己' });
    const key = `${to}\0${relation}`;
    if (seen.has(key)) issues.push({ path, message: '同一条关系只能登记一次' });
    seen.add(key);
    edges.push({ to, relation });
  });
  return edges;
}

export function checkCharacterLinks(input: {
  groups: readonly CharacterGroup[];
  characters: readonly { id: string; groupId: string; relations: readonly CharacterRelation[] }[];
}): Map<string, CatalogIssue[]> {
  const issues = new Map<string, CatalogIssue[]>();
  const groupIds = new Set<string>();
  for (const group of input.groups) {
    if (groupIds.has(group.id)) {
      pushIssue(issues, 'groups', { path: `$.groups.${group.id}`, message: '分组 id 不能重复' });
    }
    groupIds.add(group.id);
  }
  const characterIds = new Set(input.characters.map((character) => character.id));
  for (const character of input.characters) {
    if (!groupIds.has(character.groupId)) {
      pushIssue(issues, character.id, { path: '$.group', message: 'group 必须是分组表里的 id' });
    }
    for (const [index, relation] of character.relations.entries()) {
      if (!characterIds.has(relation.toId)) {
        pushIssue(issues, character.id, { path: `$.relations[${index}].to`, message: '关系指向的角色不在仓库里' });
      }
    }
  }
  return issues;
}

export function projectRelations(
  characters: readonly { id: string; name: string; relations: readonly CharacterRelation[] }[],
  id: string,
): CharacterRelation[] {
  const names = new Map(characters.map((character) => [character.id, character.name]));
  const view: CharacterRelation[] = [];
  for (const character of characters) {
    for (const relation of character.relations) {
      if (character.id !== id && relation.toId !== id) continue;
      view.push({
        fromId: character.id,
        fromName: names.get(character.id) ?? character.id,
        relation: relation.relation,
        toId: relation.toId,
        toName: names.get(relation.toId) ?? relation.toId,
      });
    }
  }
  return view;
}

function pushIssue(map: Map<string, CatalogIssue[]>, id: string, issue: CatalogIssue): void {
  const list = map.get(id) ?? [];
  list.push(issue);
  map.set(id, list);
}
