import { describe, expect, it } from 'vitest';
import { threeSceneLifePackage } from './life-package.fixture.js';
import { validateLifeGamePackage } from './life-package-validate.js';

const copy = <T>(value:T):T => JSON.parse(JSON.stringify(value)) as T;

function packageWithGraph(): any {
  const value:any=copy(threeSceneLifePackage());
  value.logic={flags:[{id:'story.open',initial:false}],resources:[{id:'renown',initial:0,min:0,max:9}]};
  value.quests=[{id:'chapter',titleKey:'Chapter',quests:[{
    id:'quest',chapterId:'chapter',priority:1,initialNodeId:'a',terminalNodeIds:['c'],nodes:[
      {id:'a',titleKey:'A',objectiveKey:'A',trigger:{kind:'game-start'},effects:[{kind:'set-node-state',questId:'quest',nodeId:'a',state:'completed'},{kind:'set-node-state',questId:'quest',nodeId:'b',state:'active'}]},
      {id:'b',titleKey:'B',objectiveKey:'B',trigger:{kind:'calendar',boundary:'day'},effects:[{kind:'set-node-state',questId:'quest',nodeId:'b',state:'completed'},{kind:'set-node-state',questId:'quest',nodeId:'c',state:'active'}]},
      {id:'c',titleKey:'C',objectiveKey:'C',trigger:{kind:'calendar',boundary:'day'},effects:[{kind:'set-node-state',questId:'quest',nodeId:'c',state:'completed'}]},
    ],
  }]}];
  return value;
}

const issues=(value:unknown)=>validateLifeGamePackage(value).issues;

describe('Life quest graph validator',()=>{
  it('accepts a closed reachable acyclic graph',()=>{
    expect(validateLifeGamePackage(packageWithGraph())).toEqual({ok:true,issues:[]});
  });

  it('rejects unknown nested fields, duplicate ids, and broken references with exact paths',()=>{
    const value=packageWithGraph();
    value.quests[0].quests[0].nodes[0].trigger.callback='free-code';
    value.quests[0].quests[0].nodes[1].id='a';
    value.quests[0].quests[0].nodes[2].trigger={kind:'talk-choice',dialogueId:'mayor.greeting',choiceId:'missing'};
    value.quests[0].quests[0].nodes[2].effects[0].nodeId='missing';
    const paths=issues(value).map((entry)=>entry.path);
    expect(paths).toEqual(expect.arrayContaining([
      '$.quests[0].quests[0].nodes[0].trigger.callback',
      '$.quests[0].quests[0].nodes[1].id',
      '$.quests[0].quests[0].nodes[2].trigger',
      '$.quests[0].quests[0].nodes[2].effects[0]',
    ]));
  });

  it('audits dead nodes and permits cycles only when every member opts in and has an exit',()=>{
    const dead=packageWithGraph(); dead.quests[0].quests[0].nodes[0].effects.pop();
    expect(issues(dead)).toEqual(expect.arrayContaining([expect.objectContaining({code:'dead_node'})]));

    const cycle=packageWithGraph();
    cycle.quests[0].quests[0].nodes[1].effects.push({kind:'set-node-state',questId:'quest',nodeId:'a',state:'active'});
    expect(issues(cycle)).toEqual(expect.arrayContaining([expect.objectContaining({code:'cycle'})]));
    cycle.quests[0].quests[0].nodes[0].loop=true; cycle.quests[0].quests[0].nodes[1].loop=true;
    expect(issues(cycle).some((entry)=>entry.code==='cycle')).toBe(false);
  });

  it('rejects obvious self-locks and duplicate logical write targets',()=>{
    const value=packageWithGraph(); const node=value.quests[0].quests[0].nodes[0];
    node.when={kind:'flag',id:'story.open',equals:true};
    node.effects.unshift({kind:'set-flag',id:'story.open',value:true},{kind:'set-flag',id:'story.open',value:true});
    const codes=issues(value).map((entry)=>entry.code);
    expect(codes).toContain('self_lock'); expect(codes).toContain('write_conflict');
  });

  it('rejects concurrent initial-node write conflicts unless a shared exclusive group resolves them',()=>{
    const value=packageWithGraph(); const second=copy(value.quests[0].quests[0]);
    second.id='quest-2'; second.nodes=second.nodes.map((node:any)=>({...node,effects:node.effects.map((effect:any)=>effect.kind==='set-node-state'?{...effect,questId:'quest-2'}:{...effect})}));
    value.quests[0].quests.push(second);
    value.quests[0].quests[0].nodes[0].effects.unshift({kind:'set-flag',id:'story.open',value:true});
    value.quests[0].quests[1].nodes[0].effects.unshift({kind:'set-flag',id:'story.open',value:false});
    expect(issues(value)).toEqual(expect.arrayContaining([expect.objectContaining({code:'write_conflict'})]));
    value.quests[0].quests[0].exclusiveGroup='opening'; value.quests[0].quests[1].exclusiveGroup='opening';
    expect(issues(value).some((entry)=>entry.code==='write_conflict')).toBe(false);
  });
});
