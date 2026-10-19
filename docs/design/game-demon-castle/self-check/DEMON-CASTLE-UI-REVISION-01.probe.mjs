import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const shots = new URL('./shots/DEMON-CASTLE-UI-REVISION-01/', import.meta.url);
mkdirSync(fileURLToPath(shots), { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(new URL('../demon-castle-ui-demo.html', import.meta.url).href);
  await page.screenshot({ path: fileURLToPath(new URL('00-before-1440.png', shots)) });
  console.log('BASELINE: old prototype screenshot saved');
  const failures=[],errors=[],checks=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('requestfailed', r=>failures.push(r.url()));
  await page.goto(new URL('../demon-castle-ui-revision-01.approved-2026-10-15.dc.html', import.meta.url).href);
  await page.screenshot({ path: fileURLToPath(new URL('01-overview-1440.png', shots)) });
  console.log('CANDIDATE: overview saved');
  const check=(label,value)=>{assert.ok(value,label);checks.push(label);};
  const shot=async name=>{
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
    await page.screenshot({path:fileURLToPath(new URL(name+'.png',shots))});
  };
  async function controls(action){const summary=page.locator('#review-tools summary');if(!await page.locator('#review-tools').evaluate(e=>e.open))await summary.click();await action();await summary.click();}
  async function mode(value){await controls(()=>page.locator('#demo-mode').selectOption(value));}
  async function metrics(label){
    const data=await page.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
      const ids=['tracker','world-status'];const groups=[...ids.map(id=>document.getElementById(id)),document.querySelector('.right-hud')];
      const rs=groups.map(rect);const overlaps=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i],b=rs[j];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2)overlaps.push([i,j]);}
      return{viewport:[innerWidth,innerHeight],stage:rect(document.querySelector('.stage')),status:rs[1],groups:rs,overlaps,resourceText:[...document.querySelectorAll('.resource')].map(e=>e.textContent.trim()),images:[...document.images].every(e=>e.complete&&e.naturalWidth>0)};
    });
    check(label+': full viewport',data.stage.w===data.viewport[0]&&data.stage.h===data.viewport[1]);
    check(label+': status height >=56',data.status.h>=56);
    check(label+': status centered',Math.abs(data.status.x+data.status.w/2-data.viewport[0]/2)<2);
    check(label+': HUD regions do not overlap',data.overlaps.length===0);
    check(label+': HUD within viewport',data.groups.every(r=>r.x>=0&&r.right<=data.viewport[0]+1&&r.y>=0&&r.bottom<=data.viewport[1]));
    check(label+': three icon-number pills',data.resourceText.length===3&&data.resourceText.every(s=>/^[\d,]+$/.test(s)));
    check(label+': image loaded',data.images);
    return data;
  }
  const report={main:await metrics('1440x900'),viewports:[],checks};
  report.contrast=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement);
    const rgb=s=>s.startsWith('#')?s.slice(1).match(/../g).map(x=>parseInt(x,16)):s.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance=c=>rgb(c).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const samples=[['tracker',getComputedStyle(document.getElementById('tracked-title')).color,root.getPropertyValue('--paper').trim()],['status palette',getComputedStyle(document.getElementById('world-status')).color,root.getPropertyValue('--night').trim()],['resource',getComputedStyle(document.querySelector('.resource')).color,getComputedStyle(document.querySelector('.resource')).backgroundColor],['sidebar',getComputedStyle(document.getElementById('panel-title')).color,root.getPropertyValue('--paper').trim()]];
    return samples.map(([name,fg,bg])=>{const a=luminance(fg),b=luminance(bg);return{name,fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
  });
  check('declared readable surface palette >=4.5',report.contrast.every(p=>p.ratio>=4.5));
  await page.locator('#entry-quest').click();
  check('J pointer opens quest',await page.locator('#side-panel').getAttribute('data-panel')==='quest');
  await shot('02-quests');
  await page.getByRole('tab',{name:'已完成',exact:true}).click();check('completed quest tab has real empty state',await page.locator('.empty').count()===1);
  await page.locator('.empty button').click();check('completed tab empty can return to active',await page.locator('.quest-row').count()===3);
  await page.locator('[data-track="1"]').click();
  check('tracking changes visible HUD',(await page.locator('#tracked-title').textContent())==='温室的裂纹');
  await shot('03-tracking-feedback');
  await page.locator('#entry-bag').click();
  check('I pointer changes shared sidebar',await page.locator('#side-panel').getAttribute('data-panel')==='bag');
  check('exactly one sidebar',await page.locator('.side-panel').count()===1);
  await page.getByRole('button',{name:'影矿 ×3',exact:true}).click();
  check('bag selection changes visible detail',(await page.locator('.bag-detail h3').textContent())==='影矿');
  await shot('04-inventory');
  await controls(()=>page.locator('#demo-resources').click());
  check('resources change as DOM numbers',(await page.locator('#resource-coin').textContent())==='2,495');
  await controls(()=>page.locator('#demo-day').click());
  check('calendar updates as DOM text',(await page.locator('#day').textContent())==='第 13 天'&&(await page.locator('#clock').textContent())==='08:10');
  await page.keyboard.press('KeyC');
  check('C opens profile',await page.locator('#side-panel').getAttribute('data-panel')==='profile');
  await shot('05-profile');
  await mode('long');
  check('long tracker text not clipped',await page.locator('#tracked-progress').evaluate(e=>e.scrollHeight<=e.clientHeight+1));
  await page.locator('#panel-body').hover();await page.mouse.wheel(0,850);
  await page.waitForFunction(()=>document.getElementById('panel-body').scrollTop>0);
  check('long profile scrolls',await page.locator('#panel-body').evaluate(e=>e.scrollHeight>e.clientHeight&&e.scrollTop>0));
  await shot('06-profile-scroll');
  await page.keyboard.press('Escape');check('Escape closes sidebar',await page.locator('#side-panel').isHidden());
  await shot('07-long-tracker');
  for(const [key,panel]of[['KeyJ','quest'],['KeyI','bag'],['KeyC','profile']]){
    await page.keyboard.press(key);check(panel+': keyboard opens',await page.locator('#side-panel').getAttribute('data-panel')===panel);
    await mode('empty');check(panel+': safe empty state',await page.locator('.empty').count()===1);
    await shot('08-empty-'+panel);
    await page.locator('.empty button').click();check(panel+': return from empty',await page.locator('.empty').count()===0);
    await page.locator('#panel-close').click();check(panel+': close button works',await page.locator('#side-panel').isHidden());
  }
  await page.keyboard.press('KeyJ');await mode('long');
  await page.locator('#panel-body').hover();await page.mouse.wheel(0,1000);await page.waitForFunction(()=>document.getElementById('panel-body').scrollTop>0);
  await shot('09-quests-scroll');await page.keyboard.press('Escape');
  await page.keyboard.press('KeyI');await mode('long');check('long bag has 60 slots',await page.locator('.slot').count()===60);
  await page.locator('#panel-body').hover();await page.mouse.wheel(0,650);await page.waitForFunction(()=>document.getElementById('panel-body').scrollTop>0);
  await shot('10-inventory-scroll');await page.keyboard.press('Escape');await mode('normal');
  await page.locator('#entry-quest').hover();await shot('11-button-hover');
  check('real hover feedback',await page.locator('#entry-quest .button-face').evaluate(e=>getComputedStyle(e).transform.endsWith('-3)')));
  const box=await page.locator('#entry-quest').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+25);await page.mouse.down();await shot('12-button-pressed');check('real pressed feedback',await page.locator('#entry-quest .button-face').evaluate(e=>getComputedStyle(e).transform.endsWith('3)')));await page.mouse.up();await page.keyboard.press('Escape');
  await controls(()=>page.locator('#button-state').selectOption('disabled'));await page.keyboard.press('KeyC');
  check('disabled C cannot open',await page.locator('#side-panel').isHidden());await shot('13-button-disabled');
  await controls(()=>page.locator('#button-state').selectOption('default'));
  for(const [width,height]of[[1920,1080],[1060,760],[760,900]]){
    await page.setViewportSize({width,height});await page.goto(new URL('../demon-castle-ui-revision-01.approved-2026-10-15.dc.html',import.meta.url).href);
    report.viewports.push(await metrics(width+'x'+height));
    await shot('14-overview-'+width);
    await page.locator('#entry-quest').click();
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
    const b=await page.locator('#side-panel').boundingBox();check(width+': sidebar within viewport',b.x>=0&&b.x+b.width<=width+1&&b.y>=0&&b.y+b.height<=height+1);
    check(width+': sidebar does not cover entry keys',await page.locator('.right-hud').evaluate((e,y)=>e.getBoundingClientRect().bottom<=y,b.y));
    check(width+': world stays visible',await page.evaluate(()=>document.elementFromPoint(innerWidth*.1,innerHeight*.45)?.id==='world'));
    await page.locator('#panel-close').click();
  }
  check('no script errors',errors.length===0);check('no failed file loads',failures.length===0);
  report.checkCount=checks.length;report.errors=errors;report.failedRequests=failures;
  writeFileSync(fileURLToPath(new URL('./DEMON-CASTLE-UI-REVISION-01.measurements.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
  console.log('PROTOTYPE: PASS · '+checks.length+' checks; screenshots saved; browser closes in finally');
} finally { await browser.close(); }
