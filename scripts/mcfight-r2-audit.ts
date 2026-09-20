import { readFileSync,writeFileSync } from 'node:fs';
import { ALL_CAPABILITIES } from '../src/assembly/capability-registry.js';
import { analyzeSystemGraph } from '../src/assembly/system-graph.js';
import { s4Capabilities } from '../games/game-mcfight/s4-world.js';
import { dragPlaceCapability } from '../src/skills/tier2/drag-place.js';
const templates=JSON.parse(readFileSync('games/game-mcfight/content/templates.json','utf8'));
const known=new Map(ALL_CAPABILITIES.map(c=>[c.id,c]));
const knownSystems=new Set(ALL_CAPABILITIES.flatMap(c=>c.systems.map(s=>s.id)));
const evaluate=(label:string,caps:typeof s4Capabilities)=>{
 const graph=analyzeSystemGraph(caps);
 return {label,capabilities:caps.map(c=>c.id),...graph,unknownReferences:graph.danglingEdges.filter(e=>!knownSystems.has(e.ref))};
};
const actual=evaluate('validated S4 battle + deployment',[...s4Capabilities,dragPlaceCapability]);
const candidateGraphs=templates.map((t:any)=>{
 const ids=[...new Set([...s4Capabilities.map(c=>c.id),...t.capabilities])] as string[];
 if(ids.some(id=>!known.has(id)))throw Error(`Unknown capability in ${t.id}`);
 return evaluate(`${t.id} candidate capability composition, not R3 runtime proof`,ids.map(id=>known.get(id)!));
});
const errors=[actual,...candidateGraphs].filter(g=>g.sccs.length||g.duplicateIds.length||g.unknownReferences.length);
writeFileSync('docs/design/game-mcfight/self-check/r2/combination-audit.json',JSON.stringify({actual,candidateGraphs,errors},null,2)+'\n');
console.log(JSON.stringify({actualSystems:actual.systemCount,candidateFamilies:candidateGraphs.length,errors}));
if(errors.length)process.exitCode=1;
