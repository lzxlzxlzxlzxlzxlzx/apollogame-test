import { describe, expect, it } from 'vitest';
import type { Status } from '@engine/protocol/components.js';
import { createR3IdentityScene } from './r3-identity.fixture.js';

const statusProjectiles = [
  ['stray', 'slow'], ['iceandfire_if_cockatrice', 'wither'], ['cataclysm_the_watcher', 'burn'],
] as const;

function run(id:string, ticks=360, offset:readonly [number,number]=[1.5,0]) {
  const scene=createR3IdentityScene(id,offset);
  for(let tick=0;tick<ticks;tick++) scene.step();
  return scene;
}

describe('R3-B2 production identity chains',()=>{
  it.each(statusProjectiles)('%s has three real projectile rounds and applies %s only after contact', (id,status)=>{
    const s=run(id); try {
      const hits=s.receipts.filter(x=>x.source==='a#0:body'&&x.actual>0);
      expect(hits.length).toBeGreaterThanOrEqual(3);
      expect(s.flightTrace.filter(x=>x.source==='a#0:body').length).toBeGreaterThan(2);
      expect(new Set(s.flightTrace.filter(x=>x.source==='a#0:body').map(x=>x.id)).size).toBeGreaterThanOrEqual(3);
      expect(s.world.getComponent<Status>('a-target','Status')!.effects?.some(e=>e.id===status)).toBe(true);
    } finally {s.dispose();}
  });

  it('wither skeleton commits a real melee hit and writes wither',()=>{
    const s=run('wither_skeleton'); try {
      expect(s.receipts.filter(x=>x.source==='a#0:body'&&x.actual>0).length).toBeGreaterThanOrEqual(3);
      expect(s.world.getComponent<Status>('a-target','Status')!.effects?.some(e=>e.id==='wither')).toBe(true);
    } finally {s.dispose();}
  });

  it('blaze emits three independently flying shots on the 2-tick cadence with deterministic indices',()=>{
    const sample=()=>{const s=run('blaze',150,[5,0]);try{return s.flightTrace.filter(x=>x.source==='a#0:body').map(x=>({tick:x.tick,shotIndex:x.shotIndex,castId:x.castId,x:x.x,y:x.y}));}finally{s.dispose();}};
    const a=sample(),b=sample(); expect(a).toEqual(b);
    const firstByShot=new Map<number,typeof a[number]>(); for(const entry of a) if(entry.shotIndex!==undefined&&!firstByShot.has(entry.shotIndex)) firstByShot.set(entry.shotIndex,entry);
    expect([...firstByShot.keys()]).toEqual([0,1,2]);
    expect(firstByShot.get(1)!.tick-firstByShot.get(0)!.tick).toBe(2);
    expect(firstByShot.get(2)!.tick-firstByShot.get(1)!.tick).toBe(2);
    expect(new Set([...firstByShot.values()].map(x=>x.castId)).size).toBe(1);
  });

  it('stymphalian bird emits two independent same-tick armor-piercing shots',()=>{
    const s=run('iceandfire_stymphalianbird',120,[5,0]); try {
      const first=new Map<number,typeof s.flightTrace[number]>();
      for(const f of s.flightTrace.filter(x=>x.source==='a#0:body')) if(f.shotIndex!==undefined&&!first.has(f.shotIndex)) first.set(f.shotIndex,f);
      expect([...first.keys()]).toEqual([0,1]);
      expect(first.get(0)!.tick).toBe(first.get(1)!.tick);
      expect(first.get(0)!.castId).toBe(first.get(1)!.castId);
      expect(first.get(0)!.id).not.toBe(first.get(1)!.id);
      const hit=s.receipts.find(x=>x.source==='a#0:body'&&x.actual>0)!;
      expect(hit.afterArmor).toBe(1);
    } finally {s.dispose();}
  });

  it.each([['twilightforest_fire_beetle','burn'],['twilightforest_winter_wolf','slow']] as const)('%s produces four locked-direction cone pulses and %s', (id,status)=>{
    const s=run(id,100,[1.5,0]); try {
      const hits=s.receipts.filter(x=>x.source==='a#0:body'&&x.actual>0);
      expect(hits.length).toBeGreaterThanOrEqual(4);
      const ticks=[...new Set(hits.map(x=>x.tick))];
      expect(ticks.slice(0,4)).toEqual([9,19,29,39]);
      expect(s.world.getComponent<Status>('a-target','Status')!.effects?.some(e=>e.id===status)).toBe(true);
    } finally {s.dispose();}
  });

  it('hard control after the first blaze shot cancels only remaining planned shots',()=>{
    const s=createR3IdentityScene('blaze',[5,0]); try {
      let interrupted=false;
      for(let tick=0;tick<80;tick++) { s.step(); if(!interrupted && s.flightTrace.some(x=>x.source==='a#0:body'&&x.shotIndex===0)) { s.world.getComponent<Status>('a#0:body','Status')!.flags|=16; interrupted=true; } }
      const shots=new Set(s.flightTrace.filter(x=>x.source==='a#0:body').map(x=>x.shotIndex));
      expect(interrupted).toBe(true); expect(shots).toEqual(new Set([0]));
    } finally {s.dispose();}
  });

  it('a real first-shot kill of the captured target cancels the remaining blaze plan',()=>{
    const s=createR3IdentityScene('blaze',[1,0],1); try {
      for(let tick=0;tick<100;tick++) s.step();
      const shots=new Set(s.flightTrace.filter(x=>x.source==='a#0:body').map(x=>x.shotIndex));
      expect(s.world.getAllEntities()).not.toContain('a-target');
      expect(shots).toEqual(new Set([0]));
    } finally {s.dispose();}
  });

  it('pre-launch hard control prevents all eight identities from releasing a new attack',()=>{
    for(const id of ['stray','iceandfire_if_cockatrice','cataclysm_the_watcher','wither_skeleton','blaze','twilightforest_fire_beetle','twilightforest_winter_wolf','iceandfire_stymphalianbird']){
      const s=createR3IdentityScene(id); try {
        s.world.getComponent<Status>('a#0:body','Status')!.flags|=16;
        for(let tick=0;tick<80;tick++) s.step();
        expect(s.receipts.filter(x=>x.source==='a#0:body')).toHaveLength(0);
      } finally {s.dispose();}
    }
  });
});
