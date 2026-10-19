import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import { applyWrite, buildIdLookup, compare, ctxOf } from '@engine/logic/index.js';
import type {
  Flag, LifeActionResult, LifeCalendar, LifeCalendarAdvanceResult,
  LifeDialogueSession, LifeFarmActionResult, LifeGatherActionResult, LifeHarvestActionResult,
  LifeMilestoneLedger, LifePlacement, LifePlantActionResult, LifeQuestCatalog, LifeQuestProjection,
  LifeQuestProjectionEntry, LifeQuestState, LifeQuestStateEntry, LifeResourceNode,
  LifeRelationshipCatalog, LifeRelationshipState, LifeSelectedTarget, LifeTalkActionResult, LifeTimeAdvanceResult, Resource,
} from '@engine/protocol/components.js';
import type { LifeQuestCondition, LifeQuestDefinition, LifeQuestEffect, LifeQuestNode, LifeQuestTrigger } from '@engine/protocol/life-sim.js';
import type { DialogueChoiceResult } from '@skills/tier3/dialogue.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';
import { findInventory, invAdd, invCanAdd, invCount, invRemove, type Inventory } from './inventory.js';
import { applyRelationshipBatch, validateRelationshipBatch, type RelationshipDeltaCandidate } from './life-relationship.js';

export const LIFE_QUEST_CAPABILITY_ID = 't2-life-quest';

interface QuestNodeRef {
  readonly chapterId: string;
  readonly quest: LifeQuestDefinition;
  readonly node: LifeQuestNode;
}

function nodeKey(questId: string, nodeId: string): string { return `${questId}\u0000${nodeId}`; }
function receiptKey(questId: string, nodeId: string): string { return `${questId}/${nodeId}`; }

function catalogNodes(catalog: LifeQuestCatalog): QuestNodeRef[] {
  const out: QuestNodeRef[] = [];
  for (const chapter of catalog.chapters) for (const quest of chapter.quests) for (const node of quest.nodes) out.push({ chapterId: chapter.id, quest, node });
  return out.sort((a, b) => b.quest.priority - a.quest.priority || a.quest.id.localeCompare(b.quest.id) || a.node.id.localeCompare(b.node.id));
}

function stateMap(state: LifeQuestState): Map<string, LifeQuestStateEntry> {
  return new Map(state.entries.map((entry) => [nodeKey(entry.questId, entry.nodeId), entry]));
}

/** Closed Life fact evaluator. It reads authoritative simulation components and never mirrors facts into game code. */
export function evaluateLifeQuestCondition(world: IWorld, condition: LifeQuestCondition): boolean {
  switch (condition.kind) {
    case 'always': return true;
    case 'and': return condition.of.every((entry) => evaluateLifeQuestCondition(world, entry));
    case 'or': return condition.of.some((entry) => evaluateLifeQuestCondition(world, entry));
    case 'not': return !evaluateLifeQuestCondition(world, condition.of);
    case 'flag': {
      const id = world.byId('Flag', 'id', condition.id);
      const flag = id === undefined ? undefined : world.getComponent<Flag>(id, 'Flag');
      return flag?.active === condition.equals;
    }
    case 'resource': {
      const id = world.byId('Resource', 'id', condition.id);
      const resource = id === undefined ? undefined : world.getComponent<Resource>(id, 'Resource');
      return resource !== undefined && resource.current >= condition.value;
    }
    case 'calendar': {
      const id = world.singleton('LifeCalendar');
      const calendar = id === undefined ? undefined : world.getComponent<LifeCalendar>(id, 'LifeCalendar');
      return !!calendar
        && (condition.seasonId === undefined || calendar.seasonId === condition.seasonId)
        && (condition.dayOfSeason === undefined || calendar.dayOfSeason === condition.dayOfSeason)
        && (condition.slotId === undefined || calendar.slotId === condition.slotId);
    }
    case 'inventory': {
      const inventory = findInventory(world, condition.inventoryId);
      return inventory !== undefined && invCount(inventory, condition.itemId) >= condition.count;
    }
    case 'milestone': {
      const id = world.singleton('LifeMilestoneLedger');
      const ledger = id === undefined ? undefined : world.getComponent<LifeMilestoneLedger>(id, 'LifeMilestoneLedger');
      return ledger?.completedIds.includes(condition.id) === true;
    }
    case 'resource-node': {
      for (const entity of sortedIds(world, 'LifePlacement', 'LifeResourceNode')) {
        const placement = world.getComponent<LifePlacement>(entity, 'LifePlacement');
        if (placement?.placementId !== condition.placementId) continue;
        const node = world.getComponent<LifeResourceNode>(entity, 'LifeResourceNode');
        return node !== undefined && compare(node.remaining, condition.cmp, condition.value);
      }
      return false;
    }
    case 'relationship': {
      const id=world.singleton('LifeRelationshipState');const state=id===undefined?undefined:world.getComponent<LifeRelationshipState>(id,'LifeRelationshipState');const entry=state?.entries.find((candidate)=>candidate.npcId===condition.npcId);if(!entry)return false;if(condition.levelId!==undefined&&entry.levelId!==condition.levelId)return false;return condition.value===undefined?condition.levelId!==undefined:compare(entry.value,condition.cmp??'gte',condition.value);
    }
  }
}

function appliedLifeAction(world: IWorld, action: LifeQuestTrigger & { kind:'life-action' }): boolean {
  const actor = 'life:player';
  let targetId: string | undefined;
  let applied = false;
  if (action.action === 'till' || action.action === 'water') {
    const result = world.getComponent<LifeFarmActionResult>(actor, 'LifeFarmActionResult');
    applied = result?.status === 'applied' && result.action === action.action;
  } else if (action.action === 'plant') {
    applied = world.getComponent<LifePlantActionResult>(actor, 'LifePlantActionResult')?.status === 'applied';
  } else if (action.action === 'harvest') {
    applied = world.getComponent<LifeHarvestActionResult>(actor, 'LifeHarvestActionResult')?.status === 'applied';
  } else if (action.action === 'forage' || action.action === 'mine') {
    const result = world.getComponent<LifeGatherActionResult>(actor, 'LifeGatherActionResult');
    applied = result?.status === 'applied' && result.action === action.action;
    targetId = result?.placementId;
  } else if (action.action === 'talk') {
    const result = world.getComponent<LifeTalkActionResult>(actor, 'LifeTalkActionResult');
    applied = result?.status === 'opened';
    targetId = result?.npcPlacementId;
  } else {
    const result = world.getComponent<LifeActionResult>(actor, 'LifeActionResult');
    applied = result?.status === 'accepted' && result.action === action.action;
  }
  targetId ??= world.getComponent<LifeSelectedTarget>(actor, 'LifeSelectedTarget')?.placementId;
  return applied && (action.targetId === undefined || action.targetId === targetId);
}

/** Matches only authoritative one-tick Life outcomes; it never observes UI/DOM state. */
export function lifeQuestTriggerMatches(world: IWorld, trigger: LifeQuestTrigger): boolean {
  switch (trigger.kind) {
    case 'game-start': return world.getVersion() === 0;
    case 'calendar': {
      const id = world.singleton('LifeCalendar');
      const calendar = id === undefined ? undefined : world.getComponent<LifeCalendar>(id, 'LifeCalendar');
      if (!calendar) return false;
      const boundary = trigger.boundary === 'day'
        ? world.getComponent<LifeCalendarAdvanceResult>(id!, 'LifeCalendarAdvanceResult')?.status === 'advanced'
        : world.getComponent<LifeTimeAdvanceResult>(id!, 'LifeTimeAdvanceResult')?.status === 'advanced';
      return boundary
        && (trigger.seasonId === undefined || calendar.seasonId === trigger.seasonId)
        && (trigger.dayOfSeason === undefined || calendar.dayOfSeason === trigger.dayOfSeason)
        && (trigger.slotId === undefined || calendar.slotId === trigger.slotId);
    }
    case 'life-action': return appliedLifeAction(world, trigger);
    case 'talk-choice': {
      for (const entity of sortedIds(world, 'DialogueChoiceResult', 'LifeDialogueSession')) {
        const result = world.getComponent<DialogueChoiceResult>(entity, 'DialogueChoiceResult');
        const session = world.getComponent<LifeDialogueSession>(entity, 'LifeDialogueSession');
        if (result?.status === 'applied' && session?.dialogueId === trigger.dialogueId && result.choiceId === trigger.choiceId) return true;
      }
      return false;
    }
    case 'harvest': {
      for (const entity of sortedIds(world, 'LifeHarvestActionResult')) {
        const result = world.getComponent<LifeHarvestActionResult>(entity, 'LifeHarvestActionResult');
        if (result?.status === 'applied'
          && (trigger.cropId === undefined || result.cropId === trigger.cropId)
          && (trigger.itemId === undefined || result.itemId === trigger.itemId)) return true;
      }
      return false;
    }
    case 'gather': {
      for (const entity of sortedIds(world, 'LifeGatherActionResult')) {
        const result = world.getComponent<LifeGatherActionResult>(entity, 'LifeGatherActionResult');
        if (result?.status === 'applied'
          && (trigger.action === undefined || result.action === trigger.action)
          && (trigger.placementId === undefined || result.placementId === trigger.placementId)
          && (trigger.itemId === undefined || result.itemId === trigger.itemId)) return true;
      }
      return false;
    }
  }
}

function effectWriteKey(effect: LifeQuestEffect): string {
  if (effect.kind === 'set-flag') return `flag:${effect.id}`;
  if (effect.kind === 'unlock') return `flag:${effect.flagId}`;
  if (effect.kind === 'add-resource') return `resource:${effect.id}`;
  if (effect.kind === 'inventory') return `inventory:${effect.inventoryId}:${effect.itemId}`;
  if (effect.kind === 'relationship-delta') return `relationship:${effect.npcId}`;
  return `quest:${effect.questId}:${effect.nodeId}`;
}

function preflight(world: IWorld, effects: readonly LifeQuestEffect[], states: ReadonlyMap<string, LifeQuestStateEntry>): string | undefined {
  const inventories=new Map<string,Inventory>();
  for (const effect of effects) {
    if (effect.kind === 'set-flag' || effect.kind === 'unlock') {
      const id = effect.kind === 'set-flag' ? effect.id : effect.flagId;
      if (world.byId('Flag', 'id', id) === undefined) return `missing flag ${id}`;
    } else if (effect.kind === 'add-resource') {
      if (!Number.isFinite(effect.amount) || world.byId('Resource', 'id', effect.id) === undefined) return `invalid resource ${effect.id}`;
    } else if (effect.kind === 'inventory') {
      const source=findInventory(world,effect.inventoryId);
      const inventory=source===undefined?undefined:inventories.get(effect.inventoryId)??{...source,items:source.items.map((item)=>({...item}))};
      if (!inventory || !Number.isSafeInteger(effect.amount) || effect.amount === 0) return `invalid inventory ${effect.inventoryId}`;
      if (effect.amount > 0 && !invCanAdd(inventory, effect.itemId, effect.amount)) return `inventory full ${effect.inventoryId}`;
      if (effect.amount < 0 && invCount(inventory, effect.itemId) < -effect.amount) return `inventory short ${effect.inventoryId}`;
      inventories.set(effect.inventoryId,inventory);
      if(effect.amount>0)invAdd(inventory,effect.itemId,effect.amount);else invRemove(inventory,effect.itemId,-effect.amount);
    } else if (effect.kind === 'relationship-delta') {
      if (!Number.isSafeInteger(effect.amount) || effect.amount === 0 || world.singleton('LifeRelationshipState') === undefined) return `invalid relationship ${effect.npcId}`;
    } else if (!states.has(nodeKey(effect.questId, effect.nodeId))) return `missing quest node ${effect.questId}/${effect.nodeId}`;
  }
  return undefined;
}

function applyEffect(world: IWorld, effect: LifeQuestEffect, states: ReadonlyMap<string, LifeQuestStateEntry>): void {
  if (effect.kind === 'set-flag') { applyWrite(ctxOf(world, buildIdLookup(world)), { to:{ flag:effect.id }, op:'set', value:effect.value }); return; }
  if (effect.kind === 'unlock') { applyWrite(ctxOf(world, buildIdLookup(world)), { to:{ flag:effect.flagId }, op:'set', value:true }); return; }
  if (effect.kind === 'add-resource') { applyWrite(ctxOf(world, buildIdLookup(world)), { to:{ res:effect.id }, op:'add', value:effect.amount }); return; }
  if (effect.kind === 'inventory') {
    const inventory = findInventory(world, effect.inventoryId)!;
    if (effect.amount > 0) invAdd(inventory, effect.itemId, effect.amount); else invRemove(inventory, effect.itemId, -effect.amount);
    return;
  }
  if (effect.kind === 'relationship-delta') return;
  states.get(nodeKey(effect.questId, effect.nodeId))!.state = effect.state;
}

export function buildLifeQuestProjection(catalog: LifeQuestCatalog, state: LifeQuestState): LifeQuestProjectionEntry[] {
  const states = stateMap(state);
  return catalogNodes(catalog).map(({ chapterId, quest, node }) => ({
    chapterId, questId:quest.id, nodeId:node.id,
    state:states.get(nodeKey(quest.id, node.id))?.state ?? 'locked',
    titleKey:node.titleKey, objectiveKey:node.objectiveKey,
  })).sort((a,b)=>a.chapterId.localeCompare(b.chapterId)||a.questId.localeCompare(b.questId)||a.nodeId.localeCompare(b.nodeId));
}

export const lifeQuestCapability = defineCapability({
  id:LIFE_QUEST_CAPABILITY_ID,
  version:'1.0.0',
  describe:{
    name:'life quest graph',
    summary:'Strict deterministic Life chapter/quest/node interpreter with domain triggers, closed conditions, atomic effects, conflict rejection and snapshot-safe projection.',
    semantic:['tier2','life-sim','quest','narrative','determinism'],
    whenToUse:'Compile LifeGamePackage.quests. UI reads LifeQuestProjection and never re-evaluates story conditions.',
    examples:['harvest turnip → complete harvest node + activate report node; mayor choice → unlock mine; gather ore → complete terminal node'],
  },
  components:{
    provides:{
      LifeQuestCatalog:defineComponent('LifeQuestCatalog',{chapters:t.arr(t.any())},{category:'config',describe:'Package-validated closed chapter/quest/node graph.',singleton:true}),
      LifeQuestState:defineComponent('LifeQuestState',{entries:t.arr(t.obj({questId:t.str(),nodeId:t.str(),state:t.enum(['locked','active','completed','failed'] as const)})),receipts:t.arr(t.str())},{category:'resource',describe:'Persistent node states and sorted one-shot receipts.',singleton:true}),
      LifeQuestProjection:defineComponent('LifeQuestProjection',{entries:t.arr(t.obj({chapterId:t.str(),questId:t.str(),nodeId:t.str(),state:t.enum(['locked','active','completed','failed'] as const),titleKey:t.str(),objectiveKey:t.str()}))},{category:'resource',describe:'Engine-derived read-only quest journal projection.',singleton:true}),
    },
    reads:['LifeQuestCatalog','LifeQuestState','LifeQuestProjection','LifeRelationshipCatalog','LifeRelationshipState','LifeRelationshipProjection','Flag','Resource','Inventory','LifeCalendar','LifeCalendarAdvanceResult','LifeTimeAdvanceResult','LifeMilestoneLedger','LifeResourceNode','LifePlacement','LifeActionResult','LifeFarmActionResult','LifePlantActionResult','LifeHarvestActionResult','LifeGatherActionResult','LifeTalkActionResult','LifeSelectedTarget','DialogueChoiceResult','LifeDialogueSession','DebugTrace'],
    writes:['LifeQuestState','LifeQuestProjection','LifeRelationshipState','LifeRelationshipProjection','Flag','Resource','Inventory'],
    consumes:['DialogueChoiceResult'],
  },
  config:{},
  systems:[{
    id:'life-quest', phase:SystemPhase.Commit,
    runsAfter:['life-milestone','life-affordance','life-construction','life-relationship','resource-apply','craft-recipe','weighted-spawn'],
    reads:['LifeQuestCatalog','LifeQuestState','LifeQuestProjection','LifeRelationshipCatalog','LifeRelationshipState','LifeRelationshipProjection','Flag','Resource','Inventory','LifeCalendar','LifeCalendarAdvanceResult','LifeTimeAdvanceResult','LifeMilestoneLedger','LifeResourceNode','LifePlacement','LifeActionResult','LifeFarmActionResult','LifePlantActionResult','LifeHarvestActionResult','LifeGatherActionResult','LifeTalkActionResult','LifeSelectedTarget','DialogueChoiceResult','LifeDialogueSession','DebugTrace'],
    writes:['LifeQuestState','LifeQuestProjection','LifeRelationshipState','LifeRelationshipProjection','Flag','Resource','Inventory'], consumes:['DialogueChoiceResult'],
    execute(world:IWorld){
      const catalogId=world.singleton('LifeQuestCatalog'), stateId=world.singleton('LifeQuestState'), projectionId=world.singleton('LifeQuestProjection');
      const catalog=catalogId===undefined?undefined:world.getComponent<LifeQuestCatalog>(catalogId,'LifeQuestCatalog');
      const state=stateId===undefined?undefined:world.getComponent<LifeQuestState>(stateId,'LifeQuestState');
      if(!catalog||!state||projectionId===undefined)return;
      const states=stateMap(state); const receipts=new Set(state.receipts); const matched:QuestNodeRef[]=[]; const conditionRejected:string[]=[];
      for(const ref of catalogNodes(catalog)){
        if(states.get(nodeKey(ref.quest.id,ref.node.id))?.state!=='active'||receipts.has(receiptKey(ref.quest.id,ref.node.id)))continue;
        if(!lifeQuestTriggerMatches(world,ref.node.trigger))continue;
        if(ref.node.when!==undefined&&!evaluateLifeQuestCondition(world,ref.node.when)){conditionRejected.push(`${ref.quest.id}/${ref.node.id}`);continue}
        matched.push(ref);
      }
      const debug=findDebugTrace(world), tick=debug?.tick??world.getVersion();
      if(matched.length===0){
        if(debug&&conditionRejected.length>0)appendTrace(debug,tick,'life-quest','reject','matched trigger but condition false',conditionRejected.join('|'));
        return;
      }
      if(debug)appendTrace(debug,tick,'life-quest','decision',`candidates=${matched.map((x)=>`${x.quest.id}/${x.node.id}`).join('|')}`,'priority→questId→nodeId');
      const winners:QuestNodeRef[]=[]; const losers:QuestNodeRef[]=[]; const claimedGroups=new Set<string>();
      for(const candidate of matched){const group=candidate.quest.exclusiveGroup;if(group&&claimedGroups.has(group)){losers.push(candidate);continue}if(group)claimedGroups.add(group);winners.push(candidate)}
      const writes=new Set<string>(); let conflict:string|undefined;
      for(const candidate of winners)for(const effect of candidate.node.effects){const key=effectWriteKey(effect);if(writes.has(key)){conflict=key;break}writes.add(key)}
      for(const candidate of losers){const key=`quest:${candidate.quest.id}:${candidate.node.id}`;if(writes.has(key)){conflict=key;break}writes.add(key)}
      const allEffects=winners.flatMap((candidate)=>[...candidate.node.effects]);
      const relationCandidates:RelationshipDeltaCandidate[]=winners.flatMap((winner)=>winner.node.effects.filter((effect):effect is Extract<LifeQuestEffect,{kind:'relationship-delta'}>=>effect.kind==='relationship-delta').map((effect)=>({ruleId:effect.ruleId,priority:effect.priority,...(effect.exclusiveGroup?{exclusiveGroup:effect.exclusiveGroup}:{}),npcId:effect.npcId,sourceId:`quest:${winner.quest.id}:${winner.node.id}`,channel:'action' as const,amount:effect.amount})));
      const relationCatalogId=world.singleton('LifeRelationshipCatalog'),relationCatalog=relationCatalogId===undefined?undefined:world.getComponent<LifeRelationshipCatalog>(relationCatalogId,'LifeRelationshipCatalog');
      if(relationCatalog)for(const winner of winners)for(const def of relationCatalog.relationships)for(const rule of def.rules)if(rule.trigger.kind==='quest-effect'&&rule.trigger.questId===winner.quest.id&&rule.trigger.nodeId===winner.node.id)relationCandidates.push({ruleId:rule.id,priority:rule.priority,...(rule.exclusiveGroup?{exclusiveGroup:rule.exclusiveGroup}:{}),npcId:def.npcId,sourceId:`quest:${winner.quest.id}:${winner.node.id}`,channel:'action',amount:rule.effect.amount});
      const ordinaryEffects=allEffects.filter((effect)=>effect.kind!=='relationship-delta');
      const relationInvalid=validateRelationshipBatch(world,relationCandidates);
      const invalid=conflict===undefined?(preflight(world,ordinaryEffects,states)??(relationInvalid.length?relationInvalid.join('|'):undefined)):`write conflict ${conflict}`;
      if(invalid!==undefined){if(debug)appendTrace(debug,tick,'life-quest','reject','atomic batch rejected',invalid);return}
      for(const candidate of winners){for(const effect of candidate.node.effects)applyEffect(world,effect,states);receipts.add(receiptKey(candidate.quest.id,candidate.node.id))}if(relationCandidates.length)applyRelationshipBatch(world,relationCandidates);
      for(const candidate of losers){states.get(nodeKey(candidate.quest.id,candidate.node.id))!.state='failed';receipts.add(receiptKey(candidate.quest.id,candidate.node.id))}
      state.receipts=[...receipts].sort(); state.entries=[...states.values()].sort((a,b)=>a.questId.localeCompare(b.questId)||a.nodeId.localeCompare(b.nodeId));
      const projection=world.getComponent<LifeQuestProjection>(projectionId,'LifeQuestProjection')!; projection.entries=buildLifeQuestProjection(catalog,state);
      if(debug)appendTrace(debug,tick,'life-quest','transition',winners.map((x)=>`${x.quest.id}/${x.node.id}`).join('|'),`effects committed atomically; exclusiveFailed=${losers.length}`);
      if(debug)appendTrace(debug,tick,'life-quest','commit',`receipts=${winners.length+losers.length}`,`writes=${writes.size}`);
    },
  }],
});
