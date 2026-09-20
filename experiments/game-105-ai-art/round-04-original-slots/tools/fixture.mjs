import {chromium} from 'playwright';import{mkdirSync,writeFileSync,readFileSync}from'node:fs';
const base='experiments/game-105-ai-art/round-04-original-slots';
const src=readFileSync('games/game-105/tower-session.ts','utf8');const section=src.split('const CARD_POOL:')[1].split('const AI_PENALTY_POOL')[0];
const questions=[...section.matchAll(/'([^']+)'/g)].map(m=>m[1]);const longest=questions.sort((a,b)=>b.length-a.length)[0];
writeFileSync(`${base}/specs/text-extremes.json`,JSON.stringify({longestMainQuestion:longest,length:longest.length,source:'games/game-105/tower-session.ts CARD_POOL',questions,cardLongestButton:'换一张（1）',globalLongestDynamicButton:'重开本局（N） has unbounded restart counter; no finite global maximum',summaryTemplate:'第 ${sequence} 块余波来自${title}。这是一条本局事实，可单独记下或跳过。',note:'Static HUD fixture, not a claimed physically reached state'},null,2));
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const records=[];
for(const candidate of ['baseline','A','B','C','D']){
 mkdirSync(`${base}/screenshots/${candidate}/fixture`,{recursive:true});
 for(const state of ['longest','summary','ai'])for(const [width,height] of [[1280,720],[800,450]]){
  await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:5197/${base}/fixture.html?state=${state}&candidate=${candidate}`);await page.waitForFunction(()=>window.__fixture?.ready);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
  const data=await page.evaluate(()=>[...document.querySelectorAll('#g105-probe-hud [id]')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{id:e.id,rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*1000)/1000),font:s.fontSize,color:s.color,padding:s.padding,gap:s.gap,text:e.childElementCount===0?e.textContent:null,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}}));
  records.push({candidate,state,width,height,data});await page.screenshot({path:`${base}/screenshots/${candidate}/fixture/${state}-${width}x${height}.png`,animations:'disabled'});
 }
}
const comparisons=records.filter(r=>r.candidate!=='baseline').map(r=>{const b=records.find(x=>x.candidate==='baseline'&&x.state===r.state&&x.width===r.width);return{candidate:r.candidate,state:r.state,width:r.width,identicalGeometryTypographyAndText:JSON.stringify(r.data)===JSON.stringify(b.data)}});
writeFileSync(`${base}/reports/fixture.json`,JSON.stringify({description:'Static original-HUD fixture, not actual gameplay screenshots',records,comparisons},null,2));await browser.close();console.log(JSON.stringify(comparisons));
