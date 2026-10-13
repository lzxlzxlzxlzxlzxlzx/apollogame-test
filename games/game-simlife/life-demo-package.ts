import type { LifeGamePackage } from '@zerocraft/engine/engine/protocol/life-sim.js';
import littleValleyPackage from './little-valley.life.json';

/** Type-only edge: the raw JSON is the sole authored Life package source. */
export const LITTLE_VALLEY_PACKAGE = littleValleyPackage as LifeGamePackage;
