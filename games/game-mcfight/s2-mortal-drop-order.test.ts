import {it,expect} from 'vitest';
import {projectile} from './s2-c6.fixture.js';
import {add,xf} from './s2-round2.fixture.js';
import {ZONE_FLAG} from '@skills/tier2/trigger-zone.js';
it('death drops exist in the death tick but first contact occurs next tick, once',()=>{
 const w=projectile(true);w.getComponent<any>('gun','Caster')!.template='absent';
 w.getComponent<any>('enemy','Transform')!.x=0;
 w.getComponent<any>('library','PrefabLibrary')!.templates.deathBurst={entities:{zone:{Transform:xf(0),Shape:{kind:'circle',radius:1},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:5,targetMask:4,consumeOnHit:true}}}};
 add(w,'dying',{Transform:xf(0),Resource:{id:'hp',current:1,min:0,max:1},ResourceModify:{resourceId:'hp',amount:-1,scope:'local'},Mortal:{resource:'hp',atOrBelow:0,dropTemplate:'deathBurst'}});
 const trace=[];
 for(let tick=1;tick<=3;tick++){w.tick();trace.push({tick,hp:w.getComponent<any>('enemy','Resource')!.current,zone:w.hasComponent('deathBurst#0:zone','Hitbox'),dead:!w.getAllEntities().includes('dying'),requests:w.query('SpawnRequest').length});}
 expect(trace).toEqual([{tick:1,hp:30,zone:true,dead:true,requests:0},{tick:2,hp:25,zone:false,dead:true,requests:0},{tick:3,hp:25,zone:false,dead:true,requests:0}]);
 expect(w.getAllEntities()).not.toContain('drop:dying');console.log('MORTAL_LATE_DROP',JSON.stringify(trace));
});
