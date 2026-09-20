import { S4Session, createCatalogBattle, type SessionContent } from './s4-session.js';
import { r3Catalog, r3ShopOffers, R3_INITIAL_GOLD } from './content/r3-catalog.js';
import { selectRuntimeUnit } from './content/runtime-selection.js';
/** Full restoration is a catalog/economy scope of the existing session authority. */
export function createR3Session(seed=1){
 const offers=r3ShopOffers();
 const content:SessionContent<string>={initialGold:R3_INITIAL_GOLD,shopIds:offers.map(o=>o.id),units:{},enemyPresets:{}};
 for(const offer of offers){
  const unit=r3Catalog.units.find(u=>u.id===offer.id)!;
  content.units[offer.id]={...offer,hp:unit.hp,radius:unit.radius,speed:unit.speed,armor:unit.armor!,role:'兼容恢复 · 机制验证',skills:selectRuntimeUnit(unit.id,'r3').skills.map(l=>l.id)};
 }
 // Small deterministic observation opponent set, not the R4 final encounter table.
 content.enemyPresets={'standard-round1':offers.slice(0,3).map(o=>o.id),'standard-later':offers.slice(0,3).map(o=>o.id)};
 return new S4Session<string>(seed,(placements,battleSeed)=>createCatalogBattle(r3Catalog,'r3',placements,battleSeed),{content});
}
