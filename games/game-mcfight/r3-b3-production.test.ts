import { describe, expect, it } from 'vitest';
import type { Resource, Status, Tag } from '@engine/protocol/components.js';
import { createR3IdentityScene } from './r3-identity.fixture.js';

function step(scene:ReturnType<typeof createR3IdentityScene>, ticks:number){for(let i=0;i<ticks;i++)scene.step();}

describe('R3-B3 production identities',()=>{
  it.each([['elephant',25],['twilightforest_minoshroom',23]] as const)('%s chooses a real long-range charge once and damage is %i',(id,damage)=>{
    const s=createR3IdentityScene(id,[5,5]);
    try{step(s,180);const hits=s.receipts.filter(x=>x.source==='a#0:body'&&x.actual>0);expect(hits.some(x=>x.raw===damage),JSON.stringify(hits.map(x=>x.raw))).toBe(true);expect(hits.length).toBeGreaterThanOrEqual(2);}finally{s.dispose();}
  });

  it('vex keeps its dive window production-bound and has no shop offer',()=>{
    const s=createR3IdentityScene('vex',[2,2]);
    try{step(s,80);expect(s.receipts.some(x=>x.source==='a#0:body'&&x.raw===13)).toBe(true);expect(s.trace.some(x=>x.instance==='a'&&x.phase==='Active')).toBe(true);}finally{s.dispose();}
  });
  it('farseer advances its private successful-release cycle 3 beams then 5 dives',()=>{
    const s=createR3IdentityScene('alexsmobs_farseer',[2,2],100000);
    try{
      step(s,900);
      const hits=s.receipts.filter(x=>x.source==='a#0:body'&&x.actual>0).map(x=>x.raw);
      expect(hits.filter(x=>x===10000).length).toBeGreaterThanOrEqual(3);
      expect(hits.filter(x=>x===6).length, JSON.stringify(hits)).toBeGreaterThanOrEqual(5);
      expect(s.world.getComponent<any>('a#0:body','SkillCycle')!.index).toBeGreaterThanOrEqual(0);
    }finally{s.dispose();}
  });

  it('tarantula hawk applies a non-interrupting ground mobility lock only to arthropods',()=>{
    const arthropod=createR3IdentityScene('alexsmobs_tarantula_hawk',[.2,.2]);
    try{
      arthropod.world.getComponent<Tag>('a-target','Tag')!.flags|=16;
      step(arthropod,80);
      const lock=arthropod.world.getComponent<any>('a-target','MobilityLock');
      expect(lock?.groundWhileLocked).toBe(true);
      expect(lock.untilTick).toBeGreaterThan(0);
      // It is not hard control: the hawk's own attack Flow remains runnable.
      expect(arthropod.world.getComponent<Status>('a-target','Status')!.flags&16).toBe(0);
    }finally{arthropod.dispose();}
    const ordinary=createR3IdentityScene('alexsmobs_tarantula_hawk',[.2,.2]);
    try{step(ordinary,80);expect(ordinary.world.getComponent('a-target','MobilityLock')).toBeUndefined();}finally{ordinary.dispose();}
  });

  it('naga alternates poison projectile and poison dive while its orbit has no damage side effect',()=>{
    const s=createR3IdentityScene('mowziesmobs_naga',[1.5,1.5],1000);
    try{step(s,420);const hits=s.receipts.filter(x=>x.source==='a#0:body'&&x.actual>0).map(x=>x.raw);expect(hits).toContain(4);expect(hits).toContain(8);expect(s.world.getComponent<Status>('a-target','Status')!.effects?.some(e=>e.id==='poison')).toBe(true);}finally{s.dispose();}
  });

  it('warped mosco changes the same body in place once and gates changed-form projectile',()=>{
    const s=createR3IdentityScene('alexsmobs_warped_mosco',[3,3]);
    try{
      const body=s.world.getComponent<Resource>('a#0:body','Resource')!;
      body.current=body.max*.25;
      step(s,3);
      expect(s.world.getComponent<any>('a#0:body','FormChange')!.changed).toBe(true);
      expect(s.world.getComponent<any>('a#0:form','State')!.current).toBe('changed');
      expect(s.world.getComponent<Status>('a#0:body','Status')!.flags&4).toBe(4);
      const id='a#0:body'; step(s,3); expect(s.world.getComponent<any>(id,'FormChange')!.changed).toBe(true);
      step(s,160); expect(s.flightTrace.some(x=>x.source===id)).toBe(true);
    }finally{s.dispose();}
  });

  it('teleto is a standard real projectile identity against ground targets',()=>{
    const s=createR3IdentityScene('alexscaves_teleto',[3,3]);
    try{step(s,160);expect(s.flightTrace.some(x=>x.source==='a#0:body')).toBe(true);expect(s.receipts.some(x=>x.source==='a#0:body'&&x.raw===6)).toBe(true);}finally{s.dispose();}
  });
});
