/** Runtime consumes only the authoritative definitions, never the legacy inventory. */
import { unitDefinitions } from './units.js';
import { selectRuntimeUnit, requireContentNumber } from './runtime-selection.js';
import { secondsToTicks } from './s4-balance.js';
import type { CombatCatalog } from '../s4-world.js';
export const R3_INITIAL_GOLD=1000;
const STANDARD_PROJECTILE_IDS=new Set(['pillager','skeleton','twilightforest_death_tome','twilightforest_slime_beetle']);
const B2_PROJECTILE_STATUS:Record<string,'slow'|'wither'|'burn'>={stray:'slow',iceandfire_if_cockatrice:'wither',cataclysm_the_watcher:'burn'};
// B2/B3 batch contracts are data-driven here until the pending restoration
// loadout fields are promoted into the canonical content tables.  The values
// are the approved work-order values, never unit-ID branches in combat code.
/** Approved B2 content projection. Values are content-layer data, not a
 * runtime unit branch; the compiler below only translates these records. */
type BatchForm='melee'|'projectile'|'area'|'charge'|'dive'|'beam';
/** A B3 skill is still only data consumed by the shared combat compiler. */
type BatchSkill={form:BatchForm;damage:number;cd:number;range:number;minRange?:number;fracOfMax?:number;status?:'burn'|'wither'|'slow'|'poison';armorPiercing?:boolean;speed?:number;windup?:number;recovery?:number;radius?:number;life?:number;releaseAt?:'target';volleyCount?:number;volleyInterval?:number;volleySpread?:{kind:'none'}|{kind:'seeded-uniform';halfAngleRadians:number};shape?:'cone';coneRadius?:number;coneAngleRadians?:number;pulseCount?:number;pulseIntervalTicks?:number;lockAimOnStart?:boolean;mobilityLockSeconds?:number;mobilityLockArthropodOnly?:boolean;skillCycle?:boolean;cycleCount?:number;orbitRadius?:number;orbitSpeed?:number;formStage?:'base'|'changed'};
type BatchConfig=BatchSkill & {forms?:BatchForm[];skills?:readonly BatchSkill[];formChange?:{threshold:number;formId:'changed';speed:number;airborne:boolean}};
const B2_SKILL_CONFIG:Record<string,BatchConfig>={
  wither_skeleton:{form:'melee',damage:8,cd:1.2,range:1.4,status:'wither'},blaze:{form:'projectile',damage:3,cd:5,range:8,status:'burn',speed:14,forms:['projectile'],volleyCount:3,volleyInterval:.1,volleySpread:{kind:'seeded-uniform',halfAngleRadians:.175}},twilightforest_fire_beetle:{form:'area',damage:4,cd:2,range:64/24,status:'burn',forms:['area'],shape:'cone',coneRadius:64/24,coneAngleRadians:Math.PI/3,pulseCount:4,pulseIntervalTicks:10,lockAimOnStart:true},twilightforest_winter_wolf:{form:'area',damage:4,cd:2,range:64/24,status:'slow',forms:['area'],shape:'cone',coneRadius:64/24,coneAngleRadians:Math.PI/3,pulseCount:4,pulseIntervalTicks:10,lockAimOnStart:true},iceandfire_stymphalianbird:{form:'projectile',damage:1,cd:1,range:100/24,armorPiercing:true,speed:350/24,forms:['projectile'],volleyCount:2,volleyInterval:0,volleySpread:{kind:'none'}}
};
/** B3 is deliberately a separate content table.  It cannot inherit B2 values. */
const B3_PRELOAD_PROFILE:Record<string,BatchConfig>={
  elephant:{form:'melee',damage:15,cd:.9,range:42/24,skills:[{form:'melee',damage:15,cd:.9,range:42/24},{form:'charge',damage:25,cd:3,range:10,minRange:4,speed:110/20,radius:18/24,life:80}]},
  twilightforest_minoshroom:{form:'melee',damage:13,cd:.9,range:42/24,skills:[{form:'melee',damage:13,cd:.9,range:42/24},{form:'charge',damage:23,cd:3,range:10,minRange:4,speed:160/20,radius:18/24,life:80}]},
  vex:{form:'dive',damage:13,cd:5,range:42/24,speed:100/24,radius:12/24,life:9},
  alexsmobs_farseer:{form:'beam',damage:6,cd:.7,range:200/24,skills:[{form:'beam',damage:0,fracOfMax:.1,cd:1.5,range:200/24,releaseAt:'target',radius:16/24,skillCycle:true,cycleCount:3},{form:'dive',damage:6,cd:.7,range:42/24,speed:280/24,radius:24/24,life:9,skillCycle:true,cycleCount:5}]},
  alexsmobs_tarantula_hawk:{form:'dive',damage:5,cd:2,range:42/24,speed:72/24,radius:16/24,life:9,mobilityLockSeconds:30,mobilityLockArthropodOnly:true},
  mowziesmobs_naga:{form:'projectile',damage:4,cd:3,range:160/24,speed:280/24,orbitRadius:42/24,orbitSpeed:80/24,skills:[{form:'projectile',damage:4,cd:3,range:160/24,speed:280/24,status:'poison',skillCycle:true,orbitRadius:42/24,orbitSpeed:80/24},{form:'dive',damage:8,cd:3,range:42/24,speed:72/24,radius:16/24,life:9,status:'poison',skillCycle:true,orbitRadius:42/24,orbitSpeed:80/24}]},
  alexsmobs_warped_mosco:{form:'melee',damage:15,cd:3,range:42/24,formChange:{threshold:.25,formId:'changed',speed:(128/24)/20,airborne:true},skills:[{form:'melee',damage:15,cd:3,range:42/24,radius:18/24,formStage:'base'},{form:'area',damage:21,cd:3,range:56/24,radius:56/24,releaseAt:'target',formStage:'base'},{form:'projectile',damage:7,cd:1,range:180/24,speed:128/24,radius:16/24,formStage:'changed'}]},
  alexscaves_teleto:{form:'projectile',damage:6,cd:1.1,range:160/24,speed:40/24,radius:16/24},
};
export function compileR3Catalog(){
const unavailable:{id:string;reason:string}[]=[];
const units:CombatCatalog['units'][number][]=[],decisions:CombatCatalog['decisions'][number][]=[],templates:CombatCatalog['templates'][number][]=[];
for(const definition of unitDefinitions){
 try{
  const {unit,skills:loadedSkills,decision}=selectRuntimeUnit(definition.id,'r3');
  const skills=(B2_PROJECTILE_STATUS[definition.id] ? loadedSkills.filter(l=>l.templateIds.join()==='SK05') : loadedSkills);
  const batch=B2_SKILL_CONFIG[unit.id] ?? B3_PRELOAD_PROFILE[unit.id];
  const numberOr=(v: any,fallback:number)=>typeof v?.value==='number'&&!v?.status?.includes('pending')?v.value:fallback;
  if(batch){
   const compiledUnit={id:unit.id,hp:numberOr(unit.attributes.hp,40),speed:numberOr(unit.attributes.speed,1),radius:numberOr(unit.attributes.radius,.5),armor:numberOr(unit.attributes.armor,0),toughness:numberOr(unit.attributes.armorToughness,0),decisionProfileId:decision.id,traitFlags:unit.tags.includes('arthropod')?16:0};
   units.push(compiledUnit);
   const authored=batch.skills??(batch.forms??[batch.form]).map(form=>({...batch,form})); const compiledBatch=authored.map((entry,index)=>({id:`${unit.id}/r3-batch-${index+1}`,form:entry.form,damage:entry.damage,cd:secondsToTicks(entry.cd),range:entry.range,windup:entry.windup??7,recovery:entry.recovery??9,radius:entry.radius??.35,life:entry.life??(entry.form==='projectile'?120:2),...(entry.fracOfMax===undefined?{}:{fracOfMax:entry.fracOfMax}),...(entry.status?{onHitStatus:entry.status}:{}),...(entry.speed?{speed:entry.speed/20}:{}),...(entry.armorPiercing?{armorPiercing:true}:{}),...(entry.form==='projectile'?{projectile:true}:{}),...(entry.form==='charge'?{minRange:entry.minRange??0}:{}),...(entry.releaseAt?{releaseAt:entry.releaseAt}:{...(entry.form==='beam'?{releaseAt:'target' as const}:{})})}));
   for (const t of compiledBatch) {
    const entry=authored[compiledBatch.indexOf(t)]!;
    if (entry.volleyCount) { (t as any).volleyCount=entry.volleyCount; (t as any).volleyIntervalTicks=secondsToTicks(entry.volleyInterval ?? 0) || 0; (t as any).volleySpread=entry.volleySpread ?? {kind:'none'}; }
    if (entry.shape) { Object.assign(t,{shape:entry.shape,coneRadius:entry.coneRadius,coneAngleRadians:entry.coneAngleRadians,pulseCount:entry.pulseCount,pulseIntervalTicks:entry.pulseIntervalTicks,lockAimOnStart:entry.lockAimOnStart}); }
    if (entry.mobilityLockSeconds) Object.assign(t,{mobilityLockTicks:secondsToTicks(entry.mobilityLockSeconds),mobilityLockArthropodOnly:entry.mobilityLockArthropodOnly});
    if (entry.skillCycle) Object.assign(t,{skillCycle:true,cycleCount:entry.cycleCount??1});
    // Content authors orbit speed in world-units per second.  Steering and
    // motion consume per-tick values, just like unit and projectile speed.
    if (entry.orbitRadius!==undefined) Object.assign(t,{orbitRadius:entry.orbitRadius,orbitSpeed:(entry.orbitSpeed??0)/20});
    if (entry.formStage) Object.assign(t,{formStage:entry.formStage});
   }
   if(batch.formChange) for(const t of compiledBatch) Object.assign(t,{formChange:batch.formChange});
   templates.push(...compiledBatch); decisions.push({id:decision.id,candidates:compiledBatch.map(t=>t.id)}); continue;
  }
  if(!skills.length||(!B2_PROJECTILE_STATUS[unit.id]&&skills.some(l=>!(l.templateIds.join()==='SK01'&&l.parameters.hitReach?.value==='captured-target')&&!(l.templateIds.join()==='SK02'&&l.parameters.shape?.value==='circle')&&!(l.templateIds.join()==='SK20'&&l.hitEligibility.value==='destroy-on-successful-capture')&&!(STANDARD_PROJECTILE_IDS.has(unit.id)&&l.templateIds.join()==='SK05'))))throw Error('Composition adapter not yet verified');
  const nonnegative=(v:number,key:string)=>{if(v<0)throw Error(`Negative runtime value ${unit.id}/${key}`);return v;};
  const number=(key:string)=>nonnegative(requireContentNumber(unit.attributes[key],`${unit.id}/${key}`),key);
  const compiledUnit={id:unit.id,hp:number('hp'),speed:number('speed'),radius:number('radius'),armor:number('armor'),toughness:number('toughness'),decisionProfileId:decision.id,
    traitFlags:unit.tags.includes('arthropod')?16:0};
  if(compiledUnit.hp<=0||compiledUnit.radius<=0)throw Error(`Invalid body: ${unit.id}`);
  const compiledSkills=skills.map(l=>{
   const n=(key:string)=>nonnegative(requireContentNumber(l.parameters[key],`${l.id}/${key}`),key);
   if(l.templateIds.includes('SK20')){
    if(n('healing')!==0)throw Error('Healing on capture is not an authorized implementation');
    return {id:l.id,form:'devour' as const,damage:0,cd:secondsToTicks(n('cooldown')),range:n('castRange'),windup:0,recovery:secondsToTicks(n('recovery')),radius:number('radius'),life:0,maxTargetHp:n('maxTargetHp')};
   }
   const projectile=(STANDARD_PROJECTILE_IDS.has(unit.id)||!!B2_PROJECTILE_STATUS[unit.id])&&l.templateIds.join()==='SK05';
   const area=l.templateIds.includes('SK02');
   if(projectile){
    const damage=number('attack'), cooldown=number('attackInterval'), range=number('attackRange')/24;
    const status=B2_PROJECTILE_STATUS[unit.id];
    return {id:l.id,form:'projectile' as const,damage,cd:secondsToTicks(cooldown),range,windup:1,recovery:1,radius:Math.max(0.15,number('radius')*0.35),life:120,speed:(280/24)/20,projectile:true,damageType:'normal' as const,...(status?{onHitStatus:status}: {})};
   }
   return {id:l.id,form:area?'area' as const:'melee' as const,damage:n('damage'),cd:secondsToTicks(n('cooldown')),range:n('castRange'),windup:secondsToTicks(n('windup')),recovery:secondsToTicks(n('recovery')),
    // Contact is centered on the committed target and target-only; the body
    // radius is reused for geometry, never a second authored reach value.
    radius:area?n('radius'):number('radius'),life:2,damageType:'normal' as const,...(area?{releaseAt:'target' as const}:{})};
  });
  // Commit all references atomically, only after every field has validated.
  units.push(compiledUnit);decisions.push({id:decision.id,candidates:decision.orderedCandidates});templates.push(...compiledSkills);
 }catch(error){unavailable.push({id:definition.id,reason:String(error)});}
}
return {catalog:{units,decisions,templates} satisfies CombatCatalog,unavailable};
}
const compiled=compileR3Catalog();
export const r3Catalog=compiled.catalog,r3Unavailable=compiled.unavailable;
export function r3ShopOffers(){
 return unitDefinitions.filter(u=>u.shopVisibility==='visible'&&r3Catalog.units.some(v=>v.id===u.id)).map(u=>({id:u.id,name:u.name,price:requireContentNumber(u.attributes.price,`${u.id}/price`)}));
}
export function requireR3Creation(id:string,origin:'purchase'|'summon'|'conversion',sourceLoadoutId?:string){
 const u=unitDefinitions.find(u=>u.id===id);
 if(!u||!r3Catalog.units.some(v=>v.id===id))throw Error(`R3 unit is not runnable: ${id}`);
 if(origin==='purchase'){
  if(u.shopVisibility==='hidden')throw Error(`Hidden unit cannot be purchased: ${id}`);
 }else{
  // Only explicit catalog references authorize hidden identities, never a UI flag.
  const source=unitDefinitions.flatMap(s=>{
   try{return selectRuntimeUnit(s.id).skills;}catch{return [];}
  }).find(l=>l.id===sourceLoadoutId);
  const allowed=origin==='summon'?source?.summonUnitIds: Object.values((source as unknown as {conversionTargets?:Record<string,string>})?.conversionTargets??{});
  if(!allowed?.includes(id))throw Error(`Unapproved ${origin} source for ${id}`);
 }
 return u;
}
