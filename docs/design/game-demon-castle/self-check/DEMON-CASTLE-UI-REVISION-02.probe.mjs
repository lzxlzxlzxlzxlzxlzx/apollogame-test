import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const mutation=process.env.LIFE_UI_PROTOTYPE_MUTATION;
let scratch;
let prototypeUrl=new URL('../demon-castle-ui-revision-01.dc.html',import.meta.url).href;
if(mutation){
  const changes={
    'entry-frame':['padding:0;border:0;border-radius:0;background:transparent;box-shadow:none','padding:0;border:2px solid #dcc18c;border-radius:50%;background:#192137;box-shadow:none'],
    'status-wrap':['.status-line span{font:inherit;display:inline}', '.status-line span{font:inherit;display:block}'],
    'hud-column':['flex-flow:row nowrap;align-items:flex-start;gap:16px','flex-flow:column nowrap;align-items:flex-start;gap:16px'],
  };
  assert.ok(Object.hasOwn(changes,mutation),'known mutation required');
  const [anchor,replacement]=changes[mutation];
  const source=readFileSync(fileURLToPath(prototypeUrl),'utf8');
  assert.equal(source.split(anchor).length,2,'mutation anchor hits exactly once');
  scratch=mkdtempSync(join(tmpdir(),'demon-ui-prototype-02-'));
  const base=new URL('../',import.meta.url).href;
  const target=join(scratch,'mutated.html');
  writeFileSync(target,source.replace(anchor,replacement).replace('<head>','<head><base href="'+base+'">'));
  prototypeUrl=pathToFileURL(target).href;
  console.log('PROTOTYPE-MUTATION',mutation,'anchor hit exactly once; isolated copy only');
}
const shots = mutation ? pathToFileURL(join(scratch,'shots')+sep) : new URL('./shots/DEMON-CASTLE-UI-REVISION-02/', import.meta.url);
mkdirSync(fileURLToPath(shots), { recursive: true });
let browser;
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(new URL('../demon-castle-ui-revision-01.approved-2026-10-15.dc.html', import.meta.url).href);
  await page.screenshot({ path: fileURLToPath(new URL('00-before-1440.png', shots)) });
  console.log('BASELINE: old prototype screenshot saved');
  const failures=[],errors=[],checks=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('requestfailed', r=>failures.push(r.url()));
  await page.goto(prototypeUrl);
  await page.screenshot({ path: fileURLToPath(new URL('01-overview-1440.png', shots)) });
  console.log('CANDIDATE: overview saved');
  const check=(label,value)=>{assert.ok(value,label);checks.push(label);};
  const shot=async name=>{
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
    await page.screenshot({path:fileURLToPath(new URL(name+'.png',shots))});
  };
  async function controls(action){const summary=page.locator('#review-tools summary');if(!await summary.isVisible())await page.keyboard.press('F2');else if(!await page.locator('#review-tools').evaluate(e=>e.open))await summary.click();await action();await summary.click();}
  async function mode(value){await controls(()=>page.locator('#demo-mode').selectOption(value));}
  async function metrics(label){
    const data=await page.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
      const ids=['tracker','world-status'];const groups=[...ids.map(id=>document.getElementById(id)),document.querySelector('.right-hud')];
      const rs=groups.map(rect);const overlaps=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i],b=rs[j];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2)overlaps.push([i,j]);}
      const line=document.querySelector('.status-line'),lineBox=rect(line),textNodes=['place','season','day','clock'].map(id=>document.getElementById(id));
      const faces=[...document.querySelectorAll('.entry .button-face')],pills=[...document.querySelectorAll('.resource')];
      return{viewport:[innerWidth,innerHeight],stage:rect(document.querySelector('.stage')),status:rs[1],groups:rs,overlaps,
        resourceText:[...document.querySelectorAll('.resource output')].map(e=>e.textContent.trim()),images:[...document.images].every(e=>e.complete&&e.naturalWidth>0),
        statusText:line.textContent,statusLine:lineBox,statusFits:line.scrollWidth<=line.clientWidth+1,
        typeStyles:textNodes.map(e=>{const c=getComputedStyle(e);return[c.fontFamily,c.fontSize,c.fontWeight,c.lineHeight].join('|');}),
        textBoxes:textNodes.map(rect),faceBoxes:faces.map(rect),resourceBoxes:pills.map(rect),
        bareFaces:faces.every(e=>{const c=getComputedStyle(e);return c.backgroundColor==='rgba(0, 0, 0, 0)'&&c.backgroundImage==='none'&&parseFloat(c.borderTopWidth)===0&&c.boxShadow==='none';}),
        bareButtons:[...document.querySelectorAll('.entry')].every(e=>{const c=getComputedStyle(e);return c.backgroundColor==='rgba(0, 0, 0, 0)'&&c.backgroundImage==='none'&&parseFloat(c.borderTopWidth)===0;}),
        approvedIcons:faces.every((e,i)=>e.querySelector('img')?.getAttribute('src')==='../../../public/games/game-demon-castle/art/ui/entry-'+['quest-scroll','backpack','profile'][i]+'.png'),
        railStyle:{direction:getComputedStyle(document.querySelector('.right-hud')).flexDirection,wrap:getComputedStyle(document.querySelector('.right-hud')).flexWrap,overflow:getComputedStyle(document.querySelector('.right-hud')).overflowX},
      };
    });
    check(label+': full viewport',data.stage.w===data.viewport[0]&&data.stage.h===data.viewport[1]);
    check(label+': status height >=56',data.status.h>=56);
    check(label+': status centered',Math.abs(data.status.x+data.status.w/2-data.viewport[0]/2)<2);
    check(label+': HUD regions do not overlap',data.overlaps.length===0);
    check(label+': HUD within viewport',data.groups.every(r=>r.x>=0&&r.right<=data.viewport[0]+1&&r.y>=0&&r.bottom<=data.viewport[1]));
    check(label+': two semantic number pills',data.resourceText.length===2&&data.resourceText.every(s=>/^[\d,]+$/.test(s)));
    check(label+': image loaded',data.images);
    check(label+': approved PNG entry icons',data.approvedIcons);
    check(label+': entry faces and buttons have no disk or border',data.bareFaces&&data.bareButtons);
    check(label+': single Chinese status line',data.statusText==='月影庭院 · 月相季·第5天 · 黎明'&&data.statusFits&&data.textBoxes.every(r=>Math.abs(r.y-data.textBoxes[0].y)<1));
    check(label+': uniform status font',new Set(data.typeStyles).size===1);
    check(label+': status text inside ribbon',data.statusLine.x>=data.status.x&&data.statusLine.right<=data.status.right&&data.statusLine.y>=data.status.y&&data.statusLine.bottom<=data.status.bottom);
    check(label+': resource left and entry right on one row',data.resourceBoxes.at(-1).right<=data.faceBoxes[0].x&&data.resourceBoxes.every(r=>Math.abs(r.y+r.h/2-data.faceBoxes[0].y-data.faceBoxes[0].h/2)<2));
    check(label+': horizontal rail never wraps',data.railStyle.direction==='row'&&data.railStyle.wrap==='nowrap');
    if(data.viewport[0]<=560)check(label+': explicit narrow horizontal scroll fallback',data.railStyle.overflow==='auto');
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
  for(const panel of ['quest','bag','profile']){
    const entry=page.locator('#entry-'+panel);let reached=false;
    for(let i=0;i<24;i++){await page.keyboard.press('Tab');if(await entry.evaluate(e=>e===document.activeElement)){reached=true;break;}}
    check(panel+': reachable by real Tab',reached);
    check(panel+': visible native focus',await entry.evaluate(e=>e.matches(':focus-visible')&&parseFloat(getComputedStyle(e).outlineWidth)>=3));
    await page.keyboard.press('Enter');check(panel+': native Enter opens',await page.locator('#side-panel').getAttribute('data-panel')===panel&&!await page.locator('#side-panel').isHidden());
    await page.keyboard.press('Escape');await entry.focus();await page.keyboard.press('Space');check(panel+': native Space opens',!await page.locator('#side-panel').isHidden());await page.keyboard.press('Escape');
  }
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
  check('resources change as DOM numbers',(await page.locator('#resource-dread').textContent())==='31');
  await controls(()=>page.locator('#demo-day').click());
  check('calendar updates as DOM text',(await page.locator('#day').textContent())==='·第6天'&&(await page.locator('#clock').textContent())==='黎明');
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
  for(const [width,height]of[[1920,1080],[1060,760],[760,900],[420,900],[375,812]]){
    await page.setViewportSize({width,height});await page.goto(prototypeUrl);
    report.viewports.push(await metrics(width+'x'+height));
    await shot('14-overview-'+width);
    await page.locator('#entry-quest').click();
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
    const b=await page.locator('#side-panel').boundingBox();check(width+': sidebar within viewport',b.x>=0&&b.x+b.width<=width+1&&b.y>=0&&b.y+b.height<=height+1);
    check(width+': sidebar does not cover entry keys',await page.locator('.right-hud').evaluate((e,y)=>e.getBoundingClientRect().bottom<=y,b.y));
    check(width+': world stays visible',await page.evaluate(()=>document.elementFromPoint(innerWidth*.1,document.getElementById('side-panel').getBoundingClientRect().top-8)?.id==='world'));
    await page.locator('#panel-close').click();
  }
  // Authoring-only stress values force the narrow rail to actually overflow.
  await page.evaluate(()=>document.querySelectorAll('.resource output').forEach(e=>{e.textContent='999999999999';}));
  const rail=page.locator('.right-hud');
  check('375: long values overflow horizontally, never wrap',await rail.evaluate(e=>e.scrollWidth>e.clientWidth&&getComputedStyle(e).flexWrap==='nowrap'));
  await rail.hover();await page.mouse.wheel(600,0);await page.waitForFunction(()=>document.querySelector('.right-hud').scrollLeft>0);
  check('375: narrow rail really scrolls',await rail.evaluate(e=>e.scrollLeft>0));await shot('15-narrow-scroll');
  await page.goto(prototypeUrl);
  await page.locator('#entry-quest').hover();
  check('375: hover name is visible and not clipped by scroll rail',await page.locator('#entry-quest .tip').evaluate(e=>{
    const r=e.getBoundingClientRect(),rail=document.querySelector('.right-hud').getBoundingClientRect();
    return getComputedStyle(e).opacity==='1'&&r.x>=rail.x&&r.right<=rail.right&&r.y>=rail.y&&r.bottom<=rail.bottom;
  }));await shot('17-narrow-hover');
  await mode('long');await page.keyboard.press('KeyJ');await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
  check('375: long tracker does not collide with sidebar',await page.evaluate(()=>document.getElementById('tracker').getBoundingClientRect().bottom<document.getElementById('side-panel').getBoundingClientRect().top));
  check('375: long tracker stays fully readable',await page.locator('#tracked-progress').evaluate(e=>e.scrollHeight<=e.clientHeight+1));await shot('16-narrow-long');
  check('375: authoring toolbar does not cover sidebar footer',!await page.locator('#review-tools').isVisible());
  await page.keyboard.press('F2');check('375: F2 can still expose authoring controls',await page.locator('#review-tools').evaluate(e=>e.open));await page.keyboard.press('F2');
  check('no script errors',errors.length===0);check('no failed file loads',failures.length===0);
  report.checkCount=checks.length;report.errors=errors;report.failedRequests=failures;
  assert.ok(!mutation,'a deliberately broken prototype must never reach success');
  writeFileSync(fileURLToPath(new URL('./DEMON-CASTLE-UI-REVISION-02.measurements.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
  console.log('PROTOTYPE: PASS · '+checks.length+' checks; screenshots saved; browser closes in finally');
} finally {
  await browser?.close();
  if(scratch){assert.ok(scratch.startsWith(resolve(tmpdir())+sep)&&scratch.includes('demon-ui-prototype-02-'));rmSync(scratch,{recursive:true,force:true});}
  console.log('Prototype browser closed; isolated mutation scratch cleaned.');
}
