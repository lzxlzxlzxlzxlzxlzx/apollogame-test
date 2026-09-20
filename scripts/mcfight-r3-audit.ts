import {writeFileSync} from 'node:fs';
import {analyzeSystemGraph} from '../src/assembly/system-graph.js';
import {ALL_CAPABILITIES} from '../src/assembly/capability-registry.js';
import {s4Capabilities} from '../games/game-mcfight/s4-world.js';
import {dragPlaceCapability} from '../src/skills/tier2/drag-place.js';
import {overTimeCapability} from '../src/skills/tier2/over-time.js';
import {pathFollowCapability} from '../src/skills/tier2/path-follow.js';
const known=new Set(ALL_CAPABILITIES.flatMap(c=>c.systems.map(s=>s.id)));
const evaluate=(label:string,caps:typeof s4Capabilities)=>{
 const graph=analyzeSystemGraph(caps);
 return {label,capabilities:caps.map(c=>c.id),...graph,unknownReferences:graph.danglingEdges.filter(e=>!known.has(e.ref))};
};
const graphs=[evaluate('R3 current production + deployment',[...s4Capabilities,dragPlaceCapability]),evaluate('R3 source/periodic receipts',[...s4Capabilities]),evaluate('R3 planar boundary probe',[...s4Capabilities,pathFollowCapability]),evaluate('R3 all current and probe capabilities',[...s4Capabilities,dragPlaceCapability,pathFollowCapability])];
const failures=graphs.filter(g=>g.sccs.length||g.duplicateIds.length||g.unknownReferences.length);
writeFileSync('docs/design/game-mcfight/self-check/r3/combination-audit.json',JSON.stringify({graphs,failures},null,2)+'\n');
console.log(JSON.stringify(graphs.map(g=>({label:g.label,systems:g.systemCount,cycles:g.sccs.length,optionalReferences:g.danglingEdges.length,unknown:g.unknownReferences.length}))));
if(failures.length)process.exitCode=1;
