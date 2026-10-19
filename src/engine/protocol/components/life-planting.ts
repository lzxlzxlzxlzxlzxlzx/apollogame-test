import type { Component } from '../../core/types.js';
export interface LifeSelectedItem extends Component { readonly type:'LifeSelectedItem'; itemId:string }
export interface LifeCrop extends Component { readonly type:'LifeCrop'; cropId:string; plantedBy?:string; daysGrown:number; stage:'seeded'|'growing'|'mature' }
export interface LifePlantActionResult extends Component { readonly type:'LifePlantActionResult'; status:'applied'|'rejected'; reason?:'missing-plot'|'unprepared-soil'|'already-planted'|'missing-selection'|'selected-not-seed'|'unknown-crop'|'inventory-empty'|'invalid-scene'; sceneId:string; x:number; y:number; cropId?:string }

export const LIFE_HARVEST_REJECT_REASONS = ['missing-plot', 'missing-crop', 'not-mature', 'unknown-crop', 'invalid-harvest-item', 'inventory-full', 'invalid-scene'] as const;
export type LifeHarvestRejectReason = typeof LIFE_HARVEST_REJECT_REASONS[number];
/** One-tick result of harvesting a mature crop from the actor's current sparse plot. */
export interface LifeHarvestActionResult extends Component { readonly type:'LifeHarvestActionResult'; status:'applied'|'rejected'; reason?:LifeHarvestRejectReason; sceneId:string; x:number; y:number; cropId?:string; itemId?:string; quantity?:number }
