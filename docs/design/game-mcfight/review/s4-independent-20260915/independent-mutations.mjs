import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const cases=[
 {id:'neighborhood',file:'src/skills/tier2/entity-check.ts',anchor:'if (count > max) return false;',replacement:'if (false) return false;',test:'src/skills/tier2/entity-check-s4.test.ts'},
 {id:'range-min',file:'src/skills/tier2/entity-check.ts',anchor:'d2 < min * min || ',replacement:'',test:'src/skills/tier2/entity-check-s4.test.ts'},
 {id:'source-guard',file:'src/skills/tier3/caster.ts',anchor:'|| !checkEntity(world, sourceId, caster.sourceCheck ?? {})',replacement:'|| false',test:'src/skills/tier3/resolve-release-binding.test.ts'},
 {id:'only-target',file:'src/skills/tier2/hitbox.ts',anchor:'if (hb.onlyTarget !== undefined && hb.onlyTarget !== target) continue;',replacement:'if (false) continue;',test:'src/skills/tier3/resolve-release-binding.test.ts'},
 {id:'captured-aim',file:'src/skills/tier3/prefab.ts',anchor:'launch.dirX = req.aim.x; launch.dirY = req.aim.y;',replacement:'launch.dirX = 1; launch.dirY = 0;',test:'src/skills/tier3/resolve-release-binding.test.ts'},
 {id:'materialize-phase',file:'src/skills/tier3/prefab.ts',anchor:"id: 'targeted-prefab-spawn', phase: SystemPhase.Materialize",replacement:"id: 'targeted-prefab-spawn', phase: SystemPhase.Resolve",test:'games/game-mcfight/s2-closeout-audit.test.ts'}
];
const results=[];
for(const c of cases){const original=readFileSync(c.file);const source=original.toString();const hits=source.split(c.anchor).length-1;if(hits!==1)throw Error(`${c.id}: anchor hits ${hits}`);try{writeFileSync(c.file,source.replace(c.anchor,c.replacement));const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',c.test],{encoding:'utf8'});writeFileSync(`independent-mutation-${c.id}.log`,result.stdout+result.stderr);results.push({id:c.id,file:c.file,hits,exit:result.status,before:hash(original)});}finally{writeFileSync(c.file,original);}results.at(-1).after=hash(readFileSync(c.file));}
writeFileSync('independent-mutations.json',JSON.stringify(results,null,2));
if(results.some(r=>r.exit!==1||r.before!==r.after))process.exit(1);
