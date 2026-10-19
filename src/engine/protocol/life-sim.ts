import type { LifeViewportProfileId } from './life-viewport-profile.js';

// Life simulation authoring input.  This protocol intentionally contains no
// runtime objects: a later compiler may translate it into a World blueprint.

export const LIFE_GAME_PACKAGE_SCHEMA = 1 as const;
/** Host-to-simulation action carrying the complete physical direction bitmask (up=1, down=2, left=4, right=8). */
export const LIFE_MOVE_STATE_ACTION = 'life.move.state' as const;

export type LifeTileTag = 'walkable' | 'blocked' | 'plantable' | 'water' | 'forage' | 'mineable';
/** Authoring/render-only meaning of a ground tile. It never grants an action. */
export type LifeSurfaceKind = 'ground' | 'plantable' | 'water' | 'forage' | 'mineable' | 'blocked';
export type LifeLayerName = 'ground' | 'collision' | 'interaction';
export type LifeSpawnKind = 'player' | 'npc' | 'warp';
export type LifeZoneKind = 'farm' | 'forage' | 'fishing' | 'mining' | 'town' | 'interior';
export const LIFE_ACTIONS = ['till', 'water', 'plant', 'harvest', 'forage', 'fish', 'mine', 'buy', 'talk', 'gift', 'build'] as const;
export type LifeAction = typeof LIFE_ACTIONS[number];
export type LifePlacementKind = 'npc' | 'building' | 'resource' | 'interactable' | 'decoration';
export const LIFE_ITEM_KINDS = ['seed', 'crop', 'resource', 'tool', 'good', 'quest'] as const;
export type LifeItemKind = typeof LIFE_ITEM_KINDS[number];

export interface LifePoint { x: number; y: number }
export interface LifeRect extends LifePoint { width: number; height: number }

/** A run-length encoded row-major tile stream. */
export interface LifeTileRun { tileId: string; count: number }
export interface LifeLayer { name: LifeLayerName; tiles: readonly LifeTileRun[] }
/** Render-only opaque key consumed by the Life scene projection; no path or bytes belong in package data. */
export interface LifeTileVisual { skinKey: string; surface?: LifeSurfaceKind }
export interface LifeTileDefinition { tags: readonly LifeTileTag[]; visual?: LifeTileVisual }
export interface LifeTileCatalogEntry { tileId: string; tags: LifeTileTag[]; skinKey?: string }

export interface LifeSpawnPoint extends LifePoint { id: string; kind: LifeSpawnKind }
/** Closed, data-only access gate. No expressions or callbacks are accepted. */
export type LifeAccessRequirement = { kind: 'flag'; id: string; equals: boolean } | { kind: 'resource'; id: string; op: '>='; value: number };
/** v1 deliberately chooses rectangles rather than an arbitrary cell list. */
export interface LifeZone { id: string; kind: LifeZoneKind; rect: LifeRect; allowedActions: readonly LifeAction[]; requires?: LifeAccessRequirement }
export interface LifeWarp {
  id: string;
  /** Optional authored action copy. Hosts fall back to the destination scene title/id. */
  label?: string;
  /** Same-scene visible placement representing this exit. Authoring/render-only. */
  landmarkPlacementId?: string;
  /** Same-scene placement whose footprint is authoritative for explicit warp interaction. */
  interactionPlacementId?: string;
  at: LifePoint;
  toSceneId: string;
  toSpawnId: string;
  conditionRef?: string;
  requires?: LifeAccessRequirement;
}
export interface LifePlacement extends LifePoint {
  id: string;
  kind: LifePlacementKind;
  width: number;
  height: number;
  prefabRef: string;
  skinKey: string;
  /** Optional per-placement override of package interaction.nearbyRange (Manhattan grid cells). */
  interactionRange?: number;
  resourceNode?: { action: 'forage' | 'mine'; itemId: string; quantity: number };
  npcDialogue?: { dialogueId: string };
  /** Complete, deterministic per-slot projection for an authored NPC. */
  schedule?: readonly LifeNpcScheduleEntry[];
  requires?: LifeAccessRequirement;
}
export interface LifeNpcScheduleEntry extends LifePoint {
  slot: string;
  sceneId: string;
  visible: boolean;
  interactive: boolean;
}
export interface LifeDialogueDefinition { id: string; graph: Record<string, unknown> }
export interface LifeItemDefinition { id: string; kind: LifeItemKind; skinKey: string }
export interface LifeInitialInventoryStack { itemId: string; count: number }
export interface LifePlayerInventory { slots: number; maxStack: number; items: readonly LifeInitialInventoryStack[] }
export interface LifeConstructionMaterial { itemId: string; count: number }
/** A fixed-site, one-time construction project. Placement/removal and staged timers are intentionally outside v1. */
export interface LifeConstructionProject {
  id: string;
  placementId: string;
  materials: readonly LifeConstructionMaterial[];
  requires?: LifeAccessRequirement;
  completedSkinKey: string;
}
export interface LifeCropVisual { seededSkinKey: string; growingSkinKey: string; matureSkinKey: string }
/** Dynamic farm-surface art. These keys are render-only and excluded from World snapshots. */
export interface LifeWorldVisualSemantics {
  schema: 1;
  farm: { tilledDrySkinKey: string; wateredSkinKey: string };
}
export interface LifeCropDefinition { id: string; seedItemId: string; harvestItemId: string; growthDays: number; visual?: LifeCropVisual }
export interface LifeSeason { id: string; lengthDays: number }
export interface LifeCalendarDefinition {
  seasons: readonly LifeSeason[];
  initialSeasonId: string;
  initialDayOfSeason: number;
  /** Omitted by legacy packages: compiler supplies the stable single slot "day". */
  slots?: readonly string[];
  /** Required whenever slots is authored. */
  initialSlot?: string;
}
/** Tile units advanced on each simulation tick while a movement direction is held. */
export interface LifeMovementDefinition { speed: number }
/** How an open dialogue reacts when its NPC leaves the actor's compiled interaction range. */
export const LIFE_DIALOGUE_SESSION_POLICIES = ['persistent', 'proximity'] as const;
export type LifeDialogueSessionPolicy = typeof LIFE_DIALOGUE_SESSION_POLICIES[number];
export const DEFAULT_LIFE_DIALOGUE_SESSION_POLICY: LifeDialogueSessionPolicy = 'persistent';
/** Nearby interaction uses Manhattan distance to the closest cell of a half-open placement footprint. */
export interface LifeInteractionDefinition {
  nearbyRange: number;
  /** Omitted by legacy packages: an open session remains active away from its target. */
  dialogueSessionPolicy?: LifeDialogueSessionPolicy;
}
/** Engine-owned logical viewport. Games select a closed profile and author no camera numbers. */
export interface LifeCameraDefinition {
  profile: LifeViewportProfileId;
}
/** Player sprite declaration. bottom-center fixes the actor foot to its continuous Transform. */
export interface LifePlayerVisual { skinKey: string; anchor: 'bottom-center' }
export type LifeMilestoneTrigger = 'harvest.applied';
export type LifeMilestoneRepeat = 'once' | 'always';
export interface LifeMilestone { id: string; trigger: LifeMilestoneTrigger; cropId?: string; itemId?: string; repeat: LifeMilestoneRepeat; effects: { flags?: readonly { id: string; value: boolean }[]; resources?: readonly { id: string; amount: number }[] } }
export interface LifeLogicConfig { flags?: readonly { id: string; initial: boolean }[]; resources?: readonly { id: string; initial: number; min: number; max: number }[] }

export type LifeRelationshipCmp = 'lt' | 'lte' | 'eq' | 'ne' | 'gte' | 'gt';
export interface LifeRelationshipLevel { id:string; min:number; titleKey:string }
export interface LifeRelationshipDailyCaps { talk:number; gift:number; action:number }
export type LifeRelationshipTrigger =
  | { kind:'talk-opened' }
  | { kind:'talk-choice'; dialogueId:string; choiceId:string }
  | { kind:'life-action'; action:LifeAction; targetId?:string }
  | { kind:'harvest'; cropId?:string; itemId?:string }
  | { kind:'gather'; action?:'forage'|'mine'; placementId?:string; itemId?:string }
  | { kind:'gift'; itemId:string; count:number }
  | { kind:'quest-effect'; questId:string; nodeId:string };
export interface LifeRelationshipRule {
  id:string; priority:number; exclusiveGroup?:string;
  trigger:LifeRelationshipTrigger;
  effect:{kind:'relationship-delta'; amount:number};
}
export interface LifeRelationshipDefinition {
  npcId:string; min:number; max:number; initial:number;
  levels:readonly LifeRelationshipLevel[];
  dailyCaps:LifeRelationshipDailyCaps;
  rules:readonly LifeRelationshipRule[];
}

export type LifeProfileDisplay = 'value' | 'gauge';
export type LifeProfileSurface = 'profile' | 'hud';
export type LifeProfileSource =
  | { kind:'resource'; id:string }
  | { kind:'relationship'; npcId:string };
export interface LifeProfileAttribute {
  id:string;
  titleKey:string;
  display:LifeProfileDisplay;
  source:LifeProfileSource;
  iconSkinKey:string;
  /** Omitted preserves the profile-only surface used by existing packages. */
  surfaces?:readonly LifeProfileSurface[];
}
/** Read-only profile declaration. Current values always come from authoritative runtime components. */
export interface LifeProfileDefinition {
  titleKey:string;
  attributes:readonly LifeProfileAttribute[];
}

export type LifeQuestNodeState = 'locked' | 'active' | 'completed' | 'failed';
export type LifeQuestRemainingCmp = 'gte' | 'lte' | 'eq';
export type LifeQuestCondition =
  | { kind: 'always' }
  | { kind: 'and'; of: readonly LifeQuestCondition[] }
  | { kind: 'or'; of: readonly LifeQuestCondition[] }
  | { kind: 'not'; of: LifeQuestCondition }
  | { kind: 'flag'; id: string; equals: boolean }
  | { kind: 'resource'; id: string; value: number }
  | { kind: 'calendar'; seasonId?: string; dayOfSeason?: number; slotId?: string }
  | { kind: 'inventory'; inventoryId: string; itemId: string; count: number }
  | { kind: 'milestone'; id: string }
  | { kind: 'resource-node'; placementId: string; cmp: LifeQuestRemainingCmp; value: number }
  | { kind: 'relationship'; npcId:string; cmp?:LifeRelationshipCmp; value?:number; levelId?:string };
export type LifeQuestTrigger =
  | { kind: 'game-start' }
  | { kind: 'calendar'; boundary: 'slot' | 'day'; seasonId?: string; dayOfSeason?: number; slotId?: string }
  | { kind: 'life-action'; action: LifeAction; targetId?: string }
  | { kind: 'talk-choice'; dialogueId: string; choiceId: string }
  | { kind: 'harvest'; cropId?: string; itemId?: string }
  | { kind: 'gather'; action?: 'forage' | 'mine'; placementId?: string; itemId?: string };
export type LifeQuestEffect =
  | { kind: 'set-flag'; id: string; value: boolean }
  | { kind: 'add-resource'; id: string; amount: number }
  | { kind: 'inventory'; inventoryId: string; itemId: string; amount: number }
  | { kind: 'set-node-state'; questId: string; nodeId: string; state: LifeQuestNodeState }
  | { kind:'relationship-delta'; ruleId:string; priority:number; exclusiveGroup?:string; npcId:string; amount:number }
  | { kind: 'unlock'; flagId: string };
export interface LifeQuestNode {
  id: string;
  titleKey: string;
  objectiveKey: string;
  trigger: LifeQuestTrigger;
  when?: LifeQuestCondition;
  effects: readonly LifeQuestEffect[];
  loop?: boolean;
}
export interface LifeQuestDefinition {
  id: string;
  chapterId: string;
  priority: number;
  exclusiveGroup?: string;
  initialNodeId: string;
  terminalNodeIds: readonly string[];
  nodes: readonly LifeQuestNode[];
}
export interface LifeQuestChapter { id: string; titleKey: string; quests: readonly LifeQuestDefinition[] }

export interface LifeScene {
  id: string;
  /** Optional player-facing scene name. Legacy packages fall back to a stable humanized id. */
  title?: string;
  width: number;
  height: number;
  layers: readonly LifeLayer[];
  spawnPoints: readonly LifeSpawnPoint[];
  zones: readonly LifeZone[];
  warps: readonly LifeWarp[];
  placements: readonly LifePlacement[];
}

export interface LifeGamePackage {
  meta: { schema: typeof LIFE_GAME_PACKAGE_SCHEMA; id: string; title: string; tickRate?: number };
  world: { startSceneId: string };
  /** Omitted by legacy packages; mandatory at generation intake when plantable ground exists. */
  visualSemantics?: LifeWorldVisualSemantics;
  tileCatalog: Readonly<Record<string, LifeTileDefinition>>;
  /** Omitted in schema-v1 legacy packages = an empty catalog. */
  itemCatalog?: readonly LifeItemDefinition[];
  /** Omitted in schema-v1 legacy packages = bag:life:player with 10 slots, stack cap 99, and no items. */
  playerInventory?: LifePlayerInventory;
  cropCatalog?: readonly LifeCropDefinition[];
  calendar?: LifeCalendarDefinition;
  /** Omitted by legacy packages: the compiler supplies the stable default speed. */
  movement?: LifeMovementDefinition;
  /** Omitted by legacy packages: placements compile with the stable one-cell nearby range. */
  interaction?: LifeInteractionDefinition;
  /** Omitted by legacy packages: preserves the historical 20×15 Camera and generic follow defaults. */
  camera?: LifeCameraDefinition;
  playerVisual?: LifePlayerVisual;
  logic?: LifeLogicConfig;
  milestones?: readonly LifeMilestone[];
  dialogueCatalog?: readonly LifeDialogueDefinition[];
  quests?: readonly LifeQuestChapter[];
  relationships?: readonly LifeRelationshipDefinition[];
  /** Omitted = no profile surface or profile-review gate. */
  profile?: LifeProfileDefinition;
  /** Omitted in schema-v1 legacy packages = no construction projects. */
  constructionProjects?: readonly LifeConstructionProject[];
  scenes: readonly LifeScene[];
}
