import {it,expect} from 'vitest';
import {projectile,summon,beam} from './s2-c6.fixture.js';
it.each([false,true])('C6 projectile physically flies then hits or expires, miss=%s',miss=>{
 const w=projectile(miss),trace=[];
 for(let tick=1;tick<=20;tick++){w.tick();trace.push({tick,hp:w.getComponent<any>('enemy','Resource')!.current,bolts:w.query('Hitbox').map(([id])=>({id,x:w.getComponent<any>(id,'Transform')!.x,source:w.getComponent<any>(id,'PrefabOrigin')?.source}))});}
 expect(trace[1].hp).toBe(30);expect(trace.flatMap(t=>t.bolts).some(b=>b.x>0&&b.x<5)).toBe(true);
 expect(trace[19].hp).toBe(miss?30:25);expect(trace[19].bolts).toEqual([]);expect(trace.flatMap(t=>t.bolts).every(b=>b.source==='gun')).toBe(true);
 console.log('C6_PROJECTILE',JSON.stringify({miss,trace}));
});
it.each([false,true])('C6 beam length and width drive horizontal/vertical piercing geometry %s',vertical=>{
 const w=beam(vertical);for(let i=0;i<4;i++)w.tick();
 for(const id of ['enemy','enemy2'])expect(w.getComponent<any>(id,'Resource')!.current).toBe(26);
 expect(w.getComponent<any>('friend','Resource')!.current).toBe(30);expect(w.query('Hitbox')).toHaveLength(0);
});
it('C6 summon ownership/source and parent-death cleanup; experiment: summoned child dies with owner',()=>{
 const w=summon();w.tick();const ids=w.query('PrefabOrigin').map(([id])=>id);expect(ids).toHaveLength(1);expect(w.getComponent<any>(ids[0],'PrefabOrigin')!.source).toBe('gun');expect(w.getComponent<any>(ids[0],'Hierarchy')!.parentId).toBe('gun');expect(w.getComponent<any>(ids[0],'Transform')!.x).toBe(1);
 for(let tick=2;tick<=8;tick++)w.tick();expect(w.getAllEntities()).not.toContain('gun');expect(w.query('PrefabOrigin')).toHaveLength(0);
});

it.each([false,true])('C6 marking freezes actual landing position and moving target can evade %s',async moving=>{
 const {bombardment}=await import('./s2-c6.fixture.js');const w=bombardment(moving),trace=[];
 for(let tick=1;tick<=10;tick++){w.tick();trace.push({tick,marker:w.getComponent<any>('gun','Transform')!.x,target:w.getComponent<any>('enemy','Transform')!.x,hp:w.getComponent<any>('enemy','Resource')!.current});}
 expect(trace[0].marker).not.toBe(0);expect(trace[3].marker).toBe(trace[2].marker);expect(trace[9].marker).toBe(trace[2].marker);
 expect(trace[9].hp).toBe(moving?30:25);expect(w.query('Hitbox')).toHaveLength(0);console.log('C6_FIXED_LANDING',JSON.stringify({moving,trace}));
});
it('C6 riding and linked segment skeleton follows hierarchy and clears with owner',async()=>{
 const {relationshipSkeleton}=await import('./s2-c6.fixture.js');const w=relationshipSkeleton();w.tick();
 expect(w.query('PrefabOrigin')).toHaveLength(4);
 const segments=w.query('PrefabOrigin').map(([id])=>({id,x:w.getComponent<any>(id,'Transform')!.x}));expect(segments.find(s=>s.id.endsWith(':segment2'))!.x).toBe(2);
 for(let i=0;i<8;i++)w.tick();expect(w.query('PrefabOrigin')).toHaveLength(0);
});
import {sustainedBeam} from './s2-c6.fixture.js';
it.each(['none','control','death'] as const)('C6 sustained piercing beam expires and interrupt removes future pulses: %s',interrupt=>{
 const w=sustainedBeam(interrupt),trace=[];
 for(let tick=1;tick<=9;tick++){w.tick();trace.push({tick,hp:w.getComponent<any>('enemy-a','Resource')!.current,other:w.getComponent<any>('enemy-b','Resource')!.current,zones:w.query('Hitbox').length});}
 const hp=interrupt==='none'?41:47;expect(trace[8].hp).toBe(hp);expect(trace[8].other).toBe(hp);expect(trace[8].zones).toBe(0);
 expect(w.getComponent<any>('friend','Resource')!.current).toBe(50);console.log('C6_SUSTAINED_BEAM',JSON.stringify({interrupt,trace}));
});
