import { describe, expect, it } from 'vitest';
import type { Resource, Status, Tag, Timer, Velocity } from '@engine/protocol/components.js';
import { createR3IdentityScene } from './r3-identity.fixture.js';

const step=(scene:ReturnType<typeof createR3IdentityScene>,ticks:number)=>{for(let i=0;i<ticks;i++)scene.step();};

/** B3 public-mechanics regression gate.  Each case uses the assembled R3 world:
 * damage, Status, Flow and movement come from normal Caster/Hitbox systems. */
describe('R3-B3 production capability boundaries',()=>{
  it('SkillCycle does not advance when its current farseer skill cannot start, then advances only after a real release',()=>{
    const s=createR3IdentityScene('alexsmobs_farseer',[100,100]);
    try{
      const body='a#0:body'; const cycle=s.world.getComponent<any>(body,'SkillCycle')!;
      expect(cycle.index).toBe(0); step(s,80); expect(cycle.index).toBe(0);
      const t=s.world.getComponent<any>('a-target','Transform')!; t.x=2;t.y=2;
      step(s,160); expect(cycle.index).toBeGreaterThan(0);
      expect(s.receipts.some(r=>r.source===body&&r.actual>0)).toBe(true);
    }finally{s.dispose();}
  });

  it('MobilityLock freezes an arthropod target without cancelling an already running production Flow, then expires',()=>{
    const s=createR3IdentityScene('alexsmobs_tarantula_hawk',[.2,.2]);
    try{
      const target='a-target', body='a#0:body';
      s.world.getComponent<Tag>(target,'Tag')!.flags|=16;
      step(s,80);
      const lock=s.world.getComponent<any>(target,'MobilityLock')!;
      expect(lock).toBeTruthy();
      const flow=s.world.query('GameFlow').map(([id])=>[id,s.world.getComponent<any>(id,'GameFlow')!]).find(([id])=>String(id).startsWith('a#0:')&&String(id)!==body)![1];
      // The source continues its real attack cycle; the lock carries no hard-control mask.
      expect(flow.current).not.toBe('Abort');
      expect(s.world.getComponent<Status>(target,'Status')!.flags&16).toBe(0);
      expect(s.world.getComponent<Status>(target,'Status')!.flags&32).toBe(0);
      s.world.destroyEntity(body); step(s,lock.untilTick-s.world.getVersion()+1);
      expect(s.world.getComponent(target,'MobilityLock')).toBeUndefined();
    }finally{s.dispose();}
  });

  it('FormChange keeps the same body, relation, cooldown and health ratio across its one-shot production change',()=>{
    const s=createR3IdentityScene('alexsmobs_warped_mosco',[3,3]);
    try{
      const body='a#0:body'; step(s,20);
      const resource=s.world.getComponent<Resource>(body,'Resource')!, beforeMax=resource.max;
      const relation=s.world.getComponent<any>(body,'Relation');
      const timer=s.world.query('Timer').map(([id])=>[id,s.world.getComponent<Timer>(id,'Timer')!]).find(([id])=>String(id).startsWith('a#0:'))![1] as Timer;
      resource.current=beforeMax*.25; const priorElapsed=timer.elapsed;
      step(s,2);
      const changed=s.world.getComponent<any>(body,'FormChange')!;
      const after=s.world.getComponent<Resource>(body,'Resource')!;
      expect(changed.changed).toBe(true); expect(s.world.getAllEntities()).toContain(body);
      expect(s.world.getComponent<any>(body,'Relation')).toEqual(relation);
      expect(after.current/after.max).toBeCloseTo(.25,5);
      expect(timer.elapsed).toBeGreaterThanOrEqual(priorElapsed);
      expect(s.world.getAllEntities().filter(id=>id.includes('body')).length).toBe(2);
      step(s,3); expect(s.world.getComponent<any>(body,'FormChange')!.changed).toBe(true);
    }finally{s.dispose();}
  });

  it('RelationOrbit writes real steering velocity while legal and stops it after its target is removed',()=>{
    const s=createR3IdentityScene('mowziesmobs_naga',[5,5]);
    try{
      const body='a#0:body'; step(s,1);
      // Production aggro supplies the legal Relation; force its idle state only so orbit owns movement this tick.
      s.world.getComponent<any>(body,'State')!.current='Free'; step(s,1);
      const before=s.world.getComponent<Velocity>(body,'Velocity')!;
      expect(Math.abs(before.vx)+Math.abs(before.vy)).toBeGreaterThan(0);
      s.world.destroyEntity('a-target'); step(s,1);
      const after=s.world.getComponent<Velocity>(body,'Velocity')!;
      expect(after.vx).toBe(0);expect(after.vy).toBe(0);
    }finally{s.dispose();}
  });

  it('poison from a real naga hit refreshes one effect, keeps source receipt, and deals periodic true damage',()=>{
    const s=createR3IdentityScene('mowziesmobs_naga',[1.5,1.5],1000);
    try{
      const target='a-target', body='a#0:body'; step(s,420);
      const status=s.world.getComponent<Status>(target,'Status')!;
      const poison=status.effects?.filter(e=>e.id==='poison')??[];
      expect(poison).toHaveLength(1); expect(poison[0]!.source).toBe(body);
      const hp=s.world.getComponent<Resource>(target,'Resource')!.current;
      // Remove target eligibility after the real hit; no later direct attack can refresh poison.
      s.world.getComponent<Tag>(target,'Tag')!.flags=0;
      // End the already-created attack zones only; poison itself remains a production OverTime effect.
      for(const [id] of s.world.query('Hitbox')) s.world.destroyEntity(id);
      step(s,20);
      expect(s.world.getComponent<Resource>(target,'Resource')!.current).toBeLessThanOrEqual(hp-2);
      expect(s.receipts.some(r=>r.source===body&&r.raw===2)).toBe(true);
    }finally{s.dispose();}
  });
});
