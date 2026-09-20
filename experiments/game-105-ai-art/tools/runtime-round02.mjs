import {chromium} from 'playwright';
import {detectBrowserRuntime} from '../../../scripts/lib/render-harness.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('experiments/game-105-ai-art/runtime-preview/round-02');mkdirSync(out,{recursive:true});
const run=process.argv[2]||'1';const browser=await chromium.launch({headless:true,executablePath:detectBrowserRuntime().execPath});
const results=[];
try{
 for(const mode of ['original-ink','ink-proposal']){
 const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];const loaded=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());if(r.url().includes('candidate-01-resized'))loaded.push(r.status());});
 await page.goto('http://127.0.0.1:5195/experiments/game-105-ai-art/runtime-preview/index.html'+(mode==='ink-proposal'?'?ink':''),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(4500);
 await page.mouse.move(650,220);await page.mouse.down();await page.mouse.move(650,550,{steps:24});await page.mouse.up();
 await page.locator('[data-action="tower.interaction.submit"]').waitFor({state:'visible',timeout:15000});
 await page.waitForTimeout(300);
 for(const size of [{width:1280,height:720},{width:800,height:450}]){
 await page.setViewportSize(size);await page.waitForTimeout(300);
 const measures=await page.evaluate(()=>{
  const panel=document.querySelector('#g105-interaction-card');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const box=rect(panel);
  const controls=[...panel.querySelectorAll('input,button')].map(e=>({id:e.id,rect:rect(e),fontSize:getComputedStyle(e).fontSize,text:e.textContent,value:e.value}));
  const labels=['g105-card-title','g105-card-text','g105-card-safety'].map(id=>{const e=document.getElementById(id);return {id,text:e.textContent,color:getComputedStyle(e).color,fontSize:getComputedStyle(e).fontSize}});
  return {box,controls,labels,occupancy:box.width*box.height/(innerWidth*innerHeight),allControlsInside:controls.every(c=>c.rect.x>=box.x&&c.rect.y>=box.y&&c.rect.right<=box.right+.1&&c.rect.bottom<=box.bottom+.1&&c.rect.right<=innerWidth&&c.rect.bottom<=innerHeight),skin:getComputedStyle(panel).borderImageSource};
 });
 const name=`${mode}-${size.width}x${size.height}`;
 await page.screenshot({path:resolve(out,`${name}-run-${run}.png`)});
 await page.locator('#g105-interaction-card').screenshot({path:resolve(out,`${name}-card-run-${run}.png`),animations:'disabled'});
 if(run==='1'){
  await page.locator('#g105-interaction-card').evaluate(e=>e.style.visibility='hidden');
  await page.screenshot({path:resolve(out,`${name}-backdrop.png`)});
  await page.locator('#g105-interaction-card').evaluate(e=>e.style.visibility='');
 }
 results.push({mode,size,...measures,errors,assetLoaded:loaded.includes(200)});
 }
 await page.locator('#g105-response-input').fill('这一刻很安心');
 const inputWorks=await page.locator('#g105-response-input').inputValue()==='这一刻很安心';
 await page.locator('[data-action="tower.response.quick"]').first().click();
 const quickWorks=await page.locator('#g105-response-input').inputValue()==='我记住了。';
 await page.locator('[data-action="tower.interaction.submit"]').click();await page.waitForTimeout(200);
 const heartText=await page.locator('#g105-heart').textContent();
 await page.screenshot({path:resolve(out,`${mode}-after-submit-run-${run}.png`)});
 await page.waitForTimeout(900);
 const aiStatus=await page.locator('#g105-status').textContent();
 await page.screenshot({path:resolve(out,`${mode}-ai-run-${run}.png`)});
 await page.locator('[data-action="tower.restart"]').click();await page.waitForTimeout(200);
 results.push({mode,inputWorks,quickWorks,heartText,aiStatus,restartWorks:await page.locator('#g105-interaction-card').count()===0});
 await page.close();
 }
 writeFileSync(resolve(out,`runtime-check-run-${run}.json`),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}
