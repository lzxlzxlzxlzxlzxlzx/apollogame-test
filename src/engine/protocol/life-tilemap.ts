import type { LifeLayer, LifeLayerName, LifeTileCatalogEntry, LifeTileTag } from './life-sim.js';

/** Reads RLE directly; it never materializes a width×height tile array. */
export function lifeTileAt(layers: readonly LifeLayer[], name: LifeLayerName, width: number, x: number, y: number): string | undefined {
  const layer = layers.find((candidate) => candidate.name === name);
  if (!layer || x < 0 || y < 0 || x >= width) return undefined;
  let remaining = y * width + x;
  for (const run of layer.tiles) { if (remaining < run.count) return run.tileId; remaining -= run.count; }
  return undefined;
}

export function lifeTileTags(catalog: readonly LifeTileCatalogEntry[], tileId: string | undefined): readonly LifeTileTag[] {
  return tileId === undefined ? [] : (catalog.find((entry) => entry.tileId === tileId)?.tags ?? []);
}

/** Static ground tags at one coordinate. Reads the RLE stream directly and never creates cell entities. */
export function lifeGroundTagsAt(layers: readonly LifeLayer[], catalog: readonly LifeTileCatalogEntry[], width: number, x: number, y: number): readonly LifeTileTag[] {
  return lifeTileTags(catalog, lifeTileAt(layers, 'ground', width, x, y));
}

/** Navigation passability: ground must allow walking; either other layer may block. */
export function isLifeWalkable(layers: readonly LifeLayer[], catalog: readonly LifeTileCatalogEntry[], width: number, x: number, y: number): boolean {
  const ground = lifeGroundTagsAt(layers, catalog, width, x, y);
  if (!ground.includes('walkable') || ground.includes('blocked')) return false;
  for (const layer of ['collision', 'interaction'] as const) if (lifeTileTags(catalog, lifeTileAt(layers, layer, width, x, y)).includes('blocked')) return false;
  return true;
}
