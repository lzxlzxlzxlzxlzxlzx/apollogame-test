import { expect, it } from 'vitest';
import type { Component } from '@engine/core/types.js';
import type { Resource } from '@engine/protocol/components.js';
import { createS4Battle } from './s4-session.js';
import { s4TeamMask } from './s4-world.js';

function scene(hp: number) {
  const b = createS4Battle([], 1);
  const add = (id: string, data: Record<string, object>) => {
    b.world.createEntity(id);
    for (const [type, value] of Object.entries(data)) b.world.addComponent(id, { type, ...value } as Component);
  };
  add('target', { Transform: { x:0,y:0,rotation:0,scaleX:1,scaleY:1 }, Shape: {kind:'circle',radius:.5}, Tag:{flags:s4TeamMask(2)}, Resource:{id:'hp',current:hp,min:0,max:100}, DamageReceiver:{resource:'hp'} });
  const hit = (id: string, amount: number, team: 1|2 = 1) => add(id, {
    Transform:{x:0,y:0,rotation:0,scaleX:1,scaleY:1}, Shape:{kind:'circle',radius:1}, Sensor:{}, Tag:{flags:1},
    PrefabOrigin:{instanceId:id,templateId:'stats-probe',source:`source-${team}`},
    Hitbox:{resource:'hp',amount,targetMask:s4TeamMask(2),consumeOnHit:true},
  });
  // Source tag snapshot is captured by the production Hitbox, not supplied statistics.
  add('source-1',{Tag:{flags:s4TeamMask(1)}}); add('source-2',{Tag:{flags:s4TeamMask(2)}});
  return {b,hit,hp:()=>b.world.getComponent<Resource>('target','Resource')!.current};
}
it('ordinary production contact reports actual HP removed once',()=>{
  const s=scene(100);s.hit('normal',12);s.b.tick();
  expect(s.hp()).toBe(88);expect(s.b.damage!()).toEqual({player:12,enemy:0,playerHealing:0,enemyHealing:0});
  expect(s.b.world.query('Hitbox')).toHaveLength(0);s.b.tick();expect(s.b.damage!().player).toBe(12);s.b.dispose();
});
it('two same-tick contacts cannot count overkill twice',()=>{
  const s=scene(7);s.hit('first',5);s.hit('second',12);s.b.tick();
  expect(s.hp()).toBe(0);expect(s.b.damage!().player).toBe(7);s.b.dispose();
});
it('healing and overhealing are separate from damage even in the same tick',()=>{
  const s=scene(90);s.hit('damage',12);s.hit('heal',-50,2);s.b.tick();
  expect(s.hp()).toBe(100);expect(s.b.damage!()).toEqual({player:12,enemy:0,playerHealing:0,enemyHealing:22});s.b.dispose();
});
