import {chromium} from 'playwright';import{mkdirSync,writeFileSync}from'node:fs';
const base='experiments/game-105-ai-art/round-05-multi-assets',mode=process.argv[2]||'baseline',run=process.argv[3]||'1',out=`${base}/background/${mode==='baseline'?'baseline':'screenshots/run-'+run}`;
mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],records=[];page.on('pageerror',e=>errors.push(String(e)));
async function measure(){return page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
 const ui=[...document.querySelectorAll('#g105-probe-hud [id],#g105-probe-hud img')].map(e=>{const s=getComputedStyle(e);return{id:e.id||'img',rect:rect(e),text:e.childElementCount===0?e.textContent:null,font:s.fontSize,color:s.color,padding:s.padding,gap:s.gap,transform:s.transform,src:e.getAttribute('src'),image:s.backgroundImage,borderImage:s.borderImageSource}});
 return{width:innerWidth,height:innerHeight,selected:window.__bgLab.selected,scene:window.__bgLab.getScene(),ui,materials:window.__measureMaterials(),status:document.querySelector('#g105-status')?.textContent,heart:document.querySelector('#g105-heart')?.textContent};
 });}
try{
 await page.goto(`http://127.0.0.1:5198/${base}/index.html?inspect=1`);await page.waitForFunction(()=>window.__bgLab?.ready&&document.querySelector('#g105-status')?.textContent?.includes('轮到你'));await page.evaluate(()=>window.__bgLab.set('baseline'));await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/opening.png`,animations:'disabled'});
 await page.mouse.move(650,220);await page.mouse.down();await page.mouse.move(650,550,{steps:24});await page.mouse.up();await page.locator('#g105-interaction-card').waitFor();await page.waitForTimeout(350);
 for(const[width,height]of[[1280,720],[1024,576],[800,450],[667,375],[390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(700);
  for(const candidate of mode==='baseline'?['baseline']:['baseline','A','B','C']){
   await page.evaluate(k=>window.__bgLab.set(k),candidate);await page.waitForTimeout(60);const r=await measure();r.screenshot=`${out.split(base+'/')[1]}/${candidate}-${width}x${height}.png`;records.push(r);await page.screenshot({path:`${out}/${candidate}-${width}x${height}.png`,animations:'disabled'});
  }
 }
 if(mode!=='baseline'){
  // UI integration evidence: switch back without reboot; retain typed response and current status.
  await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(700);await page.locator('#g105-response-input').fill('背景切换保留输入');const before=await measure();
  for(const k of ['A','B','C','baseline'])await page.evaluate(k=>window.__bgLab.set(k),k);
  const after=await measure();records.push({switchTest:{beforeStatus:before.status,afterStatus:after.status,value:await page.locator('#g105-response-input').inputValue(),selected:after.selected}});
 }
 writeFileSync(`${base}/background/reports/${mode==='baseline'?'baseline':`runtime-${run}`}.json`,JSON.stringify({mode,run,records,errors},null,2));console.log(JSON.stringify({mode,run,cases:records.length,errors}));
}catch(e){await page.screenshot({path:`${out}/failure.png`});writeFileSync(`${base}/background/reports/${mode}-${run}-failure.json`,JSON.stringify({records,errors,error:String(e)},null,2));throw e;}finally{await browser.close();}
