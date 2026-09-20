/** Read-only world observations and result-backed matrix updates; no simulated hits. */
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { r3Catalog,r3Unavailable,r3ShopOffers } from '../games/game-mcfight/content/r3-catalog.js';
import { skillLoadouts } from '../games/game-mcfight/content/loadouts.js';
import { createR3IdentityScene } from '../games/game-mcfight/r3-identity.fixture.js';
import { createR3Boundary } from '../games/game-mcfight/r3-boundary.fixture.js';
const base='docs/design/game-mcfight/',out=base+'self-check/r3/';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const save=(path:string,value:unknown)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const result=read(out+'final-tests.json');
if(!result.success)throw Error('Cannot publish identity evidence from a failing run');
const assertions=result.testResults.flatMap((f:any)=>f.assertionResults.map((a:any)=>({...a,file:f.name})));
const passed=(match:(a:any)=>boolean)=>assertions.some((a:any)=>a.status==='passed'&&match(a));
const matrix=read(base+'full-restoration-matrix.json');
const currentIdentity:object[]=[];
for(const unit of r3Catalog.units){
 const basic=passed(a=>a.fullName===`R3 identity ${unit.id}: real primary attack, independent instances and source-death cleanup`);
 const devour=unit.id==='iceandfire_cyclops'&&assertions.filter((a:any)=>a.file.endsWith('r3-devour.test.ts')&&a.status==='passed').length===8;
 if(!basic&&!devour)throw Error(`No passing identity assertion for ${unit.id}`);
 const s=createR3IdentityScene(unit.id);
 try{
  const cd=Math.max(...r3Catalog.templates.filter(t=>t.id.startsWith(unit.id+'/')).map(t=>t.cd));
  for(let i=0;i<cd*3+20;i++)s.step();
  const data={unitId:unit.id,scope:devour?'ground-smash fallback; devour signature in r3-devour.test.ts':'three cycles and two instances',trace:s.trace,receipts:s.receipts};
  save(out+`identity-${unit.id}.json`,data);
  currentIdentity.push({unitId:unit.id,sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),evidence:`self-check/r3/identity-${unit.id}.json`});
 }finally{s.dispose();}
 const row=matrix.units.find((r:any)=>r.id===unit.id);if(!row)throw Error(`Missing identity row ${unit.id}`);
 row.r3IdentityTest='passed-program';row.r3IndependentReview='pending';
 row.r3Evidence=devour?'../../../games/game-mcfight/r3-devour.test.ts':`self-check/r3/identity-${unit.id}.json`;
 row.r3TestFile=devour?'games/game-mcfight/r3-devour.test.ts':'games/game-mcfight/r3-identity.test.ts';
}
for(const row of matrix.units)if(!r3Catalog.units.some(u=>u.id===row.id)){
 row.r3IdentityTest='pending';row.r3IndependentReview='not-submitted';row.r3PendingReason=r3Unavailable.find(u=>u.id===row.id)?.reason??'Not runnable';
}
const pendingPaths=(value:unknown,path:string):string[]=>{
 if(!value||typeof value!=='object')return [];
 if((value as {status?:string}).status==='pending-design')return [path];
 return Object.entries(value).flatMap(([key,v])=>pendingPaths(v,`${path}/${key}`));
};
save(out+'unresolved-content.json',r3Unavailable.map(u=>({...u,pendingFields:skillLoadouts.filter(l=>l.unitId===u.id&&l.variant==='restoration').flatMap(l=>pendingPaths(l,l.id))})));
for(const kind of ['SK10','SK22','SK24'] as const){
 const s=createR3Boundary(kind);try{
  for(let i=0;i<25;i++)s.step();
  if(kind==='SK24'){s.strike('evidence-lethal',0,0,1e6,'mount#0:body');s.step();}
  save(out+`boundary-${kind}.json`,{kind,scope:'capability boundary only; NOT an identity PASS',trace:s.log});
 }finally{s.dispose();}
}
save(base+'full-restoration-matrix.json',matrix);
save(out+'identity-index.json',{programPassed:currentIdentity.length,pending:r3Unavailable.length,shopOffers:r3ShopOffers().length,identity:currentIdentity});
console.log(JSON.stringify({programPassed:currentIdentity.length,pending:r3Unavailable.length,shopOffers:r3ShopOffers().length,testRun:{passed:result.numPassedTests,pending:result.numPendingTests}}));
