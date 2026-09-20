import { anchorOffset, type Point } from './s2-action-bindings.js';
export interface ClipFrame { source:string|null; ticks:number; }
export interface PlaybackData { canvas:{width:number;height:number}; root:Point; anchors:Record<string,Point>; clips:Record<string,{frames:ClipFrame[];loop:boolean}>; }
// Read-only, deterministic frame selection. The caller supplies the simulation
// phase and elapsed ticks. There are deliberately no combat callbacks.
export function samplePlayback(data:PlaybackData,clip:string,elapsedTicks:number,position:Point,facing:1|-1,scale=1,speed=1){
 if(speed<.75||speed>1.5)throw new RangeError('动作速度超出适配范围');
 const spec=data.clips[clip];if(!spec||spec.frames.length===0)throw new Error('缺少动作片段 '+clip);
 if(spec.frames.some(f=>!Number.isFinite(f.ticks)||f.ticks<=0))throw new Error('非法帧时长');
 const total=spec.frames.reduce((n,f)=>n+f.ticks,0),t=Math.max(0,elapsedTicks)*speed;
 let remaining=spec.loop?t%total:Math.min(t,total-Number.EPSILON*total),index=0;
 while(index<spec.frames.length-1&&remaining>=spec.frames[index].ticks){remaining-=spec.frames[index].ticks;index++;}
 const anchors=Object.fromEntries(Object.entries(data.anchors).map(([name,p])=>{const d=anchorOffset(p,data.root,scale,facing);return [name,{x:position.x+d.x,y:position.y+d.y}];}));
 return {index,source:spec.frames[index].source,missing:spec.frames[index].source===null,anchors};
}
export function placeholderPlayback(kind:'axe'|'sweep'|'dive'):PlaybackData{
 const names=kind==='dive'?['Ready','Dive','Rise']:['Ready','Windup','Active','Recovery'];
 return {canvas:{width:128,height:128},root:kind==='dive'?{x:64,y:64}:{x:64,y:120},anchors:{contact:{x:64,y:88},root:kind==='dive'?{x:64,y:64}:{x:64,y:120},body:{x:64,y:70},grip:{x:80,y:64},effectOrigin:{x:104,y:64}},clips:Object.fromEntries(names.map(name=>[name,{frames:[{source:null,ticks:1},{source:null,ticks:1}],loop:name==='Ready'}]))};
}

