import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { VolleyPlan, SpawnRequest } from '@engine/protocol/components.js';

/** Emits independent SpawnRequests from a single cast plan. */
export const volleyEmitterCapability = defineCapability({
  id:'t3-volley-emitter', version:'1.0.0',
  describe:{name:'volley-emitter',summary:'VolleyPlan→按间隔生成独立投射物 SpawnRequest；每枚继承来源快照和固定方向。',semantic:['tier3','projectile','combat'],whenToUse:'需要一次施法产生多枚独立投射物时使用。',examples:['三连火球','双羽齐射']},
  components:{provides:{VolleyPlan:{category:'config',describe:'一次齐射计划',fields:{castId:{type:'string',describe:'施法编号'},templateId:{type:'string',describe:'投射物模板'},source:{type:'string',describe:'来源实体'},sourceTagSnapshot:{type:'number',describe:'来源阵营快照'},count:{type:'number',describe:'数量'},intervalTicks:{type:'number',describe:'间隔 Tick'},nextShotIndex:{type:'number',describe:'下一枚索引'},nextEmitTick:{type:'number',describe:'下一发射 Tick'},aimX:{type:'number',describe:'固定方向 X'},aimY:{type:'number',describe:'固定方向 Y'},speed:{type:'number',describe:'速度'},shotMaxDistance:{type:'number',describe:'最大距离'}}}},reads:['VolleyPlan','Resource','Status'],writes:['VolleyPlan','SpawnRequest'],consumes:[]},
  config:{},
  systems:[{id:'volley-emitter',phase:1,runsAfter:['flow'],reads:['VolleyPlan','Resource','Status'],writes:['VolleyPlan','SpawnRequest'],consumes:[],execute(world:IWorld){
    const now=world.getVersion();
    for(const [id] of world.query('VolleyPlan')){ const p=world.getComponent<VolleyPlan>(id,'VolleyPlan')!; const sourceAlive=world.hasComponent(p.source,'Resource'); const sourceStatus=world.getComponent<any>(p.source,'Status'); if(p.cancelled||!sourceAlive||sourceStatus?.flags&16||world.hasComponent(id,'DestroyRequest')){world.destroyEntity(id);continue;} while(p.nextShotIndex<p.count && p.nextEmitTick<=now){
      const target= p.targetId ? world.getComponent<any>(p.targetId,'Resource') : undefined; if(p.targetId && (!target || target.current<=target.min)){p.cancelled=true;break;}
      const i=p.nextShotIndex++; const spread=p.spread?.kind==='seeded-uniform' ? (((((p.seed??0)+i*1664525)>>>0)/4294967296)*2-1)*p.spread.halfAngleRadians : 0; const c=Math.cos(spread),s=Math.sin(spread); const dx=p.aimX*c-p.aimY*s,dy=p.aimX*s+p.aimY*c; const st=world.getComponent<any>(p.source,'Transform');
      // A plan can emit several bullets in one tick.  SpawnRequest is one
      // component per entity, so every shot gets its own short-lived request
      // entity rather than overwriting the previous request on the plan.
      const shot={source:p.source,sourceTags:p.sourceTagSnapshot,targetId:p.targetId,maxDistance:p.shotMaxDistance,castId:p.castId,shotIndex:i};
      const requestId=`${id}:shot:${i}`;
      world.createEntity(requestId);
      world.addComponent(requestId,{type:'SpawnRequest',spawnPhase:'resolve',templateId:p.templateId,x:st?.x??0,y:st?.y??0,source:p.source,projectileShot:shot,overrides:{zone:{ProjectileFlight:{shot},Launch:{speed:p.speed,toward:'dir',dirX:dx,dirY:dy}}}} as unknown as SpawnRequest);
      p.nextEmitTick += p.intervalTicks;
      if(p.intervalTicks>0) break;
    }
    if(p.cancelled||p.nextShotIndex>=p.count) world.destroyEntity(id);
    }
  }}]
});
