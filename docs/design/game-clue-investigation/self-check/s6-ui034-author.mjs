// Offline authoring transform only; never imported by the game runtime.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const path='library/game-clue-investigation/manifest.json';
const bytes=readFileSync(path), hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(bytes),'1585fc239e45e1c4e703a501f0c074932e38f70862d800aeaf156a30c3b84eea');
const m=JSON.parse(bytes), before=structuredClone(m), nodes=[];
const walk=n=>{nodes.push(n);n.children?.forEach(walk);};walk(m.presentation.ui);
const find=id=>{const n=nodes.find(n=>n.id===id);assert.ok(n,id);return n;};
m.presentation.font='system-yahei';
for(const target of m.presentation.focusTargets) Object.assign(target,{labelPlacement:'above',labelGap:8,labelSize:14,tone:['object-lock','object-prints','object-letter'].includes(target.entity)?'gold':'cyan'});
m.presentation.pointerFeedback.visual={colors:{cyan:'#7EE9EC',gold:'#F3BF67',jade:'#7BB996'},hoverAlpha:.24,pressedAlpha:.24,hoverGlowBlur:9,pressedGlowBlur:9,pressedBrightness:1.45};
for(const n of nodes){
  if(n.type==='Button'){
    const evidence=/^(lock|prints|letter)-(collect|return)$/.test(n.id);
    n.props.borderWidth=evidence?2:1;
    n.props.focusRingVisual={color:{custom:evidence?'#139CA4':'#7EE9EC'},width:evidence?3:2,offset:evidence?3:2};
  }
  if(n.type==='Label'&&/^ledger-/.test(n.id)){n.props.lineHeight=23.8;n.layout.height=21;}
  if(n.type==='Label'&&/^(evidence|collection)-(lock|prints|letter)-text$/.test(n.id))n.props.lineHeight=30.4;
}
for(const prefix of ['evidence','collection']){
  const slot=find(`${prefix}-image-slot`);slot.props.border={width:7,color:{custom:'#7A6345'}};delete slot.props.edge;slot.layout.padding=0;
  for(const id of ['lock','prints','letter'])Object.assign(find(`${prefix}-${id}-image`).layout,{x:0,y:0});
}
find('clue-reveal-modal').props.visual.enter='lift-240';
find('investigation-completed-modal').props.visual.enter='lift-600';
find('investigation-completed-modal').props.visual.outerRing={width:12,color:'#D2A54C22'};
// Collected swaps an already-open evidence dialog: no second whole-dialog lift.
for(const id of ['evidence-structure','completed-content']){delete find(id).layout.transformFrom;delete find(id).layout.transformMotionMs;}
const stamp=find('collection-stamp');
Object.assign(stamp,{type:'Panel',props:{bare:true},layout:{x:620,y:-1,width:102,height:56,opacity:.86,allowOverlap:true},children:[{type:'Panel',id:'collection-stamp-fade',props:{bare:true},layout:{width:102,height:56,anim:'fadeIn',animMs:380,allowOverlap:true},children:[{type:'Panel',id:'collection-stamp-frame',props:{bg:'transparent',border:{width:5,color:{custom:'#AB3D32'}}},layout:{width:102,height:56,padding:0,radius:0,rotate:12,transformFrom:{scale:1.8,rotate:12},transformMotionMs:380,allowOverlap:true},children:[{type:'Label',id:'collection-stamp-text',props:{text:'已收录',size:22,weight:900,lineHeight:30,font:'ui',color:{custom:'#A9372D'}},layout:{x:13,y:8,width:66,height:30,allowOverlap:true}}]}]}]});
// Font measurement: 22px YaHei normal line box is 29px; 26px border/padding yields 55px.
stamp.layout.height=55;stamp.children[0].layout.height=55;
stamp.children[0].children[0].layout.height=55;
stamp.children[0].children[0].children[0].props.lineHeight=29;
stamp.children[0].children[0].children[0].layout.height=29;
const assets=JSON.parse(readFileSync('library/game-clue-investigation/art/index.json')).assets;
for(const t of m.presentation.focusTargets){const e=m.entities[t.entity],mask=assets.find(a=>a.id===e.Clickable.hitMaskKey).spec;t.labelGap=8+(e.Sprite.height-mask.height*Math.min(e.Sprite.width/mask.width,e.Sprite.height/mask.height))/2;assert.ok(t.labelGap<=64);}
const strip=x=>{const v=structuredClone(x);for(const k of ['ui','font','focusTargets','pointerFeedback'])delete v.presentation[k];return v;};
assert.deepEqual(strip(m),strip(before),'non-presentation contracts must not change');
assert.deepEqual(m.entities,before.entities,'World/scene/masks/rules frozen');
assert.equal(hash(readFileSync(path)),hash(bytes),'concurrent manifest drift');
writeFileSync('docs/design/game-clue-investigation/self-check/S6-ui034-before.json',bytes);
writeFileSync(path,JSON.stringify(m,null,2)+'\n');
console.log(JSON.stringify({before:hash(bytes),after:hash(readFileSync(path)),nonPresentationEqual:true}));
