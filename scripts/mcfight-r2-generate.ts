/** Offline content authoring only. Never imported by a game entry or simulation. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd();
const design = 'docs/design/game-mcfight/';
const content = 'games/game-mcfight/content/';
const read = (p: string): any => JSON.parse(readFileSync(resolve(root, p), 'utf8').replace(/^\uFEFF/, ''));
const write = (p: string, data: unknown) => writeFileSync(resolve(root,p), JSON.stringify(data,null,2)+'\n');
export const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const aliases: Record<string,string> = { vindicator:'vindicator', skeleton:'skeleton', vex:'vex', alexsmobs_elephant:'elephant', alexscaves_tremorzilla:'earthshaker', witch:'witch' };
const families: Record<string, [string, string[], string[]]> = {
  SK01:['单体近战',['t3-flow','t3-caster','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','hitReach']],
  SK02:['单次范围',['t3-flow','t3-caster','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','shape','radius','angle','length']],
  SK03:['分段连击',['t3-flow','t3-caster','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','segments','followBetweenHits']],
  SK04:['持续跟随区域',['t3-flow','t3-caster','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','shape','tickCount','tickInterval','firstTickDelay']],
  SK05:['投射攻击',['t3-flow','t3-caster','t2-launch','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','projectileSpeed','maxTravel','projectileRadius','flightMode','pierceCount']],
  SK06:['弹丸齐射',['t3-flow','t3-caster','t2-launch','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','shotCount','shotInterval','spreadAngle','projectileSpeed']],
  SK07:['持续光束',['t3-flow','t3-caster','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','width','tickCount','tickInterval','turnRate']],
  SK08:['固定落点轰击',['t3-flow','t3-caster','t3-prefab','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','markDuration','warningDuration','tickCount','tickInterval','radius']],
  SK09:['真实冲锋',['t3-flow','t2-steering','t1-motion-apply','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','minCastRange','chargeSpeed','hitPolicy']],
  SK10:['跃击',['t3-flow','t1-motion-apply','t2-hitbox'],['damage','cooldown','castRange','windup','recovery','travelDuration','landingRadius','height']],
  SK11:['俯冲窗口',['t3-flow','t1-motion-apply','t2-hitbox'],['damage','cooldown','castRange','descendDuration','contactDuration','riseDuration','speed']],
  SK12:['蓄爆自毁',['t3-flow','t2-hitbox','t2-mortal'],['damage','cooldown','castRange','fuse','radius','falloff','selfDestruction']],
  SK13:['恐惧怒吼',['t3-flow','t3-caster','t2-hitbox'],['cooldown','castRange','windup','recovery','duration','bossFilter']],
  SK14:['治疗',['t3-flow','t3-caster','t2-hitbox'],['healing','cooldown','castRange','windup','recovery','hpThreshold','safeRadius']],
  SK15:['召唤',['t3-flow','t3-prefab'],['cooldown','windup','recovery','count','limit','spawnRadius','lifetime']],
  SK16:['持续地面区域',['t3-flow','t3-prefab','t2-hitbox'],['damage','radius','tickCount','tickInterval','lifetime']],
  SK17:['环绕接触区域',['t3-flow','t2-orbit-motion','t2-hitbox'],['damage','cooldown','orbitRadius','orbitSpeed','lifetime','contactInterval']],
  SK18:['分布式轰击',['t3-flow','t3-prefab','t2-hitbox'],['damage','cooldown','castRange','warningDuration','ringCount','ringInterval','radius']],
  SK19:['防御姿态循环',['t3-flow','t2-damage-routing'],['cooldown','burrowDuration','emergeDuration','exitRadius','damageMultiplier']],
  SK20:['条件处决',['t3-flow','t2-hitbox','t2-mortal'],['cooldown','castRange','windup','recovery','maxTargetHp','healing']],
  SK21:['形态切换',['t3-flow','t2-stat-bind'],['hpThreshold','duration','statOverrides']],
  SK22:['身体接触',['t2-hitbox','t2-damage-routing','t1-motion-apply'],['damage','contactInterval','segmentCount','speedCurve']],
  SK23:['分离部位共享生命',['t2-damage-routing','t3-aggro','t2-steering'],['headMultiplier','maxSeparation','returnSpeed']],
  SK24:['骑乘组合',['t3-prefab','t3-flow'],['mountOffset','dismountOffset','riderLifetime']],
  M01:['状态刷新',['t2-hitbox','t2-over-time'],['statusKind','duration','strength','sourcePolicy']],
  M02:['特征效果',['t2-hitbox','t3-flow'],['traitMask','duration','effect']],
  M03:['邻敌增伤',['t2-group-count','t2-modifier-stack','t2-stat-bind'],['radius','perEnemy','cap']],
  M05:['独立恢复',['t2-over-time'],['healing','interval']],
  M06:['死亡归属效果',['t2-damage-routing','t3-prefab'],['sourceScope','effect','countLimit']],
  M07:['低血一次触发',['t3-flow'],['hpThreshold','countLimit']],
  M08:['防御免疫',['t2-damage-routing','t2-modifier-stack'],['damageMask','multiplier','statusImmunity']],
  M09:['穿甲',['t2-modifier-stack','t2-stat-bind'],['mode','ratio']],
  M10:['独立周期触发',['t3-flow','t3-prefab'],['interval','initialDelay','limit']],
};
// These are unresolved compositions, NOT newly authorized engine features.
const familyIssues: Record<string,string> = {
  SK10:'跃击高度/落点/控制期间轨迹尚无本单位组合证明；禁止将瞬移作为跃击。',
  SK20:'处决的最大生命门控、删除和恢复可用Flow组合；吞噬目标与恢复合同仍待数值，未验证完整组合。',
  SK22:'现有接触CD按命中区域保存，整只多体节共享接触CD与动态蛇形缩节尚未证明可组合。',
  SK24:'已验证层级关系清理，不等于双生命骑手独立决策和死亡下马完成。',
  M06:'直接Hitbox尸巫标记/一次转换已有能力；随从/间接伤害来源仍待设计，禁止自动继承。',
  M09:'护甲最终公式未定；已有乘性修正不等于穿甲规则已确认。',
};
const commonContracts = ['CR02','CR03','CR04','CR05','CR06'];
/** Authoring rule bindings, not executable unit-ID branches. */
const ruleBindings: Record<string,any> = {
  cataclysm_wadjet:{contracts:['CR13'],family:'SK05',label:'龙卷',target:'ground-and-air',piercing:'pending-design'},
  warden:{contracts:['CR14'],family:'SK05',label:'声波',piercing:true},
  iceandfire_cyclops:{contracts:['CR15'],family:'SK20',target:'ground-and-air'},
  iceandfire_dread_lich:{contracts:['CR10','CR11'],family:'M06',lastPositiveLichSource:true,sourceDeathPreservesMark:true,conversionOnce:true,arthropodFirst:true},
  alexsmobs_murmur:{contracts:['CR12'],family:'SK23',separatelyTargetable:['body','head'],sharedPool:true,headOnlyReduction:true},
};
export function generate(cards: any[], facts: any[], approved: any) {
  if(cards.length!==84 || facts.length!==84) throw Error('R2 requires 84 cards and facts');
  const out: any = { 'legacy-source':[], adoption:[], units:[], loadouts:[], decisions:[], presentations:[], templates:[], issues:[] };
  for(const [id,[name,capabilities,parameters]] of Object.entries(families)) out.templates.push({id,name,capabilities,parameters,coverage:'composition-candidate', gapIds:familyIssues[id]?[`family:${id}`]:[]});
  for(const [id,reason] of Object.entries(familyIssues)) out.issues.push({id:`family:${id}`,family:id,kind:'composition-unverified',status:'pending',reason,evidence:['docs/playbooks/combat.md','docs/design/game-mcfight/s2-c6-public-gaps.md'],unitIds:[]});
  for(const card of cards) {
    const fact=facts[card.legacyUnitIndex];
    if(!fact || fact.monsterId!==card.id) throw Error(`legacyUnitIndex mismatch ${card.id}`);
    const id=aliases[card.id]??card.id, alias=aliases[card.id], prior=alias?approved.units[alias]:null;
    const sourceId=`source:${id}`, sourceRef=`${design}inventory/units.json#/${card.legacyUnitIndex}`;
    out['legacy-source'].push({id:sourceId,unitId:id,legacyId:card.id,legacyUnitIndex:card.legacyUnitIndex,factsRef:sourceRef,factsHash:digest(fact),cardHash:digest(card),assetRefs:fact.sprites,legacyAbility:{class:fact.resolvedAbility,route:fact.bindingRoute},conflicts:fact.attributeOverrides,missingParams:fact.missingParams,unconsumedParams:fact.paramsNotReadByBoundAbility,duplicateParams:fact.duplicateParams});
    const adopt=(path:string,status:string,reason:string,value?:any, legacyPath?:string)=> {
      const adoptionId=`adopt:${id}:${path}`;
      out.adoption.push({id:adoptionId,unitId:id,path,status,reason,sourceRef:legacyPath?`${sourceRef}/${legacyPath}`:`${design}${prior?'s4-playable-vertical-slice.md':'r1-unit-cards-v1.json'}`,approvedBy:status==='pending-design'?null:(prior?'S4 accepted baseline':'combat-rulings-v0.2'),...(value!==undefined?{value}:{}),unresolvedIds:status==='pending-design'?[`design:${id}:${path}`]:[]});
      return {status,adoptionId,...(value!==undefined?{value}:{})};
    };
    // Every numeric leaf is individually reconciled, including overridden and unread values.
    const numeric=(v:any,p:string)=>{if(typeof v==='number') adopt(`legacy/${p}`,'pending-design',p.includes('sourceSO')||p.includes('sourceConfigEntry')?'旧来源值（可能有覆盖冲突），不批准为新版值':'没有旧像素/数值到新版的已批准全局换算；候选不是运行参数',undefined,p);else if(v&&typeof v==='object') for(const [k,x]of Object.entries(v))numeric(x,`${p}/${k}`);};
    for(const field of ['sourceSO','sourceConfigEntry','effectiveAttributes','attributeOverrides','abilityParams','firstWinsParams'])numeric(fact[field],field);
    for(const key of fact.missingParams??[])adopt(`missing/${key}`,'pending-design','旧能力请求参数缺失，禁止补默认常量',undefined,`missingParams`);
    const attrs:any={};
    for(const key of ['price','hp','speed','radius','armor','toughness','attack','attackRange','attackInterval']) {
      const value=prior?.[key];
      attrs[key]=adopt(`attributes/${key}`,value!==undefined?'rebuilt':'pending-design',value!==undefined?'保留已验收S4新版实验参数；不是旧值自动采用，也不是R4平衡定稿':'未批准新版值/比例或存在来源冲突，待策划批量裁定',value);
    }
    const movement=fact.moveType==='Fly'?'flying':'ground';
    attrs.targetEligibility=adopt('attributes/targetEligibility','pending-design','目标资格逐技能配置，不能从旧attackType自动认定对空');
    const unit:any={id,legacyId:card.id,name:card.name,sourceId,shopVisibility:fact.shopVisibleByPrice?'visible':'hidden',movement,tags:[movement,...fact.tags],attributes:attrs,loadoutIds:[],decisionId:`decision:${id}`,presentationId:`presentation:${id}`,collisionSlot:`presentation:${id}/collision`,noActiveAttack:card.proposed.templates==='无主动攻击',...(prior?{runtimeAlias:alias,role:prior.role}:{})};
    if(prior)unit.runtimeSelectionOrder=adopt('runtimeSelectionOrder','rebuilt','保留S4验收的商店子集次序，与R2隐藏/召唤目录分开',Object.keys(approved.units).indexOf(alias!));
    const arts:any={id:unit.presentationId,unitId:id,identity:{path:card.presentation.idle,status:'identity-candidate'},attackCandidate:{path:card.presentation.attack??null,status:card.presentation.attack?'single-pose-candidate':'missing'},death:{status:'missing'},anchor:movement==='flying'?'body-center':'feet-center',facing:'right',mirror:true,collisionSlot:unit.collisionSlot,s6ArtBinding:'pending',actions:[]};
    const addArt=(l:any)=>arts.actions.push({id:l.presentationSlot,loadoutId:l.id,semantics:l.templateIds.includes('SK11')?['hover','prepare','descend','release','contact','rise','hover-recover']:['idle','windup','release','contact','recovery','cancel'],status:'missing',anchors:Object.fromEntries(['root','body','grip','effect','contact'].map(k=>[k,{status:'missing',coordinates:null}])),vfx:{status:'missing'},sfx:{status:'missing'}});
    let sequence=0;
    for(const clause of card.proposed.templates.split('；')) {
      const matches=[...clause.matchAll(/(SK\d\d|M\d\d)\s*([^＋]*?)(?=＋|\/M\d\d|$)/g)] as RegExpMatchArray[];
      let parent:string|null=null;
      for(const m of matches) {
        const family=m[1]!,desc=m[2]!.trim();
        if(!families[family])throw Error(`unknown mechanism ${family}`);
        // Explicit slash alternatives within one template are independent loadouts.
        const variants=desc==='范围药水'?['伤害范围药水','剧毒范围药水','迟缓范围药水']:desc.includes('/')?desc.split('/'):[desc||family];
        const inheritedParent=parent;
        let firstVariant:string|null=null;
        for(const label of variants) {
          const lid=`${id}/skill-${++sequence}`;
          const passive=family.startsWith('M')||clause.includes('可作为');
          const params:any={};
          for(const p of families[family]![2])params[p]=adopt(`loadouts/${lid}/${p}`,'pending-design',`R1建议“${clause}”；${card.proposed.unresolved}；数值/几何须逐项裁定`);
          const target=adopt(`loadouts/${lid}/targetEligibility`,'pending-design','未批准技能空地/阵营配置，不从旧攻击分类推断');
          const hit=adopt(`loadouts/${lid}/hitEligibility`,'pending-design','命中资格独立于启动目标，不默认继承前摇承诺');
          const contracts=[...commonContracts,...(family==='SK09'?['CR01']:[]),...(family==='SK08'?['CR08']:[]),...(family==='SK12'?['CR09']:[]),...(family==='SK23'?['CR12']:[]),...(family==='M01'?['CR07']:[])];
          const rule=ruleBindings[card.id];
          const appliedRule=rule&&rule.family===family&&(!rule.label||label.includes(rule.label))?rule:null;
          if(appliedRule)contracts.push(...appliedRule.contracts);
          if(family==='SK12'){params.allyMultiplier=adopt(`loadouts/${lid}/allyMultiplier`,'adopted','CR09明确友伤倍率',.5);params.enemyMultiplier=adopt(`loadouts/${lid}/enemyMultiplier`,'adopted','CR09明确敌方倍率',1);}
          const summons:string[]=[];
          if(/恼鬼召唤/.test(label))summons.push('vex');
          if(/蝌蚪/.test(label))summons.push('stradpole');
          if(family==='M06'&&/转化/.test(label)) {contracts.push('CR10','CR11');summons.push('dread_spider','dread_thrall','dread_ghoul','dread_beast');}
          const l:any={id:lid,unitId:id,templateIds:[family],label,mode:passive?'passive':inheritedParent?'triggered':'active',parentId:inheritedParent,parameters:params,sourceRef:`${design}r1-unit-cards-v1.json#/cards/${cards.indexOf(card)}/proposed`,modifierIds:[],contracts,stateScope:'entity-instance/loadout-id',actionLock:passive?'none':inheritedParent?'parent':'exclusive',presentationSlot:`${unit.presentationId}/${sequence}`,eligibility:target,hitEligibility:hit,summonUnitIds:summons,gapIds:familyIssues[family]?[`family:${family}`]:[],variant:'restoration'};
          l.sourceClause=clause;
          l.effects=(inheritedParent?[]:clause.split('＋').filter((part:string)=>!/(SK|M)\d\d/.test(part))).map((effect:string)=>({semantic:effect,status:'pending-design',parameters:{strength:adopt(`loadouts/${lid}/effect/${effect}/strength`,'pending-design','R1明确附加效果，强度未批准'),duration:adopt(`loadouts/${lid}/effect/${effect}/duration`,'pending-design','R1明确附加效果，时序未批准')}}));
          if(/剧毒范围药水|迟缓范围药水/.test(label))l.effects.push({semantic:label.startsWith('剧毒')?'poison':'slow',status:'pending-design',directDamage:'pending-design'});
          if(family==='SK14'&&/治疗效果/.test(label)) {
            const drain=out.loadouts.find((x:any)=>x.unitId===id&&x.label==='吸血');
            if(drain)l.parentId=drain.id;
          }
          if(family==='SK01'&&/部位近战/.test(label))l.partScheduling={owner:'detached-head',stateScope:'part-entity/loadout-id',mode:'independent-melee',status:'pending-design'};
          l.confirmedRules={cd:'on-successful-start',cancel:'hard-control-or-death/no-refund',meleeCommitment:family==='SK01'?'captured-target-despite-distance-or-ascent':'not-applicable',areaQualification:'at-each-hit',...(family==='SK11'?{groundWindow:'descent-start-through-rise-complete',movementAndWindow:'same-boundary'}:{}),...(family==='SK08'?{lockPoint:'at-mark-end',followAfterLock:false}:{}),...(family==='M01'?{sameStatus:'refresh-duration/keep-stronger',differentStatuses:'coexist'}:{}),...(appliedRule??{})};
          if(appliedRule?.target){l.eligibility=adopt(`loadouts/${lid}/confirmedTarget`,'adopted',appliedRule.contracts.join('/'),appliedRule.target);l.hitEligibility=adopt(`loadouts/${lid}/confirmedHit`,'adopted',appliedRule.contracts.join('/'),appliedRule.target);}
          if(appliedRule?.conversionOnce){params.lowerMaxHp=adopt(`loadouts/${lid}/lowerMaxHp`,'adopted','CR11 非节肢最大生命下档（含边界）',20);params.upperMaxHp=adopt(`loadouts/${lid}/upperMaxHp`,'adopted','CR11 非节肢最大生命中档（含边界）',50);l.conversionTargets={arthropod:'dread_spider',lower:'dread_thrall',middle:'dread_ghoul',upper:'dread_beast'};}
          if(passive&&parent){out.loadouts.find((x:any)=>x.id===parent)?.modifierIds.push(lid);}
          if(!firstVariant&&!passive)firstVariant=lid;
          out.loadouts.push(l);unit.loadoutIds.push(lid);addArt(l);
          for(const gap of l.gapIds)out.issues.find((x:any)=>x.id===gap).unitIds.push(id);
        }
        if(!parent)parent=firstVariant;
      }
    }
    // S4 gameplay is a scoped, tested variant, not a replacement for the full restoration loadouts.
    const runtimeCandidates:string[]=[];
    if(prior) for(const sid of prior.skills) {
      const parameters:any={};for(const [p,v]of Object.entries(approved.skills[sid]))parameters[p]=adopt(`s4/${sid}/${p}`,'rebuilt','S4已验收新版参数，原值保留；完整复原语义仍由restoration装配描述',v);
      const fam=({slash:'SK01',arrow:'SK05',dive:'SK11',charge:'SK09',strike:'SK01',quake:'SK02',beam:'SK07',potion:'SK02',heal:'SK14'} as Record<string,string>)[sid]!;
      const lid=`${id}/s4-${sid}`;runtimeCandidates.push(lid);
      const l:any={id:lid,unitId:id,templateIds:[fam],label:`S4 ${sid}`,mode:'active',parentId:null,parameters,sourceRef:`${design}s4-playable-vertical-slice.md`,modifierIds:[],contracts:commonContracts,stateScope:'entity-instance/loadout-id',actionLock:'exclusive',presentationSlot:`${unit.presentationId}/s4-${sid}`,eligibility:adopt(`s4/${sid}/targetEligibility`,'rebuilt','S4既有技能合法目标合同，完整目标矩阵待R3',sid==='heal'?'self':['slash','strike','charge','quake'].includes(sid)?'ground-enemy':'enemy'),hitEligibility:adopt(`s4/${sid}/hitEligibility`,'rebuilt','S4已验证生效资格',sid==='heal'?'self':'s4-validated'),summonUnitIds:[],gapIds:[],variant:'s4-validated',runtimeAlias:sid};
      out.loadouts.push(l);unit.loadoutIds.push(lid);addArt(l);
    }
    out.units.push(unit);out.presentations.push(arts);
    const active=out.loadouts.filter((x:any)=>x.unitId===id&&x.mode==='active'&&x.variant==='restoration').map((x:any)=>x.id);
    out.decisions.push({id:unit.decisionId,unitId:id,candidates:active,policyText:card.proposed.decision,sourceRef:`${design}r1-unit-cards-v1.json#/cards/${cards.indexOf(card)}/proposed/decision`,status:active.length<=1?'configured':'pending-design',selection:active.length<=1?'priority':'pending-design',orderedCandidates:active.length<=1?active:[],gates:['alive','legal-target','cast-distance','independent-cd-ready','exclusive-action-free'],constraints:{retarget:'before-start-only',busy:'finish-or-cancel-no-restart',cooldowns:'entity-instance/loadout-id',passiveScheduling:'independent-of-active-lock',complexSelection:active.length>1?{status:'pending-design',reason:card.proposed.decision}:null},fallback:unit.noActiveAttack?'wander-near-spawn':'idle',runtimeCandidates});
  }
  for(const issue of out.issues)issue.unitIds=[...new Set(issue.unitIds)];
  return out;
}
export function runGeneration() {
  const cards=read(design+'r1-unit-cards-v1.json').cards, facts=read(design+'inventory/units.json');
  let approved:any;
  if(!existsSync(content+'units.json'))throw Error('Canonical units missing; do not recover runtime facts from legacy or evidence snapshots');
  if(read(content+'units.json').some((u:any)=>u.compatibility))throw Error('Catalog has an approved R3 projection. Use mcfight-r3-project.ts; R2 generation would discard it.');
  {
    const units=read(content+'units.json'), loadouts=read(content+'loadouts.json'), decisions=read(content+'decisions.json');
    approved={units:{},skills:{}};
    for(const u of units.filter((u:any)=>u.runtimeAlias).sort((a:any,b:any)=>(a.runtimeSelectionOrder?.value??0)-(b.runtimeSelectionOrder?.value??0))) {
      const skills=decisions.find((d:any)=>d.id===u.decisionId).runtimeCandidates.map((id:string)=>loadouts.find((l:any)=>l.id===id).runtimeAlias);
      approved.units[u.runtimeAlias]={name:u.name,role:u.role,...Object.fromEntries(Object.entries(u.attributes).filter(([,v]:any)=>v.status!=='pending-design').map(([k,v]:any)=>[k,v.value])),skills};
    }
    for(const l of loadouts.filter((l:any)=>l.variant==='s4-validated'))approved.skills[l.runtimeAlias]=Object.fromEntries(Object.entries(l.parameters).map(([k,v]:any)=>[k,v.value]));
  }
  const result=generate(cards,facts,approved);
  for(const [name,value]of Object.entries(result))write(content+name+'.json',value);
  console.info(`R2 generated ${result.units.length} units / ${result.loadouts.length} loadouts; ${digest(result)}`);
}
if(process.env.MCFIGHT_R2_GENERATE==='1')runGeneration();
