import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ALL_CAPABILITIES } from '../src/assembly/capability-registry.js';
import { validateR2, validateR2Matrix } from '../games/game-mcfight/content/r2-validate.js';
const base='docs/design/game-mcfight/', content='games/game-mcfight/content/';
const read=(p:string):any=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const names=['legacy-source','adoption','units','loadouts','decisions','presentations','templates','issues'];
const c:any=Object.fromEntries(names.map(n=>[n,read(content+n+'.json')]));
const cards=read(base+'r1-unit-cards-v1.json').cards,facts=read(base+'inventory/units.json');
const errors=validateR2(c,cards,facts,new Set(ALL_CAPABILITIES.map(x=>x.id)));
errors.push(...validateR2Matrix(read(base+'full-restoration-matrix.json'),cards));
const hash=createHash('sha256').update(JSON.stringify(c)).digest('hex');
// Anti-drift sources are checked from actual content bytes, not optimistic progress.
for(const s of c['legacy-source']) {
  const f=facts[s.legacyUnitIndex], card=cards.find((x:any)=>x.id===s.legacyId);
  for(const [label,value,expected]of [['facts',f,s.factsHash],['card',card,s.cardHash]])if(createHash('sha256').update(JSON.stringify(value)).digest('hex')!==expected)errors.push(`stale ${label} ${s.id}`);
}
const counts=(xs:any[],key:string)=>Object.fromEntries([...new Set(xs.map(x=>x[key]))].map(k=>[String(k),xs.filter(x=>x[key]===k).length]));
const report={ok:errors.length===0,hash,counts:{cards:cards.length,units:c.units.length,decisions:c.decisions.length,presentations:c.presentations.length,loadouts:c.loadouts.length,hidden:c.units.filter((x:any)=>x.shopVisibility==='hidden').length,adoption:counts(c.adoption,'status'),mechanisms:c.templates.map((t:any)=>({id:t.id,count:c.loadouts.filter((l:any)=>l.templateIds.includes(t.id)).length}))},pending:c.adoption.filter((a:any)=>a.status==='pending-design'),issues:c.issues,errors};
writeFileSync(base+'self-check/r2/content-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,hash,counts:report.counts,errors}));
if(errors.length)process.exitCode=1;
else if(process.argv.includes('--update-matrix')||process.env.MCFIGHT_R2_UPDATE_MATRIX==='1') {
  const matrix=read(base+'full-restoration-matrix.json');
  for(const row of matrix.units) {
    const u=c.units.find((x:any)=>x.legacyId===row.id);
    if(!u)throw Error(`Matrix orphan ${row.id}`);
    row.r2Definition='validated-with-pending';row.r2Loadout='validated-with-pending';
    row.r2ContentId=u.id;row.r2Evidence='self-check/r2/content-validation.json';
    row.r2ContentHash=hash;row.r2PendingCount=report.pending.filter((x:any)=>x.unitId===u.id).length;
    row.r2GapIds=c.issues.filter((x:any)=>x.unitIds.includes(u.id)).map((x:any)=>x.id);
    // Intentionally preserve all R1, R3 and S6 fields.
  }
  writeFileSync(base+'full-restoration-matrix.json',JSON.stringify(matrix,null,2)+'\n');
}
