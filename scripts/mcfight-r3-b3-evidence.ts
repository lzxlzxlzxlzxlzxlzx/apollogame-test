/** Publish B3 program evidence only after the recorded full R3 run is green. */
import { readFileSync, writeFileSync } from 'node:fs';

const base='docs/design/game-mcfight/';
const log=readFileSync(base+'self-check/r3/r3-b3-full-regression.log','utf8');
if(!/Test Files\s+47 passed \(47\)/.test(log)||!/Tests\s+325 passed \| 1 skipped \(326\)/.test(log))
  throw new Error('Refuse to publish B3 identity evidence without the recorded green full regression');
const path=base+'full-restoration-matrix.json';
const matrix=JSON.parse(readFileSync(path,'utf8'));
const units=[
  ['alexsmobs_elephant','elephant'],['twilightforest_minoshroom','twilightforest_minoshroom'],
  ['vex','vex'],['alexsmobs_farseer','alexsmobs_farseer'],
  ['alexsmobs_tarantula_hawk','alexsmobs_tarantula_hawk'],['mowziesmobs_naga','mowziesmobs_naga'],
  ['alexsmobs_warped_mosco','alexsmobs_warped_mosco'],['alexscaves_teleto','alexscaves_teleto'],
] as const;
const prior=matrix.units.filter((row:any)=>row.r3IdentityTest==='passed-program').length;
if(prior!==36)throw new Error(`Expected 36 program-passed identities before B3, got ${prior}`);
for(const [matrixId,runtimeId] of units){
  const row=matrix.units.find((candidate:any)=>candidate.id===matrixId);
  if(!row)throw new Error(`Missing B3 matrix row: ${matrixId}`);
  row.r3IdentityTest='passed-program';
  row.r3IndependentReview='pending';
  row.r3Evidence='r3-b3-program-evidence.md';
  row.r3TestFile='games/game-mcfight/r3-b3-production.test.ts';
  row.r3PendingReason=null;
  row.r3RuntimeId=runtimeId;
}
const total=matrix.units.filter((row:any)=>row.r3IdentityTest==='passed-program').length;
if(total!==44)throw new Error(`Expected B3 publication to reach 44, got ${total}`);
matrix.r3Batch3ProgramEvidence={
  status:'passed-program-pending-independent-review',
  matrixProgramPassed:total,
  units:units.map(([matrixId,runtimeId])=>({matrixId,runtimeId})),
  tests:['games/game-mcfight/r3-b3-production.test.ts','games/game-mcfight/s2-visual.fixture.test.ts'],
  evidence:'r3-b3-program-evidence.md',
};
writeFileSync(path,JSON.stringify(matrix,null,2)+'\n');
console.log(JSON.stringify({programPassed:total,units:units.map(([matrixId])=>matrixId)}));
