import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const p='src/skills/tier2/drag-place.ts', original=fs.readFileSync(p,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const mutations=[
 ['bounds',"if (!inside(rule.bounds, radius))",'if (false)'],
 ['overlap',"if ((x - p.x) ** 2 + (y - p.y) ** 2 < r * r)",'if (false)'],
 ['phase',"if (d.freePlacement && !phaseAllows(world, d)) return;",'if (false) return;']
];
const results=[];
for(const [name,anchor,replacement] of mutations){
 const hits=original.split(anchor).length-1;if(hits!==1) throw Error(`${name} hits ${hits}`);
 try {fs.writeFileSync(p,original.replace(anchor,replacement));
 const r=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/skills/tier2/drag-place-free.test.ts'],{encoding:'utf8'});
 fs.writeFileSync(`mutation-${name}.log`,r.stdout+r.stderr);
 results.push({name,hits,exit:r.status,detected:r.status===1});
 } finally {fs.writeFileSync(p,original);}
 results.at(-1).restored=hash(fs.readFileSync(p,'utf8'))===hash(original);
}
fs.writeFileSync('mutation-results.json',JSON.stringify({sha256:hash(original),results},null,2));
console.log(results);
if(results.some(r=>!r.detected||!r.restored)) process.exit(1);
