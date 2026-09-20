import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateR2, validateR2Matrix } from './content/r2-validate.js';
import { generate } from '../../scripts/mcfight-r2-generate.js';
import { projectR3 } from '../../scripts/mcfight-r3-project.js';
import { selectRuntimeUnit, requireContentNumber, hasPendingContent } from './content/runtime-selection.js';
import { skillLoadouts } from './content/loadouts.js';
import { S4_BALANCE_V1 } from './content/s4-balance.js';
import { ALL_CAPABILITIES } from '@assembly/capability-registry.js';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const base='docs/design/game-mcfight/';
const cards=read(base+'r1-unit-cards-v1.json').cards,facts=read(base+'inventory/units.json');
const names=['legacy-source','adoption','units','loadouts','decisions','presentations','templates','issues'];
const data:any=Object.fromEntries(names.map(n=>[n,read('games/game-mcfight/content/'+n+'.json')]));
const known=new Set(ALL_CAPABILITIES.map(x=>x.id));
const check=(d:any=data,cs:any[]=cards)=>validateR2(d,cs,facts,known);
describe('R2 authoring contract',()=>{
 it('84 exact identities, provenance, references and numeric adoption are valid',()=>expect(check()).toEqual([]));
 it('rejects duplicates, foreign IDs and incorrect legacy index instead of accepting 84 rows',()=>{
  const d=structuredClone(data);d.units[1]=structuredClone(d.units[0]);expect(check(d).join()).toMatch(/duplicate|bijection/);
  const cs=structuredClone(cards);cs[0].legacyUnitIndex=1;expect(check(data,cs).join()).toContain('legacy index');
 });
 it('rejects missing numeric reconciliation and unknown capability/decision references',()=>{
  const d=structuredClone(data);d.adoption.splice(d.adoption.findIndex((a:any)=>a.path.startsWith('legacy/')),1);d.templates[0].capabilities=['not-installed'];d.decisions[0].candidates=['lost'];
  expect(check(d).join()).toMatch(/legacy numeric uncovered/);expect(check(d).join()).toMatch(/unknown capability/);expect(check(d).join()).toMatch(/decision candidate/);
 });
 it('pending parameters cannot carry a fake zero or cross the runtime selector',()=>{
  const d=structuredClone(data);d.units[0].attributes.hp.status='pending-design';d.units[0].attributes.hp.value=0;expect(check(d).join()).toContain('pending value');
  expect(()=>requireContentNumber({status:'pending-design',adoptionId:'x',value:0},'hp')).toThrow(/Pending/);
  for(const u of data.units){
   const decision=data.decisions.find((d:any)=>d.id===u.decisionId);
   const unresolved=hasPendingContent(u.attributes)||decision.status==='pending-design'||data.loadouts.some((l:any)=>l.unitId===u.id&&l.variant==='restoration'&&(hasPendingContent(l)||l.gapIds.length));
   if(unresolved)expect(()=>selectRuntimeUnit(u.id)).toThrow(/Pending/);
   else expect(selectRuntimeUnit(u.id).unit.id).toBe(u.id);
  }
 });
 it('does not drop same-template attacks or embedded effects',()=>{
  const brain=data.loadouts.filter((l:any)=>l.unitId==='alexscaves_brainiac'&&l.templateIds.includes('SK05'));expect(brain).toHaveLength(2);expect(new Set(brain.map((l:any)=>l.id)).size).toBe(2);
  const troll=data.loadouts.filter((l:any)=>l.unitId==='iceandfire_if_troll'&&l.templateIds.includes('SK01'));expect(troll).toHaveLength(2);expect(troll.every((l:any)=>l.mode==='active')).toBe(true);
  const d=structuredClone(data);d.loadouts=d.loadouts.filter((l:any)=>l.id!==troll[1].id);expect(check(d).join()).toContain('ordinary/heavy');
  expect(data.loadouts.some((l:any)=>l.unitId==='alexscaves_brainiac'&&l.templateIds.includes('SK16')&&l.parentId)).toBe(true);
 });
 it('preserves hidden six and all missing art; no-attack unit has no aggro candidate',()=>{
  expect(data.units.filter((u:any)=>u.shopVisibility==='hidden').map((u:any)=>u.legacyId).sort()).toEqual(['dread_beast','dread_ghoul','dread_spider','dread_thrall','stradpole','vex'].sort());
  expect(data.presentations.filter((p:any)=>p.attackCandidate.status==='single-pose-candidate')).toHaveLength(78);
  expect(data.presentations.filter((p:any)=>p.attackCandidate.status==='missing')).toHaveLength(6);
  expect(data.presentations.every((p:any)=>p.death.status==='missing'&&p.s6ArtBinding==='pending')).toBe(true);
  expect(data.decisions.find((d:any)=>d.unitId==='stradpole').candidates).toEqual([]);
  const d=structuredClone(data);d.presentations[0].s6ArtBinding='passed';expect(check(d).join()).toMatch(/art/);
 });
 it('retains confirmed charge, windows, fixed points, conversion and special eligibility contracts',()=>{
  for(const cr of ['CR01','CR02','CR03','CR04','CR05','CR06','CR07','CR08','CR09','CR10','CR11','CR12','CR13','CR14','CR15'])expect(data.loadouts.some((l:any)=>l.contracts.includes(cr)),cr).toBe(true);
  const lich=data.loadouts.find((l:any)=>l.unitId==='iceandfire_dread_lich'&&l.templateIds.includes('M06'));
  expect(lich.confirmedRules.sourceDeathPreservesMark).toBe(true);expect(lich.parameters.lowerMaxHp.value).toBe(20);expect(lich.parameters.upperMaxHp.value).toBe(50);
 });
 it('regeneration from the same inputs is deterministic and matches checked-in content',()=>{
  const a=generate(cards,facts,S4_BALANCE_V1),b=generate(cards,facts,S4_BALANCE_V1);
  const hash=(x:any)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
  expect(hash(a)).toBe(hash(b));expect(projectR3(a,cards,facts)).toEqual(data);
 });
 it('S4 values are preserved exactly as a canonical catalog selection',()=>{
  const before=read(base+'self-check/r2/s4-before.json');expect(S4_BALANCE_V1).toEqual(before);
  expect(Object.keys(S4_BALANCE_V1.units)).toEqual(Object.keys(before.units));
  for(const id of Object.keys(before.units)){const x=selectRuntimeUnit(id,'s4');expect(x.skills.map(l=>l.runtimeAlias)).toEqual(before.units[id].skills);expect(x.unit.attributes.hp.value).toBe(before.units[id].hp);}
  const balance=readFileSync('games/game-mcfight/content/s4-balance.ts','utf8');expect(balance).toContain('units: s4Units');expect(balance).not.toMatch(/units:\s*\{/);
 });
 it('rejects missing effects, swapped adoption owners, repeated action slots and rule downgrades',()=>{
  const d=structuredClone(data);
  d.units[0].attributes.hp.adoptionId=d.units[1].attributes.hp.adoptionId;
  d.presentations.find((p:any)=>p.actions.length>1).actions[1]=d.presentations.find((p:any)=>p.actions.length>1).actions[0];
  d.loadouts.find((l:any)=>l.unitId==='cataclysm_wadjet'&&l.templateIds.includes('SK05')).confirmedRules.target='ground';
  d.loadouts.find((l:any)=>l.unitId==='alexscaves_magnetron'&&l.templateIds.includes('SK01')).effects=[];
  const e=check(d).join();expect(e).toContain('adoption reference');expect(e).toContain('action bijection');expect(e).toContain('confirmed rule');expect(e).toContain('effect omitted');
 });
 it('cannot certify duplicate matrix rows or silently overwrite runtime aliases',()=>{
  const m=read(base+'full-restoration-matrix.json');m.units[1]=m.units[0];expect(validateR2Matrix(m,cards)).toEqual(['matrix identity mismatch']);
  const d=structuredClone(data),r=d.loadouts.filter((l:any)=>l.runtimeAlias);r[1].runtimeAlias=r[0].runtimeAlias;expect(check(d).join()).toContain('runtime skill aliases');
 });
 it('rejects pending qualification and nested effects at the real runtime selector',()=>{
  const skill=skillLoadouts.find(l=>l.runtimeAlias==='slash')!;
  const original=structuredClone(skill);
  try {
    skill.eligibility.status='pending-design';expect(()=>selectRuntimeUnit('vindicator','s4')).toThrow(/Pending/);
    Object.assign(skill,structuredClone(original));
    (skill as any).effects=[{semantic:'poison',status:'pending-design'}];expect(()=>selectRuntimeUnit('vindicator','s4')).toThrow(/Pending/);
    expect(hasPendingContent({effects:[{parameters:{damage:{status:'pending-design'}}}]})).toBe(true);
  }finally{delete (skill as any).effects;Object.assign(skill,original);}
 });
 it('runtime projections cannot import legacy/adoption/facts files',()=>{
  for(const name of ['runtime-selection','units','loadouts','decisions','presentations','s4-balance','s4-catalog']) {
   const text=readFileSync(`games/game-mcfight/content/${name}.ts`,'utf8');
   const imports=[...text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
   expect(imports.some(p=>/legacy-source|adoption|inventory|r1-unit-cards/.test(p!))).toBe(false);
  }
 });
});
