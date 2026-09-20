import {s4Capabilities} from './games/game-mcfight/s4-world.js';
import {dragPlaceCapability} from './src/skills/tier2/drag-place.js';
import {analyzeSystemGraph} from './src/assembly/system-graph.js';
import {ALL_CAPABILITIES} from './src/assembly/capability-registry.js';
const graph=analyzeSystemGraph([...s4Capabilities,dragPlaceCapability]);const known=new Set(ALL_CAPABILITIES.flatMap(c=>c.systems.map(s=>s.id)));console.log(JSON.stringify(graph,null,2));if(graph.systemCount!==31||graph.sccs.length||graph.duplicateIds.length||graph.danglingEdges.some(e=>!known.has(e.ref)))process.exit(1);
