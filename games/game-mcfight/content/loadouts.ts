import data from './loadouts.json';
import type { R2Loadout } from './r2-types.js';
// JSON heterogeneous objects infer optional undefined keys; validated at the content gate.
export const skillLoadouts = data as unknown as R2Loadout[];
