import {chromium} from 'playwright';import {writeFileSync,mkdirSync} from 'node:fs';
const base='experiments/game-105-ai-art/round-03-layout';const run=process.argv[2]||'1';mkdirSync(`${base}/screenshots/collapse-${run}`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});const attempts=[];
try{for(const [i,coords] of [[650,400,1200,400],[650,500,1200,500],[590,450,100,450]].entries()){
 await page.goto('http://127.0.0.1:5196/experiments/game-105-ai-art/round-03-layout/index.html?layout=C&theme=plum');await page.waitForFunction(()=>document.querySelector('#g105-status')?.textContent?.includes('轮到你'));
 await page.mouse.move(coords[0],coords[1]);await page.mouse.down();
 for(let n=1;n<=36;n++){await page.mouse.move(coords[0]+(coords[2]-coords[0])*n/36,coords[1]+(coords[3]-coords[1])*n/36);await page.waitForTimeout(20);}
 const heldStatus=await page.locator('#g105-status').textContent();await page.waitForTimeout(5000);await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('#g105-status')?.textContent?.includes('这一局先到这里'),{},{timeout:16000}).catch(()=>{});
 const status=await page.locator('#g105-status').textContent();const passed=status.includes('这一局先到这里');const path=`${base}/screenshots/collapse-${run}/attempt-${i+1}.png`;
 await page.screenshot({path});attempts.push({coords,steps:36,stepDelayMs:20,heldStatus,status,passed,screenshot:path});if(passed)break;
}writeFileSync(`${base}/measurements/collapse-${run}.json`,JSON.stringify(attempts,null,2));console.log(JSON.stringify(attempts));}finally{await browser.close();}
