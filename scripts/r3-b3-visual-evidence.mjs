/** Capture repeatable observation evidence from the production B3 fixtures. */
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const out='docs/design/game-mcfight/self-check/r3/b3-visual';
mkdirSync(out,{recursive:true});
const edge=[
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if(!edge)throw new Error('No installed Chromium-family browser available for local evidence capture');
const browser=await chromium.launch({headless:true,executablePath:edge});
const page=await browser.newPage({viewport:{width:1100,height:760}});
await page.goto('http://127.0.0.1:5173/games/game-mcfight/s2-visual.html',{waitUntil:'networkidle'});
const capture=async (label,option,steps)=>{
  await page.selectOption('#scenario',option);
  for(let i=0;i<steps;i++)await page.locator('#step').click();
  const text=await page.locator('#readout').innerText();
  await page.screenshot({path:`${out}/${label}.png`,fullPage:true});
  console.log(JSON.stringify({label,option,steps,readout:text.split('\n').slice(0,14)}));
};
await capture('01-charge','b3Charge',25);
await capture('02-dive-window','b3Dive',25);
await capture('03-transform','b3Transform',25);
await browser.close();
