import type {World} from '@engine/core/world.js';
import {placeholderPlayback,samplePlayback} from './s2-clip-player.js';
export const sampleBindings=[
 {entity:'unit#0:melee',host:'unit#0:body',unit:'vindicator',data:placeholderPlayback('axe')},
 {entity:'unit#1:melee',host:'unit#1:body',unit:'zombie',data:placeholderPlayback('sweep')},
 {entity:'flyer',host:'flyer',unit:'vex',data:placeholderPlayback('dive')},
];
// Presentation-only state: per-instance phase clock and facing commitment.
export class BoundPlayback {
 private state=new Map<string,{phase:string;start:number;facing:1|-1;locked?:string}>();
 reset(){this.state.clear();}
 sample(w:World,tick:number){
  return sampleBindings.flatMap(binding=>{
   const t=w.getComponent<any>(binding.host,'Transform'),flow=w.getComponent<any>(binding.entity,'GameFlow');
   if(!t||!flow){this.state.delete(binding.entity);return [];}
   const controlled=((w.getComponent<any>(binding.host,'Status')?.flags??0)&32)!==0;
   const phase=controlled?(binding.unit==='vex'?'Rise':'Recovery'):flow.current;
   if(!binding.data.clips[phase])return [];
   let state=this.state.get(binding.entity);if(!state){state={phase,start:tick,facing:1};this.state.set(binding.entity,state);}
   if(state.phase!==phase){state.phase=phase;state.start=tick;}
   const locked=flow.targetSnapshot?.targetId;
   if(locked&&!state.locked){const target=w.getComponent<any>(locked,'FrameStartTransform');const origin=w.getComponent<any>(binding.host,'FrameStartTransform')??t;if(target)state.facing=target.x<origin.x?-1:1;}
   state.locked=locked;
   return [{unit:binding.unit,phase,facing:state.facing,...samplePlayback(binding.data,phase,tick-state.start,t,state.facing)}];
  });
 }
}
