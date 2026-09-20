import { s4Capabilities } from '../../../../../games/game-mcfight/s4-world.js';
import { dragPlaceCapability } from '@skills/tier2/drag-place.js';
import { ALL_CAPABILITIES } from '@assembly/capability-registry.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';
const known = new Set(ALL_CAPABILITIES.flatMap(c => c.systems.map(s => s.id)));
const report = analyzeSystemGraph([...s4Capabilities, dragPlaceCapability]);
console.log(JSON.stringify(report));
if (report.systemCount === 0 || report.sccs.length || report.duplicateIds.length || report.danglingEdges.some(e => !known.has(e.ref))) process.exitCode = 1;
