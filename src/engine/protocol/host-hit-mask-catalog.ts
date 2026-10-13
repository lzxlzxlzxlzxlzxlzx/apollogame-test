import type { HitMaskSpec } from './hit-mask.js';

// Session-scoped, non-snapshot runtime input. A restored World must be rebound to
// the same validated host input before accepting pointer commands.
export const HOST_MASK_PREFIX = 'host-mask:';
export interface HostHitMaskCatalog {
  get(key: string): HitMaskSpec | undefined;
}
const catalogs = new WeakMap<object, HostHitMaskCatalog>();

export function bindHostHitMaskCatalog(world: object, catalog: HostHitMaskCatalog): () => void {
  catalogs.set(world, catalog);
  return () => {
    if (catalogs.get(world) === catalog) catalogs.delete(world);
  };
}

export function resolveHostHitMask(world: object, key: string): HitMaskSpec | undefined {
  return catalogs.get(world)?.get(key);
}
