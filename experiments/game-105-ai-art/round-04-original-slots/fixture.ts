// Static evidence fixture: original exported HUD, original renderer/CSS; no production mutation.
import {hud,HEART_TOWER_THEME} from '../../../games/game-105/game-105';
import {TowerGameSession} from '../../../games/game-105/tower-session';
import {TOWER_BLOCKS} from '../../../games/game-105/tower-blueprint';
import {mountHost} from '@zerocraft/engine/engine/host/mount-host.js';
import {mountUI} from '@zerocraft/engine/ui/components/index.js';
const params=new URLSearchParams(location.search),variant=params.get('candidate'),mode=params.get('state')||'longest';
const s=new TowerGameSession(105);s.phase='player-interaction';
const spec=await (await fetch('./specs/text-extremes.json')).json();
s.interactionQueue.push({effectId:'fixture',block:TOWER_BLOCKS.find(b=>b.channel==='blue')!,title:'默契选择',text:spec.longestMainQuestion,kind:'main',sequence:1,total:1});
if(mode==='summary'){s.interactionQueue[0].kind='summary';s.interactionQueue[0].text='第 1 块余波来自心动时刻。这是一条本局事实，可单独记下或跳过。';}
if(mode==='ai'){s.phase='ai-response';s.aiInteractionQueue.push(s.interactionQueue[0]);s.aiReplyVisible=true;s.templateReply='这个小计划不错，我们可以从不赶时间的那一步开始。';}
const idx=await (await fetch('/games/game-105/art/index.json')).json();const skins=Object.fromEntries(idx.assets.map(a=>[a.id,a.path]));
if(variant&&/^[ABCD]$/.test(variant))skins['game-105/ui/card-frame']=`/experiments/game-105-ai-art/round-04-original-slots/derived/${variant}.png`;
const host=mountHost(document.getElementById('game')!,{fieldW:1280,fieldH:720,sceneBackground:`url('${skins['game-105/scene/night-room']}') center/cover no-repeat`,wrapperBackground:'#1c1728'});
mountUI(host.overlayHost,hud(s,0,skins),{},HEART_TOWER_THEME);
(window as any).__fixture={mode,description:'Original HUD with explicit existing content, static fixture, no real physics or gameplay transitions',ready:true};
