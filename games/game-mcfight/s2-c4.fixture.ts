import { multiPulse } from './s2-v07.fixture.js';
import { add,xf } from './s2-round2.fixture.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
export function closeoutPulse(multiplier:0|.5=0,interrupt:'none'|'control'|'death'='none'){
 const w=multiPulse(false),lib=w.getComponent<any>('library','PrefabLibrary')!;
 const zone=lib.templates.pulse.entities.zone;
 lib.templates.pulse.entities.friendly={...zone,Hitbox:{...zone.Hitbox,targetMask:4,amount:3*multiplier}};
 w.getComponent<any>('enemy-b','Transform')!.x=-6;
 w.addComponent('enemy-b',{type:'Velocity',vx:2,vy:0} as any);
 add(w,'health',{Resource:{id:'source-hp',current:100,min:0,max:100}});
 w.addComponent('source',{type:'Resource',id:'hp',current:100,min:0,max:100} as any);
 w.addComponent('source',{type:'Status',flags:0} as any);
 w.addComponent('source',{type:'Shape',kind:'circle',radius:.25} as any);
 w.addComponent('source',{type:'Tag',flags:8} as any);
 w.addComponent('source',{type:'Mortal',resource:'hp',atOrBelow:0} as any);
 w.addComponent('pulse-event',{type:'Hierarchy',parentId:'source'} as any);
 const flow=w.getComponent<any>('source','GameFlow')!;
 for(const state of flow.states)if(state.id!=='Done')state.transitions.unshift({whenEntities:[{entityId:'source',check:{aliveResource:'hp',rejectStatusMask:32},not:true}],to:'Done',do:[{kind:'set-state',targetId:'pulse',value:'Done'}]});
 if(interrupt!=='none')add(w,'control',{Transform:xf(-2),Velocity:{vx:1,vy:0},Shape:{kind:'circle',radius:.25},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:interrupt==='death'?200:0,targetMask:8,setMask:interrupt==='control'?32:0,consumeOnHit:true}});
 return w;
}
