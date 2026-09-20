/** Offline authoring validation. Deliberately separate from runtime selection. */
export function validateR2(c: any, cards: any[], facts: any[], knownCapabilities?: Set<string>): string[] {
  const errors:string[]=[];
  const fail=(s:string)=>errors.push(s);
  const unique=(xs:any[],name:string)=>{if(new Set(xs.map(x=>x.id)).size!==xs.length)fail(`duplicate ${name}`);};
  unique(cards,'cards');
  for(const key of ['units','decisions','presentations','legacy-source'])if(c[key].length!==84)fail(`count ${key}`);
  if(cards.length!==84||facts.length!==84)fail('count inputs');
  for(const key of Object.keys(c))if(Array.isArray(c[key]))unique(c[key],key);
  const units=new Map<string,any>(c.units.map((u:any)=>[u.id,u]));
  const loadouts=new Map<string,any>(c.loadouts.map((l:any)=>[l.id,l]));
  const adoptions=new Map<string,any>(c.adoption.map((a:any)=>[a.id,a]));
  const templates=new Map<string,any>(c.templates.map((t:any)=>[t.id,t]));
  const issues=new Set(c.issues.map((g:any)=>g.id));
  const checkValue=(v:any,path:string,expectedPaths?:string[])=>{
    if(!v||!['adopted','normalized','rebuilt','pending-design'].includes(v.status)){fail(`adoption status ${path}`);return;}
    const a=adoptions.get(v.adoptionId);
    if(!a||a.status!==v.status||JSON.stringify(a.value)!==JSON.stringify(v.value)||a.unitId!==path.split('/')[0])fail(`adoption reference ${path}`);
    if(a&&expectedPaths&&!expectedPaths.includes(a.path))fail(`adoption path ${path}`);
    if(v.status==='pending-design'&&Object.hasOwn(v,'value'))fail(`pending value ${path}`);
    if(v.status!=='pending-design'&&(!Object.hasOwn(v,'value')||(typeof v.value==='number'&&!Number.isFinite(v.value))))fail(`missing adopted value ${path}`);
  };
  for(const a of c.adoption){if(!units.has(a.unitId)||!a.reason||!a.sourceRef)fail(`adoption source ${a.id}`);if(a.status==='pending-design'&&Object.hasOwn(a,'value'))fail(`pending adoption ${a.id}`);}
  const seenLegacy=new Set<string>();
  unique(c.units.filter((u:any)=>u.runtimeAlias).map((u:any)=>({id:u.runtimeAlias})),'runtime unit aliases');
  unique(c.loadouts.filter((l:any)=>l.runtimeAlias).map((l:any)=>({id:l.runtimeAlias})),'runtime skill aliases');
  for(const card of cards){
    const f=Number.isInteger(card.legacyUnitIndex)?facts[card.legacyUnitIndex]:null;
    if(!f||f.monsterId!==card.id){fail(`legacy index ${card.id}`);continue;}
    const matches=c.units.filter((u:any)=>u.legacyId===card.id);
    if(matches.length!==1){fail(`bijection ${card.id}`);continue;}
    const u=matches[0];seenLegacy.add(u.legacyId);
    const source=c['legacy-source'].find((s:any)=>s.id===u.sourceId&&s.unitId===u.id);
    if(!source||source.legacyId!==card.id||source.legacyUnitIndex!==card.legacyUnitIndex)fail(`source ${u.id}`);
    if(source)for(const [key,value]of Object.entries({conflicts:f.attributeOverrides,missingParams:f.missingParams,unconsumedParams:f.paramsNotReadByBoundAbility,duplicateParams:f.duplicateParams,assetRefs:f.sprites}))if(JSON.stringify(source[key])!==JSON.stringify(value))fail(`source detail ${u.id}/${key}`);
    if(u.shopVisibility!==(f.shopVisibleByPrice?'visible':'hidden'))fail(`visibility ${u.id}`);
    const d=c.decisions.find((x:any)=>x.id===u.decisionId&&x.unitId===u.id),p=c.presentations.find((x:any)=>x.id===u.presentationId&&x.unitId===u.id);
    if(!d||!p){fail(`profile ${u.id}`);continue;}
    if(p.identity.path!==card.presentation.idle||p.identity.status!=='identity-candidate'||p.attackCandidate.path!==(card.presentation.attack??null)||p.attackCandidate.status!==(card.presentation.attack?'single-pose-candidate':'missing')||p.death.status!=='missing'||p.s6ArtBinding!=='pending')fail(`art ${u.id}`);
    if(p.collisionSlot!==u.collisionSlot)fail(`collision slot ${u.id}`);
    if(u.noActiveAttack!==(card.proposed.templates==='无主动攻击'))fail(`no-active ${u.id}`);
    if(d.policyText!==card.proposed.decision)fail(`decision source ${u.id}`);
    if(u.noActiveAttack&&(d.candidates.length||d.fallback!=='wander-near-spawn'))fail(`noncombat decision ${u.id}`);
    const owned=c.loadouts.filter((l:any)=>l.unitId===u.id);
    if(new Set(u.loadoutIds).size!==u.loadoutIds.length||owned.length!==u.loadoutIds.length||u.loadoutIds.some((id:string)=>!owned.some((l:any)=>l.id===id)))fail(`loadout ownership ${u.id}`);
    if(!u.noActiveAttack&&!owned.some((l:any)=>l.variant==='restoration'&&l.mode==='active'))fail(`missing attack ${u.id}`);
    const expected=[...card.proposed.templates.matchAll(/SK\d\d|M\d\d/g)].map((m:RegExpMatchArray)=>m[0]);
    const actual=owned.filter((l:any)=>l.variant==='restoration').flatMap((l:any)=>l.templateIds);
    for(const l of owned.filter((l:any)=>l.variant==='restoration'))if(!card.proposed.templates.split('；').includes(l.sourceClause))fail(`source clause ${l.id}`);
    for(const clause of card.proposed.templates.split('；').filter((x:string)=>x.includes('＋击退'))){
      if(!owned.some((l:any)=>l.sourceClause===clause&&!l.parentId&&l.effects?.some((e:any)=>e.semantic==='击退')))fail(`source effect omitted ${u.id}`);
    }
    for(const key of new Set(expected))if(actual.filter((x:string)=>x===key).length<expected.filter((x:string)=>x===key).length)fail(`mechanism omitted ${u.id}/${key}`);
    for(const key of ['price','hp','speed','radius','armor','toughness','attack','attackRange','attackInterval','targetEligibility'])checkValue(u.attributes[key],`${u.id}/${key}`,[`attributes/${key}`]);
    if(u.runtimeAlias)checkValue(u.runtimeSelectionOrder,`${u.id}/runtimeSelectionOrder`);
    if(u.s4Attributes)for(const [key,value]of Object.entries(u.s4Attributes))checkValue(value,`${u.id}/s4/${key}`,[`s4/attributes/${key}`]);
    const numeric=(v:any,path:string)=>{if(typeof v==='number'){if(!c.adoption.some((a:any)=>a.unitId===u.id&&a.path===`legacy/${path}`))fail(`legacy numeric uncovered ${u.id}/${path}`);}else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))numeric(x,`${path}/${k}`);};
    for(const key of ['sourceSO','sourceConfigEntry','effectiveAttributes','attributeOverrides','abilityParams','firstWinsParams'])numeric(f[key],key);
    for(const key of f.missingParams??[])if(!c.adoption.some((a:any)=>a.unitId===u.id&&a.path===`missing/${key}`&&a.status==='pending-design'))fail(`missing parameter ${u.id}/${key}`);
    for(const id of [...d.candidates,...d.runtimeCandidates])if(!loadouts.has(id)||loadouts.get(id).unitId!==u.id||loadouts.get(id).mode!=='active')fail(`decision candidate ${u.id}/${id}`);
    for(const id of d.runtimeCandidates)if(loadouts.get(id)?.variant!=='s4-validated')fail(`runtime scope ${u.id}/${id}`);
    for(const id of d.candidates)if(loadouts.get(id)?.variant!=='restoration')fail(`restoration scope ${u.id}/${id}`);
    if(new Set(d.runtimeCandidates).size!==d.runtimeCandidates.length)fail(`runtime candidate duplicate ${u.id}`);
    if(d.orderedCandidates.some((id:string)=>!d.candidates.includes(id)))fail(`ordered candidate ${u.id}`);
    const active=owned.filter((l:any)=>l.variant==='restoration'&&l.mode==='active').map((l:any)=>l.id);
    if(active.length!==d.candidates.length||active.some((id:string)=>!d.candidates.includes(id)))fail(`decision coverage ${u.id}`);
    if(p.actions.length!==owned.length||p.actions.some((a:any)=>!owned.some((l:any)=>l.id===a.loadoutId&&l.presentationSlot===a.id)))fail(`action coverage ${u.id}`);
    unique(p.actions,`actions ${u.id}`);
    for(const l of owned)if(p.actions.filter((a:any)=>a.loadoutId===l.id).length!==1)fail(`action bijection ${l.id}`);
    for(const a of p.actions)if(a.status!=='missing'||a.vfx.status!=='missing'||a.sfx.status!=='missing'||Object.values(a.anchors).some((v:any)=>v.status!=='missing'||v.coordinates!==null))fail(`unreviewed action ${a.id}`);
  }
  if(seenLegacy.size!==84||c.units.some((u:any)=>!seenLegacy.has(u.legacyId)))fail('legacy set mismatch');
  for(const d of c.decisions)if(!units.has(d.unitId)||units.get(d.unitId).decisionId!==d.id)fail(`orphan decision ${d.id}`);
  for(const p of c.presentations)if(!units.has(p.unitId)||units.get(p.unitId).presentationId!==p.id)fail(`orphan presentation ${p.id}`);
  for(const t of c.templates){for(const id of t.capabilities)if(knownCapabilities&&!knownCapabilities.has(id))fail(`unknown capability ${id}`);for(const id of t.gapIds)if(!issues.has(id))fail(`template gap ${id}`);}
  for(const l of c.loadouts){
    if(!units.has(l.unitId))fail(`orphan skill ${l.id}`);
    for(const tid of l.templateIds){const t=templates.get(tid);if(!t)fail(`unknown template ${tid}`);else if(l.variant==='restoration')for(const key of t.parameters)if(!l.parameters[key])fail(`missing slot ${l.id}/${key}`);}
    for(const [key,v]of Object.entries(l.parameters))checkValue(v,`${l.id}/${key}`,[l.variant==='s4-validated'?`s4/${l.runtimeAlias}/${key}`:`loadouts/${l.id}/${key}`]);
    checkValue(l.eligibility,`${l.id}/eligibility`,l.variant==='s4-validated'?[`s4/${l.runtimeAlias}/targetEligibility`]:[`loadouts/${l.id}/targetEligibility`,`loadouts/${l.id}/confirmedTarget`]);
    checkValue(l.hitEligibility,`${l.id}/hitEligibility`,l.variant==='s4-validated'?[`s4/${l.runtimeAlias}/hitEligibility`]:[`loadouts/${l.id}/hitEligibility`,`loadouts/${l.id}/confirmedHit`]);
    if(l.stateScope!=='entity-instance/loadout-id'||(l.mode==='active'&&l.actionLock!=='exclusive'))fail(`instance/lock ${l.id}`);
    if(l.parentId&&(!loadouts.has(l.parentId)||loadouts.get(l.parentId).unitId!==l.unitId))fail(`parent ${l.id}`);
    for(const id of [...l.modifierIds,...l.summonUnitIds])if(!loadouts.has(id)&&!units.has(id))fail(`effect reference ${l.id}/${id}`);
    for(const id of l.modifierIds)if(!loadouts.has(id)||loadouts.get(id).unitId!==l.unitId||loadouts.get(id).mode==='active')fail(`modifier ownership ${l.id}/${id}`);
    for(const id of l.summonUnitIds)if(!units.has(id))fail(`summon reference ${l.id}/${id}`);
    for(const id of Object.values(l.conversionTargets??{}))if(!units.has(id as string))fail(`conversion reference ${l.id}/${id}`);
    for(const effect of l.effects??[])for(const [k,v]of Object.entries(effect.parameters??{}))checkValue(v,`${l.unitId}/${l.id}/effect/${k}`);
    if(l.variant==='restoration'&&l.sourceClause?.includes('＋击退')&&!l.parentId&&!l.effects?.some((e:any)=>e.semantic==='击退'))fail(`effect omitted ${l.id}`);
    if(l.parentId&&l.effects?.some((e:any)=>e.semantic==='击退'))fail(`effect attached to child ${l.id}`);
    for(const id of l.gapIds)if(!issues.has(id))fail(`gap ${id}`);
    if(l.variant==='s4-validated'&&Object.values(l.parameters).some((v:any)=>v.status==='pending-design'))fail(`runtime pending ${l.id}`);
  }
  // This explicit same-family case cannot be caught by a set-of-template check.
  const troll=c.units.find((u:any)=>u.legacyId==='iceandfire_if_troll');
  if(troll&&c.loadouts.filter((l:any)=>l.unitId===troll.id&&l.variant==='restoration'&&l.templateIds.includes('SK01')&&l.mode==='active').length!==2)fail('ordinary/heavy independent loadouts');
  const requiredRules:[string,string,string,unknown][]=[['cataclysm_wadjet','SK05','target','ground-and-air'],['warden','SK05','piercing',true],['iceandfire_cyclops','SK20','target','ground-and-air'],['iceandfire_dread_lich','M06','sourceDeathPreservesMark',true],['iceandfire_dread_lich','M06','conversionOnce',true],['alexsmobs_murmur','SK23','sharedPool',true],['alexsmobs_murmur','SK23','headOnlyReduction',true]];
  for(const [uid,family,key,value]of requiredRules)if(!c.loadouts.some((l:any)=>l.unitId===uid&&l.templateIds.includes(family)&&l.confirmedRules?.[key]===value))fail(`confirmed rule ${uid}/${key}`);
  for(const l of c.loadouts.filter((l:any)=>l.variant==='restoration')){
    if(l.confirmedRules?.cd!=='on-successful-start'||l.confirmedRules?.cancel!=='hard-control-or-death/no-refund')fail(`timing contract ${l.id}`);
    if(l.templateIds.includes('SK11')&&l.confirmedRules?.groundWindow!=='descent-start-through-rise-complete')fail(`dive window ${l.id}`);
    if(l.templateIds.includes('SK08')&&(l.confirmedRules?.lockPoint!=='at-mark-end'||l.confirmedRules?.followAfterLock!==false))fail(`fixed point ${l.id}`);
  }
  if(c.loadouts.filter((l:any)=>l.unitId==='witch'&&l.variant==='restoration'&&l.templateIds.includes('SK05')).length!==3)fail('three potion effect packages');
  return errors;
}

export function validateR2Matrix(matrix:any,cards:any[]):string[] {
  const ids=matrix.units.map((u:any)=>u.id);
  return ids.length===84&&new Set(ids).size===84&&cards.every(c=>ids.includes(c.id))?[]:['matrix identity mismatch'];
}
