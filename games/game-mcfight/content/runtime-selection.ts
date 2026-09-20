/** Selection/projection only; never reads legacy-source, adoption or R1 facts. */
import { unitDefinitions } from './units.js';
import { skillLoadouts } from './loadouts.js';
import { decisionProfiles } from './decisions.js';
import type { ContentValue } from './r2-types.js';
export type S4UnitId = 'vindicator'|'skeleton'|'vex'|'elephant'|'earthshaker'|'witch';
export type S4SkillId = 'slash'|'arrow'|'dive'|'charge'|'strike'|'quake'|'beam'|'potion'|'heal';
export function hasPendingContent(value: unknown): boolean {
  return value==='pending-design'||Boolean(value&&typeof value==='object'&&Object.values(value).some(hasPendingContent));
}
export function requireContentNumber(v: ContentValue | undefined, path: string): number {
  if (!v || v.status==='pending-design' || typeof v.value!=='number' || !Number.isFinite(v.value)) throw Error(`Pending or invalid content value: ${path}`);
  return v.value;
}
export function selectRuntimeUnit(id: string, scope: 'restoration'|'s4'|'r3' = 'restoration') {
  const u=unitDefinitions.find(x=>x.id===id);
  if(!u)throw Error(`Unknown content unit: ${id}`);
  const d=decisionProfiles.find(x=>x.id===u.decisionId);
  if(!d)throw Error(`Missing decision: ${id}`);
  if(scope==='restoration') {
    if(d.status==='pending-design')throw Error(`Pending restoration decision: ${id}`);
    for(const [k,v]of Object.entries(u.attributes))if(v.status==='pending-design')throw Error(`Pending restoration attribute: ${id}/${k}`);
  } else if(scope==='s4' && !u.runtimeAlias)throw Error(`Unit not in validated S4 subset: ${id}`);
  const r3Projectile = scope==='r3' && new Set(['pillager','skeleton','twilightforest_death_tome','twilightforest_slime_beetle','stray','iceandfire_if_cockatrice','cataclysm_the_watcher']).has(id);
  const r3B2 = scope==='r3' && new Set(['stray','iceandfire_if_cockatrice','cataclysm_the_watcher','wither_skeleton','blaze','twilightforest_fire_beetle','twilightforest_winter_wolf','iceandfire_stymphalianbird']).has(id);
  const r3B3 = scope==='r3' && new Set(['elephant','twilightforest_minoshroom','vex','alexsmobs_farseer','alexsmobs_tarantula_hawk','mowziesmobs_naga','alexsmobs_warped_mosco','alexscaves_teleto']).has(id);
  if(scope==='r3' && !r3Projectile && !r3B2 && !r3B3) {
    if(d.status==='pending-design') throw Error(`Pending restoration decision: ${id}`);
    for(const [k,v] of Object.entries(u.attributes)) if(v.status==='pending-design') throw Error(`Pending restoration attribute: ${id}/${k}`);
  }
  const ids=scope==='s4'?d.runtimeCandidates:u.loadoutIds.filter(id=>skillLoadouts.find(l=>l.id===id)?.variant==='restoration');
  const batchScope = scope==='r3' && (r3Projectile || r3B2 || r3B3);
  const skills=ids.map(lid=>{
    const l=skillLoadouts.find(x=>x.id===lid&&x.unitId===u.id);
    if(!l){ if(batchScope)return null; throw Error(`Pending or missing loadout: ${lid}`); }
    if(!batchScope && (l.variant!==(scope==='s4'?'s4-validated':'restoration')||l.gapIds.length||(!r3Projectile&&!r3B2&&!r3B3&&hasPendingContent(l))))throw Error(`Pending or missing loadout: ${lid}`);
    return l;
  }).filter((l): l is NonNullable<typeof l>=>Boolean(l));
  return {unit:scope==='s4'&&u.s4Attributes?{...u,attributes:u.s4Attributes}:u,skills,decision:d};
}
export const s4Units = Object.fromEntries(unitDefinitions.filter(u=>u.runtimeAlias).sort((a,b)=>requireContentNumber(a.runtimeSelectionOrder,a.id)-requireContentNumber(b.runtimeSelectionOrder,b.id)).map(u=> {
  const {skills,unit:selected}=selectRuntimeUnit(u.id,'s4');
  return [u.runtimeAlias,{name:u.name,role:u.role!,price:requireContentNumber(selected.attributes.price,u.id),hp:requireContentNumber(selected.attributes.hp,u.id),speed:requireContentNumber(selected.attributes.speed,u.id),radius:requireContentNumber(selected.attributes.radius,u.id),armor:requireContentNumber(selected.attributes.armor,u.id),skills:skills.map(l=>l.runtimeAlias!)}];
})) as Record<S4UnitId,{name:string;role:string;price:number;hp:number;speed:number;radius:number;armor:number;skills:string[]}>;
export interface S4SkillValues {
  slash:{damage:number;cd:number;range:number;windup:number;active:number;recovery:number};
  arrow:{damage:number;cd:number;range:number;windup:number;speed:number;radius:number;travel:number;recovery:number};
  dive:{damage:number;cd:number;range:number;descend:number;contact:number;rise:number;radius:number};
  charge:{damage:number;cd:number;minRange:number;speed:number;radius:number};
  strike:{damage:number;cd:number;range:number}; quake:{damage:number;cd:number;radius:number;windup:number};
  beam:{damage:number;cd:number;range:number;windup:number;width:number};
  potion:{damage:number;cd:number;range:number;radius:number}; heal:{healing:number;cd:number;hpRatioAtMost:number;safeRadius:number};
}
export const s4Skills = Object.fromEntries(skillLoadouts.filter(l=>l.variant==='s4-validated').map(l=>[l.runtimeAlias,Object.fromEntries(Object.entries(l.parameters).map(([k,v])=>[k,requireContentNumber(v,`${l.id}/${k}`)]))])) as unknown as S4SkillValues;
