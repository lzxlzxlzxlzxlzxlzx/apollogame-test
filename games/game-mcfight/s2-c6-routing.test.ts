import {it,expect} from 'vitest';
import {ZONE_FLAG} from '@skills/tier2/trigger-zone.js';
import {setup,strike} from './s2-c6-routing.fixture.js';
import {add,xf} from './s2-round2.fixture.js';
it('A shared head routes reduced damage and body receives full damage; last source only changes on effective loss',()=>{
 const w=setup();add(w,'lich-a',{Tag:{flags:16}});add(w,'lich-b',{Tag:{flags:16}});
 strike(w,'head-hit',2,6,'lich-a');w.tick();expect(w.getComponent<any>('enemy','Resource')!.current).toBe(27);expect(w.getComponent<any>('head','Resource')).toBeUndefined();
 strike(w,'body-hit',6,6,'lich-b');w.tick();expect(w.getComponent<any>('enemy','Resource')!.current).toBe(21);expect(w.getComponent<any>('enemy','LastDamage')!.source).toBe('lich-b');expect(w.query('DamageRequest')).toHaveLength(0);
});
it.each([['arthropod',8,30],['large',0,100],['small',0,30]] as const)('A conversion selects %s by original max/tag and preserves last effective source once', (expected,tag,max)=>{
 const w=setup();w.getComponent<any>('enemy','Resource')!.max=max;w.getComponent<any>('enemy','Resource')!.current=max;w.getComponent<any>('enemy','Tag')!.flags=4|tag;
 const conversion={resource:'hp',remaining:1,sourceMask:16,rules:[{template:'arthropod',requireTag:8},{template:'large',minMaxHp:80},{template:'small'}]};
 w.addComponent('enemy',{type:'DeathConversion',...conversion} as any);
 const lib=w.getComponent<any>('library','PrefabLibrary')!;for(const name of ['arthropod','large','small'])lib.templates[name]={entities:{body:{Transform:xf(0),Resource:{id:'hp',current:10,min:0,max:10},DeathConversion:conversion,Mortal:{resource:'hp',atOrBelow:0},Shape:{kind:'circle',radius:.25},Tag:{flags:4}}}};
 add(w,'lich-a',{Tag:{flags:16}});add(w,'lich-b',{Tag:{flags:16}});add(w,'late',{Tag:{flags:16}});
 strike(w,'first',6,1,'lich-a');strike(w,'fatal',6,max,'lich-b');strike(w,'too-late',6,99,'late');w.tick();
 expect(w.getAllEntities()).not.toContain('enemy');expect(w.getAllEntities()).not.toContain('head');
 w.tick();const converted=w.query('PrefabOrigin').filter(([id])=>w.getComponent<any>(id,'PrefabOrigin')!.templateId===expected);expect(converted).toHaveLength(1);
 const id=converted[0][0];expect(w.getComponent<any>(id,'PrefabOrigin')!.source).toBe('lich-b');expect(w.getComponent<any>(id,'DeathConversion')!.remaining).toBe(0);
 strike(w,'kill-converted',6,20,'lich-a');for(let i=0;i<4;i++)w.tick();expect(w.query('DeathConversion')).toHaveLength(0);expect(w.query('DamageRequest')).toHaveLength(0);
 console.log('C6_A_CONVERSION',JSON.stringify({expected,max,tag,source:'lich-b',remaining:0,entities:w.getAllEntities()}));
});
import {sharedPoolSample,conversionSample} from './s2-c6-routing.fixture.js';
it('A routed zero damage cannot steal provenance; a dead pool is not damaged twice',()=>{
 const w=sharedPoolSample();w.tick();strike(w,'zero',2,0,'other');w.tick();expect(w.getComponent<any>('enemy','LastDamage')!.source).toBe('lich');
 w.removeComponent('enemy','Mortal');strike(w,'fatal',6,100,'lich');w.tick();strike(w,'after-zero',6,100,'other');w.tick();expect(w.getComponent<any>('enemy','LastDamage')!.source).toBe('lich');expect(w.getComponent<any>('enemy','Resource')!.current).toBe(0);
});
it('A conversion request is idempotent without destroy and source-death policy is explicitly snapshot-based',()=>{
 const w=conversionSample();w.removeComponent('enemy','Mortal');w.addComponent('lich',{type:'Resource',id:'hp',current:1,min:0,max:1} as any);w.addComponent('lich',{type:'Mortal',resource:'hp',atOrBelow:0} as any);w.addComponent('lich',{type:'Transform',...xf(8)} as any);w.addComponent('lich',{type:'Shape',kind:'circle',radius:.25} as any);
 add(w,'kill-lich',{Transform:xf(8),Shape:{kind:'circle',radius:.3},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:3,targetMask:16,consumeOnHit:true}});
 for(let i=0;i<8;i++)w.tick();expect(w.getAllEntities()).not.toContain('lich');expect(w.query('PrefabOrigin').filter(([id])=>w.getComponent<any>(id,'PrefabOrigin')!.templateId==='converted')).toHaveLength(1);
 expect(w.query('DamageRequest')).toHaveLength(0);
});
import {committedMelee,GROUND} from './s2-dive.fixture.js';
import {damageRoutingCapability} from '@skills/tier2/damage-routing.js';
it('A routed lethal contact still prevents a same-tick late committed release',()=>{
 const w=committedMelee();for(const system of damageRoutingCapability.systems)w.addSystem(system);
 w.addComponent('melee',{type:'DamageReceiver',resource:'cd'} as any);w.addComponent('melee',{type:'Mortal',resource:'cd',atOrBelow:0} as any);
 add(w,'lethal',{Transform:xf(-6),Velocity:{vx:2,vy:0},Shape:{kind:'circle',radius:.25},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'cd',amount:1,targetMask:GROUND,consumeOnHit:true}});
 for(let i=0;i<6;i++)w.tick();expect(w.getAllEntities()).not.toContain('melee');expect(w.getComponent<any>('flyer','Resource')!.current).toBe(30);expect(w.query('Hitbox')).toHaveLength(0);
});
