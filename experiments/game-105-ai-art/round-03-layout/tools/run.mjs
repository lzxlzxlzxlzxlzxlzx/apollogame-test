import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const base=resolve('experiments/game-105-ai-art/round-03-layout');const run=process.argv[2]||'1';
mkdirSync(`${base}/screenshots/run-${run}`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const results=[];const states=[];
const url='http://127.0.0.1:5196/experiments/game-105-ai-art/round-03-layout/index.html';
async function shot(name){await page.screenshot({path:`${base}/screenshots/run-${run}/${name}.png`,animations:'disabled'});}
async function state(name){const status=await page.locator('#g105-status').textContent();states.push({name,status,card:await page.locator('#g105-interaction-card').count(),heart:await page.locator('#g105-heart').textContent()});await shot(name);}
async function open(){await page.goto(url+'?layout=C&theme=plum');await page.waitForFunction(()=>document.querySelector('#g105-status')?.textContent?.includes('轮到你'));}
async function quickReply(){if(await page.locator('#pilot-quick-select').count())await page.locator('#pilot-quick-select').selectOption('我记住了。');else await page.locator('[data-action="tower.response.quick"]').first().click();}
async function pull(){await page.mouse.move(650,220);await page.mouse.down();await page.mouse.move(650,550,{steps:24});await state('player-pulling');await page.mouse.up();await page.locator('#g105-interaction-card').waitFor();await page.waitForTimeout(150);}
async function measure(){return page.evaluate(()=>{
 const data=window.__pilot;const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
 const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
 const el=document.querySelector('#g105-interaction-card'),card=box(el),status=box(document.querySelector('#g105-controls')),canvas=box(document.querySelector('canvas')||document.querySelector('#fixture-scene'));
 const ref=data.config.towerReference.box1280;const scale=canvas.width/1280;
 const tower={x:canvas.x+ref[0]*scale,y:canvas.y+ref[1]*scale,width:ref[2]*scale,height:ref[3]*scale};tower.right=tower.x+tower.width;tower.bottom=tower.y+tower.height;
 const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const controls=[...el.querySelectorAll('input,button,select')].filter(visible).map(e=>({id:e.id,rect:box(e),disabled:e.disabled,font:parseFloat(getComputedStyle(e).fontSize),text:e.textContent}));
 const labels=[...el.querySelectorAll('[id]')].filter(e=>/^g105-card-(title|text|kicker|safety)$/.test(e.id)).map(e=>({id:e.id,rect:box(e),font:parseFloat(getComputedStyle(e).fontSize),color:getComputedStyle(e).color,text:e.textContent}));
 const inside=(a,b)=>a.x>=b.x-.5&&a.y>=b.y-.5&&a.right<=b.right+.5&&a.bottom<=b.bottom+.5;
 const input=controls.find(c=>c.id==='g105-response-input'),buttons=controls.filter(c=>c.id!=='g105-response-input');const area=card.width*card.height/(innerWidth*innerHeight);const ta=overlap(card,tower),sa=overlap(card,status);
 const limit=data.config.limits[data.environment.mode+'Area'];
 return {layout:data.scheme,theme:data.palette,expanded:data.expanded,width:innerWidth,height:innerHeight,mode:data.environment.mode,card,status,tower,validation:data.validation,gameCanvas:canvas,gameViewportShare:canvas.width*canvas.height/(innerWidth*innerHeight),towerEnvelopeMethod:data.config.towerReference.method,cardAreaRatio:area,towerOverlapArea:ta,towerOverlapRatio:ta/(tower.width*tower.height),statusOverlapArea:sa,outsideScreen:!inside(card,{x:0,y:0,right:innerWidth,bottom:innerHeight}),allControlsInside:controls.every(c=>inside(c.rect,card)),allLabelsInside:labels.every(c=>inside(c.rect,card)),minTextFont:Math.min(...labels.map(l=>l.font)),inputHeight:input?.rect.height??null,minButtonWidth:Math.min(...buttons.map(b=>b.rect.width)),minButtonHeight:Math.min(...buttons.map(b=>b.rect.height)),visibleGameAreaRatio:1-overlap(card,canvas)/(canvas.width*canvas.height),controls,labels,areaPass:area<=limit,towerPass:ta/(tower.width*tower.height)<=(data.environment.mode==='desktop'?0:.05),statusPass:sa===0};
 });}
try{
 await open();await state('opening');await pull();await state('interaction-collapsed');
 await page.locator('#pilot-answer').click();states.push({name:'expand-button',expanded:await page.evaluate(()=>window.__pilot.expanded)});await page.locator('#pilot-collapse').click();states.push({name:'collapse-button',expanded:await page.evaluate(()=>window.__pilot.expanded)});
 for(const [width,height] of [[1280,720],[1024,576],[800,450],[667,375],[390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(120);
  for(const [layout,expanded] of [['A',false],['B',false],['C',false],['C',true]]){
   await page.evaluate(({layout,expanded})=>window.__pilot.set(layout,'plum',expanded),{layout,expanded});await page.waitForTimeout(50);
   const name=`${layout}-${expanded?'expanded':'default'}-${width}x${height}`;const result={...await measure(),screenshot:`screenshots/run-${run}/${name}.png`};results.push(result);await shot(name);
   if(run==='1'){
    mkdirSync(`${base}/layouts/frozen-inputs`,{recursive:true});
    await page.locator('#g105-interaction-card').screenshot({path:`${base}/layouts/frozen-inputs/${name}-card.png`,animations:'disabled'});
    await page.locator('#g105-interaction-card').evaluate(e=>e.style.visibility='hidden');await page.screenshot({path:`${base}/layouts/frozen-inputs/${name}-backdrop.png`,animations:'disabled'});await page.locator('#g105-interaction-card').evaluate(e=>e.style.visibility='');
   }
   if(layout==='C'&&expanded){await page.locator('#g105-response-input').focus();const focus=await measure();result.focusWithoutNativeKeyboard={allControlsInside:focus.allControlsInside,outsideScreen:focus.outsideScreen};await shot(`focused-${width}x${height}`);await page.locator('#g105-response-input').blur();}
  }
 }
 await page.setViewportSize({width:800,height:450});
 for(const theme of ['light','plum','contrast']){await page.evaluate(t=>window.__pilot.set('C',t,true),theme);await page.waitForTimeout(50);results.push({...await measure(),comparison:'theme'});await shot(`theme-${theme}`);}
 await page.evaluate(()=>window.__pilot.set('C','plum',true));
 await page.locator('#g105-response-input').focus();await state('input-focused');
 states.push({name:'focus-outline',outline:await page.locator('#g105-response-input').evaluate(e=>getComputedStyle(e).outline)});
 await page.locator('#g105-response-input').fill('这一刻很安心');states.push({name:'keyboard-input',value:await page.locator('#g105-response-input').inputValue()});
 await quickReply();await state('quick-reply');states.push({name:'quick-value',value:await page.locator('#g105-response-input').inputValue()});
 const before=await page.locator('#g105-card-text').textContent();await page.locator('[data-action="tower.interaction.swap"]').click();await state('swapped');states.push({name:'swap-check',before,after:await page.locator('#g105-card-text').textContent(),disabled:await page.locator('[data-action="tower.interaction.swap"]').isDisabled()});
 await quickReply();await page.locator('[data-action="tower.interaction.submit"]').click();await state('submitted');
 await page.waitForTimeout(10000);await state('after-ai-wait');
 await page.locator('[data-action="tower.restart"]').click();await state('restarted');await page.setViewportSize({width:1280,height:800});await open();await pull();await page.evaluate(()=>window.__pilot.set('A','plum'));await page.locator('[data-action="tower.interaction.skip"]').click();await state('skipped');
 await open();await page.mouse.move(650,400);await page.mouse.down();await page.mouse.move(1200,400,{steps:36});await page.waitForTimeout(8500);await page.mouse.up();await page.waitForFunction(()=>document.querySelector('#g105-status')?.textContent?.includes('这一局先到这里'),{},{timeout:20000}).catch(()=>{});await state('collapse-attempt');
 writeFileSync(`${base}/measurements/run-${run}.json`,JSON.stringify({results,states,errors,softKeyboard:'not-verified: desktop headless browser cannot display native mobile IME'},null,2)+'\n');
 console.log(JSON.stringify({run,cases:results.length,errors,states}));
}catch(e){console.error(errors);await shot('failure');writeFileSync(`${base}/measurements/run-${run}-incomplete.json`,JSON.stringify({results,states,errors,error:String(e)},null,2));throw e;}finally{await browser.close();}
