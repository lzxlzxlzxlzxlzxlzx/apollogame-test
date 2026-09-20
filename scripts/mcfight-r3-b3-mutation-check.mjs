/**
 * B3 independent-review mutation proof.  Every mutation is applied to the
 * shared source only long enough to run the production boundary suite, and is
 * restored in finally.  A passing mutant is a failed gate.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const test = 'games/game-mcfight/r3-b3-capability-boundaries.test.ts';
const mutations = [
  {
    id: 'cycle-advance-on-no-signal', file: 'src/skills/tier3/caster.ts',
    from: 'if (signals.size === 0) return;',
    to: "if (signals.size === 0) { for (const [owner] of world.query('SkillCycle')) { const cycle=world.getComponent<any>(owner,'SkillCycle')!; cycle.index=(cycle.index+1)%Math.max(1,cycle.candidates.length); } return; }",
  },
  {
    id: 'mobility-lock-becomes-hard-control', file: 'src/skills/tier3/mcfight-b3.ts',
    from: 'v.vx=0;v.vy=0;}}},\n {id:\'relation-orbit\'',
    to: 'v.vx=0;v.vy=0;if(status)status.flags|=32;}}},\n {id:\'relation-orbit\'',
  },
  {
    id: 'form-change-loses-original-body', file: 'src/skills/tier3/mcfight-b3.ts',
    from: 'f.changed=true;',
    to: 'f.changed=true;world.destroyEntity(id);',
  },
  {
    id: 'orbit-keeps-velocity-after-target-removal', file: 'src/skills/tier3/mcfight-b3.ts',
    from: 'if(v){v.vx=0;v.vy=0;}continue;}const dx=',
    to: 'if(v){v.vx=1;v.vy=1;}continue;}const dx=',
  },
  {
    id: 'poison-loses-source-snapshot', file: 'src/skills/tier2/hitbox.ts',
    from: 'prev.source = statusSource;',
    to: 'prev.source = trig.zone;',
  },
  {
    id: 'poison-loses-periodic-damage', file: 'games/game-mcfight/s4-world.ts',
    from: "skill.onHitStatus === 'poison' ? { damagePerTick: 2, period: 20 }",
    to: "skill.onHitStatus === 'poison' ? { damagePerTick: 0, period: 20 }",
  },
];
const results=[];
for (const mutation of mutations) {
  const path=resolve(root, mutation.file); const before=readFileSync(path,'utf8');
  if (!before.includes(mutation.from)) throw new Error(`anchor missing: ${mutation.id}`);
  try {
    writeFileSync(path,before.replace(mutation.from,mutation.to));
    const run=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',test,'--maxWorkers=1','--minWorkers=1','--reporter=dot'],{cwd:root,encoding:'utf8'});
    results.push({id:mutation.id,exitCode:run.status,red:run.status!==0,tail:(run.stdout+run.stderr).slice(-2000)});
  } finally { writeFileSync(path,before); }
}
const out=resolve(root,'docs/design/game-mcfight/self-check/r3/r3-b3-r3-mutations.json');
mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,JSON.stringify({test,results},null,2)+'\n');
for (const result of results) console.log(`${result.id}: ${result.red?'RED':'GREEN'} exit=${result.exitCode}`);
if (results.some(r=>!r.red)) process.exitCode=1;
