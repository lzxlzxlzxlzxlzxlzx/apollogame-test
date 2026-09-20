import { ALL_CAPABILITIES } from '@assembly/capability-registry.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';
console.log(JSON.stringify(analyzeSystemGraph(ALL_CAPABILITIES)));
