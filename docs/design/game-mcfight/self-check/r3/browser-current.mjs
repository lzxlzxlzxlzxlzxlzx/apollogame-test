import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[],trace=[];
page.on('pageerror',e=>errors.push(String(e)));
const save=async name=>{await page.screenshot({path:out+name+'.png',fullPage:true});trace.push({name,text:await page.locator('body').innerText()});};
try{
 await page.goto('http://localhost:5173/?game=game-mcfight');
 await page.locator('#r3-buy-alexscaves_atlatitan').waitFor();
 if(!(await page.locator('#r3-gold').innerText()).includes('1000'))throw Error('Wrong restoration gold');
 await save('r3-01-shop');
 await page.locator('#r3-next').click();await page.waitForFunction(()=>document.querySelector('#r3-page')?.textContent?.startsWith('2/'));
 await save('r3-02-page-two');await page.locator('#r3-prev').click();await page.locator('#r3-buy-alexscaves_atlatitan').waitFor();
 await page.locator('#r3-buy-alexscaves_atlatitan').click();await page.locator('#r3-buy-alexscaves_deep_one').click();
 await save('r3-03-purchase');await page.locator('#r3-deploy').click();await page.locator('#start-battle').waitFor();
 const box=await page.locator('canvas').boundingBox();if(!box)throw Error('Missing field');
 const p=(x,y)=>({x:box.x+(480+x*18)*box.width/960,y:box.y+(360+y*18)*box.height/720});
 for(const [fromX,x,y]of [[-15,-8,-2],[-9,-8,2]]){const from=p(fromX,14),to=p(x,y);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();await page.waitForTimeout(150);}
 await page.waitForFunction(()=>!document.querySelector('#start-battle')?.disabled);await save('r3-04-pointer-deploy');await page.locator('#start-battle').click();
 await page.waitForTimeout(10000);await save('r3-05-real-combat');
 if(errors.length)throw Error(errors.join('\n'));
}finally{writeFileSync(out+'browser-current.json',JSON.stringify({scope:'R3 currently runnable subset only; real session purchase, pointer placement and combat observation',errors,trace},null,2));await browser.close();}
