const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface LifeVisualReference { readonly key: string; readonly pointer: string }

/** Closed traversal of Life v1 visual fields; arbitrary *skinKey properties are not silently accepted. */
export function collectLifeVisualReferences(raw: unknown): readonly LifeVisualReference[] {
  if (!record(raw)) return [];
  const out: LifeVisualReference[] = [];
  const add = (key: unknown, pointer: string): void => { if (typeof key === 'string' && key.length > 0) out.push({ key, pointer }); };
  if (record(raw.playerVisual)) add(raw.playerVisual.skinKey, '/playerVisual/skinKey');
  if (record(raw.profile) && Array.isArray(raw.profile.attributes)) raw.profile.attributes.forEach((entry, index) => { if (record(entry)) add(entry.iconSkinKey, `/profile/attributes/${index}/iconSkinKey`); });
  if (record(raw.tileCatalog)) for (const id of Object.keys(raw.tileCatalog).sort()) {
    const entry = raw.tileCatalog[id];
    if (record(entry) && record(entry.visual)) add(entry.visual.skinKey, `/tileCatalog/${id.replace(/~/g, '~0').replace(/\//g, '~1')}/visual/skinKey`);
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
  return out;
}

export function missingLifeVisualCatalogRules(raw: unknown, catalog: ReadonlyMap<string, unknown>): readonly LifeVisualReference[] {
  return collectLifeVisualReferences(raw).filter((reference) => !catalog.has(reference.key));
}
