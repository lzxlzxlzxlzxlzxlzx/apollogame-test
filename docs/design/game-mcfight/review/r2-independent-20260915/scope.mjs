import ts from 'typescript';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=process.cwd(),shared=resolve(root,'../apollogame-test-game-105-standalone'),old=resolve(root,'../mcfight-s4-independent-20260915');
const cfg=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,root);
const visited=new Set(),queue=[resolve(root,'games/game-mcfight/game-mcfight.ts')];
while(queue.length){const file=queue.shift();if(visited.has(file))continue;visited.add(file);if(file.endsWith('.json'))continue;
 for(const imp of ts.preProcessFile(readFileSync(file,'utf8'),true,true).importedFiles){
  const r=ts.resolveModuleName(imp.fileName,file,parsed.options,ts.sys).resolvedModule;
  if(r&&!r.isExternalLibraryImport&&resolve(r.resolvedFileName).startsWith(root)&&!r.resolvedFileName.includes('node_modules'))queue.push(resolve(r.resolvedFileName));
 }
}
const closure=[...visited].map(p=>relative(root,p).replaceAll('\\','/')).sort();
const banned=closure.filter(p=>/s2-visual|legacy-source|\/adoption\.|inventory\/units|r1-unit-cards/.test(p));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(p,e.name)):[resolve(p,e.name)]);
const files=['src','games/game-mcfight','scripts'].flatMap(d=>walk(resolve(root,d))).filter(p=>/\.(ts|mjs|json|jsonc|html)$/.test(p));
const differences=files.filter(p=>!existsSync(resolve(shared,relative(root,p)))||sha(readFileSync(p))!==sha(readFileSync(resolve(shared,relative(root,p))))).map(p=>relative(root,p));
const s2visual='games/game-mcfight/s2-visual.ts';
const s2={current:sha(readFileSync(resolve(root,s2visual))),s4Frozen:sha(readFileSync(resolve(old,s2visual)))};
const report={closure,banned,comparedFiles:files.length,sharedDifferences:differences,s2Visual:s2};
writeFileSync('review-results/scope.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,closure:`${closure.length} files`}));
if(closure.length<10||banned.length||differences.length||s2.current!==s2.s4Frozen)process.exitCode=1;
