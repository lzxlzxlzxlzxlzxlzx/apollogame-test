// Authoring-only JSON transform. Never replaces the formal manifest.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const path='library/game-clue-investigation/manifest.json';
const input=readFileSync(path), hash=createHash('sha256').update(input).digest('hex');
assert.equal(hash,'8a7306cb7439875b1a79b320aa66c7303b01534075a77caa0856bb19449f1a9d','formal drift: stop candidate transform');
const manifest=JSON.parse(input), before=structuredClone(manifest);
const find=(id,node=manifest.presentation.ui)=>node.id===id?node:(node.children||[]).map(c=>find(id,c)).find(Boolean);
const label=(id,text,x,y,width,size,color='#352617',bold=false)=>({type:'Label',id,props:{text,size,color:{custom:color},bold,font:'ui'},layout:{x,y,width}});
const texts={lock:'锁扣内侧有新鲜撬痕。有人从室内先松开了它。',prints:'鞋底纹沾着窗边的泥水，方向直指书桌。',letter:'残留的日期与一枚陌生署名，没有改变必要证物的数量。'};
for(const [modalId,collected] of [['clue-reveal-modal',false],['clue-collected-modal',true]]) {
  const modal=find(modalId), prefix=collected?'collection':'evidence';
  const titles=['lock','prints','letter'].map(id=>structuredClone(find(`${prefix}-${id}-title`)));
  const images=['lock','prints','letter'].map(id=>structuredClone(find(`${prefix}-${id}-image`)));
  const buttons=!collected?['lock','prints','letter'].map(id=>structuredClone(find(`${id}-collect-controls`))):[];
  modal.props={closable:false,...(!collected?{closeAction:'investigation.close'}:{}),scrim:{blur:3},visual:{width:820,minHeight:560,padding:{top:26,right:40,bottom:26,left:40},radius:0,fill:{gradient:{from:'#E7DDC2',to:'#BBA875'}},border:{width:12,color:'#5D452E'}}};
  const eyebrow=label(`${prefix}-eyebrow`,'EVIDENCE / 现场证物',0,0,716,13,'#123E43');eyebrow.props.tracking=2.08;
  for(const title of titles){title.props.size=34;title.props.font='ui';title.props.color={custom:'#352617'};title.layout={x:0,y:25,width:716,height:45};}
  for(const image of images){image.props.fit='cover';image.props.position='top';image.layout={x:6,y:6,width:702,height:260};}
  // Panel border remains legacy 1px pending UI-03; 6px padding gives target image origin/size.
  const slot={type:'Panel',id:`${prefix}-image-slot`,props:{bg:{custom:'radial-gradient(ellipse,#52696a,#19262a)'},edge:'gold'},layout:{x:0,y:88,width:716,height:274,padding:6,radius:0},children:images};
  const descriptions=['lock','prints','letter'].map(id=>({...label(`${prefix}-${id}-text`,texts[id],0,381,585,19,'#1B211D'),visibleWhen:`selected.${id}`}));
  for(const group of buttons){group.layout={x:608,y:430.39,width:108,height:47};for(const b of group.children||[])if(b.type==='Button'){b.props.label='收录线索';b.props.labelSize=16;b.props.labelWeight=700;b.layout={width:108,height:47,radius:0};}else{group.children=group.children.filter(c=>c.type==='Button');}}
  // Revisit uses the same native action, with the same single lower-right button.
  if(!collected) for(const id of ['lock','prints','letter']){
    const old=find(`${id}-already-collected`); // retained only to recover its existing flag condition
    if(old) buttons.find(g=>g.id===`${id}-collect-controls`).children.push({type:'Button',id:`${id}-return`,visibleWhen:old.visibleWhen,props:{...structuredClone(find(`${id}-collect`).props),label:'回到现场',action:'investigation.close',labelSize:16,labelWeight:700},layout:{width:108,height:47,radius:0}});
  }
  const children=[eyebrow,...titles,slot,...descriptions,...buttons];
  if(collected) children.push({type:'Label',id:'collection-stamp',props:{text:'已收录',size:22,bold:true,color:{custom:'#A9372D'},font:'ui'},layout:{x:628,y:0,width:96,height:56,rotate:12,opacity:.86,transformFrom:{scale:1.8,rotate:12},transformMotionMs:380,allowOverlap:true}});
  modal.children=[{type:'Panel',id:collected?'collection-content':'evidence-structure',props:{bare:true},layout:{width:716,height:484,padding:0},children}];
}
// Existing closed-data fields also cover the remaining HUD/control geometry.
const place=(id,layout)=>{find(id).layout=layout;};
const textStyle=(id,size,color,bold=false)=>{Object.assign(find(id).props,{size,font:'ui',bold,...(color?{color:{custom:color}}:{})});};
const buttonStyle=(id,x,y,width,height,labelText)=>{const b=find(id);b.layout={x,y,width,height,radius:5};Object.assign(b.props,{kind:'ghost',skin:'',labelSize:16,labelWeight:400,...(labelText?{label:labelText}:{}),stateColors:structuredClone(find('flavor-continue').props.stateColors)});};
for(const id of ['case-heading','case-progress','case-utility']) find(id).props.bg={custom:'linear-gradient(135deg,#0a1720ec,#16212add)'};
find('clue-ledger').props.bg={custom:'#0E1720DC'};
find('flavor-archive').props.bg={custom:'linear-gradient(#11212ae8,#091219fa)'};
place('case-heading',{x:42,y:36,width:392,height:124,padding:0,radius:8});
place('case-eyebrow',{x:26,y:17,width:342,height:17});textStyle('case-eyebrow',13,'#7EE9EC');find('case-eyebrow').props.tracking=2.08;
place('case-title',{x:26,y:38,width:342,height:40});textStyle('case-title',30,'#F4EEDF',true);find('case-title').props.tracking=2.4;
place('case-goal',{x:26,y:84,width:342,height:21});textStyle('case-goal',16,'#D0D8D3');
place('case-progress',{x:1193,y:36,width:205,height:97,padding:0,radius:8});
find('case-progress').children=find('case-progress').children.filter(n=>n.id!=='progress-bar');
place('progress-title',{x:56.7,y:18,width:100,height:17});textStyle('progress-title',13.3333,'#B5C2C4');find('progress-title').props.tracking=1.6;
place('progress-count-row',{x:22,y:38,width:159,height:42,direction:'row',align:'center',justify:'center',gap:4});
textStyle('progress-count',32,'#F3BF67',true);textStyle('progress-total',32,'#F3BF67',true);
place('clue-ledger',{x:42,y:725.61,width:300,height:132.39,padding:0,radius:8});
buttonStyle('ledger-title',18,14,132,21,'▾ 线索清单');find('ledger-title').props.labelWeight=700;
for(const [i,id] of ['lock','prints','letter'].entries()) for(const status of ['pending','found']){const n=find(`ledger-${id}-${status}`);n.layout={x:38,y:45+i*23.8,width:240,height:21};Object.assign(n.props,{size:14,font:'ui',color:{custom:status==='found'?'#EED09A':'#BECBC9'}});}
place('case-utility',{x:1184,y:795,width:214,height:63,padding:0,radius:8});buttonStyle('view-records',10,10,92,41);buttonStyle('exit-investigation',110,10,92,41);
place('flavor-archive',{x:0,y:722,width:1440,height:178,padding:0,radius:0,transformMotionMs:220,transformFrom:{y:900}});
const flavorTexts={shelf:'书脊被潮气卷起；最下层留有刚被抽走一册的空隙。',clock:'钟摆停在 23:17。玻璃表面蒙着一层薄雾。',cup:'杯沿仍留着一圈未干的水痕，茶已经完全冷了。',rug:'地毯边缘被匆忙掀起过，下面没有藏着第二个出口。'};
for(const id of Object.keys(flavorTexts)){place(`flavor-${id}-title`,{x:69,y:21,width:1300,height:24});textStyle(`flavor-${id}-title`,18,'#EED09A',true);find(`flavor-${id}-title`).props.tracking=2.16;place(`flavor-${id}`,{x:69,y:54,width:1300,height:25});textStyle(`flavor-${id}`,19,'#F4EEDF');find(`flavor-${id}`).props.text=flavorTexts[id];}
buttonStyle('flavor-continue',1283,110,92,41);
const completed=find('investigation-completed-modal');
completed.props={closable:false,scrim:{blur:3},visual:{width:690,minHeight:429,padding:52,radius:0,fill:{gradient:{from:'#102A30',to:'#112018'}},border:{width:1,color:'#D5B66D'}}};
const completedButton=structuredClone(find('completed-restart'));completedButton.layout={x:230,y:282,width:124,height:41,radius:5};completedButton.props.labelSize=16;completedButton.props.labelWeight=400;
const centerLabel=(id,text,y,width,size,color,bold=false)=>({type:'Panel',id:`${id}-align`,props:{bare:true},layout:{x:0,y,width,height:size*1.4,direction:'column',align:'center',justify:'center'},children:[label(id,text,undefined,undefined,undefined,size,color,bold)]});
const completeEyebrow=centerLabel('completed-eyebrow','INVESTIGATION COMPLETE',104,584,13,'#7EE9EC');completeEyebrow.children[0].props.tracking=2.08;
completed.children=[{type:'Panel',id:'completed-content',props:{bare:true},layout:{width:584,height:323,padding:0},children:[centerLabel('completed-seal','✦',0,584,78,'#ECC368'),completeEyebrow,centerLabel('completed-message','现场调查完成',127,584,42,'#F4EEDF',true),centerLabel('completed-progress','两项必要证物已归档。正式宿主将处理其后的知识与剧情。',201,584,19,'#D6E0D5'),completedButton]}];
find('completed-seal-align').layout.height=104;
find('completed-eyebrow-align').layout.height=17;
const exit=find('exit-confirm-modal'),stay=structuredClone(find('exit-stay')),cancel=structuredClone(find('exit-confirm'));
for(const [b,x,w,txt]of [[stay,110,92,'返回现场'],[cancel,216,124,'确认取消调查']]){b.layout={x,y:110.9,width:w,height:41,radius:5};Object.assign(b.props,{label:txt,labelSize:16,labelWeight:400,skin:'',stateColors:structuredClone(find('flavor-continue').props.stateColors)});}
exit.props={closable:false,closeAction:'investigation.stay',scrim:{blur:3},visual:{width:520,minHeight:221.9,padding:34,radius:0,fill:{color:'#152027'},border:{width:1,color:'#C29E68'}}};
exit.children=[{type:'Panel',id:'exit-confirm-content',props:{bare:true},layout:{width:450,height:151.9,padding:0},children:[centerLabel('exit-eyebrow','CANCELLED / 取消语义',0,450,13,'#7EE9EC'),centerLabel('exit-heading','暂时离开现场？',17,450,24,'#F4EEDF',true),centerLabel('exit-confirm-message','退出会取消本次调查，不会被呈现为调查失败。',67.9,450,16,'#F4EEDF'),stay,cancel]}];
find('exit-eyebrow-align').layout.height=17;
const cancelled=find('investigation-cancelled-modal'),restart=structuredClone(find('cancelled-restart'));
restart.layout={x:1251,y:110,width:124,height:41,radius:5};restart.props.labelSize=16;restart.props.labelWeight=400;
cancelled.type='Panel';cancelled.props={bg:{custom:'linear-gradient(#11212af0,#091219fa)'},edge:'gold'};cancelled.layout={x:0,y:722,width:1440,height:178,padding:0,radius:0,allowOverlap:true};cancelled.children=[label('cancelled-heading','调查已取消',69,21,1300,18,'#EED09A',true),label('cancelled-message','取消不是失败：本次调查未提交完成结果。',69,54,1300,19,'#F4EEDF'),restart];
// The cancelled archive intentionally overlays the still-visible scene ledger, like the prototype archive.
for(const child of cancelled.children) child.layout.allowOverlap=true;
// Scope fence: all engine/world/asset data and presentation contracts except UI are byte-equivalent JSON.
const withoutUI=m=>({...m,presentation:{...m.presentation,ui:null}});
assert.deepEqual(withoutUI(manifest),withoutUI(before));
assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash);
const output='docs/design/game-clue-investigation/self-check/S6-ui02.candidate.json';
writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({ok:true,sourceSha256:hash,candidateSha256:createHash('sha256').update(readFileSync(output)).digest('hex'),output,formalUnchanged:true}));
