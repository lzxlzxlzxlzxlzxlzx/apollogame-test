import { expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { unitDefinitions } from './content/units.js';
import { skillLoadouts } from './content/loadouts.js';
import { r3ShopOffers, R3_INITIAL_GOLD, requireR3Creation, compileR3Catalog } from './content/r3-catalog.js';
import { S4_BALANCE_V1 } from './content/s4-balance.js';
import { S4_ACTIONS } from './content/s4-balance.js';
import { createR3Session } from './r3-session.js';
const facts=JSON.parse(readFileSync('docs/design/game-mcfight/inventory/units.json','utf8'));
const cards=JSON.parse(readFileSync('docs/design/game-mcfight/r1-unit-cards-v1.json','utf8')).cards;
it('invalid skill fields cannot leave a partially published unit or dangling decision',()=>{
 const l=skillLoadouts.find(l=>l.id==='vindicator/skill-1')!,saved=structuredClone(l.parameters);
 try{
  for(const invalid of [NaN,-1]){
   l.parameters.cooldown!.value=invalid;
   const c=compileR3Catalog();expect(c.catalog.units.some(u=>u.id==='vindicator')).toBe(false);expect(c.catalog.decisions.some(d=>d.id==='decision:vindicator')).toBe(false);expect(c.catalog.templates.some(t=>t.id===l.id)).toBe(false);
   expect(c.unavailable.some(u=>u.id==='vindicator')).toBe(true);
  }
 }finally{l.parameters=saved;}
});
it('all 84 card indices project effective attributes, exactly once, with seconds unchanged',()=>{
 expect(unitDefinitions).toHaveLength(84);
 for(const card of cards){
  const f=facts[card.legacyUnitIndex];expect(f.monsterId).toBe(card.id);
  const u=unitDefinitions.find(u=>u.legacyId===card.id)!;
  for(const [key,old,scale]of [['price','price',1],['hp','hp',1],['armor','armor',1],['toughness','armorToughness',1],['attack','attack',1],['attackInterval','attackInterval',1],['speed','moveSpeed',24],['radius','radius',24],['attackRange','attackRange',24]] as const){
   expect(u.attributes[key]!.value,`${card.id}/${key}`).toBe(f.effectiveAttributes[old]/scale);
   expect(u.attributes[key]!.status).toBe(scale===24?'normalized':'adopted');
  }
 }
});
it('the 1000-gold restoration shop cannot expose pending or hidden units; S4 remains 30 gold',()=>{
 expect(R3_INITIAL_GOLD).toBe(1000);expect(S4_BALANCE_V1.economy.initialGold).toBe(30);
 expect(r3ShopOffers().length).toBeGreaterThan(0);
 const hidden=unitDefinitions.filter(u=>u.shopVisibility==='hidden');expect(hidden).toHaveLength(6);
 for(const u of hidden){expect(r3ShopOffers().some(o=>o.id===u.id)).toBe(false);expect(()=>requireR3Creation(u.id,'purchase')).toThrow();expect(()=>requireR3Creation(u.id,'summon','invented')).toThrow();}
 expect(()=>requireR3Creation('cataclysm_coral_golem','purchase')).toThrow(/not runnable/);
});
it('production session buys at the legacy price and rejects hidden/pending IDs without spending',()=>{
 const session=createR3Session(17);
 try{
  expect(session.gold).toBe(1000);
  for(const u of unitDefinitions.filter(u=>u.shopVisibility==='hidden'))session.command(S4_ACTIONS.buy,{unitId:u.id});
  session.command(S4_ACTIONS.buy,{unitId:'cataclysm_coral_golem'});
  expect(session.gold).toBe(1000);expect(session.roster).toEqual([]);
  const offer=r3ShopOffers()[0]!;session.command(S4_ACTIONS.buy,{unitId:offer.id});
  expect(session.roster[0]!.unitId).toBe(offer.id);expect(session.gold).toBe(1000-offer.price);
  session.command(S4_ACTIONS.deploy);session.command(S4_ACTIONS.place,{instanceId:session.roster[0]!.instanceId,x:-10,y:0});
  expect(session.canStartBattle).toBe(true);session.command(S4_ACTIONS.start);expect(session.phase).toBe('battle');
  for(let t=0;t<20;t++)session.tick();
  expect(session.battleTicks).toBe(20);
 }finally{session.dispose();}
});
it('seven planner groups retain independent, normalized patches and unresolved composition fields',()=>{
 const get=(unitId:string,label:string)=>skillLoadouts.find(l=>l.unitId===unitId&&l.label===label&&l.variant==='restoration')!;
 const rev=skillLoadouts.filter(l=>l.unitId==='cataclysm_ignited_revenant');
 expect(rev.find(l=>l.label==='旋转')!.parameters.damage!.value).toBe(6);
 expect(rev.find(l=>l.label==='扇形火焰')!.parameters.damage!.value).toBe(4);
 const leap=skillLoadouts.find(l=>l.unitId==='cataclysm_coral_golem'&&l.templateIds.includes('SK10'))!;
 expect(leap.parameters.travelDuration!.value).toBe(1.5);expect(leap.parameters.landingRadius!.value).toBe(20/24);expect(leap.gapIds).toContain('family:SK10');
 const warlock=skillLoadouts.find(l=>l.unitId==='cataclysm_deepling_warlock'&&l.templateIds.includes('SK08'))!;
 expect(warlock.parameters.tickInterval!.value).toBe(3/7);expect(warlock.parameters.cooldown!.value).toBe(10);
 expect(get('twilightforest_minoshroom','真实冲锋').parameters.minCastRange!.value).toBe(4);
 const creeper=skillLoadouts.find(l=>l.unitId==='creeper')!;
 expect(creeper.parameters.damage!.value).toBe(49);expect(creeper.parameters.allyMultiplier!.value).toBe(.5);
});
