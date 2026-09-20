import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const base='experiments/game-105-ai-art/round-04-original-slots',variant=process.argv[2]||'baseline';
const out=`${base}/${variant==='baseline'?'baseline':'screenshots/'+variant}`;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],records=[];
page.on('pageerror',e=>errors.push(String(e)));
const url=`http://127.0.0.1:5197/${base}/index.html`+(variant==='baseline'?'':`?candidate=${variant}`);
async function open(){await page.setViewportSize({width:1280,height:800});await page.goto(url);await page.waitForFunction(()=>document.querySelector('#g105-status')?.textContent?.includes('轮到你'));await page.evaluate(()=>document.fonts.ready);}
async function pull(){await page.mouse.move(650,220);await page.mouse.down();await page.mouse.move(650,550,{steps:24});await page.mouse.up();await page.locator('#g105-interaction-card').waitFor();await page.waitForTimeout(300);}
async function record(name){
 const data=await page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
 const elements=[...document.querySelectorAll('#g105-probe-hud [id],#g105-probe-hud img,canvas')].map(e=>{const s=getComputedStyle(e);return {id:e.id||e.tagName,tag:e.tagName,rect:rect(e),layoutWidth:e.offsetWidth,layoutHeight:e.offsetHeight,text:e.matches('button,input')?e.value||e.textContent:e.childElementCount===0?e.textContent:null,src:e.getAttribute('src'),background:s.backgroundImage,backgroundSize:s.backgroundSize,objectFit:s.objectFit,borderImage:s.borderImageSource,slice:s.borderImageSlice,borderWidth:s.borderImageWidth,repeat:s.borderImageRepeat,color:s.color,fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,gap:s.gap,transform:s.transform,overflow:s.overflow,disabled:e.disabled??null}});
 return {width:innerWidth,height:innerHeight,status:document.querySelector('#g105-status')?.textContent,heart:document.querySelector('#g105-heart')?.textContent,elements};
 });
 await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});records.push({name,...data});
}
try{
 await open();await record('opening');await pull();
 for(const [width,height] of [[1280,720],[1024,576],[800,450],[667,375],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(650);await record(`interaction-${width}x${height}`);}
 await page.setViewportSize({width:1280,height:720});await page.locator('#g105-response-input').fill('这一刻很安心');await record('input');await page.locator('#g105-quick-one').click();await record('quick');await page.locator('#g105-interaction-swap').click();await record('swap');await page.locator('#g105-quick-one').click();await page.locator('#g105-interaction-complete').click();await record('submit');await page.waitForTimeout(10000);await record('ai');
 await open();await pull();await page.setViewportSize({width:800,height:450});await page.locator('#g105-interaction-skip').click();await record('skip');
 writeFileSync(`${base}/reports/runtime-${variant}.json`,JSON.stringify({variant,records,errors,nativeKeyboard:'not tested'},null,2));console.log(JSON.stringify({variant,records:records.map(r=>({name:r.name,status:r.status,card:r.elements.find(e=>e.id==='g105-interaction-card')})),errors}));
}finally{await browser.close();}
