import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { DebugTrace, Flag, LifeHarvestActionResult, LifeMilestoneCatalog, LifeMilestoneLedger, Resource } from '@engine/protocol/components.js';
import { queueResourceMod } from '@skills/atoms/resource/index.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

export const LIFE_MILESTONE_CAPABILITY_ID = 't2-life-milestone';

/** Data-declared Life success events → persistent logical facts. */
export const lifeMilestoneCapability = defineCapability({
  id: LIFE_MILESTONE_CAPABILITY_ID, version: '1.0.0',
  describe: { name: 'life milestone bridge', summary: 'Matches successful Life harvest outcomes against static milestone data and writes declared Flag/Resource effects deterministically.', semantic: ['life-sim','milestone','narrative'], whenToUse: 'Declare LifeGamePackage.milestones for reusable progression facts; dialogue/flow consume resulting Flag or Resource.', examples: ['harvest.applied crop.turnip → Flag{first_harvest:true} once'] },
  components: { provides: {
    LifeMilestoneCatalog: defineComponent('LifeMilestoneCatalog',{milestones:t.arr(t.any())},{category:'config',describe:'Validated static Life milestone declarations.',singleton:true}),
    LifeMilestoneLedger: defineComponent('LifeMilestoneLedger',{completedIds:t.arr(t.str())},{category:'resource',describe:'Sorted one-shot milestone ids; snapshot-safe.' ,singleton:true}),
  }, reads:['LifeHarvestActionResult','LifeMilestoneCatalog','LifeMilestoneLedger','Flag','Resource','DebugTrace'], writes:['LifeMilestoneLedger','Flag','ResourceModify'], consumes:[] }, config:{},
  systems:[{ id:'life-milestone', phase:SystemPhase.Commit, reads:['LifeHarvestActionResult','LifeMilestoneCatalog','LifeMilestoneLedger','Flag','Resource','DebugTrace'], writes:['LifeMilestoneLedger','Flag','ResourceModify'], consumes:[], execute(world:IWorld) {
    const catalogId=world.singleton('LifeMilestoneCatalog'), ledgerId=world.singleton('LifeMilestoneLedger'); const catalog=catalogId===undefined?undefined:world.getComponent<LifeMilestoneCatalog>(catalogId,'LifeMilestoneCatalog'); const ledger=ledgerId===undefined?undefined:world.getComponent<LifeMilestoneLedger>(ledgerId,'LifeMilestoneLedger'); if(!catalog||!ledger)return;
    const trace=findDebugTrace(world); let count=0; const record=(kind:'decision'|'commit'|'reject',what:string,why?:string)=>{if(trace&&count<3){appendTrace(trace,trace.tick??world.getVersion(),'life-milestone',kind,what,why);count++;}};
    const flags=new Map<string,Flag>(), resources=new Map<string,{entity:string;value:Resource}>(); for(const id of sortedIds(world,'Flag')){const f=world.getComponent<Flag>(id,'Flag');if(f)flags.set(f.id,f);} for(const id of sortedIds(world,'Resource')){const r=world.getComponent<Resource>(id,'Resource');if(r)resources.set(r.id,{entity:id,value:r});}
    for(const actorId of sortedIds(world,'LifeHarvestActionResult')) { const result=world.getComponent<LifeHarvestActionResult>(actorId,'LifeHarvestActionResult'); if(!result)continue; if(result.status!=='applied'){record('reject',`${actorId} milestone skipped`,'harvest-not-applied');continue;} for(const milestone of catalog.milestones) { if(milestone.trigger!=='harvest.applied'||(milestone.cropId!==undefined&&milestone.cropId!==result.cropId)||(milestone.itemId!==undefined&&milestone.itemId!==result.itemId)){record('reject',`${milestone.id} unmatched`,'harvest-filter');continue;} if(milestone.repeat==='once'&&ledger.completedIds.includes(milestone.id)){record('reject',`${milestone.id} skipped`,'already-completed');continue;} record('decision',`${milestone.id} matched`,result.cropId); for(const effect of milestone.effects.flags??[]){const flag=flags.get(effect.id);if(flag)flag.active=effect.value;} for(const effect of milestone.effects.resources??[]){const target=resources.get(effect.id);if(target)queueResourceMod(world,target.entity,effect.id,effect.amount,'global');} if(milestone.repeat==='once'){ledger.completedIds=[...ledger.completedIds,milestone.id].sort();} record('commit',`${milestone.id} applied`); } }
  }}],
});
