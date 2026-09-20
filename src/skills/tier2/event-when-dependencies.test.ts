import { expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import { eventWhenCapability } from './event-when.js';
import { stringVariableCapability } from '../atoms/string-variable/index.js';
import { timerCapability } from '../atoms/timer/index.js';
const add=(w:World,id:string,data:Record<string,object>)=>{w.createEntity(id);for(const[type,value]of Object.entries(data))w.addComponent(id,{type,...value} as Component);};
it('event conditions observe this tick string assignment even when registered before the producer',()=>{
 const w=new World();for(const c of [eventWhenCapability,stringVariableCapability])for(const s of c.systems)w.addSystem(s);
 add(w,'text',{StringVar:{id:'hand',value:'old'},StringSet:{id:'hand',value:'ready'}});
 add(w,'event',{EventWhen:{when:{kind:'string',id:'hand',equals:'ready'},mode:'edge',signal:'ready'}});
 w.tick();expect(w.getComponent<any>('text','StringVar')!.value).toBe('ready');expect(w.getComponent<any>('event','Signal')?.name).toBe('ready');
 expect(w.getSortedSystems().map(s=>s.id)).toEqual(['string-apply','event-when']);
});
it('event conditions observe this tick timer advance even when registered before the producer',()=>{
 const w=new World();for(const c of [eventWhenCapability,timerCapability])for(const s of c.systems)w.addSystem(s);
 add(w,'timer',{Timer:{id:'wait',elapsed:0,duration:10,loop:false}});
 add(w,'event',{EventWhen:{when:{kind:'timer',id:'wait',cmp:'gte',value:1},mode:'edge',signal:'ready'}});
 w.tick();expect(w.getComponent<any>('event','Signal')?.name).toBe('ready');
 expect(w.getSortedSystems().map(s=>s.id)).toEqual(['timer-advance','event-when']);
});

