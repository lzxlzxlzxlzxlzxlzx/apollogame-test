import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage, compileLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import type { DebugTrace, Flag, LifeMilestoneLedger, LifeQuestCatalog, LifeQuestProjection, LifeQuestState, Resource } from '@engine/protocol/components.js';
import type { LifeQuestCondition } from '@engine/protocol/life-sim.js';
import { SystemPhase } from '@engine/core/types.js';
import { hashWithOrder } from '@net/determinism.js';
import { Engine } from '@runtime/engine.js';
import type { DialogueChoiceResult } from '@skills/tier3/dialogue.js';
import type { Inventory } from './inventory.js';
import { evaluateLifeQuestCondition, lifeQuestCapability, lifeQuestTriggerMatches } from './life-quest.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function questPackage(): any {
  const value: any = copy(threeSceneLifePackage());
  value.itemCatalog.push({ id:'seed.turnip', kind:'seed', skinKey:'item:turnip-seed' }, { id:'crop.turnip', kind:'crop', skinKey:'item:turnip' }, { id:'resource.ore', kind:'resource', skinKey:'item:ore' });
  value.playerInventory.items = [{ itemId:'crop.turnip', count:1 }];
  value.cropCatalog = [{ id:'turnip', seedItemId:'seed.turnip', harvestItemId:'crop.turnip', growthDays:1 }];
  value.calendar = { seasons:[{ id:'spring', lengthDays:28 }], initialSeasonId:'spring', initialDayOfSeason:1, slots:['morning','afternoon'], initialSlot:'morning' };
  value.logic = { flags:[{ id:'flag.a', initial:false }, { id:'flag.b', initial:false }], resources:[{ id:'renown', initial:1, min:0, max:9 }] };
  value.milestones = [{ id:'first', trigger:'harvest.applied', repeat:'once', effects:{ flags:[{ id:'flag.b', value:true }] } }];
  value.dialogueCatalog = [{ id:'mayor.greeting', graph:{ start:{ kind:'choice', speaker:'Mayor', prompt:'?', options:[{ id:'report', text:'Report', next:'end' }] }, end:{ kind:'line', speaker:'Mayor', text:'Done', next:null } } }];
  value.quests = [{ id:'chapter', titleKey:'Chapter', quests:[{
    id:'quest.a', chapterId:'chapter', priority:20, exclusiveGroup:'opening', initialNodeId:'start', terminalNodeIds:['start'],
    nodes:[{ id:'start', titleKey:'A', objectiveKey:'Do A', trigger:{ kind:'game-start' }, effects:[
      { kind:'set-flag', id:'flag.a', value:true }, { kind:'add-resource', id:'renown', amount:2 },
      { kind:'inventory', inventoryId:'bag:life:player', itemId:'resource.ore', amount:1 },
      { kind:'set-node-state', questId:'quest.a', nodeId:'start', state:'completed' },
    ] }],
  }, {
    id:'quest.b', chapterId:'chapter', priority:10, exclusiveGroup:'opening', initialNodeId:'start', terminalNodeIds:['start'],
    nodes:[{ id:'start', titleKey:'B', objectiveKey:'Do B', trigger:{ kind:'game-start' }, effects:[
      { kind:'set-flag', id:'flag.a', value:false },
      { kind:'set-node-state', questId:'quest.b', nodeId:'start', state:'completed' },
    ] }],
  }] }];
  return value;
}

function make(trace=false): Engine {
  const engine = new Engine();
  engine.load(compileAndParseLifeGamePackage(questPackage()).blueprint);
  if (trace) { engine.world.createEntity('trace'); engine.world.addComponent('trace', { type:'DebugTrace', events:[], tick:1, max:30 } as DebugTrace); }
  return engine;
}

describe('t2-life-quest', () => {
  it('evaluates every closed condition family from authoritative Life state', () => {
    const engine=make(); const world=engine.world;
    world.getComponent<LifeMilestoneLedger>('life:milestone-ledger','LifeMilestoneLedger')!.completedIds=['first'];
    const conditions: LifeQuestCondition[] = [
      { kind:'always' }, { kind:'flag', id:'flag.a', equals:false }, { kind:'resource', id:'renown', value:1 },
      { kind:'calendar', seasonId:'spring', dayOfSeason:1, slotId:'morning' },
      { kind:'inventory', inventoryId:'bag:life:player', itemId:'crop.turnip', count:1 },
      { kind:'milestone', id:'first' }, { kind:'resource-node', placementId:'berry-bush', cmp:'gte', value:3 },
      { kind:'and', of:[{ kind:'always' }, { kind:'not', of:{ kind:'flag', id:'flag.a', equals:true } }] },
      { kind:'or', of:[{ kind:'flag', id:'flag.a', equals:true }, { kind:'resource', id:'renown', value:1 }] },
    ];
    expect(conditions.map((condition)=>evaluateLifeQuestCondition(world,condition))).toEqual(Array(conditions.length).fill(true));
    expect(evaluateLifeQuestCondition(world,{kind:'resource-node',placementId:'berry-bush',cmp:'eq',value:2})).toBe(false);
  });

  it('matches closed trigger outcomes without reading presentation state', () => {
    const engine=make(); const world=engine.world;
    expect(lifeQuestTriggerMatches(world,{kind:'game-start'})).toBe(true);
    world.addComponent('life:calendar',{type:'LifeTimeAdvanceResult',status:'advanced',fromSlotId:'morning',toSlotId:'afternoon'} as any);
    world.getComponent<any>('life:calendar','LifeCalendar')!.slotId='afternoon';
    expect(lifeQuestTriggerMatches(world,{kind:'calendar',boundary:'slot',slotId:'afternoon'})).toBe(true);
    world.addComponent('life:player',{type:'LifeHarvestActionResult',status:'applied',sceneId:'farm',x:1,y:1,cropId:'turnip',itemId:'crop.turnip',quantity:1} as any);
    expect(lifeQuestTriggerMatches(world,{kind:'harvest',cropId:'turnip',itemId:'crop.turnip'})).toBe(true);
    expect(lifeQuestTriggerMatches(world,{kind:'life-action',action:'harvest'})).toBe(true);
    world.addComponent('life:player',{type:'LifeGatherActionResult',status:'applied',action:'forage',placementId:'berry-bush',itemId:'resource.berry',quantity:1,remaining:2} as any);
    expect(lifeQuestTriggerMatches(world,{kind:'gather',action:'forage',placementId:'berry-bush',itemId:'resource.berry'})).toBe(true);
    world.createEntity('dialogue');
    world.addComponent('dialogue',{type:'LifeDialogueSession',npcPlacementId:'mayor',dialogueId:'mayor.greeting'} as any);
    world.addComponent('dialogue',{type:'DialogueChoiceResult',status:'applied',choiceId:'report',index:0,fromNode:'start',toNode:'end'} as DialogueChoiceResult);
    expect(lifeQuestTriggerMatches(world,{kind:'talk-choice',dialogueId:'mayor.greeting',choiceId:'report'})).toBe(true);
  });

  it('commits an exclusive winner atomically once, updates projection, and emits at most three trace records', () => {
    const engine=make(true); engine.world.tick();
    expect(lifeQuestCapability.systems[0]!.phase).toBe(SystemPhase.Commit);
    expect(engine.world.getComponent<Flag>('life:logic:flag:flag.a','Flag')!.active).toBe(true);
    expect(engine.world.getComponent<Resource>('life:logic:resource:renown','Resource')!.current).toBe(3);
    expect(engine.world.getComponent<Inventory>('life:player','Inventory')!.items).toContainEqual({kind:'resource.ore',count:1});
    expect(engine.world.getComponent<LifeQuestState>('life:quest-state','LifeQuestState')).toMatchObject({ receipts:['quest.a/start','quest.b/start'], entries:expect.arrayContaining([
      {questId:'quest.a',nodeId:'start',state:'completed'}, {questId:'quest.b',nodeId:'start',state:'failed'},
    ]) });
    expect(engine.world.getComponent<LifeQuestProjection>('life:quest-projection','LifeQuestProjection')!.entries).toEqual(expect.arrayContaining([expect.objectContaining({questId:'quest.a',state:'completed'}),expect.objectContaining({questId:'quest.b',state:'failed'})]));
    const trace=engine.world.getComponent<DebugTrace>('trace','DebugTrace')!;
    expect(trace.events.filter((event)=>event.system==='life-quest').map((event)=>event.kind)).toEqual(['decision','transition','commit']);
    trace.events=[]; engine.world.tick();
    expect(engine.world.getComponent<Resource>('life:logic:resource:renown','Resource')!.current).toBe(3);
    expect(trace.events.filter((event)=>event.system==='life-quest')).toEqual([]);
  });

  it('fails a conflicting batch closed with no partial writes or receipts', () => {
    const engine=make(true);
    const catalog=engine.world.getComponent<LifeQuestCatalog>('life:quest-catalog','LifeQuestCatalog')!;
    for(const quest of catalog.chapters[0]!.quests) delete (quest as {exclusiveGroup?:string}).exclusiveGroup;
    engine.world.tick();
    expect(engine.world.getComponent<Flag>('life:logic:flag:flag.a','Flag')!.active).toBe(false);
    expect(engine.world.getComponent<Resource>('life:logic:resource:renown','Resource')!.current).toBe(1);
    expect(engine.world.getComponent<LifeQuestState>('life:quest-state','LifeQuestState')!.receipts).toEqual([]);
    expect(engine.world.getComponent<DebugTrace>('trace','DebugTrace')!.events).toEqual(expect.arrayContaining([expect.objectContaining({system:'life-quest',kind:'reject',why:'write conflict flag:flag.a'})]));
  });

  it('supports inventory removal and rolls every earlier effect back when preflight cannot satisfy it', () => {
    const run=(amount:number)=>{const raw=questPackage();raw.quests[0].quests.splice(1);delete raw.quests[0].quests[0].exclusiveGroup;raw.quests[0].quests[0].nodes[0].effects[2]={kind:'inventory',inventoryId:'bag:life:player',itemId:'crop.turnip',amount};const engine=new Engine();engine.load(compileAndParseLifeGamePackage(raw).blueprint);engine.world.tick();return engine};
    const accepted=run(-1);
    expect(accepted.world.getComponent<Inventory>('life:player','Inventory')!.items.some((item)=>item.kind==='crop.turnip')).toBe(false);
    expect(accepted.world.getComponent<Flag>('life:logic:flag:flag.a','Flag')!.active).toBe(true);
    const rejected=run(-2);
    expect(rejected.world.getComponent<Inventory>('life:player','Inventory')!.items).toContainEqual({kind:'crop.turnip',count:1});
    expect(rejected.world.getComponent<Flag>('life:logic:flag:flag.a','Flag')!.active).toBe(false);
    expect(rejected.world.getComponent<Resource>('life:logic:resource:renown','Resource')!.current).toBe(1);
    expect(rejected.world.getComponent<LifeQuestState>('life:quest-state','LifeQuestState')!.receipts).toEqual([]);

    const crowded=questPackage();crowded.quests[0].quests.splice(1);delete crowded.quests[0].quests[0].exclusiveGroup;crowded.playerInventory={slots:1,maxStack:1,items:[]};crowded.quests[0].quests[0].nodes[0].effects.splice(3,0,{kind:'inventory',inventoryId:'bag:life:player',itemId:'crop.turnip',amount:1});
    const crowdedEngine=new Engine();crowdedEngine.load(compileAndParseLifeGamePackage(crowded).blueprint);crowdedEngine.world.tick();
    expect(crowdedEngine.world.getComponent<Inventory>('life:player','Inventory')!.items).toEqual([]);
    expect(crowdedEngine.world.getComponent<Flag>('life:logic:flag:flag.a','Flag')!.active).toBe(false);
  });

  it('canonicalizes declaration order and keeps quest state snapshot/hash/restore stable', () => {
    const forward=questPackage(), reversed=questPackage(); reversed.quests[0].quests.reverse();
    expect(compileLifeGamePackage(reversed)).toEqual(compileLifeGamePackage(forward));
    const first=make(); first.world.tick(); const snapshot=first.world.snapshot(), order=first.world.snapshotOrder(); const hash=hashWithOrder(snapshot,order);
    const second=make(); second.world.restore(snapshot,order);
    expect(second.world.snapshotOrder()).toEqual(order);
    expect(hashWithOrder(second.world.snapshot(),second.world.snapshotOrder())).toBe(hash);
    expect(second.world.getComponent<LifeQuestState>('life:quest-state','LifeQuestState')).toEqual(first.world.getComponent<LifeQuestState>('life:quest-state','LifeQuestState'));
  });
});
