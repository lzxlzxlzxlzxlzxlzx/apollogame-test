import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTER_ID_RE, inspectCharacter, type CharacterPage } from '../services/character-library/catalog.js';
import { loadCharacterLibrary, loadCharacterPage } from '../services/character-library/disk.js';
import type { GalDraftIssue, GalDraftLedger, NarrativeBible } from './gal-draft-types.js';
import { currentApprovedGalDraft } from './gal-draft-review.js';

export interface GameCharacterGroup {
  readonly id: string;
  readonly name: string;
}

export interface CharacterCatalogDraft {
  readonly id: string;
  readonly catalog: {
    readonly name: string;
    readonly group: string;
    readonly entries: readonly { readonly title: string; readonly text: string; readonly description: string }[];
    readonly relations?: readonly { readonly to: string; readonly relation: string }[];
  };
}

export interface CharacterLibraryFact {
  readonly id: string;
  readonly name: string;
  readonly groupId: string;
  readonly persona: readonly { readonly title: string; readonly text: string }[];
  readonly relations: readonly { readonly toId: string; readonly relation: string }[];
  readonly artNotes: readonly { readonly costume: string | null; readonly title: string; readonly file: string; readonly description: string }[];
}

const RELATION_LABEL = { ally: '同伴', rival: '对手', family: '家人', romance: '恋慕', other: '其他' } as const;

/** Approved bible text becomes one library group. Pictures stay out until a later asset review. */
export function characterCatalogsFromBible(bible: NarrativeBible, group: GameCharacterGroup): { catalogs: CharacterCatalogDraft[]; issues: GalDraftIssue[] } {
  const catalogs: CharacterCatalogDraft[] = [];
  const issues: GalDraftIssue[] = [];
  if (!CHARACTER_ID_RE.test(group.id) || group.name.trim() === '') {
    issues.push({ path: '$.group', code: 'library_group', severity: 'error', message: 'game group needs a lowercase id and a display name' });
    return { catalogs, issues };
  }
  const ids = new Set(bible.characters.map((character) => character.id));
  const relations = new Map<string, { to: string; relation: string }[]>();
  bible.relationships.forEach((edge, index) => {
    const path = `$.data.relationships[${index}]`;
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) {
      issues.push({ path, code: 'library_relation', severity: 'error', message: 'relationship must connect two characters in this game' });
      return;
    }
    const label = RELATION_LABEL[edge.kind];
    const relation = edge.note.trim() ? `${label}：${edge.note.trim()}` : label;
    const list = relations.get(edge.from) ?? [];
    if (list.some((item) => item.to === edge.to && item.relation === relation)) return;
    list.push({ to: edge.to, relation });
    relations.set(edge.from, list);
  });
  if (issues.length > 0) return { catalogs, issues };
  bible.characters.forEach((character, index) => {
    const path = `$.data.characters[${index}]`;
    if (!CHARACTER_ID_RE.test(character.id)) {
      issues.push({ path: `${path}.id`, code: 'library_id', severity: 'error', message: 'character id must be a lowercase library folder id' });
      return;
    }
    const edges = relations.get(character.id) ?? [];
    const catalog = {
      name: character.name.trim(),
      group: group.id,
      entries: [
        { title: '简介', text: `${character.role.trim()}。${character.motivation.trim()}`, description: '角色职责' },
        { title: '姓名', text: character.name.trim(), description: '角色名' },
        { title: '人设', text: `${character.traits.map((trait) => trait.trim()).filter(Boolean).join('、')}。${character.arc.trim()}`, description: '性格与变化' },
        { title: '外形', text: `轮廓：${character.visualNeed.silhouette.trim()}。服装：${character.visualNeed.costume.trim()}。表情：${character.visualNeed.expressions.map((item) => item.trim()).filter(Boolean).join('、') || '未列'}。`, description: '画风与造型；立绘尚未审核' },
      ],
      ...(edges.length > 0 ? { relations: edges } : {}),
    };
    const inspected = inspectCharacter({ id: character.id, catalog, files: [], readText: () => '' });
    if (!inspected.ok) {
      issues.push({ path, code: 'library_catalog', severity: 'error', message: inspected.issues.map((issue) => issue.message).join('；') });
      return;
    }
    catalogs.push({ id: character.id, catalog });
  });
  return { catalogs, issues };
}

export function approvedBibleCharacterCatalogs(ledger: GalDraftLedger, projectId: string, group: GameCharacterGroup): { catalogs: CharacterCatalogDraft[]; issues: GalDraftIssue[] } {
  const draft = currentApprovedGalDraft(ledger, projectId, 'bible');
  if (!draft || draft.kind !== 'bible') return { catalogs: [], issues: [{ path: '$.kind', code: 'approved_bible', severity: 'error', message: 'character library requires the current approved bible' }] };
  return characterCatalogsFromBible(draft.data, group);
}

export function characterFact(page: CharacterPage): CharacterLibraryFact {
  const persona = page.blocks.flatMap((block) => block.kind === 'text' && block.text ? [{ title: block.title, text: block.text }] : []);
  const artNotes = [
    ...page.blocks.flatMap((block) => block.kind === 'image' && block.file ? [{ costume: null, title: block.title, file: block.file, description: block.description }] : []),
    ...page.costumes.flatMap((costume) => costume.blocks.flatMap((block) => block.kind === 'image' && block.file ? [{ costume: costume.name, title: block.title, file: block.file, description: block.description }] : [])),
  ];
  return {
    id: page.id, name: page.name, groupId: page.groupId, persona, artNotes,
    relations: page.relations.filter((relation) => relation.fromId === page.id).map((relation) => ({ toId: relation.toId, relation: relation.relation })),
  };
}

/** Facts for one game group. Other groups stay out of that game's generation context. */
export function listCharacterFacts(root: string, groupId: string): CharacterLibraryFact[] {
  return loadCharacterLibrary(root).characters.filter((card) => card.groupId === groupId).flatMap((card) => {
    const page = loadCharacterPage(root, card.id);
    return page.ok ? [characterFact(page.page)] : [];
  });
}

export function applyCharacterCatalogs(root: string, group: GameCharacterGroup, catalogs: readonly CharacterCatalogDraft[]): { written: string[]; unchanged: string[]; conflicts: string[] } {
  const written: string[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  if (catalogs.some((item) => item.catalog.group !== group.id)) {
    return { written, unchanged, conflicts: ['group'] };
  }
  const groupResult = ensureGroup(root, group);
  if (groupResult === 'conflict') return { written, unchanged, conflicts: ['group'] };
  for (const item of catalogs) {
    const dir = join(root, item.id);
    const target = join(dir, 'catalog.json');
    const next = `${JSON.stringify(item.catalog, null, 2)}\n`;
    let existing = '';
    try { existing = readFileSync(target, 'utf8'); } catch { existing = ''; }
    if (existing) {
      if (canonical(existing) === canonical(next)) unchanged.push(item.id);
      else conflicts.push(item.id);
      continue;
    }
    let names: string[] = [];
    try { if (statSync(dir).isDirectory()) names = readdirSync(dir); } catch { names = []; }
    if (names.length > 0) { conflicts.push(item.id); continue; }
    mkdirSync(dir, { recursive: true });
    writeFileSync(target, next, 'utf8');
    written.push(item.id);
  }
  return { written, unchanged, conflicts };
}

function ensureGroup(root: string, group: GameCharacterGroup): 'ok' | 'conflict' {
  const target = join(root, 'groups.json');
  let groups: { id: string; name: string }[] = [];
  try {
    const parsed = JSON.parse(readFileSync(target, 'utf8')) as { groups?: { id: string; name: string }[] };
    groups = Array.isArray(parsed.groups) ? parsed.groups : [];
  } catch { groups = []; }
  const current = groups.find((item) => item.id === group.id);
  if (current && current.name !== group.name) return 'conflict';
  if (!current) {
    groups.push({ id: group.id, name: group.name });
    writeFileSync(target, `${JSON.stringify({ groups }, null, 2)}\n`, 'utf8');
  }
  return 'ok';
}

function canonical(text: string): string {
  return JSON.stringify(JSON.parse(text));
}
