import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { KnockbackRequest, Transform, DamageReceiver, DestroyRequest } from '@engine/protocol/components.js';
/** Resolves post-damage knockback in Commit.  Transform is only changed after
 * combat resolution, so it cannot feed same-tick aggro or contact. */
export const knockbackCapability=defineCapability({
 id:'t2-knockback',version:'1.0.0',
 describe:{name:'knockback',summary:'实际伤害后按来源至目标方向提交一次位移。',semantic:['combat','motion'],whenToUse:'命中反馈位移；免疫由目标Tag或数据过滤。',examples:['Hitbox{knockback:10}']},
 components:{provides:{KnockbackRequest:{category:'event',describe:'实际正伤害后生成的位移请求。',fields:{target:{type:'string',describe:'被击退目标'},source:{type:'string',describe:'方向来源'},distance:{type:'number',describe:'本次位移距离'}}}},reads:['KnockbackRequest','Transform','DamageReceiver','DestroyRequest'],writes:['Transform'],consumes:['KnockbackRequest']},config:{},
 systems:[{id:'knockback-apply',phase:SystemPhase.Commit,runsAfter:['damage-route','resource-apply'],reads:['KnockbackRequest','Transform','DamageReceiver','DestroyRequest'],writes:['Transform'],consumes:['KnockbackRequest'],execute(w:IWorld){
  const doomed=new Set(w.query('DestroyRequest').map(([,c])=>(c as DestroyRequest).entityId));
  for(const [id] of w.query('KnockbackRequest')){const k=w.getComponent<KnockbackRequest>(id,'KnockbackRequest')!;const t=w.getComponent<Transform>(k.target,'Transform'),s=w.getComponent<Transform>(k.source,'Transform');const receiver=w.getComponent<DamageReceiver>(k.target,'DamageReceiver');
   if(t&&s&&!doomed.has(k.target)&&!doomed.has(k.source)&&!receiver?.knockbackImmune){const dx=t.x-s.x,dy=t.y-s.y,d=Math.hypot(dx,dy)||1;t.x+=dx/d*k.distance;t.y+=dy/d*k.distance;}w.destroyEntity(id);
  }
 }}]
});

