import {projectile} from './s2-c6.fixture.js';
import {add,xf} from './s2-round2.fixture.js';
import {ZONE_FLAG} from '@skills/tier2/trigger-zone.js';
export function setup(){
 const w=projectile(true);w.getComponent<any>('gun','Caster')!.template='absent';
 w.addComponent('enemy',{type:'DamageReceiver',resource:'hp'} as any);w.addComponent('enemy',{type:'Mortal',resource:'hp',atOrBelow:0} as any);
 add(w,'head',{Transform:xf(2),Shape:{kind:'circle',radius:.25},Tag:{flags:2},Hierarchy:{parentId:'enemy',localX:-4,localY:0,localRotation:0,localScaleX:1,localScaleY:1},DamageReceiver:{resource:'hp',targetEntity:'enemy',multiplier:.5}});
 return w;
}
export function strike(w:ReturnType<typeof setup>,id:string,x:number,amount:number,source:string){add(w,id,{Transform:xf(x),Shape:{kind:'circle',radius:.3},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount,targetMask:6,consumeOnHit:true},PrefabOrigin:{templateId:'strike',seq:0,localId:'zone',source}});}

export function sharedPoolSample(){const w=setup();add(w,'lich',{Tag:{flags:16}});strike(w,'head-hit',2,6,'lich');return w;}
export function conversionSample(){
 const w=setup();add(w,'lich',{Tag:{flags:16}});
 w.addComponent('enemy',{type:'DeathConversion',resource:'hp',remaining:1,sourceMask:16,rules:[{template:'converted'}]} as any);
 w.getComponent<any>('library','PrefabLibrary')!.templates.converted={entities:{body:{Transform:xf(0),Resource:{id:'hp',current:10,min:0,max:10},Tag:{flags:4}}}};
 strike(w,'fatal',6,40,'lich');return w;
}
