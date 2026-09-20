import { armorMitigation } from './armor-mitigation.js';
import { findDebugTrace, appendTrace } from '../debug-trace.js';
import {defineCapability} from '@engine/core/define-capability.js';
import {SystemPhase} from '@engine/core/types.js';
import type {DamageRequest,DamageReceiver,Resource,LastDamage,QualifiedDamage,DeathConversion,Tag,Transform,PrefabLibrary,SpawnRequest,KnockbackRequest} from '@engine/protocol/components.js';
export const damageRoutingCapability=defineCapability({
 id:'t2-damage-routing',version:'1.0.0',
 describe:{name:'damage-routing',summary:'可选共享伤害池、有效伤害来源及一次性死亡转换。',semantic:['combat','damage'],whenToUse:'分别可选中的部位共用生命；按最后有效直接伤害来源转换。',examples:['头部减伤但扣本体生命']},
 components:{provides:{
  DamageReceiver:{category:'config',describe:'部位直接伤害路由；targetEntity省略为自身，multiplier仅作用本部位。',fields:{resource:{type:'string',describe:'共享资源'},targetEntity:{type:'string',describe:'池实体'},multiplier:{type:'number',describe:'非负倍率'},armor:{type:'number',describe:'非负护甲，省略为0'},toughness:{type:'number',describe:'非负韧性，省略为0'}}},
  DamageRequest:{category:'event',describe:'Hitbox产生的有序直接伤害请求。',fields:{target:{type:'string',describe:'命中部位'},source:{type:'string',describe:'伤害来源'},sourceTags:{type:'number',describe:'来源标签快照'},resource:{type:'string',describe:'资源'},amount:{type:'number',describe:'原始伤害'},damageType:{type:'string',describe:'normal/true'},armorPiercing:{type:'boolean',describe:'护甲与韧性归零'},afterArmorAmount:{type:'number',describe:'部位倍率和护甲后的结算请求'},armorUsed:{type:'number',describe:'本次使用护甲'},toughnessUsed:{type:'number',describe:'本次使用韧性'},appliedAmount:{type:'number',describe:'结算回执：实际扣除为正、实际恢复为负；系统写入，非输入'}}},
  LastDamage:{category:'marker',describe:'最后实际降低生命的伤害来源/来源标签快照/命中部位/伤害量。',fields:{source:{type:'string',describe:'最后有效来源'},sourceTags:{type:'number',describe:'来源标签'},part:{type:'string',describe:'部位'},amount:{type:'number',describe:'实际扣血量'}}},
  QualifiedDamage:{category:'marker',describe:'保留最后满足DeathConversion来源掩码的直接正伤害，普通/间接/周期伤害不覆盖。',fields:{source:{type:'string',describe:'直接来源'},sourceTags:{type:'number',describe:'来源阵营与分类快照'},part:{type:'string',describe:'命中部位'},amount:{type:'number',describe:'实际扣血'}}},
  DeathConversion:{category:'config',describe:'按最终生命/来源标签/原最大生命与Tag顺序匹配转换；remaining逐代递减。',fields:{resource:{type:'string',describe:'生命资源'},remaining:{type:'number',describe:'剩余转换次数'},sourceMask:{type:'number',describe:'合法来源标签'},rules:{type:'string',describe:'有序{template,requireTag?,minMaxHp?,maxMaxHp?}列表'}}},
  DeathConverted:{category:'marker',describe:'本实体已处理转换；幂等。',fields:{}},
 },reads:['DamageReceiver','Resource','DeathConversion','LastDamage','QualifiedDamage','Tag','Transform','PrefabLibrary','DeathConverted'],writes:['Resource','LastDamage','QualifiedDamage','DeathConverted','SpawnRequest','DamageRequest','KnockbackRequest'],consumes:['DamageRequest']},config:{},
 systems:[{
  id:'damage-route',phase:SystemPhase.Resolve,runsAfter:['hitbox'],runsBefore:['resource-apply'],
  reads:['DamageReceiver','Resource','DeathConversion'],writes:['Resource','LastDamage','QualifiedDamage','DamageRequest','KnockbackRequest'],consumes:['DamageRequest'],
  execute(w){const trace=findDebugTrace(w);let handled=0,rejected=0,total=0;for(const [id] of w.query('DamageRequest')){
   const request=w.getComponent<DamageRequest>(id,'DamageRequest')!,receiver=w.getComponent<DamageReceiver>(request.target,'DamageReceiver');
   request.appliedAmount=0;request.afterArmorAmount=0;request.armorUsed=0;request.toughnessUsed=0;
   const pool=receiver?.resource===request.resource?(receiver.targetEntity??request.target):request.target;
   const resource=w.getComponent<Resource>(pool,'Resource'),factor=receiver?.resource===request.resource?(receiver.multiplier??1):1;
   const armor=receiver?.resource===request.resource?(receiver.armor??0):0,toughness=receiver?.resource===request.resource?(receiver.toughness??0):0;
   const category=request.damageCategory??(request.damageType==='true'?'true':'melee');
   if(receiver?.rejectDamageCategories?.includes(category)){ rejected++; w.destroyEntity(id); continue; }
   const categoryMultiplier=receiver?.damageCategoryMultipliers?.[category]??1;
   if(resource?.id===request.resource&&[factor,armor,toughness,request.amount,categoryMultiplier].every(Number.isFinite)&&factor>=0&&armor>=0&&toughness>=0&&categoryMultiplier>=0){
    const bypass=request.damageType==='true'||request.armorPiercing===true;request.armorUsed=bypass?0:armor;request.toughnessUsed=bypass?0:toughness;
    request.afterArmorAmount=armorMitigation(request.amount*factor*categoryMultiplier,request.armorUsed,request.toughnessUsed,bypass);
    const before=resource.current;resource.current=Math.max(resource.min,Math.min(resource.max,before-request.afterArmorAmount));
    request.appliedAmount=before-resource.current;handled++;total+=request.appliedAmount;
    if(resource.current<before){
      const record={source:request.source,sourceTags:request.sourceTags,part:request.target,amount:before-resource.current};
      w.addComponent(pool,{type:'LastDamage',...record} as LastDamage);
      const conversion=w.getComponent<DeathConversion>(pool,'DeathConversion');
      if(conversion?.retainQualifiedSource&&conversion.resource===request.resource&&(request.origin===undefined||request.origin==='direct')&&(request.sourceTags&conversion.sourceMask)!==0)w.addComponent(pool,{type:'QualifiedDamage',...record} as QualifiedDamage);
      if((request.knockback??0)>0){const kb=`knockback:${id}`;w.createEntity(kb);w.addComponent(kb,{type:'KnockbackRequest',target:request.target,source:request.source,distance:request.knockback!} as KnockbackRequest);}
    }
   }else rejected++;
   w.destroyEntity(id);
  }if(trace){if(handled)appendTrace(trace,trace.tick ?? 0,'damage-route','commit',`requests=${handled};actualDelta=${total}`);if(rejected)appendTrace(trace,trace.tick ?? 0,'damage-route','reject',`invalid requests=${rejected}`);}}
 },{
  id:'death-conversion',phase:SystemPhase.Resolve,runsAfter:['resource-apply','damage-route'],runsBefore:['mortal','targeted-prefab-spawn'],
  reads:['DeathConversion','DeathConverted','Resource','LastDamage','QualifiedDamage','Tag','Transform','PrefabLibrary'],writes:['DeathConverted','SpawnRequest'],consumes:[],
  execute(w){for(const [id] of w.query('DeathConversion','Resource')){
   const config=w.getComponent<DeathConversion>(id,'DeathConversion')!,hp=w.getComponent<Resource>(id,'Resource')!;
   if(hp.id!==config.resource||hp.current>hp.min||config.remaining<=0||w.hasComponent(id,'DeathConverted'))continue;
   w.addComponent(id,{type:'DeathConverted'});
   const last=config.retainQualifiedSource?w.getComponent<QualifiedDamage>(id,'QualifiedDamage'):w.getComponent<LastDamage>(id,'LastDamage');if(!last||(last.sourceTags&config.sourceMask)===0)continue;
   const flags=w.getComponent<Tag>(id,'Tag')?.flags??0;
   const rule=config.rules.find(r=>(!r.requireTag||(flags&r.requireTag)===r.requireTag)&&(!r.requireSourceTag||(last.sourceTags&r.requireSourceTag)===r.requireSourceTag)&&(r.minMaxHp===undefined||hp.max>=r.minMaxHp)&&(r.maxMaxHp===undefined||hp.max<=r.maxMaxHp));if(!rule)continue;
   const lib=w.query('PrefabLibrary').map(([e])=>w.getComponent<PrefabLibrary>(e,'PrefabLibrary')!).find(l=>l.templates[rule.template]);if(!lib)continue;
   const overrides:Record<string,Record<string,any>>={};
   for(const [key,entity] of Object.entries(lib.templates[rule.template].entities))if(entity.DeathConversion)overrides[key]={DeathConversion:{remaining:Math.max(0,config.remaining-1)}};
   const position=w.getComponent<Transform>(id,'Transform'),carrier=`convert:${id}`;w.createEntity(carrier);
   w.addComponent(carrier,{type:'SpawnRequest',templateId:rule.template,x:position?.x??0,y:position?.y??0,source:last.source,overrides} as SpawnRequest);
  }}
 }]
});
