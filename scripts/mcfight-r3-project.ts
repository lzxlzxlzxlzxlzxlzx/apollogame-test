/** Offline projection of the approved R3 baseline; never imported by runtime. */
import { readFileSync, writeFileSync } from 'node:fs';
import { generate } from './mcfight-r2-generate.js';
const base='docs/design/game-mcfight/';
const approval=base+'r3-planner-resolution-batch-1.md';
export const LEGACY_PIXELS_PER_WORLD_UNIT=24;
const attributeKeys:Record<string,string>={price:'price',hp:'hp',speed:'moveSpeed',radius:'radius',armor:'armor',toughness:'armorToughness',attack:'attack',attackRange:'attackRange',attackInterval:'attackInterval'};
const spatial=new Set(['moveSpeed','radius','attackRange']);
export function projectR3(r2:any,cards:any[],facts:any[]) {
 const c=structuredClone(r2);
 const put=(u:any,path:string,value:number|string|boolean,status:string,sourceRef:string,reason:string)=>{
  const id=`adopt:${u.id}:${path}`;
  const record={id,unitId:u.id,path,status,value,sourceRef,reason,approvedBy:approval,unresolvedIds:[]};
  const i=c.adoption.findIndex((a:any)=>a.id===id);
  if(i<0)c.adoption.push(record);else c.adoption[i]=record;
  return {status,adoptionId:id,value};
 };
 for(const card of cards){
  const fact=facts[card.legacyUnitIndex],u=c.units.find((v:any)=>v.legacyId===card.id);
  if(!u||fact?.monsterId!==card.id)throw Error(`R3 identity mismatch: ${card.id}`);
  // The accepted six-unit demonstration is a scoped variant in the same unit record.
  if(u.runtimeAlias&&!u.s4Attributes){
   u.s4Attributes=structuredClone(u.attributes);
   for(const [key,v]of Object.entries(u.s4Attributes) as [string,any][]){
    const old=c.adoption.find((a:any)=>a.id===v.adoptionId);
    const id=`adopt:${u.id}:s4/attributes/${key}`;
    c.adoption.push({...old,id,path:`s4/attributes/${key}`});v.adoptionId=id;
   }
  }
  const ref=`${base}inventory/units.json#/${card.legacyUnitIndex}/effectiveAttributes/`;
  for(const [key,legacyKey]of Object.entries(attributeKeys)){
   const raw=fact.effectiveAttributes?.[legacyKey];
   if(typeof raw!=='number'||!Number.isFinite(raw))throw Error(`Missing effective attribute ${card.id}/${legacyKey}`);
   const normalized=spatial.has(legacyKey),value=normalized?raw/LEGACY_PIXELS_PER_WORLD_UNIT:raw;
   const status=normalized?'normalized':'adopted';
   const reason=normalized?'R3兼容基线：effectiveAttributes，24旧像素换算为1世界单位':'R3兼容基线：effectiveAttributes直接采用；时间仍使用秒';
   u.attributes[key]=put(u,`attributes/${key}`,value,status,ref+legacyKey,reason);
   put(u,`legacy/effectiveAttributes/${legacyKey}`,value,status,ref+legacyKey,reason);
  }
  u.compatibility='r3-batch-1';
  const owned=c.loadouts.filter((l:any)=>l.unitId===u.id&&l.variant==='restoration');
  if(fact.resolvedAbility==='MeleeAbility'&&u.movement==='ground'&&owned.length===1&&owned[0].templateIds.join()==='SK01'&&!owned[0].effects.length){
   const l=owned[0],profile=base+'inventory/mechanism-profiles.json#/MeleeAbility';
   u.attributes.targetEligibility=put(u,'attributes/targetEligibility','ground-enemy','rebuilt',approval,'地面单体近战启动检查；前摇后遵守CR04命中承诺');
   for(const [key,attribute]of [['damage','attack'],['cooldown','attackInterval'],['castRange','attackRange']] as const){
    const v=u.attributes[attribute];l.parameters[key]=put(u,`loadouts/${l.id}/${key}`,v.value,v.status,ref+attributeKeys[attribute],'兼容基本近战：采用有效攻击、攻击间隔和换算后的启动距离');
   }
   // Zero here is an explicitly recorded absence of legacy animation phases,
   // not a fallback for a missing parameter. Flow still advances at tick boundaries.
   for(const key of ['windup','recovery'])l.parameters[key]=put(u,`loadouts/${l.id}/${key}`,0,'rebuilt',profile,'旧基本近战没有前摇/后摇时长；R3保留零秒配置，生产Flow逐拍推进时序另记实测');
   l.parameters.hitReach=put(u,`loadouts/${l.id}/hitReach`,'captured-target','rebuilt',approval,'CR04：启动后承诺捕获目标，目标移动不重新限制距离');
   l.eligibility=put(u,`loadouts/${l.id}/targetEligibility`,'ground-enemy','rebuilt',approval,'普通地面近战启动只接受合法地面敌人');
   l.hitEligibility=put(u,`loadouts/${l.id}/hitEligibility`,'committed-living-enemy','rebuilt',approval,'CR04：承诺目标存活与敌方关系仍需成立');
  }
  if(fact.resolvedAbility==='AoeMeleeAbility'&&owned.length===1&&owned[0].templateIds.join()==='SK02'){
   const l=owned[0],profile=base+'inventory/ability-code-evidence.json#/AoeMeleeAbility/sourceText';
   u.attributes.targetEligibility=put(u,'attributes/targetEligibility','ground-enemy','rebuilt',approval,'地面范围攻击每次生效按地面资格判断');
   for(const[key,attribute]of [['damage','attack'],['cooldown','attackInterval'],['castRange','attackRange']] as const){const v=u.attributes[attribute];l.parameters[key]=put(u,`loadouts/${l.id}/${key}`,v.value,v.status,ref+attributeKeys[attribute],'旧有效属性投影；不采用未被旧能力读取的aoeRadius候选');}
   const values:Record<string,number|string>={windup:0,recovery:0,shape:'circle',radius:(fact.tags.includes('giant')?92:64)/24,angle:'not-applicable-to-circle',length:'not-applicable-to-circle'};
   for(const[key,value]of Object.entries(values))l.parameters[key]=put(u,`loadouts/${l.id}/${key}`,value,key==='radius'?'normalized':'rebuilt',profile,'旧AoeMelee立即释放；圆形使用真实代码giant分支/DEFAULT_AOE_RADIUS=64；圆形不适用角度与长度');
   l.eligibility=put(u,`loadouts/${l.id}/targetEligibility`,'ground-enemy','rebuilt',approval,'启动检查合法地面敌人');
   l.hitEligibility=put(u,`loadouts/${l.id}/hitEligibility`,'current-ground-enemy','rebuilt',approval,'范围攻击不继承单体前摇承诺，每次按当前资格判断');
  }
 }
 // These are authoring patches keyed by card identity, never executable combat branches.
 const patches:[string,string,Record<string,number>,string[]][]=[
  ['cataclysm_coral_golem','SK10',{damage:12.5,travelDuration:1.5,castRange:200/24,landingRadius:20/24,height:42/24},['castRange','landingRadius','height']],
  ['cataclysm_coralssus','SK10',{damage:11.5,travelDuration:1.6,castRange:200/24,landingRadius:28/24,height:42/24},['castRange','landingRadius','height']],
  ['cataclysm_deepling_warlock','SK08',{damage:14,cooldown:10,castRange:400/24,markDuration:3,warningDuration:1,tickCount:7,tickInterval:3/7,radius:50/24},['castRange','radius']],
  ['cataclysm_ignited_berserker','SK04',{damage:11,tickCount:2,tickInterval:1.5,radius:64/24},['radius']],
  ['cataclysm_ignited_berserker','SK03',{damage:14,hitCount:2},[]],
  ['cataclysm_ignited_revenant','SK04#旋转',{damage:6,tickCount:3,tickInterval:2/3,radius:20/24},['radius']],
  ['cataclysm_ignited_revenant','SK04#扇形火焰',{damage:4,tickCount:4,tickInterval:.5,castRange:64/24,angle:55},['castRange']],
  ['cataclysm_ignited_revenant','SK06',{damage:6,shotCount:4,shotInterval:.5,castRange:160/24},['castRange']],
  ['creeper','SK12',{damage:49,edgeDamage:49,radius:60/24,fuse:1.5,enemyMultiplier:1,allyMultiplier:.5},['radius']],
  ['twilightforest_minoshroom','SK01',{damage:13},[]],
  ['twilightforest_minoshroom','SK09',{damage:23,minCastRange:4,cooldown:3},[]],
 ];
 for(const [legacyId,family,parameters,normalized]of patches){
  const [templateId,label]=family.split('#');
  const u=c.units.find((x:any)=>x.legacyId===legacyId);
  const ls=c.loadouts.filter((l:any)=>l.unitId===u?.id&&l.variant==='restoration'&&l.templateIds.includes(templateId)&&(!label||l.label===label));
  if(!ls.length)throw Error(`Planner patch has no loadout: ${legacyId}/${family}`);
  for(const l of ls){
   const values={...parameters};
   if(family==='SK09')values.chargeSpeed=u.attributes.speed.value*3;
   for(const [key,value]of Object.entries(values))l.parameters[key]=put(u,`loadouts/${l.id}/${key}`,value,normalized.includes(key)?'normalized':'rebuilt',approval+'#3-七组旧缺参的策划处理','R3第一批明确裁定；不是R4最终平衡值');
  }
 }
 const cyclops=c.units.find((u:any)=>u.legacyId==='iceandfire_cyclops');
 const card=cards.find((u:any)=>u.id===cyclops.legacyId),fact=facts[card.legacyUnitIndex];
 const owner=base+'r3-owner-decisions.md',old=base+'inventory/ability-code-evidence.json#/CyclopsAbility/sourceText';
 cyclops.attributes.targetEligibility=put(cyclops,'attributes/targetEligibility','ground-and-air','rebuilt',approval,'CR15吞噬可对空；非阈值目标仅地面重击');
 for(const l of c.loadouts.filter((l:any)=>l.unitId===cyclops.id&&l.variant==='restoration')){
  const devour=l.templateIds.includes('SK20');
  const values:Record<string,number|string>=devour?{cooldown:5,castRange:42/24,windup:0,recovery:3,maxTargetHp:fact.firstWinsParams.devourThreshold,healing:0}:{damage:fact.firstWinsParams.aoeDamage,cooldown:2,castRange:42/24,windup:0,recovery:0,shape:'circle',radius:fact.firstWinsParams.aoeRadius/24,angle:'not-applicable-to-circle',length:'not-applicable-to-circle'};
  for(const[key,value]of Object.entries(values))l.parameters[key]=put(cyclops,`loadouts/${l.id}/${key}`,value,['castRange','radius'].includes(key)?'normalized':'rebuilt',devour&&['healing','cooldown'].includes(key)?owner:old,'吞噬无治疗/CD5秒按owner补充；其余为旧代码/有效参数的兼容投影，非R4平衡');
  l.eligibility=put(cyclops,`loadouts/${l.id}/targetEligibility`,devour?'enemy-max-hp-threshold':'ground-enemy','rebuilt',approval,'先按最大HP阈值选择吞噬，否则只能对地重击');
  l.hitEligibility=put(cyclops,`loadouts/${l.id}/hitEligibility`,devour?'destroy-on-successful-capture':'current-ground-enemy','rebuilt',owner,'吞噬用已授权公共捕获删除；范围按当前资格');
  l.gapIds=l.gapIds.filter((id:string)=>id!=='family:SK20');
 }
 const decision=c.decisions.find((d:any)=>d.id===cyclops.decisionId);decision.status='configured';decision.selection='priority';decision.orderedCandidates=[...decision.candidates];decision.constraints.complexSelection={status:'configured',strategy:'priority',sourceRef:approval};
 return c;
}
if(process.env.MCFIGHT_R3_PROJECT==='1'){
 const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
 const cards=read(base+'r1-unit-cards-v1.json').cards,facts=read(base+'inventory/units.json');
 const units=read('games/game-mcfight/content/units.json'),loadouts=read('games/game-mcfight/content/loadouts.json'),decisions=read('games/game-mcfight/content/decisions.json');
 const approved:any={units:{},skills:{}};
 for(const u of units.filter((u:any)=>u.runtimeAlias).sort((a:any,b:any)=>a.runtimeSelectionOrder.value-b.runtimeSelectionOrder.value)){
  const attrs=u.s4Attributes??u.attributes;
  approved.units[u.runtimeAlias]={name:u.name,role:u.role,...Object.fromEntries(Object.entries(attrs).filter(([,v]:any)=>v.status!=='pending-design').map(([k,v]:any)=>[k,v.value])),skills:decisions.find((d:any)=>d.id===u.decisionId).runtimeCandidates.map((id:string)=>loadouts.find((l:any)=>l.id===id).runtimeAlias)};
 }
 for(const l of loadouts.filter((l:any)=>l.variant==='s4-validated'))approved.skills[l.runtimeAlias]=Object.fromEntries(Object.entries(l.parameters).map(([k,v]:any)=>[k,v.value]));
 const c=projectR3(generate(cards,facts,approved),cards,facts);
 for(const [name,value]of Object.entries(c))writeFileSync(`games/game-mcfight/content/${name}.json`,JSON.stringify(value,null,2)+'\n');
 console.info('R3 compatibility projection: 84 identities; S4 scoped values preserved; no identity PASS inferred.');
}
