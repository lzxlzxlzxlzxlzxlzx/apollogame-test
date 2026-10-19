import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { hashWithOrder } from '@net/determinism.js';
import { QueuedInputSource } from '@net/host/index.js';
import { compileAndParseLifeGamePackage, lifeEntityId } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import type { DebugTrace, LifeNpcSchedule, LifePlacement, LifePosition, Transform } from '@engine/protocol/components.js';

function scheduledPackage(): any {
  const raw:any=JSON.parse(JSON.stringify(threeSceneLifePackage()));
  raw.calendar={seasons:[{id:'spring',lengthDays:2}],initialSeasonId:'spring',initialDayOfSeason:1,slots:['morning','afternoon'],initialSlot:'morning'};
  raw.dialogueCatalog.push({id:'merchant.greeting',graph:{start:{kind:'line',speaker:'Merchant',text:'Hello.',next:null}}});
  const mayor=raw.scenes[0].placements[0];
  mayor.schedule=[
    {slot:'morning',sceneId:'town',x:1,y:1,visible:true,interactive:true},
    {slot:'afternoon',sceneId:'farm',x:2,y:1,visible:true,interactive:true},
  ];
  raw.scenes[0].placements.push({id:'merchant',kind:'npc',x:2,y:1,width:1,height:1,prefabRef:'npc.merchant',skinKey:'npc:mayor',npcDialogue:{dialogueId:'merchant.greeting'},schedule:[
    {slot:'morning',sceneId:'farm',x:2,y:1,visible:false,interactive:false},
    {slot:'afternoon',sceneId:'town',x:1,y:1,visible:true,interactive:false},
  ]});
  return raw;
}

function make(trace=false):Engine{
  const engine=new Engine();engine.load(compileAndParseLifeGamePackage(scheduledPackage()).blueprint);
  if(trace){engine.world.createEntity('trace');engine.world.addComponent('trace',{type:'DebugTrace',events:[],tick:1,max:20} as DebugTrace)}
  return engine;
}

function advanceTime(engine:Engine):void{
  const input=new QueuedInputSource('host');input.enqueueAction('life.advance-time');
  applyCommands(engine.world,input.commandsForTick(engine.world.getVersion()+1));engine.world.tick();
}

describe('t2-life-npc-schedule',()=>{
  it('projects every scheduled NPC instantaneously in stable id order at a slot boundary',()=>{
    const engine=make(true);const mayorId=lifeEntityId('placement','town','mayor');const merchantId=lifeEntityId('placement','town','merchant');
    advanceTime(engine);
    expect(engine.world.getComponent<LifePlacement>(mayorId,'LifePlacement')).toMatchObject({sceneId:'farm',x:2,y:1,visible:true,interactive:true});
    expect(engine.world.getComponent<LifePosition>(mayorId,'LifePosition')).toMatchObject({sceneId:'farm',x:2,y:1});
    expect(engine.world.getComponent<Transform>(mayorId,'Transform')).toMatchObject({x:2,y:1});
    expect(engine.world.getComponent<LifeNpcSchedule>(merchantId,'LifeNpcSchedule')).toMatchObject({currentSlot:'afternoon'});
    expect(engine.world.getComponent<LifePlacement>(merchantId,'LifePlacement')).toMatchObject({sceneId:'town',x:1,y:1,visible:true,interactive:false});
    const events=engine.world.getComponent<DebugTrace>('trace','DebugTrace')!.events.filter((event)=>event.system==='life-npc-schedule');
    expect(events.map((event)=>event.kind)).toEqual(['decision','transition','commit']);
    expect(events[0]?.why).toBe(`npcs=${[mayorId,merchantId].sort().join('|')}`);
  });

  it('is replay deterministic and the schedule cursor participates in the snapshot hash',()=>{
    const first=make();const second=make();advanceTime(first);advanceTime(second);
    expect(first.world.snapshotOrder()).toEqual(second.world.snapshotOrder());
    expect(hashWithOrder(first.world.snapshot(),first.world.snapshotOrder())).toBe(hashWithOrder(second.world.snapshot(),second.world.snapshotOrder()));
    const before=hashWithOrder(first.world.snapshot(),first.world.snapshotOrder());
    const mayorId=lifeEntityId('placement','town','mayor');
    first.world.getComponent<LifeNpcSchedule>(mayorId,'LifeNpcSchedule')!.currentSlot='morning';
    expect(hashWithOrder(first.world.snapshot(),first.world.snapshotOrder())).not.toBe(before);
  });
});
