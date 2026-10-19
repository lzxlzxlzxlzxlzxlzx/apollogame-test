import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { LifeActor, LifeCalendar, LifeNpcSchedule, LifePlacement, LifePosition, Transform } from '@engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

export const LIFE_NPC_SCHEDULE_CAPABILITY_ID = 't2-life-npc-schedule';

const entrySchema = t.obj({ slot:t.str(), sceneId:t.str(), x:t.num(), y:t.num(), visible:t.bool(), interactive:t.bool() });

/** Applies complete author projections only at deterministic Life calendar slot boundaries. */
export const lifeNpcScheduleCapability = defineCapability({
  id:LIFE_NPC_SCHEDULE_CAPABILITY_ID,
  version:'1.0.0',
  describe:{
    name:'life npc schedule',
    summary:'Relocates authored Life NPC placements at deterministic intra-day slot boundaries, including visibility and interaction eligibility.',
    semantic:['tier2','life-sim','npc','schedule','determinism'],
    whenToUse:'Compile a Life NPC placement with one complete schedule entry per calendar slot. Slot changes are instantaneous and snapshot-safe.',
    examples:['morning town:2,2 → afternoon hall:1,1'],
  },
  components:{
    provides:{
      LifeNpcSchedule:defineComponent('LifeNpcSchedule',{entries:t.arr(entrySchema),currentSlot:t.str()},{category:'resource',describe:'Complete per-slot NPC projections plus the last applied slot cursor.'}),
    },
    reads:['LifeCalendar','LifeActor','LifeNpcSchedule','LifePlacement','Transform','LifePosition','DebugTrace'],
    writes:['LifeNpcSchedule','LifePlacement','Transform','LifePosition'],
    consumes:[],
  },
  config:{},
  systems:[{
    id:'life-npc-schedule',
    runsAfter:['life-calendar','life-navigation'],
    runsBefore:['life-activity','life-affordance','life-target-selection','life-talk'],
    reads:['LifeCalendar','LifeActor','LifeNpcSchedule','LifePlacement','DebugTrace'],
    writes:['LifeNpcSchedule','LifePlacement'],
    consumes:[],
    execute(world:IWorld){
      const calendarId=world.singleton('LifeCalendar');
      const calendar=calendarId===undefined?undefined:world.getComponent<LifeCalendar>(calendarId,'LifeCalendar');
      if(!calendar?.slotId)return;
      const pending=sortedIds(world,'LifeActor','LifeNpcSchedule','LifePlacement').filter((id)=>{
        const actor=world.getComponent<LifeActor>(id,'LifeActor');
        const schedule=world.getComponent<LifeNpcSchedule>(id,'LifeNpcSchedule');
        return actor?.kind==='npc'&&!!schedule&&schedule.currentSlot!==calendar.slotId;
      });
      if(pending.length===0)return;
      const debug=findDebugTrace(world); const tick=debug?.tick??world.getVersion();
      if(debug)appendTrace(debug,tick,'life-npc-schedule','decision',`slot=${calendar.slotId}`,`npcs=${pending.join('|')}`);
      const changed:string[]=[]; const rejected:string[]=[];
      for(const id of pending){
        const schedule=world.getComponent<LifeNpcSchedule>(id,'LifeNpcSchedule')!;
        const placement=world.getComponent<LifePlacement>(id,'LifePlacement')!;
        const entry=schedule.entries.find((candidate)=>candidate.slot===calendar.slotId);
        if(!entry){rejected.push(id);continue}
        placement.sceneId=entry.sceneId; placement.x=entry.x; placement.y=entry.y; placement.visible=entry.visible; placement.interactive=entry.interactive;
        schedule.currentSlot=calendar.slotId;
        changed.push(id);
      }
      if(debug&&rejected.length>0)appendTrace(debug,tick,'life-npc-schedule','reject','missing slot projection',rejected.join('|'));
      if(debug&&changed.length>0)appendTrace(debug,tick,'life-npc-schedule','transition',`applied slot=${calendar.slotId}`,changed.join('|'));
      if(debug&&rejected.length===0&&changed.length>0)appendTrace(debug,tick,'life-npc-schedule','commit',`npc projections=${changed.length}`,calendar.slotId);
    },
  },{
    id:'life-npc-schedule-position',
    phase:SystemPhase.Commit,
    // Bounds clamps the player only; schedule projection owns NPC transforms and commits afterwards.
    runsAfter:['bounds-clamp','facing'],
    reads:['LifeActor','LifeNpcSchedule','LifePlacement','Transform','LifePosition'],
    writes:['Transform','LifePosition'],
    consumes:[],
    execute(world:IWorld){
      for(const id of sortedIds(world,'LifeActor','LifeNpcSchedule','LifePlacement','Transform','LifePosition')){
        const actor=world.getComponent<LifeActor>(id,'LifeActor');
        if(actor?.kind!=='npc')continue;
        const placement=world.getComponent<LifePlacement>(id,'LifePlacement')!;
        const transform=world.getComponent<Transform>(id,'Transform')!;
        const position=world.getComponent<LifePosition>(id,'LifePosition')!;
        if(transform.x!==placement.x||transform.y!==placement.y){transform.x=placement.x;transform.y=placement.y}
        if(position.sceneId!==placement.sceneId||position.x!==placement.x||position.y!==placement.y){
          position.sceneId=placement.sceneId;position.x=placement.x;position.y=placement.y;
        }
      }
    },
  }],
});
