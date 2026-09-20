import {it,expect} from 'vitest';
import {projectile} from './s2-c6.fixture.js';
import {add,xf} from './s2-round2.fixture.js';
it('C6 gap evidence: a separately targetable head does not route local damage into the body pool',()=>{
 const w=projectile();w.getComponent<any>('enemy','Tag')!.flags=4;
 add(w,'head',{Transform:xf(2),Shape:{kind:'circle',radius:.25},Tag:{flags:2},Resource:{id:'hp',current:10,min:0,max:10},Hierarchy:{parentId:'enemy',localX:-4,localY:0,localRotation:0,localScaleX:1,localScaleY:1}});
 for(let i=0;i<12;i++)w.tick();
 const observed={head:w.getComponent<any>('head','Resource')!.current,body:w.getComponent<any>('enemy','Resource')!.current};
 expect(observed).toEqual({head:5,body:30});
 console.log('C6_UNMET_SHARED_HEALTH',JSON.stringify({observed,required:'head hit must reduce the shared body pool; current local Hitbox routing cannot express it'}));
});
