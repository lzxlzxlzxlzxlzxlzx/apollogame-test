// This adapter is substituted ONLY by the isolated dev server. Production files stay untouched.
export * from '../../../src/ui/components/index';
import {mountUI as originalMount, validateLayoutNode, type LayoutNode, type MountHandle} from '../../../src/ui/components/index';
import config from './theme-round-03.json';
const params=new URLSearchParams(location.search);
let scheme=params.get('layout')||'C', palette=params.get('theme')||'plum',expanded=false;
const cfg:any=config;
function environment(hasCard=true){
 const w=innerWidth,h=innerHeight;
 const mode=h>w?'portrait':w>=cfg.responsive.desktopMinWidth?'desktop':'landscape';
 const r=cfg.responsive[mode];
 const reserve=hasCard&&mode!=='portrait'&&(scheme==='B'||scheme==='C'&&expanded&&mode==='landscape')?r[scheme].height+r.statusHeight+2*r.margin+8:0;
 const playHeight=h-reserve;
 document.getElementById('game')!.style.height=`${playHeight}px`;
 const k=Math.min(w/1280,playHeight/720);
 return {w,h,k,sx:(w-1280*k)/2,sy:(playHeight-720*k)/2,mode,r,playHeight,reserve};
}
export function mountUI(host:any,root:any,handlers:any,theme:any,sink:any):MountHandle{
 let current=root;
 let redraw=()=>{};
 const render=(tree:any)=>{
  const out=structuredClone(tree);const hasCard=out.children?.some((n:any)=>n.id==='g105-interaction-card');if(!hasCard)expanded=false;
  const env=environment(hasCard),{w,h,k,sx,sy,mode,r}=env;
  const card=out.children?.find((n:any)=>n.id==='g105-interaction-card');
  const t=cfg.themes[palette];const p=r[scheme].padding??cfg.controls.padding;
  document.body.style.background=cfg.pageBackground;
  const style=document.getElementById('experiment-style')!;
  const rules=r[scheme];const width=Math.min(scheme==='C'&&!expanded?(rules.collapsedWidth??rules.width):rules.width,w-r.margin*2);
  const compact=scheme==='C'&&!expanded;
  const height=compact?rules.collapsedHeight:rules.height;
  const x=scheme==='A'||scheme==='C'&&mode!=='portrait'?r.margin:(w-width)/2;
  const y=h-r.margin-r.statusHeight-8-height;
  const lx=(x-sx)/k-20,ly=(y-sy)/k-18;
  const statusWidth=Math.min(w-r.margin*2,600),statusX=(w-statusWidth)/2;
  const statusY=h-r.margin-r.statusHeight;
  const colorRules=`#g105-interaction-card #g105-card-title{color:${t.title}!important;font-size:${cfg.typography.title}px!important}#g105-interaction-card #g105-card-text{color:${t.body}!important;font-size:${cfg.typography.body}px!important}#g105-interaction-card #g105-card-kicker,#g105-interaction-card #g105-card-safety{color:${t.aux}!important;font-size:${cfg.typography.aux}px!important}`;
  style.textContent=`
  #g105-interaction-card{position:absolute!important;left:${lx}px!important;top:${ly}px!important;width:${width}px!important;height:${height}px!important;transform:scale(${1/k})!important;transform-origin:0 0!important;box-sizing:border-box!important;padding:${p}px!important;gap:${cfg.controls.gap}px!important;animation:none!important;box-shadow:${t.shadow}!important;border:0 solid transparent!important;border-image-source:url('${cfg.asset.path}')!important;border-image-slice:${cfg.asset.slice} fill!important;border-image-width:${cfg.asset.renderBorderWidth}px!important;border-image-repeat:stretch!important;background:none!important;overflow:visible!important;}
  #g105-interaction-card *{box-sizing:border-box!important;text-shadow:none!important;animation:none!important;line-height:${cfg.typography.lineHeight}!important;min-width:0;}
  #g105-interaction-card input{width:100%!important;height:${cfg.controls.height}px!important;min-height:${cfg.controls.height}px!important;font-size:${cfg.typography.input}px!important;padding:6px 8px!important;border:1px solid ${t.inputBorder}!important;background:${t.inputBg}!important;color:${t.body}!important;}
  #g105-interaction-card input::placeholder{color:${t.placeholder}!important;opacity:1;}
  #g105-interaction-card select{height:${cfg.controls.height}px!important;min-width:84px!important;font-size:${cfg.typography.button}px!important;color:${t.secondaryText}!important;background:${t.secondaryBg}!important;border:1px solid ${t.inputBorder}!important;padding:4px!important;}
  #g105-interaction-card input:focus-visible,#g105-interaction-card button:focus-visible{outline:3px solid ${t.focus}!important;outline-offset:2px!important;}
  #g105-interaction-card button[data-action]{height:${cfg.controls.height}px!important;min-height:${cfg.controls.height}px!important;min-width:${cfg.controls.minWidth}px!important;font-size:${cfg.typography.button}px!important;padding:5px 8px!important;color:${t.secondaryText}!important;background:${t.secondaryBg}!important;border:1px solid ${t.inputBorder}!important;border-image:none!important;box-shadow:none!important;white-space:nowrap!important;}
  #g105-interaction-card button[data-action='tower.interaction.submit'],#g105-interaction-card button[data-action='pilot.expand']{background:${t.primaryBg}!important;color:${t.primaryText}!important;}
  #g105-interaction-card button:disabled{background:${t.disabledBg}!important;color:${t.disabledText}!important;border-style:dashed!important;opacity:1!important;}
  #g105-interaction-card button *{font-size:inherit!important;}
  #g105-quick-replies,#g105-card-actions{padding:0!important;gap:${cfg.controls.gap}px!important;flex-wrap:wrap!important;}
  #g105-card-safety{white-space:normal!important;}
  #g105-controls{left:${(statusX-sx)/k-20}px!important;top:${(statusY-sy)/k-18}px!important;width:${statusWidth}px!important;height:${r.statusHeight}px!important;box-sizing:border-box!important;transform:scale(${1/k})!important;transform-origin:0 0!important;border:0!important;border-image:none!important;padding:3px 8px!important;background:#fff9ed!important;}
  #g105-note{font-size:11px!important;line-height:16px!important;color:#442a31!important;}
  ${colorRules}
  #game>div{overflow:visible!important;}
  `;
  style.textContent=style.textContent.replace(/(^|[},])(\s*)(#g105-)/g,'$1$2#game $3');
  if(card){
   const pick=(id:string)=>card.children.find((n:any)=>n.id===id);
   const title=pick('g105-card-title'),question=pick('g105-card-text'),kicker=pick('g105-card-kicker'),input=pick('g105-response-input'),quick=pick('g105-quick-replies'),actions=pick('g105-card-actions'),safety=pick('g105-card-safety');
   card.layout={...card.layout,padding:p,gap:cfg.controls.gap,anim:undefined,fx:undefined};card.props={...card.props,skin:cfg.asset.path,skinSlice:cfg.asset.slice};
   const panel=(id:string,children:any[],layout:any={})=>({type:'Panel',id,props:{bare:true},layout:{padding:0,gap:cfg.controls.gap,...layout},children:children.filter(Boolean)});
   const heading=panel('pilot-heading',[title,kicker],{direction:'row',justify:'between',align:'center'});
   const toggle={type:'Button',id:compact?'pilot-answer':'pilot-collapse',props:{label:compact?'回答':'收起',action:compact?'pilot.expand':'pilot.collapse',kind:'quiet'}};
   if(compact)card.children=[panel('pilot-collapsed',[question,toggle],{direction:'row',align:'center',justify:'between'})];
   else if(scheme==='C'&&rules.compact){
    const submit=actions.children.find((n:any)=>n.id==='g105-interaction-complete');
    const swap=actions.children.find((n:any)=>n.id==='g105-interaction-swap');
    const skip=actions.children.find((n:any)=>n.id==='g105-interaction-skip');
    if(swap)swap.props.label=swap.props.disabled?'已换卡':cfg.compactCopy.swap;
    if(skip)skip.props.label=cfg.compactCopy.skip;
    if(safety)safety.props.text=cfg.compactCopy.safety;
    const dropdown={type:'Dropdown',id:'pilot-quick-select',props:{placeholder:cfg.compactCopy.quick,action:'tower.response.quick',options:quick.children.map((n:any)=>({label:n.props.label,value:n.props.actionArg}))}};
    input.layout={...input.layout,flex:1};
    card.children=[panel('pilot-horizontal',[panel('pilot-copy',[question,safety],{width:rules.copyWidth}),panel('pilot-form',[panel('pilot-input-row',[input,submit],{direction:'row'}),panel('pilot-toolbar',[dropdown,swap,skip,toggle],{direction:'row',justify:'between'})],{flex:1})],{direction:'row',gap:rules.columnGap})];
   }
   else if(scheme==='B'&&mode!=='portrait'){
    card.children=[panel('pilot-horizontal',[panel('pilot-copy',[heading,question,safety],{width:Math.round(width*.30)}),panel('pilot-form',[input,quick,actions],{flex:1})],{direction:'row',gap:12})];
   }else{
    if(scheme==='C')actions?.children.push(toggle);
    card.children=[heading,question,input,quick,actions,safety].filter(Boolean);
   }
  }
  (window as any).__pilot={scheme,palette,expanded,environment:env,requestedBox:{x,y,width,height},config:cfg,tree:current,validation:card?validateLayoutNode(card):[],inheritedValidation:validateLayoutNode(tree),source:'real HUD through original mountUI',set:(a:string,b:string,open=false)=>{scheme=a;palette=b;expanded=open;redraw();}};
  return out;
 };
 const merged={...handlers,'pilot.expand':()=>{expanded=true;redraw();console.info('[pilot] transition expanded');},'pilot.collapse':()=>{expanded=false;redraw();console.info('[pilot] transition collapsed');}};
 const mounted=originalMount(host,render(root),merged,theme,sink);
 redraw=()=>mounted.update(render(current),theme);
 const resize=()=>redraw();window.addEventListener('resize',resize);
 const handle=(()=>{window.removeEventListener('resize',resize);mounted();}) as MountHandle;
 handle.update=(next,nextTheme)=>{current=next;theme=nextTheme||theme;redraw();};
 return handle;
}
