import type {LifeHostViewModel} from '../../src/assembly/life-host/life-presenter.js';
import {buildLifeProfilePanel} from '../../src/assembly/life-host/life-hud.js';

const view:LifeHostViewModel={scene:'moon-courtyard',x:10,y:9,poseX:10,poseY:9,date:'Eclipse 1',slot:'Dawn',placeLabel:'月影庭院',canInteract:false,interactionSummary:'附近没有可互动对象',inventory:[],inventoryItems:[],inventoryCapacity:{usedSlots:0,freeSlots:12,totalSlots:12},allowedActions:[],nearby:[],nearbyWarps:[],affordances:[],results:{},objective:'复兴王城',questItems:[],relationships:[],profile:{title:'月影魔王档案',playerSkinKey:'art:player',attributes:[{id:'dread',title:'魔王威仪',iconSkinKey:'art:dread',display:'gauge',surfaces:['profile','hud'],value:30,min:0,max:100},{id:'bond',title:'工匠盟约',iconSkinKey:'art:bond',display:'gauge',surfaces:['profile','hud'],value:20,min:0,max:100,levelId:'stranger',levelTitle:'陌生的工匠'}]}};
const hud={preset:'life-standard-v1' as const,title:'月影魔王城',labels:{profile:'人物档案'}};
export const lifeProfilePanelAuditTree=buildLifeProfilePanel(view,hud,{enabled:true,titleLabelKey:'profile'},()=>undefined);
