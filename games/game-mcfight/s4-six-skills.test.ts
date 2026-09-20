import { expect, it } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { QueuedInputSource } from '@net/queued-input.js';
import type { Component } from '@engine/core/types.js';
import type { Resource, State, GameFlow, Timer, Transform, PrefabOrigin } from '@engine/protocol/components.js';
import { assembleS4World, spawnS4Unit, s4TeamMask } from './s4-world.js';
import { S4_BALANCE_V1, type S4UnitId, type S4SkillId } from './content/s4-balance.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';

const xf = (x=0,y=0) => ({x,y,rotation:0,scaleX:1,scaleY:1});
function scene(unit: S4UnitId, x=0,y=0,id='source') {
  const engine=new Engine({tickRate:20,input:new QueuedInputSource('s4-skills')});
  assembleS4World(engine);
  const body=spawnS4Unit(engine.world,unit,id,1,x,y);
  engine.world.getComponent<State>('session','State')!.current='battle';
  return {engine,w:engine.world,body};
}
type Scene=ReturnType<typeof scene>;
function add(s:Scene,id:string,data:Record<string,object>){s.w.createEntity(id);for(const[type,value]of Object.entries(data))s.w.addComponent(id,{type,...value}as Component);}
function target(s:Scene,id:string,x:number,y=0,status=8,team:1|2=2){add(s,id,{Transform:xf(x,y),Shape:{kind:'circle',radius:.7},Tag:{flags:s4TeamMask(team)},Status:{flags:status},Resource:{id:'hp',current:1000,min:0,max:1000},Mortal:{resource:'hp',atOrBelow:0}});}
const hp=(s:Scene,id:string)=>s.w.getComponent<Resource>(id,'Resource')?.current??0;
function advance(s:Scene,n:number){for(let i=0;i<n;i++)s.w.tick();}
const cases: Array<{unit:S4UnitId;skill:S4SkillId;x?:number;y?:number;amount:number}>=[
  {unit:'vindicator',skill:'slash',x:1,amount:12},{unit:'skeleton',skill:'arrow',x:6,amount:9},
  {unit:'vex',skill:'dive',x:2.4,amount:14},{unit:'elephant',skill:'charge',x:6,amount:22},
  {unit:'elephant',skill:'strike',x:1,amount:10},{unit:'earthshaker',skill:'quake',x:1,amount:20},
  {unit:'earthshaker',skill:'beam',x:4,y:4,amount:18},{unit:'witch',skill:'potion',x:6,amount:12},
  {unit:'witch',skill:'heal',amount:-15},
];
function setup(c:typeof cases[number]){
  const s=scene(c.unit);
  if(c.x!==undefined)target(s,'target',c.x,c.y??0);
  if(c.skill==='quake')s.w.getComponent<Timer>('source#0:beam','Timer')!.elapsed=0;
  if(c.skill==='heal')s.w.getComponent<Resource>(s.body,'Resource')!.current=20;
  return s;
}
it.each(cases)('S4 $unit / $skill releases through production and changes actual HP',c=>{
  const s=setup(c),victim=c.skill==='heal'?s.body:'target',initial=hp(s,victim);
  const trace:Array<{tick:number;phase:string|undefined;hp:number;x:number|undefined;y:number|undefined}>=[];
  let released=false;
  for(let tick=1;tick<=90;tick++){
    s.w.tick();const flow=s.w.getComponent<GameFlow>(`source#0:${c.skill}`,'GameFlow');
    released ||= flow?.current==='Active';
    trace.push({tick,phase:flow?.current,hp:hp(s,victim),x:s.w.getComponent<Transform>(s.body,'Transform')?.x,y:s.w.getComponent<Transform>(s.body,'Transform')?.y});
    if(hp(s,victim)!==initial)break;
  }
  console.log('S4_NINE_SKILLS',c.skill,JSON.stringify(trace));
  expect(released).toBe(true);expect(hp(s,victim)).toBe(initial-c.amount);
  if(c.skill==='charge')expect(trace.some((r,i)=>i>0&&Math.abs((r.x!-trace[i-1]!.x!)-.35)<1e-10)).toBe(true);
});

it.each([3.999,4,4.001])('S4 charge closed start boundary at %s keeps failed CD',distance=>{
  const s=scene('elephant');target(s,'target',distance);s.w.tick();
  const phase=s.w.getComponent<GameFlow>('source#0:charge','GameFlow')!.current;
  const cd=s.w.getComponent<Timer>('source#0:charge','Timer')!.elapsed;
  expect(phase).toBe(distance<4?'Ready':'Windup');expect(cd).toBe(distance<4?100:0);
  console.log('S4_CHARGE_BOUNDARY',JSON.stringify({distance,phase,cd}));
});
it('S4 charge rejects airborne target without taking CD',()=>{
  const s=scene('elephant');target(s,'target',6,0,4);advance(s,3);
  expect(s.w.getComponent<GameFlow>('source#0:charge','GameFlow')!.current).toBe('Ready');
  expect(s.w.getComponent<Timer>('source#0:charge','Timer')!.elapsed).toBe(100);expect(hp(s,'target')).toBe(1000);
});

it('S4 diagonal beam deals 18 to both on-axis targets, not side target or ally',()=>{
  const s=scene('earthshaker');target(s,'first',3,3);target(s,'second',5,5);target(s,'side',3,5);target(s,'friend',4,4,8,1);
  advance(s,20);
  expect(['first','second','side','friend'].map(id=>hp(s,id))).toEqual([982,982,1000,1000]);
  expect(s.w.query('Hitbox')).toHaveLength(0);
  console.log('S4_DIAGONAL_BEAM',JSON.stringify({hp:['first','second','side','friend'].map(id=>hp(s,id))}));
});

it.each([2.999,3,3.001])('S4 healing safe-circle boundary %s and priority are actual local decisions',distance=>{
  const s=scene('witch');s.w.getComponent<Resource>(s.body,'Resource')!.current=20;target(s,'target',distance);
  s.w.tick();
  expect(s.w.getComponent<GameFlow>('source#0:heal','GameFlow')!.current).toBe(distance<=3?'Ready':'Windup');
  expect(s.w.getComponent<GameFlow>('source#0:potion','GameFlow')!.current).toBe(distance<=3?'Windup':'Ready');
});
it('S4 two witches with identical hp resource IDs heal independently and empty neighborhood is safe',()=>{
  const s=scene('witch',0,0,'alpha'),beta=spawnS4Unit(s.w,'witch','beta',1,0,20);
  s.w.getComponent<Resource>(s.body,'Resource')!.current=20;
  s.w.getComponent<Resource>(beta,'Resource')!.current=50;
  advance(s,10);
  expect(hp(s,s.body)).toBe(35);expect(hp(s,beta)).toBe(50);
  expect(s.w.getComponent<Timer>('alpha#0:heal','Timer')!.elapsed).toBe(9);
  expect(s.w.getComponent<Timer>('beta#0:heal','Timer')!.elapsed).toBe(120);
});
it.each([38.5,38.501])('S4 heal HP threshold is inclusive at 70 percent: %s',health=>{
  const s=scene('witch');s.w.getComponent<Resource>(s.body,'Resource')!.current=health;s.w.tick();
  expect(s.w.getComponent<GameFlow>('source#0:heal','GameFlow')!.current).toBe(health<=38.5?'Windup':'Ready');
});

for(const kind of ['control','death']as const)it.each(cases)(`S4 ${kind} from incoming production contact before $skill release cancels without refund`,c=>{
  const s=setup(c),initial=hp(s,c.skill==='heal'?s.body:'target');
  // Incoming collider reaches stationary/slowly descending source at Tick 3-4,
  // before any configured S4 release; all contact results remain production-owned.
  add(s,'incoming',{Transform:xf(-4),Velocity:{vx:1,vy:0},Shape:{kind:'circle',radius:.2},Tag:{flags:ZONE_FLAG},
    Hitbox:{resource:'hp',amount:kind==='death'?1000:0,targetMask:s4TeamMask(1),consumeOnHit:true,...(kind==='control'?{setMask:16}:{})}});
  const trace=[];
  for(let tick=1;tick<=36;tick++){
    s.w.tick();trace.push({tick,phase:s.w.getComponent<GameFlow>(`source#0:${c.skill}`,'GameFlow')?.current,
      effects:s.w.query('PrefabOrigin').filter(([id])=>s.w.getComponent<PrefabOrigin>(id,'PrefabOrigin')?.templateId===`s4-1-${c.skill}`).length});
  }
  console.log('S4_RELEASE_CANCEL',c.skill,kind,JSON.stringify(trace));
  expect(trace.every(r=>r.effects===0)).toBe(true);
  if(kind==='control')expect(s.w.getComponent<Timer>(`source#0:${c.skill}`,'Timer')!.elapsed).toBeGreaterThan(0);
  else expect(s.w.hasComponent(s.body,'Resource')).toBe(false);
  if(c.skill!=='heal')expect(hp(s,'target')).toBe(initial);
  else if(kind==='control')expect(hp(s,s.body)).toBe(initial);
});

for(const kind of ['control','death']as const)it.each(cases)(`S4 SAME RELEASE TICK ${kind} intercepts $skill, with a successful no-control reference`,c=>{
  const reference=setup(c);let releaseTick=0,sourceAtRelease:Transform|undefined;
  for(let tick=1;tick<=90;tick++){
    reference.w.tick();
    if(reference.w.query('PrefabOrigin').some(([id])=>reference.w.getComponent<PrefabOrigin>(id,'PrefabOrigin')?.templateId===`s4-1-${c.skill}`)){
      releaseTick=tick;sourceAtRelease={...reference.w.getComponent<Transform>(reference.body,'Transform')!};break;
    }
  }
  expect(releaseTick).toBeGreaterThan(0); // reference really released; not a disabled fixture
  const s=setup(c),radius=S4_BALANCE_V1.units[c.unit].radius;
  // Plan a physical collider's initial position from the reference timing.
  // No phase, target, HP or contact is modified after this initial arrangement.
  add(s,'incoming',{Transform:xf(sourceAtRelease!.x-(radius+.2)/2-releaseTick,sourceAtRelease!.y),Velocity:{vx:1,vy:0},Shape:{kind:'circle',radius:.2},Tag:{flags:ZONE_FLAG},
    Hitbox:{resource:'hp',amount:kind==='death'?1000:0,targetMask:s4TeamMask(1),consumeOnHit:true,...(kind==='control'?{setMask:16}:{})}});
  let firstContact=0;const trace=[];
  for(let tick=1;tick<=releaseTick+20;tick++){
    s.w.tick();
    if(!firstContact&&!s.w.hasComponent('incoming','Hitbox'))firstContact=tick;
    trace.push({tick,phase:s.w.getComponent<GameFlow>(`source#0:${c.skill}`,'GameFlow')?.current,
      sourceHP:hp(s,s.body),targetHP:c.skill==='heal'?undefined:hp(s,'target'),
      effects:s.w.query('PrefabOrigin').filter(([id])=>s.w.getComponent<PrefabOrigin>(id,'PrefabOrigin')?.templateId===`s4-1-${c.skill}`).length,
      cd:s.w.getComponent<Timer>(`source#0:${c.skill}`,'Timer')?.elapsed});
  }
  console.log('S4_SAME_RELEASE',JSON.stringify({skill:c.skill,kind,releaseTick,firstContact,trace}));
  expect(firstContact).toBe(releaseTick);
  expect(trace.every(r=>r.effects===0)).toBe(true);
  if(c.skill!=='heal')expect(hp(s,'target')).toBe(1000);
  if(kind==='control') {
    expect(trace[releaseTick-1]!.phase).toBe('Active');
    expect(trace[releaseTick-1]!.cd).toBe(releaseTick-1);
    if(c.skill==='heal')expect(hp(s,s.body)).toBe(20);
  } else expect(s.w.hasComponent(s.body,'Resource')).toBe(false);
});
