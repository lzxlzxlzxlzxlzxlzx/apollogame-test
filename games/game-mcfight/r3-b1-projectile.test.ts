import { describe,it,expect } from 'vitest';
import { r3Catalog,r3Unavailable } from './content/r3-catalog.js';
import { createR3IdentityScene } from './r3-identity.fixture.js';
import type { Status } from '@engine/protocol/components.js';

const ids=['pillager','skeleton','twilightforest_death_tome','twilightforest_slime_beetle'] as const;

describe('R3-B1 standard straight projectile',()=>{
  it('compiles the four approved identities from effective attributes',()=>{
    for(const id of ids){
      expect(r3Unavailable.find(x=>x.id===id),id).toBeUndefined();
      const unit=r3Catalog.units.find(x=>x.id===id); expect(unit,id).toBeTruthy();
      const decision=r3Catalog.decisions.find(x=>x.id===unit!.decisionProfileId)!;
      expect(decision.candidates).toHaveLength(1);
      expect(r3Catalog.templates.find(x=>x.id===decision.candidates[0])!.form).toBe('projectile');
    }
  });

  it.each(ids)('%s creates a real flight and resolves one physical hit', id=>{
    const s=createR3IdentityScene(id); try {
      for(let tick=0;tick<220;tick++) s.step();
      const hits=s.receipts.filter(x=>x.source==='a#0:body'&&x.actual>0);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits.every(x=>x.target==='a-target')).toBe(true);
      expect(s.flightTrace.length).toBeGreaterThan(0);
      expect(new Set(s.flightTrace.map(x=>x.x)).size).toBeGreaterThan(1);
      const shotHits=s.projectileHits.filter(x=>x.target==='a-target');
      expect(new Set(shotHits.map(x=>x.projectile)).size).toBe(hits.length);
      expect(shotHits.length).toBe(hits.length);
      expect(s.world.query('ProjectileFlight')).toHaveLength(0);
    } finally { s.dispose(); }
  });

  it.each(ids)('%s rejects a pre-launch hard-control cancellation without damage', id=>{
    const s=createR3IdentityScene(id); try {
      const status=s.world.getComponent<Status>('a#0:body','Status')!; status.flags |= 16;
      for(let tick=0;tick<40;tick++) s.step();
      expect(s.receipts.filter(x=>x.source==='a#0:body')).toHaveLength(0);
      expect(s.world.query('ProjectileFlight')).toHaveLength(0);
    } finally { s.dispose(); }
  });

  it.each(ids)('%s keeps two instances isolated and deterministic for three rounds', id=>{
    const run=()=>{const s=createR3IdentityScene(id);try{for(let tick=0;tick<520;tick++)s.step();return s.receipts.filter(x=>x.actual>0).map(x=>[x.tick,x.source,x.target,x.actual]);}finally{s.dispose();}};
    const a=run(),b=run(); expect(a).toEqual(b);
    for(const source of ['a#0:body','b#0:body']) expect(a.filter(x=>x[1]===source).length).toBeGreaterThanOrEqual(3);
  });
});
