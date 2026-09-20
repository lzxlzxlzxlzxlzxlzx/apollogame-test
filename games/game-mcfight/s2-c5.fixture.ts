import { lifetimeCapability } from '@skills/tier1/lifetime.js';
import {World} from '@engine/core/world.js';
import {caps,unitTemplate} from './s2-multiskill.fixture.js';
import {instantiate} from '@skills/tier3/prefab.js';
import {add,xf} from './s2-round2.fixture.js';
import {ZONE_FLAG} from '@skills/tier2/trigger-zone.js';
import {mulberry32} from '@skills/atoms/random/index.js';
export function scaleBattle(count:number,seed=301){
 const w=new World(),rng=mulberry32(seed);for(const c of [...caps,lifetimeCapability])for(const s of c.systems)w.addSystem(s);
 add(w,'library',{PrefabLibrary:{seq:0,templates:{strike:{entities:{zone:{Timer:{id:"life",elapsed:0,duration:3,loop:false},Transform:xf(0),Shape:{kind:'circle',radius:1},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:7,targetMask:2,consumeOnHit:true}}}}}}});
 for(let i=0;i<count-1;i++)instantiate(w,unitTemplate(),'scale',i,-2-5*rng(),(rng()-.5)*2);
 add(w,'target',{Transform:xf(0),Tag:{flags:2},Shape:{kind:'circle',radius:.5},Resource:{id:'hp',current:1e9,min:0,max:1e9}});
 return w;
}

