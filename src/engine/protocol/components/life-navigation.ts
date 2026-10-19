import type { Component } from '../../core/types.js';

export interface LifeActor extends Component { readonly type: 'LifeActor'; actorId: string; kind: 'player' | 'npc' }
/** Persistent semantic movement state. Transform is the position authority; this stores only held intent. */
export interface LifeContinuousMotion extends Component { readonly type: 'LifeContinuousMotion'; sceneId: string; speed: number; up: boolean; down: boolean; left: boolean; right: boolean }
export interface LifePosition extends Component { readonly type: 'LifePosition'; sceneId: string; x: number; y: number }
export interface LifeMoveRequest extends Component { readonly type: 'LifeMoveRequest'; dx: number; dy: number }
export interface LifeWarpRequest extends Component { readonly type: 'LifeWarpRequest'; warpId: string }
