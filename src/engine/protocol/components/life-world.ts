// Protocol · LifeGamePackage static-world projection.  These are immutable
// authoring data, not movement, transition, rendering, or simulation state.
import type { Component } from '../../core/types.js';
import type { LifeAccessRequirement, LifeAction, LifeCropDefinition, LifeDialogueSessionPolicy, LifeItemDefinition, LifeLayer, LifeNpcScheduleEntry, LifePlacementKind, LifeQuestChapter, LifeQuestNodeState, LifeRect, LifeRelationshipDefinition, LifeSpawnKind, LifeTileCatalogEntry, LifeZoneKind } from '../life-sim.js';
import type { LifeMilestone } from '../life-sim.js';

export interface LifeWorld extends Component { readonly type: 'LifeWorld'; startSceneId: string }
export interface LifeTileCatalog extends Component { readonly type: 'LifeTileCatalog'; tiles: LifeTileCatalogEntry[] }
export interface LifeItemCatalog extends Component { readonly type: 'LifeItemCatalog'; items: LifeItemDefinition[] }
export interface LifeCropCatalog extends Component { readonly type: 'LifeCropCatalog'; crops: LifeCropDefinition[] }
export interface LifeCalendarConfig extends Component { readonly type: 'LifeCalendarConfig'; seasons: { id:string; lengthDays:number }[]; slots?:string[]; initialSlot?:string }
export interface LifeCalendar extends Component { readonly type: 'LifeCalendar'; totalDay:number; seasonId:string; dayOfSeason:number; slotId?:string }
export interface LifeCalendarAdvanceResult extends Component { readonly type:'LifeCalendarAdvanceResult'; status:'advanced'|'rejected'; reason?:'not-player'|'navigation-conflict'|'action-conflict'|'missing-calendar-config'; totalDay:number; seasonId:string; dayOfSeason:number }
export interface LifeTimeAdvanceResult extends Component { readonly type:'LifeTimeAdvanceResult'; status:'advanced'|'rejected'; reason?:'not-player'|'navigation-conflict'|'action-conflict'|'missing-calendar-config'; slotId:string; wrappedDay:boolean }
export interface LifeScene extends Component { readonly type: 'LifeScene'; sceneId: string; title?: string; width: number; height: number; layers: LifeLayer[] }
export interface LifeZone extends Component { readonly type: 'LifeZone'; sceneId: string; zoneId: string; kind: LifeZoneKind; geometry: LifeRect; allowedActions: LifeAction[]; requires?: LifeAccessRequirement }
export interface LifeWarp extends Component { readonly type: 'LifeWarp'; sceneId: string; warpId: string; label?: string; x: number; y: number; toSceneId: string; toSpawnId: string; conditionRef?: string; requires?: LifeAccessRequirement }
export interface LifeWarpResult extends Component { readonly type: 'LifeWarpResult'; status: 'applied'|'rejected'; reason?: 'unknown'|'not-at-warp'|'invalid-target'|'locked'; warpId?: string }
export interface LifeSpawn extends Component { readonly type: 'LifeSpawn'; sceneId: string; spawnId: string; kind: LifeSpawnKind; x: number; y: number }
/** Render-only player skin metadata compiled from LifeGamePackage.playerVisual. */
export interface LifePlayerVisual extends Component { readonly type: 'LifePlayerVisual'; skinKey: string; anchor: 'bottom-center' }
/** interactionRange is a compiled Manhattan-cell range to the closest point in this half-open footprint. */
export interface LifePlacement extends Component { readonly type: 'LifePlacement'; sceneId: string; placementId: string; kind: LifePlacementKind; x: number; y: number; width: number; height: number; prefabRef: string; skinKey: string; interactionRange: number; visible?:boolean; interactive?:boolean; npcDialogueId?:string; requires?: LifeAccessRequirement }
/** Author schedule plus the last applied slot. The cursor is persistent snapshot/hash state. */
export interface LifeNpcSchedule extends Component { readonly type:'LifeNpcSchedule'; entries:LifeNpcScheduleEntry[]; currentSlot:string }
export interface LifeResourceNode extends Component { readonly type: 'LifeResourceNode'; action:'forage'|'mine'; itemId:string; remaining:number }
export interface LifeSelectedTarget extends Component { readonly type:'LifeSelectedTarget'; placementId:string }
export const LIFE_GATHER_REASONS=['missing-selection','target-not-nearby','invalid-target','action-mismatch','depleted','invalid-item','inventory-full','invalid-scene'] as const;
export interface LifeGatherActionResult extends Component { readonly type:'LifeGatherActionResult'; action:'forage'|'mine'; status:'applied'|'rejected'; reason?:typeof LIFE_GATHER_REASONS[number]; placementId?:string; itemId?:string; quantity?:number; remaining?:number }
export interface LifeDialogueCatalog extends Component { readonly type:'LifeDialogueCatalog'; dialogues:{id:string;graph:Record<string,unknown>}[]; /** Omitted runtime field preserves legacy persistent sessions. */ sessionPolicy?:LifeDialogueSessionPolicy }
export interface LifeMilestoneCatalog extends Component { readonly type:'LifeMilestoneCatalog'; milestones: LifeMilestone[] }
export interface LifeMilestoneLedger extends Component { readonly type:'LifeMilestoneLedger'; completedIds: string[] }
export interface LifeDialogueSession extends Component { readonly type:'LifeDialogueSession'; npcPlacementId:string; dialogueId:string; status:'open' }
export const LIFE_TALK_REASONS=['missing-selection','target-not-nearby','invalid-target','not-npc','missing-dialogue','invalid-scene','session-conflict'] as const;
export interface LifeTalkActionResult extends Component { readonly type:'LifeTalkActionResult'; status:'opened'|'rejected'; reason?:typeof LIFE_TALK_REASONS[number]; npcPlacementId?:string; dialogueId?:string }
export interface LifeQuestCatalog extends Component { readonly type:'LifeQuestCatalog'; chapters:LifeQuestChapter[] }
export interface LifeQuestStateEntry { questId:string; nodeId:string; state:LifeQuestNodeState }
export interface LifeQuestState extends Component { readonly type:'LifeQuestState'; entries:LifeQuestStateEntry[]; receipts:string[] }
export interface LifeQuestProjectionEntry { chapterId:string; questId:string; nodeId:string; state:LifeQuestNodeState; titleKey:string; objectiveKey:string }
/** Engine-owned, read-only presentation projection. UI must not re-evaluate quest rules. */
export interface LifeQuestProjection extends Component { readonly type:'LifeQuestProjection'; entries:LifeQuestProjectionEntry[] }
export interface LifeRelationshipCatalog extends Component { readonly type:'LifeRelationshipCatalog'; relationships:LifeRelationshipDefinition[] }
export interface LifeRelationshipStateEntry { npcId:string; value:number; levelId:string; day:number; talkSpent:number; giftSpent:number; actionSpent:number }
export interface LifeRelationshipState extends Component { readonly type:'LifeRelationshipState'; entries:LifeRelationshipStateEntry[]; receipts:string[] }
export interface LifeRelationshipProjectionEntry { npcId:string; value:number; min:number; max:number; levelId:string; levelTitleKey:string; nextLevelAt?:number; talkRemaining:number; giftRemaining:number; actionRemaining:number }
export interface LifeRelationshipProjection extends Component { readonly type:'LifeRelationshipProjection'; entries:LifeRelationshipProjectionEntry[] }
export const LIFE_GIFT_REASONS=['missing-selection','invalid-target','invalid-item','missing-item','daily-cap','value-bound','conflict'] as const;
export interface LifeGiftActionResult extends Component { readonly type:'LifeGiftActionResult'; status:'applied'|'rejected'; reason?:typeof LIFE_GIFT_REASONS[number]; npcId?:string; itemId?:string; count?:number; requestedDelta?:number; appliedDelta?:number }
