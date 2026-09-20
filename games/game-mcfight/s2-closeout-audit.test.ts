import {it,expect} from 'vitest';
import {ALL_CAPABILITIES} from '@assembly/capability-registry.js';
import {analyzeSystemGraph} from '@assembly/system-graph.js';
import {c6Caps} from './s2-c6.fixture.js';
import {steeringCapability} from '@skills/tier2/steering.js';
import {collisionResolveCapability} from '@skills/tier2/collision-resolve.js';
import {pathfindCapability} from '@skills/tier2/pathfind.js';
import {animStateCapability} from '@skills/tier2/anim-state.js';
it('all closeout production capabilities have a cycle-free schedule',()=>{
 const caps=[...c6Caps,steeringCapability,collisionResolveCapability,pathfindCapability,animStateCapability];
 const report=analyzeSystemGraph(caps);console.log('CLOSEOUT_AUDIT',JSON.stringify({capabilities:caps.length,...report}));
 expect(report.sccs).toEqual([]);expect(report.duplicateIds).toEqual([]);// References to uninstalled optional consumers are reported, never removed.
 const registered=new Set(ALL_CAPABILITIES.flatMap(c=>c.systems.map(s=>s.id)));
 expect(report.danglingEdges.filter(e=>!registered.has(e.ref))).toEqual([]);
});
