import { sha256Canonical } from './life-generation-bundle.js';
import { parseLifeHostDescriptor } from './life-host-descriptor-core.js';

export * from './life-host-descriptor-core.js';

/** Canonical authoring hash; runtime hosts import the browser-safe core instead. */
export function hashLifeHostDescriptor(raw: unknown): string {
  return sha256Canonical(parseLifeHostDescriptor(raw));
}
