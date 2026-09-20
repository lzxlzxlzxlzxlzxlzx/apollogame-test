import {it,expect} from 'vitest';
import {samplePlayback,placeholderPlayback} from './s2-clip-player.js';
it('variable frame duration, looping and clamping are selected without combat writes',()=>{
 const d=placeholderPlayback('axe');d.clips.Windup.frames=[{source:null,ticks:2},{source:null,ticks:3}];
 expect([0,1,2,4,5,20].map(t=>samplePlayback(d,'Windup',t,{x:0,y:0},1).index)).toEqual([0,0,1,1,1,1]);
 expect(samplePlayback(d,'Ready',2,{x:0,y:0},1).index).toBe(0);
});
it('mirrored moving attachment uses the same root and uniform scale within one source pixel',()=>{
 const d=placeholderPlayback('axe');
 for(const scale of [.8,1,1.2])for(const x of [0,10,25]){
  const right=samplePlayback(d,'Active',0,{x,y:4},1,scale),left=samplePlayback(d,'Active',0,{x,y:4},-1,scale);
  expect(right.anchors.root).toEqual({x,y:4});expect(left.anchors.root).toEqual({x,y:4});
  expect(Math.abs((right.anchors.grip.x-x)/scale-16)).toBeLessThan(1);expect(left.anchors.grip.x-x).toBeCloseTo(-(right.anchors.grip.x-x),10);
 }
});
it('independent axe/sweep/dive manifests retain missing-art status and rate limits',()=>{
 const axe=placeholderPlayback('axe'),sweep=placeholderPlayback('sweep'),dive=placeholderPlayback('dive');
 axe.clips.Active.frames[0].source='test-only.png';expect(sweep.clips.Active.frames[0].source).toBeNull();
 expect(samplePlayback(dive,'Dive',0,{x:0,y:0},1).missing).toBe(true);
 expect(()=>samplePlayback(axe,'Active',0,{x:0,y:0},1,1,2)).toThrow();
 expect(()=>samplePlayback(axe,'Active',0,{x:0,y:0},1,1.3)).toThrow();
});

