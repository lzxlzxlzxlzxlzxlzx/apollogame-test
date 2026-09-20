import {BoundPlayback} from './s2-bound-playback.js';
import { samplePlayback,placeholderPlayback } from './s2-clip-player.js';
import { ActionObservation } from './s2-action-observation.js';
import { actionBindings, missingActionAssets } from './s2-action-bindings.js';
import { factories } from './s2-visual.fixture.js';
const select = document.createElement('select'); select.id = 'scenario'; select.setAttribute('aria-label','验证场景');
const names = ['V02 双技能与参数复用','卫道士临时播放接口','普通俯冲','双单位错时','正常近战对照','前摇后升空与移动','释放拍硬控','释放拍死亡','范围双目标清理','升空前重选','V06 接敌','V06 重叠失败探针','V06 实心墙','V06 绕边角','V06 断路阻挡','斧劈左向','斧劈同拍硬控','斧劈死亡','斧劈距离承诺','六单位围攻','三段与半倍率友伤','三段硬控中断','三段死亡中断','弹丸接触','弹丸未命中清理','光束双目标','持续穿透光束','光束硬控中断','固定落点躲避','固定落点命中','召唤与来源死亡','关系骨架清理','头部减伤共享生命','最后伤害来源转换','B3 大象冲锋','B3 恼鬼俯冲窗口','B3 诡异蚊鬼变身'];
Object.keys(factories).forEach((key,i)=>select.add(new Option(names[i],key)));
document.querySelector('canvas')!.before(select);
const canvas = document.querySelector<HTMLCanvasElement>('canvas')!, ctx = canvas.getContext('2d')!, out = document.querySelector<HTMLElement>('#readout')!;
let w = factories.multiskill(), tick = 0, paused = true;
const boundPlayback=new BoundPlayback();
const history: string[] = []; const actionObservation = new ActionObservation();
const assets = document.createElement('details');
const summary = document.createElement('summary'); summary.textContent='动作素材未就绪：卫道士斧劈 / 僵尸横扫 / 恼鬼俯冲';
assets.append(summary);
for(const binding of actionBindings){const line=document.createElement('p');line.textContent=binding.unit+'：缺少 '+missingActionAssets(binding).join('、');assets.append(line);}
out.after(assets);
const preview = document.createElement('div');
const pose = document.createElement('img'); pose.width=100; pose.height=128; pose.style.objectFit='contain';
const caption=document.createElement('p');
preview.append(pose,caption);out.after(preview);
const playback=placeholderPlayback('axe'); let clipStart=0,lastClip='';
function draw() {
  const presentation=actionObservation.sample(w);
  const anim=w.getComponent<any>('melee','AnimState');
  preview.hidden=!presentation.visible;
  pose.style.transform=`scaleX(${presentation.facing})`;
  if(anim){
    if(lastClip!==anim.current){lastClip=anim.current;clipStart=tick;}
    const source=w.getComponent<any>('melee','Transform');
    const played=samplePlayback(playback,anim.current,tick-clipStart,{x:source.x,y:source.y},presentation.facing);
    pose.src=played.source ?? '/games/game-mcfight/temp-action/'+(anim.current==='Windup'||anim.current==='Active'?'attack':'idle')+'.png';
    caption.textContent='临时单姿态接口探针，非合格斧劈动画 | '+anim.current+' | Frame '+w.getComponent<any>('melee','Frame')?.index+' | 占位序列帧 '+played.index+' | 握持挂点 '+JSON.stringify(played.anchors.grip);
  }
  ctx.clearRect(0,0,900,460);
  const entities = w.query('Transform').map(([id])=>({id,t:w.getComponent<any>(id,'Transform')!,shape:w.getComponent<any>(id,'Shape')}));
  const maxX = Math.max(8,...entities.map(e=>e.t.x+3)), minX = Math.min(-3,...entities.map(e=>e.t.x-3));
  const maxY=Math.max(3,...entities.map(e=>e.t.y+(e.shape?.height??2)/2)),minY=Math.min(-3,...entities.map(e=>e.t.y-(e.shape?.height??2)/2));
  const scale = Math.min(760/(maxX-minX),340/(maxY-minY)), X=(x:number)=>70+(x-minX)*scale,Y=(y:number)=>50+(y-minY)*scale;
  ctx.font='14px system-ui';
  for(const hit of presentation.hits){ctx.fillStyle='#ffdd77';ctx.fillText('命中 -'+hit.amount,X(hit.x),Y(hit.y)-25);}
  for (const e of entities) {
    const relation = w.getComponent<any>(e.id,'Relation'), target=relation?.kind==='target'?w.getComponent<any>(relation.targetId,'Transform'):undefined;
    if(target){ctx.strokeStyle='#83d5ff';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(X(e.t.x),Y(e.t.y));ctx.lineTo(X(target.x),Y(target.y));ctx.stroke();ctx.setLineDash([]);}
    const zone=w.hasComponent(e.id,'Hitbox'); ctx.fillStyle=zone?'#ee755560':'#69b8d8';ctx.strokeStyle=zone?'#ee7555':'#90dfed';
    ctx.beginPath();if(e.shape?.kind==='box'){ctx.rect(X(e.t.x)-e.shape.width*scale/2,Y(e.t.y)-e.shape.height*scale/2,e.shape.width*scale,e.shape.height*scale);}else{ctx.arc(X(e.t.x),Y(e.t.y),e.shape?.radius?e.shape.radius*scale:4,0,2*Math.PI);}ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.fillText(e.id,X(e.t.x)-25,330+(entities.indexOf(e)%3)*20);
  }
  const rows=w.getAllEntities().filter(id=>w.hasComponent(id,'Resource')||w.hasComponent(id,'GameFlow')||w.hasComponent(id,'State')||w.hasComponent(id,'DamageReceiver')||w.hasComponent(id,'PrefabOrigin')).map(id=>({id,source:w.getComponent<any>(id,'PrefabOrigin')?.source,lastDamage:w.getComponent<any>(id,'LastDamage'),receiver:w.getComponent<any>(id,'DamageReceiver'),phase:w.getComponent<any>(id,'GameFlow')?.current,action:w.getComponent<any>(id,'State')?.current,cd:w.hasComponent(id,'Timer')?Math.max(0,w.getComponent<any>(id,'Timer').duration-w.getComponent<any>(id,'Timer').elapsed):undefined,resource:w.getComponent<any>(id,'Resource')?.current,status:w.getComponent<any>(id,'Status')?.flags,target:w.getComponent<any>(id,'Relation')?.targetId,locked:w.getComponent<any>(id,'GameFlow')?.targetSnapshot?.targetId}));
  const boundRows=boundPlayback.sample(w,tick);
  out.textContent=`Tick ${tick} | ${names[select.selectedIndex]} | 攻击区域 ${w.query('Hitbox').length}\n`+rows.map(r=>JSON.stringify(r)).join('\n')+'\n'+boundRows.map(r=>JSON.stringify({unit:r.unit,phase:r.phase,frame:r.index,facing:r.facing,missingArt:r.missing,anchors:r.anchors})).join('\n');
  if(history.length<=tick)history.push(out.textContent);
}
function step(){w.tick();tick++;draw();}
const pause=document.querySelector<HTMLButtonElement>('#pause')!; pause.textContent='继续';
pause.onclick=()=>{paused=!paused;pause.textContent=paused?'继续':'暂停';};
document.querySelector<HTMLButtonElement>('#step')!.onclick=()=>{paused=true;pause.textContent='继续';step();};
function reset(){w=factories[select.value as keyof typeof factories]();tick=0;history.length=0;actionObservation.reset();boundPlayback.reset();lastClip='';clipStart=0;paused=true;pause.textContent='继续';draw();}
select.onchange=reset;document.querySelector<HTMLButtonElement>('#reset')!.onclick=reset;
setInterval(()=>{if(!paused)step();},500);draw();







