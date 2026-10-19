import { emptyAuthoringSession, type AuthoringSession, type AuthoringStepId } from './gal-authoring-flow.js';
import type { AuthoringChatMessage } from './gal-authoring-chat.js';

const WORK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface AuthoringWork {
  readonly id: string;
  readonly title: string;
  readonly session: AuthoringSession;
  readonly threads: Partial<Record<AuthoringStepId, readonly AuthoringChatMessage[]>>;
}
export interface AuthoringWorkCatalog { readonly works: readonly AuthoringWork[] }
export interface AuthoringWorkIssue { readonly path: string; readonly message: string }

export function emptyAuthoringWorkCatalog(): AuthoringWorkCatalog {
  return { works: [] };
}

export function readAuthoringWorks(raw: string | null): AuthoringWorkCatalog {
  if (!raw) return emptyAuthoringWorkCatalog();
  try {
    const parsed = JSON.parse(raw) as { works?: unknown };
    if (!parsed || !Array.isArray(parsed.works)) return emptyAuthoringWorkCatalog();
    const works = parsed.works.filter((item): item is AuthoringWork => {
      if (!item || typeof item !== 'object') return false;
      const work = item as AuthoringWork;
      return WORK_ID.test(work.id) && typeof work.title === 'string' && work.title.trim().length > 0 && !!work.session && typeof work.threads === 'object';
    });
    return { works };
  } catch {
    return emptyAuthoringWorkCatalog();
  }
}

export function writeAuthoringWorks(catalog: AuthoringWorkCatalog): string {
  return JSON.stringify(catalogWithoutImages(catalog));
}

/** Image bytes stay out of the text catalog. */
export function catalogWithoutImages(catalog: AuthoringWorkCatalog): AuthoringWorkCatalog {
  return {
    works: catalog.works.map((work) => ({
      ...work,
      session: {
        ...work.session,
        materials: work.session.materials.map((item) => {
          const { image: _image, ...rest } = item;
          return rest;
        }),
      },
    })),
  };
}

export function createAuthoringWork(catalog: AuthoringWorkCatalog, id: string, title: string): { catalog: AuthoringWorkCatalog; work?: AuthoringWork; issues: AuthoringWorkIssue[] } {
  const workId = id.trim();
  const workTitle = title.trim();
  const issues: AuthoringWorkIssue[] = [];
  if (!WORK_ID.test(workId)) issues.push({ path: '$.id', message: '作品 id 要用英文字母或数字开头' });
  if (!workTitle) issues.push({ path: '$.title', message: '要写作品标题' });
  if (catalog.works.some((work) => work.id === workId)) issues.push({ path: '$.id', message: '已经有这部作品' });
  if (issues.length) return { catalog, issues };
  const work: AuthoringWork = { id: workId, title: workTitle, session: emptyAuthoringSession(workId), threads: {} };
  return { catalog: { works: [work, ...catalog.works] }, work, issues: [] };
}

/** A finished imported work replaces an empty one with the same id. A work that already has its own approved script stays. */
function attachSeedPictures(existing: AuthoringWork, seed: AuthoringWork): AuthoringWork {
  const exhibits = { ...existing.session.exhibits };
  let changed = false;
  for (const key of ['art', 'assets'] as const) {
    const pictures = seed.session.exhibits?.[key]?.pictures;
    const current = exhibits[key];
    if (pictures?.length && current && !current.pictures?.length) {
      exhibits[key] = { ...current, pictures };
      changed = true;
    }
  }
  return changed ? { ...existing, session: { ...existing.session, exhibits } } : existing;
}

export function installAuthoringSeed(catalog: AuthoringWorkCatalog, seed: AuthoringWork): AuthoringWorkCatalog {
  const existing = catalog.works.find((work) => work.id === seed.id);
  if (!existing) return { works: [seed, ...catalog.works] };
  const approvedScript = existing.session.ledger.events.some((event) => event.projectId === seed.id && event.draftId.startsWith('script-') && event.action === 'approve');
  if (approvedScript) return { works: catalog.works.map((work) => work.id === seed.id ? attachSeedPictures(work, seed) : work) };
  return { works: catalog.works.map((work) => work.id === seed.id ? seed : work) };
}

/** Keeps every other work untouched. Returns the same catalog when this work did not change. */
export function saveAuthoringWork(catalog: AuthoringWorkCatalog, id: string, session: AuthoringSession, threads: AuthoringWork['threads']): AuthoringWorkCatalog {
  const index = catalog.works.findIndex((work) => work.id === id);
  if (index < 0) return catalog;
  const current = catalog.works[index]!;
  if (current.session === session && current.threads === threads) return catalog;
  const works = catalog.works.slice();
  works[index] = { ...current, session, threads };
  return { works };
}
