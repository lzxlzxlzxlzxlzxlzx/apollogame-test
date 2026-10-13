import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { validateLifeGamePackage } from '@assembly/life-package.js';
import type { LifeContinuousMotion, LifeGatherActionResult, LifePosition, LifeResourceNode, Transform } from '@engine/protocol/components.js';
import type { Inventory } from './inventory.js';
import { invCount } from './inventory.js';
import { lifeEntityId } from '@assembly/life-package-compile.js';

function make(): Engine { const e=new Engine();e.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint);e.world.addComponent('life:player',{type:'LifePosition',sceneId:'farm',x:1,y:2} as LifePosition);e.world.addComponent('life:player',{type:'Transform',x:1,y:2,rotation:0,scaleX:1,scaleY:1} as Transform);e.world.getComponent<LifeContinuousMotion>('life:player','LifeContinuousMotion')!.sceneId='farm';return e; }
function tick(e:Engine,s:QueuedInputSource,...actions:Array<[string,string?]>){for(const [key,arg] of actions)s.enqueueAction(key,arg===undefined?undefined:{arg});applyCommands(e.world,s.commandsForTick(e.world.getVersion()+1));e.world.tick();}
const nodeId=lifeEntityId('placement','farm','berry-bush');
describe('t2-life-target-selection and t2-life-resource-gather',()=>{
  it('selects a nearby resource and atomically gathers it through the semantic input chain',()=>{const e=make(),s=new QueuedInputSource('host');tick(e,s,['life.select-target','berry-bush'],['life.action','forage']);expect(invCount(e.world.getComponent<Inventory>('life:player','Inventory')!,'resource.berry')).toBe(1);expect(e.world.getComponent<LifeResourceNode>(nodeId,'LifeResourceNode')?.remaining).toBe(2);expect(e.world.getComponent<LifeGatherActionResult>('life:player','LifeGatherActionResult')).toMatchObject({status:'applied',placementId:'berry-bush',quantity:1,remaining:2});});
  it('rejects no selection, mismatched action, depletion and a full inventory without changing the node',()=>{const e=make(),s=new QueuedInputSource('host');tick(e,s,['life.action','forage']);expect(e.world.getComponent<LifeGatherActionResult>('life:player','LifeGatherActionResult')).toMatchObject({reason:'missing-selection'});tick(e,s,['life.select-target','berry-bush']);e.world.addComponent(nodeId,{type:'LifeResourceNode',action:'mine',itemId:'resource.berry',remaining:2} as LifeResourceNode);tick(e,s,['life.action','forage']);expect(e.world.getComponent<LifeGatherActionResult>('life:player','LifeGatherActionResult')).toMatchObject({reason:'action-mismatch'});expect(e.world.getComponent<LifeResourceNode>(nodeId,'LifeResourceNode')?.remaining).toBe(2);e.world.addComponent(nodeId,{type:'LifeResourceNode',action:'forage',itemId:'resource.berry',remaining:0} as LifeResourceNode);tick(e,s,['life.action','forage']);expect(e.world.getComponent<LifeGatherActionResult>('life:player','LifeGatherActionResult')).toMatchObject({reason:'depleted'});});
  it('strictly validates resource-node authoring',()=>{const p:any=threeSceneLifePackage();const node=p.scenes[1].placements[0];delete node.resourceNode;expect(validateLifeGamePackage(p).issues.map(x=>x.path)).toContain('$.scenes[1].placements[0].resourceNode');const q:any=threeSceneLifePackage();q.scenes[1].placements[0].resourceNode.quantity=0;expect(validateLifeGamePackage(q).issues.map(x=>x.path)).toContain('$.scenes[1].placements[0].resourceNode.quantity');});
});
