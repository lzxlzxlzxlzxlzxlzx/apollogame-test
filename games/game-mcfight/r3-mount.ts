import type { LayoutNode } from '@ui/components/index.js';
import { mountCombatSession } from './s4-mount.js';
import { readS4View,renderS4Footer } from './s4-render.js';
import { createR3Session } from './r3-session.js';
import { S4_ACTIONS as A } from './content/s4-balance.js';
import { selectRuntimeUnit } from './content/runtime-selection.js';
const label=(id:string,text:string,size=16):LayoutNode=>({id,type:'Label',props:{text,size}});
const button=(id:string,text:string,action:string,args={},disabled=false):LayoutNode=>({id,type:'Button',props:{label:text,action,actionArg:JSON.stringify(args),disabled,kind:'hero'},layout:{height:38}});
const panel=(id:string,children:LayoutNode[],row=false):LayoutNode=>({id,type:'Panel',props:{},layout:{direction:row?'row':'column',gap:8,padding:10},children});
export function mountR3(container:HTMLElement){
 const session=createR3Session(1);
 const read=(s:typeof session)=>({...readS4View(s),page:s.shopPage,health:[...s.unitsInBattle(1),...s.unitsInBattle(2)].map(h=>{
  const placed=[...s.roster,...s.enemyUnits].find(u=>h.id===`${u.instanceId}#0:body`);
  return `${placed?s.content.units[placed.unitId]!.name:h.id} ${h.current.toFixed(1)}/${h.max}`;
 }).join(' · ')});
 const render=(v:ReturnType<typeof read>):LayoutNode=>{
  const heading=panel('r3-heading',[label('r3-title','MC FIGHT · 兼容恢复',26),label('r3-gold',`金币 ${v.gold} · 第 ${v.round} 轮 · 持有 ${v.owned.length}/6`)],true);
  if(v.phase==='shop'){
   const selected=selectRuntimeUnit(v.selected,'r3').unit;
   const cards=session.content.shopIds.slice(v.page*6,v.page*6+6).map(id=>{
    const d=session.content.units[id]!;
    return panel(`r3-card-${id}`,[button(`r3-select-${id}`,d.name,A.select,{unitId:id}),label(`r3-price-${id}`,`${d.price} 金 · 生命 ${d.hp}`,14),button(`r3-buy-${id}`,'购买',A.buy,{unitId:id},v.gold<d.price||v.owned.length>=6)]);
   });
   const details=panel('r3-details',[label('r3-selected',selected.name,22),...['hp','attack','armor','toughness','speed','radius','attackRange','attackInterval'].map(key=>label(`r3-detail-${key}`,`${({hp:'生命',attack:'攻击',armor:'护甲',toughness:'韧性',speed:'移速',radius:'碰撞半径',attackRange:'启动距离',attackInterval:'冷却秒数'} as Record<string,string>)[key]}：${selected.attributes[key]!.value}`,14))]);
   const roster=panel('r3-roster',v.owned.length?v.owned.map(r=>button(`r3-sell-${r.instanceId}`,`出售 ${r.name}`,A.sell,{instanceId:r.instanceId})):[label('r3-empty','购买后进入部署，将待命单位拖入蓝色区域。')],true);
   return {...panel('r3-shop',[heading,label('r3-scope',`当前开放 ${session.content.shopIds.length}/78 个可购买身份；仅展示装配完整项，其他单位待验证。`,14),panel('r3-body',[panel('r3-cards',[panel('r3-row1',cards.slice(0,3),true),panel('r3-row2',cards.slice(3),true)]),details],true),panel('r3-pages',[button('r3-prev','上一页','mcfight.catalog-page',{page:v.page-1},v.page===0),label('r3-page',`${v.page+1}/${Math.ceil(session.content.shopIds.length/6)}`),button('r3-next','下一页','mcfight.catalog-page',{page:v.page+1},(v.page+1)*6>=session.content.shopIds.length)],true),roster,button('r3-deploy','进入部署',A.deploy,{},!v.canEnter),label('r3-note','测试阵容与六格待命栏沿用已验证会话；本轮不做 R4 平衡或正式动作。',12)]),layout:{width:960,height:720,direction:'column',gap:6,padding:10}};
  }
  if(v.phase==='result')return {...panel('r3-result',[heading,label('r3-outcome',({victory:'胜利',defeat:'失败',draw:'平局',none:''})[v.outcome],40),label('r3-damage',`实际伤害：我方 ${v.playerDamage.toFixed(2)} / 敌方 ${v.enemyDamage.toFixed(2)}`),label('r3-healing',`实际治疗：我方 ${v.playerHealing.toFixed(2)} / 敌方 ${v.enemyHealing.toFixed(2)}`),button('r3-continue','返回商店',A.continue)]),layout:{width:960,height:720,direction:'column',padding:40,gap:20}};
  return {...panel('r3-header',[heading,label('r3-status',v.phase==='deploy'?`${v.reason||'可以开始'} · 将圆形单位拖入己方区域`:`战斗 ${v.seconds.toFixed(2)} 秒 · 我方 ${v.playerAlive} / 敌方 ${v.enemyAlive}`,14),...(v.phase==='battle'?[label('r3-health',v.health,12)]:[])]),layout:{width:960,height:v.phase==='deploy'?160:120,padding:8,gap:3,direction:'column'}};
 };
 return mountCombatSession(container,session,read,render,renderS4Footer);
}
