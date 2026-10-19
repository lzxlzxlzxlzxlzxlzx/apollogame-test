import type { IWorld } from '../../engine/core/types.js';
import type {
  LifeActionResult,
  LifeActivityContext,
  LifeCalendar,
  LifeCalendarAdvanceResult,
  LifeDialogueSession,
  LifeFarmActionResult,
  LifeGatherActionResult,
  LifeGiftActionResult,
  LifeHarvestActionResult,
  LifeInteractionAffordance,
  LifeItemCatalog,
  LifePlantActionResult,
  LifePosition,
  LifePlayerVisual,
  LifeProfileCatalog,
  LifeQuestCatalog,
  LifeQuestProjection,
  LifeRelationshipProjection,
  LifeScene,
  LifeSelectedItem,
  LifeSelectedTarget,
  LifeTalkActionResult,
  LifeTimeAdvanceResult,
  Transform,
  LifeWarpResult,
  LifeWarp,
  State,
  Text,
  Resource,
} from '../../engine/protocol/components.js';
import type { Inventory } from '../../skills/tier2/inventory.js';
import { invFreeSlots } from '../../skills/tier2/inventory.js';
import type { DialogueScript } from '../../skills/tier3/dialogue.js';
import { optionAvailable } from '../../skills/tier3/dialogue.js';
import type { DialogueSource } from '../../ui/components/index.js';
import { resolveLifePose } from '../../engine/protocol/life-pose.js';
import type { LifeHostCalendarLabels } from '../../authoring/life-host-descriptor-core.js';

export type LifeHostQuestState = 'active' | 'locked' | 'completed' | 'failed';
export interface LifeHostQuestItem {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly questId: string;
  readonly title: string;
  readonly summary: string;
  readonly state: LifeHostQuestState;
  readonly completedNodes: number;
  readonly visibleNodes: number;
  readonly tracked: boolean;
  readonly nextObjective: string;
}
export interface LifeHostQuestTracking {
  readonly questId?: string;
  readonly defaultPolicy?: 'first-active' | 'none';
}
export interface LifeHostProfileAttribute {readonly id:string;readonly title:string;readonly iconSkinKey:string;readonly display:'value'|'gauge';readonly surfaces:readonly ('profile'|'hud')[];readonly value:number;readonly min:number;readonly max:number;readonly levelId?:string;readonly levelTitle?:string}
export interface LifeHostProfileView {readonly title:string;readonly playerSkinKey?:string;readonly attributes:readonly LifeHostProfileAttribute[]}

export interface LifeHostViewModel {
  readonly scene: string;
  readonly x: number;
  readonly y: number;
  /** Continuous player footpoint in tile units; render-only consumers never write it back. */
  readonly poseX: number;
  readonly poseY: number;
  readonly date: string;
  readonly slot: string;
  readonly placeLabel: string;
  readonly canInteract: boolean;
  readonly interactionSummary: string;
  readonly inventory: readonly { itemId: string; count: number }[];
  /** Stable, catalog-ordered, render-only inventory projection for shared host chrome. */
  readonly inventoryItems: readonly { id: string; title: string; kind: string; count: number; skinKey: string }[];
  readonly inventoryCapacity: { readonly usedSlots: number; readonly freeSlots: number; readonly totalSlots: number };
  readonly allowedActions: readonly string[];
  readonly nearby: readonly string[];
  readonly nearbyWarps: readonly string[];
  /** Player-facing labels for current-scene warp affordances, keyed by warp id. */
  readonly warpLabels?: Readonly<Record<string, string>>;
  readonly affordances: readonly LifeInteractionAffordance[];
  readonly selectedItem?: string;
  readonly selectedTarget?: string;
  readonly results: Readonly<Record<string, string>>;
  readonly dialogue?: string;
  readonly dialogueActive?: boolean;
  readonly dialogueTarget?: string;
  readonly dialogueKind?: 'line' | 'choice' | 'check';
  readonly dialogueTerminal?: boolean;
  readonly dialogueOptions?: readonly { index: number; label: string; available: boolean }[];
  readonly objective: string;
  /** Stable catalog/priority ordered join of engine-owned quest catalog and projection. */
  readonly questItems: readonly LifeHostQuestItem[];
  readonly relationships: readonly { npcId: string; value: number; levelId: string; levelTitle: string }[];
  readonly profile?:LifeHostProfileView;
}

const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  till: '翻土', water: '浇水', plant: '播种', harvest: '收获', forage: '采集', fish: '垂钓', mine: '采矿', buy: '购买', talk: '交谈', gift: '送礼', build: '建造', warp: '通行',
});

/** Stable fallback for authored identifiers; it never special-cases content ids. */
export function humanizeLifeId(id: string): string {
  const tail = id.split(':').at(-1) ?? id;
  return tail.split(/[._-]+/u).filter(Boolean).map((part) => /^[a-z]/u.test(part) ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part).join(' ') || id;
}

export function lifeResultFeedback(results: Readonly<Record<string, string>>): string | undefined {
  const rejected = results.warp?.startsWith('rejected') ? ['warp', results.warp] as const : Object.entries(results).find(([, value]) => value.startsWith('rejected'));
  return rejected ? `${humanizeLifeId(rejected[0])}: ${humanizeLifeId(rejected[1])}` : undefined;
}

export function createLifeDialogueSource(world: IWorld): DialogueSource {
  return {
    current(entityId) {
      const script = world.getComponent<DialogueScript>(entityId, 'DialogueScript');
      const state = world.getComponent<State>(entityId, 'State');
      const node = script && state ? script.nodes[state.current] : undefined;
      if (!node) return undefined;
      if (node.kind === 'line') return { kind: 'line', speaker: node.speaker, text: node.text, emotion: node.emotion };
      if (node.kind === 'choice') return { kind: 'choice', speaker: node.speaker, text: node.prompt, emotion: node.emotion, options: node.options.map((option) => ({ label: option.text, available: optionAvailable(world, option) })) };
      return { kind: 'check', speaker: node.speaker, text: node.prompt, emotion: node.emotion };
    },
  };
}

function projectQuestItems(
  catalog: LifeQuestCatalog | undefined,
  projection: LifeQuestProjection | undefined,
  tracking: LifeHostQuestTracking,
): readonly LifeHostQuestItem[] {
  if (!catalog || !projection) return [];
  const projected = new Map(projection.entries.map((entry) => [`${entry.questId}\u0000${entry.nodeId}`, entry] as const));
  const candidates = catalog.chapters.flatMap((chapter) => chapter.quests.map((quest) => {
    const nodes = quest.nodes.flatMap((node) => {
      const entry = projected.get(`${quest.id}\u0000${node.id}`);
      return entry === undefined ? [] : [entry];
    });
    const active = nodes.find((entry) => entry.state === 'active');
    const terminalCompleted = quest.terminalNodeIds.some((nodeId) => projected.get(`${quest.id}\u0000${nodeId}`)?.state === 'completed');
    const state: LifeHostQuestState = active
      ? 'active'
      : terminalCompleted
        ? 'completed'
        : nodes.some((entry) => entry.state === 'failed')
          ? 'failed'
          : 'locked';
    const current = active
      ?? nodes.find((entry) => entry.state === 'locked')
      ?? [...nodes].reverse().find((entry) => entry.state === 'completed' || entry.state === 'failed')
      ?? nodes[0];
    return {
      chapterId: chapter.id,
      chapterTitle: chapter.titleKey,
      questId: quest.id,
      priority: quest.priority,
      title: current?.titleKey ?? humanizeLifeId(quest.id),
      summary: chapter.titleKey,
      state,
      completedNodes: nodes.filter((entry) => entry.state === 'completed').length,
      visibleNodes: nodes.length,
      nextObjective: state === 'completed' ? '已完成' : (current?.objectiveKey ?? '—'),
    };
  })).sort((a, b) => a.chapterId.localeCompare(b.chapterId) || b.priority - a.priority || a.questId.localeCompare(b.questId));
  const requested = tracking.questId && candidates.some((item) => item.questId === tracking.questId) ? tracking.questId : undefined;
  const trackedQuestId = requested ?? (tracking.defaultPolicy === 'none' ? undefined : candidates.find((item) => item.state === 'active')?.questId);
  return candidates.map(({ priority: _priority, ...item }) => ({ ...item, tracked: item.questId === trackedQuestId }));
}

/** Pure, read-only host projection. All eligibility comes from engine-owned affordances. */
export function selectLifeHostView(
  world: IWorld,
  priorResults: Readonly<Record<string, string>> = {},
  questTracking: LifeHostQuestTracking = {},
  calendarLabels?: LifeHostCalendarLabels,
): LifeHostViewModel {
  const player = world.getComponent<LifePosition>('life:player', 'LifePosition');
  if (!player) throw new Error('Life host requires life:player/LifePosition');
  const pose = resolveLifePose(player, world.getComponent<Transform>('life:player', 'Transform'));
  const calendar = world.getComponent<LifeCalendar>('life:calendar', 'LifeCalendar');
  const bag = world.getComponent<Inventory>('life:player', 'Inventory');
  const itemCatalog = world.getComponent<LifeItemCatalog>('life:item-catalog', 'LifeItemCatalog');
  const context = world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext');
  const item = world.getComponent<LifeSelectedItem>('life:player', 'LifeSelectedItem');
  const target = world.getComponent<LifeSelectedTarget>('life:player', 'LifeSelectedTarget');
  const pairs: readonly [string, unknown][] = [
    ['action', world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')],
    ['farm', world.getComponent<LifeFarmActionResult>('life:player', 'LifeFarmActionResult')],
    ['plant', world.getComponent<LifePlantActionResult>('life:player', 'LifePlantActionResult')],
    ['harvest', world.getComponent<LifeHarvestActionResult>('life:player', 'LifeHarvestActionResult')],
    ['gather', world.getComponent<LifeGatherActionResult>('life:player', 'LifeGatherActionResult')],
    ['talk', world.getComponent<LifeTalkActionResult>('life:player', 'LifeTalkActionResult')],
    ['calendar', world.getComponent<LifeCalendarAdvanceResult>('life:calendar', 'LifeCalendarAdvanceResult')],
    ['time', world.getComponent<LifeTimeAdvanceResult>('life:calendar', 'LifeTimeAdvanceResult')],
    ['warp', world.getComponent<LifeWarpResult>('life:player', 'LifeWarpResult')],
    ['gift', world.getComponent<LifeGiftActionResult>('life:player', 'LifeGiftActionResult')],
  ];
  const results: Record<string, string> = { ...priorResults };
  for (const [name, result] of pairs) {
    if (result && typeof result === 'object' && 'status' in result) {
      const value = result as { status: string; reason?: string };
      results[name] = `${value.status}${value.reason ? `:${value.reason}` : ''}`;
    }
  }
  const dialogueEntity = 'life:dialogue-session:player';
  const text = world.getComponent<Text>(dialogueEntity, 'Text');
  const dialogueSession = world.getComponent<LifeDialogueSession>(dialogueEntity, 'LifeDialogueSession');
  const dialogueScript = world.getComponent<DialogueScript>(dialogueEntity, 'DialogueScript');
  const dialogueState = world.getComponent<State>(dialogueEntity, 'State');
  const dialogueNode = dialogueScript && dialogueState ? dialogueScript.nodes[dialogueState.current] : undefined;
  const dialogue = createLifeDialogueSource(world).current(dialogueEntity);
  const questProjection = world.getComponent<LifeQuestProjection>('life:quest-projection', 'LifeQuestProjection');
  const questCatalog = world.getComponent<LifeQuestCatalog>('life:quest-catalog', 'LifeQuestCatalog');
  const questItems = projectQuestItems(questCatalog, questProjection, questTracking);
  const trackedQuest = questItems.find((entry) => entry.tracked);
  const relationshipProjection = world.getComponent<LifeRelationshipProjection>('life:relationship-projection', 'LifeRelationshipProjection');
  const profileCatalog=world.getComponent<LifeProfileCatalog>('life:profile-catalog','LifeProfileCatalog');
  const playerVisual=world.getComponent<LifePlayerVisual>('life:player','LifePlayerVisual');
  const resources=new Map<string,Resource>();
  for(const[entityId]of world.query('Resource')){const resource=world.getComponent<Resource>(entityId,'Resource');if(resource)resources.set(resource.id,resource);}
  const relationshipValues=new Map((relationshipProjection?.entries??[]).map((entry)=>[entry.npcId,entry]));
  const profile=profileCatalog===undefined?undefined:{
    title:profileCatalog.titleKey,
    ...(playerVisual?{playerSkinKey:playerVisual.skinKey}:{}),
    attributes:profileCatalog.attributes.flatMap((attribute)=>{
      if(attribute.source.kind==='resource'){
        const value=resources.get(attribute.source.id);return value?[{id:attribute.id,title:attribute.titleKey,iconSkinKey:attribute.iconSkinKey,display:attribute.display,surfaces:attribute.surfaces??['profile'],value:value.current,min:value.min,max:value.max}]:[];
      }
      const value=relationshipValues.get(attribute.source.npcId);return value?[{id:attribute.id,title:attribute.titleKey,iconSkinKey:attribute.iconSkinKey,display:attribute.display,surfaces:attribute.surfaces??['profile'],value:value.value,min:value.min,max:value.max,levelId:value.levelId,levelTitle:value.levelTitleKey}]:[];
    }),
  } satisfies LifeHostProfileView;
  const affordances = context?.affordances ?? [];
  const scenes = new Map<string, LifeScene>();
  for (const [entityId] of world.query('LifeScene')) {
    const scene = world.getComponent<LifeScene>(entityId, 'LifeScene');
    if (scene) scenes.set(scene.sceneId, scene);
  }
  const warpLabels: Record<string, string> = {};
  for (const [entityId] of world.query('LifeWarp')) {
    const warp = world.getComponent<LifeWarp>(entityId, 'LifeWarp');
    if (!warp || warp.sceneId !== player.sceneId) continue;
    const destination = scenes.get(warp.toSceneId);
    warpLabels[warp.warpId] = warp.label ?? `前往${destination?.title ?? humanizeLifeId(warp.toSceneId)}`;
  }
  const summary = affordances.flatMap((entry) => entry.action === 'warp'
    ? [warpLabels[entry.targetId] ?? ACTION_LABELS.warp]
    : [ACTION_LABELS[entry.action] ?? humanizeLifeId(entry.action), entry.targetKind === 'tile' ? '' : humanizeLifeId(entry.targetId)])
    .filter((value, index, values) => value !== '' && values.indexOf(value) === index).join(' · ');
  const activeScene = scenes.get(player.sceneId);
  const inventoryCounts = new Map<string, number>();
  for (const stack of bag?.items ?? []) inventoryCounts.set(stack.kind, (inventoryCounts.get(stack.kind) ?? 0) + stack.count);
  const inventoryItems = (itemCatalog?.items ?? []).flatMap((definition) => {
    const count = inventoryCounts.get(definition.id) ?? 0;
    return count > 0 ? [{ id: definition.id, title: humanizeLifeId(definition.id), kind: definition.kind, count, skinKey: definition.skinKey }] : [];
  });
  // Presentation maps contain authored names, never a second calendar. Own-key
  // lookup also keeps arbitrary legacy IDs from resolving Object.prototype.
  const seasonLabel = calendar ? (calendarLabels?.seasons && Object.hasOwn(calendarLabels.seasons, calendar.seasonId)
    ? calendarLabels.seasons[calendar.seasonId] : humanizeLifeId(calendar.seasonId)) : '—';
  const slotLabel = calendar?.slotId ? (calendarLabels?.slots && Object.hasOwn(calendarLabels.slots, calendar.slotId)
    ? calendarLabels.slots[calendar.slotId] : humanizeLifeId(calendar.slotId)) : '—';
  return {
    scene: player.sceneId,
    x: player.x,
    y: player.y,
    poseX: pose.x,
    poseY: pose.y,
    date: calendar ? (calendarLabels ? `${seasonLabel}·第${calendar.dayOfSeason}天`
      : `${humanizeLifeId(calendar.seasonId)} ${calendar.dayOfSeason}日（第${calendar.totalDay}天）`) : '—',
    slot: slotLabel,
    placeLabel: activeScene?.title ?? humanizeLifeId(player.sceneId),
    canInteract: affordances.some((entry) => entry.available) || !!dialogue,
    interactionSummary: summary || '附近没有可互动对象',
    inventory: (bag?.items ?? []).map((stack) => ({ itemId: stack.kind, count: stack.count })),
    inventoryItems,
    inventoryCapacity: {
      usedSlots: bag?.items.length ?? 0,
      freeSlots: bag ? invFreeSlots(bag) : 0,
      totalSlots: bag?.slots ?? 0,
    },
    allowedActions: context?.allowedActions ?? [],
    nearby: context?.nearbyPlacementIds ?? [],
    nearbyWarps: context?.nearbyWarpIds ?? [],
    warpLabels,
    affordances,
    selectedItem: item?.itemId,
    selectedTarget: target?.placementId,
    results,
    dialogue: dialogue ? `${dialogue.speaker}：${dialogue.text}` : text?.content,
    dialogueActive: dialogueSession?.status === 'open',
    dialogueTarget: dialogueSession?.npcPlacementId,
    dialogueKind: dialogue?.kind,
    dialogueTerminal: dialogueNode?.kind === 'line' && dialogueNode.next === null,
    dialogueOptions: dialogue?.options?.map((option, index) => ({ index, label: option.label, available: option.available })),
    objective: trackedQuest?.nextObjective ?? '—',
    questItems,
    relationships: (relationshipProjection?.entries ?? []).map((entry) => ({ npcId: entry.npcId, value: entry.value, levelId: entry.levelId, levelTitle: entry.levelTitleKey })),
    ...(profile?{profile}:{}),
  };
}
