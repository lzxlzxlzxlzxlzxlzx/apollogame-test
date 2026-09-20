import {it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {collectSystems,analyzeSystemGraph} from '../../../../../src/assembly/system-graph.js';
import {ALL_CAPABILITIES} from '../../../../../src/assembly/capability-registry.js';
import {c6Caps} from '../../../../../games/game-mcfight/s2-c6.fixture.js';
it('diagnose only',()=>{const caps=[...c6Caps,...['t2-steering','t2-collision-resolve','t2-pathfind','t2-anim-state'].map(id=>ALL_CAPABILITIES.find(c=>c.id===id)!)]; const proposed=caps.map(c=>({...c,systems:c.systems.map(s=>s.id==='targeted-prefab-spawn'?{...s,phase:12}:s)})); console.log('PROPOSED_PHASE12',JSON.stringify(analyzeSystemGraph(proposed))); const refs=collectSystems(caps); const report=analyzeSystemGraph(caps);const edges=[];for(const a of refs)for(const b of refs){if(a===b||a.phase!==b.phase)continue; const explicit=a.sys.runsBefore?.includes(b.id)||b.sys.runsAfter?.includes(a.id); const reverse=b.sys.runsBefore?.includes(a.id)||a.sys.runsAfter?.includes(b.id);const components=a.sys.writes.filter(c=>[...b.sys.reads,...b.sys.consumes].includes(c));if(explicit||components.length&&!reverse)edges.push({from:a.id,to:b.id,explicit:!!explicit,components:reverse?[]:components});}writeFileSync('docs/design/game-mcfight/self-check/s4/independent-closeout-edges.json',JSON.stringify({report,refs,edges},null,2));});

