import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const mutations=[
 {name:'pending-runtime',file:'games/game-mcfight/content/runtime-selection.ts',anchor:'||hasPendingContent(l)',replacement:''},
 {name:'same-template-alternatives',file:'scripts/mcfight-r2-generate.ts',anchor:"desc.includes('/')?desc.split('/')",replacement:"false?desc.split('/')"},
 {name:'confirmed-rule-check',file:'games/game-mcfight/content/r2-validate.ts',anchor:'l.confirmedRules?.[key]===value',replacement:'true'},
 {name:'runtime-source-isolation',file:'games/game-mcfight/content/runtime-selection.ts',anchor:"import { unitDefinitions } from './units.js';",replacement:"import { unitDefinitions } from './units.js';\nimport './legacy-source.json';"},
 {name:'runtime-alias-uniqueness',file:'games/game-mcfight/content/r2-validate.ts',anchor:"unique(c.loadouts.filter((l:any)=>l.runtimeAlias).map((l:any)=>({id:l.runtimeAlias})),'runtime skill aliases');",replacement:"unique(c.loadouts.filter((l:any)=>l.runtimeAlias).map((l:any)=>({id:l.id})),'runtime skill aliases');"}
];
const results=[];
for(const m of mutations){
 const original=readFileSync(m.file),text=original.toString();
 const hits=text.split(m.anchor).length-1;
 if(hits!==1)throw Error(`${m.name} anchor matches ${hits}`);
 let execution;
 try {
  writeFileSync(m.file,text.replace(m.anchor,m.replacement));
  const changed=readFileSync(m.file);if(sha(changed)===sha(original))throw Error('mutation missed');
  const log=openSync(`review-results/mutation-${m.name}.log`,'w');
  try {execution=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','games/game-mcfight/r2-content.test.ts','--maxWorkers=1','--minWorkers=1','--no-file-parallelism'],{stdio:['ignore',log,log],timeout:120000});}finally{closeSync(log);}
  results.push({name:m.name,file:m.file,anchorHits:hits,before:sha(original),mutated:sha(changed),exitCode:execution.status,error:execution.error?.message??null});
 }finally{writeFileSync(m.file,original);}
 const r=results.at(-1);r.restored=sha(readFileSync(m.file));r.restoreMatched=r.restored===r.before;
 writeFileSync('review-results/mutations.json',JSON.stringify(results,null,2));
 if(execution.status!==1||!r.restoreMatched)throw Error(`${m.name} did not fail assertions or restore`);
 console.log(JSON.stringify(r));
}
