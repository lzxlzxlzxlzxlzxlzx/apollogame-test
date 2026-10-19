import type { AuthoringWorkCatalog } from './gal-authoring-works.js';

const DB_NAME = 'gal-authoring-files';
const STORE = 'images';

function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finish(request: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Picture bytes live here, not in the work JSON. */
export async function saveAuthoringImages(catalog: AuthoringWorkCatalog): Promise<void> {
  const db = await openFiles();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const writes: Promise<void>[] = [];
  for (const work of catalog.works) {
    for (const material of work.session.materials) {
      if (material.image) writes.push(finish(store.put(material.image, `${work.id}/${material.id}`)));
    }
  }
  await Promise.all(writes);
  db.close();
}

export function applyAuthoringImages(current: AuthoringWorkCatalog, loaded: AuthoringWorkCatalog): AuthoringWorkCatalog {
  const images = new Map<string, string>();
  for (const work of loaded.works) for (const material of work.session.materials) if (material.image) images.set(`${work.id}/${material.id}`, material.image);
  if (!images.size) return current;
  let changed = false;
  const works = current.works.map((work) => ({
    ...work,
    session: {
      ...work.session,
      materials: work.session.materials.map((material) => {
        const image = images.get(`${work.id}/${material.id}`);
        if (!image || material.image) return material;
        changed = true;
        return { ...material, image, kind: material.kind ?? 'image' as const };
      }),
    },
  }));
  return changed ? { works } : current;
}

export async function loadAuthoringImages(catalog: AuthoringWorkCatalog): Promise<AuthoringWorkCatalog> {
  const db = await openFiles();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const works = await Promise.all(catalog.works.map(async (work) => ({
    ...work,
    session: {
      ...work.session,
      materials: await Promise.all(work.session.materials.map(async (material) => {
        if (material.image) return material;
        const image = await new Promise<string | undefined>((resolve, reject) => {
          const request = store.get(`${work.id}/${material.id}`);
          request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : undefined);
          request.onerror = () => reject(request.error);
        });
        return image ? { ...material, image, kind: material.kind ?? 'image' as const } : material;
      })),
    },
  })));
  db.close();
  return { works };
}
