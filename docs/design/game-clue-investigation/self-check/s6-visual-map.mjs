// Read-only authoring measurement: isolated browser, existing Owner service, no production writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { detectBrowserRuntime, cartProbeFixture, startDevServer, stopDevServer } from '../../../../scripts/lib/render-harness.mjs';
const root = process.cwd();
const base = 'docs/design/game-clue-investigation/self-check';
const manifest = readFileSync(resolve(root, 'library/game-clue-investigation/manifest.json'));
const result = { manifestSha256: createHash('sha256').update(manifest).digest('hex'), canvas: [1440, 900], prototype: {}, formal: {} };
const isolated = process.argv.includes('--fixture');
const candidate = process.argv.includes('--candidate');
if(candidate && !isolated) throw new Error('Candidate measurement requires isolated fixture');
const dev = isolated ? await startDevServer(root, { port: 5728 }) : null;
let browser;
const platformFonts=async(page,selector)=>{const cdp=await page.context().newCDPSession(page);try{await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});return (await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}finally{await cdp.detach();}};
const measure = async (page, prototype) => page.evaluate(isPrototype => {
  const base = isPrototype ? document.querySelector('#stage').getBoundingClientRect() : document.querySelector('canvas').getBoundingClientRect();
  const selector = isPrototype
    ? '.top-card,.top-card>* , .progress,.progress>*,.case-list,.case-list>*,.utility,.utility>*,.hotspot,.archive-bar,.archive-bar>*,.veil.open,.veil.open article,.veil.open article>*,.evidence-art img,.actions>button'
    : '#investigation-ui [id],#investigation-ui [role="dialog"],#investigation-ui button:not([id]),[id^="cart-focus-object-"]';
  return [...document.querySelectorAll(selector)].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width && r.height && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden="true"]');
  }).map(el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { id: el.id || el.className || el.tagName, tag: el.tagName, text: (el.children.length ? '' : el.textContent).trim(),
      rect: [r.x-base.x,r.y-base.y,r.width,r.height].map(v => Math.round(v*100)/100),
      font: [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing],
      color:s.color, background:s.backgroundImage === 'none' ? s.backgroundColor : s.backgroundImage,
      border:[s.borderWidth,s.borderColor,s.borderRadius],padding:s.padding,opacity:s.opacity,
      overflow:s.overflow,fit:s.objectFit,position:s.objectPosition,transform:s.transform,blur:s.backdropFilter,
      animation:[s.animationDuration,s.animationName],disabled:el.disabled ?? null,
      feedback:el.getAttribute('data-pointer-feedback-state'),
      after:{text:getComputedStyle(el,'::after').content,opacity:getComputedStyle(el,'::after').opacity} };
  });
}, prototype);
try {
  browser = await chromium.launch({ headless: true, executablePath: detectBrowserRuntime().execPath });
  const p = await browser.newPage({ viewport: { width: 1480, height: 940 } });
  await p.goto(pathToFileURL(resolve(root,'docs/design/game-clue-investigation/prototype.dc.html')).href);
  for (const state of ['scene-idle','object-hover','object-pressed','flavor-result','clue-reveal','clue-collected','completed','exit-confirm','disabled']) {
    await p.selectOption('#stateSelect', state);
    await p.waitForTimeout(700);
    result.prototype[state] = await measure(p,true);
    if(state==='clue-reveal')result.prototypeTitleFonts=await platformFonts(p,'#evidenceTitle');
    if(candidate && state==='clue-reveal') await p.locator('#stage').screenshot({path:resolve(root,base,'shots/S6-ui02-prototype-color-reveal.png')});
  }
  const page = await browser.newPage({ viewport:{width:1440,height:900} });
  await page.route('**/api/generate/providers',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  if (isolated) {
    const fixture = cartProbeFixture(root, 'game-clue-investigation');
    if(candidate) fixture.manifest=JSON.parse(readFileSync(resolve(root,base,'S6-ui02.candidate.json')));
    await page.route('http://localhost:4000/api/status',route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
    await page.route('**/api/library',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture.entries)}));
    await page.route('**/api/library/game-clue-investigation/manifest',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture.manifest)}));
  }
  result.formalSource = isolated ? 'isolated local fixture 5728: frozen formal manifest; Owner5173 refused connection' : 'Owner localhost5173';
  await page.goto(`http://localhost:${dev?.port ?? 5173}/?game=lib:game-clue-investigation`);
  await page.locator('#case-heading').waitFor();
  const snap=async state => { result.formal[state]=await measure(page,false);await page.screenshot({path:resolve(root,base,`shots/${candidate?'S6-ui02':'S6-ui034'}-${state}.png`)}); };
  await snap('scene-idle');
  if(!candidate){
    result.focusMeasurements=[];
    for(const viewport of [{width:1440,height:900},{width:720,height:800}]){
      await page.setViewportSize(viewport);await page.waitForTimeout(100);
      for(const target of JSON.parse(manifest).presentation.focusTargets){
        const entity=JSON.parse(manifest).entities[target.entity];
        const actual=await page.locator(`#cart-focus-${target.entity}`).evaluate(el=>{let a=el.parentElement;while(a&&!a.style.top)a=a.parentElement;const s=getComputedStyle(el),r=a.getBoundingClientRect(),c=document.querySelector('canvas').getBoundingClientRect();return {top:parseFloat(a.style.top),size:s.fontSize,color:s.color,bottom:r.bottom,canvasY:c.y,scale:c.width/1440};});
        const mask=JSON.parse(readFileSync(resolve(root,'library/game-clue-investigation/art/index.json'))).assets.find(a=>a.id===entity.Clickable.hitMaskKey).spec;
        const drawnHeight=mask.height*Math.min(entity.Sprite.width/mask.width,entity.Sprite.height/mask.height);
        const top=entity.Transform.y-drawnHeight/2-target.labelGap;
        assert.ok(Math.abs(top-(entity.Transform.y-entity.Shape.height/2-8))<.001,'prototype slot top minus eight');
        assert.ok(Math.abs(actual.top-top)<.001);assert.equal(actual.size,'14px');assert.equal(actual.color,target.tone==='gold'?'rgb(243, 191, 103)':'rgb(126, 233, 236)');
        assert.ok(Math.abs(actual.bottom-(actual.canvasY+top*actual.scale))<.1);
        result.focusMeasurements.push({entity:target.entity,viewport,...actual});
      }
    }
    await page.setViewportSize({width:1440,height:900});
  }
  await page.mouse.move(243.359375,411.942708);
  await page.waitForTimeout(170);
  await snap('object-hover');
  await page.mouse.down();
  await page.locator('#cart-focus-object-lock[data-pointer-feedback-state="pressed"]').waitFor();
  await snap('object-pressed');
  await page.mouse.up();
  await page.locator('#clue-reveal-modal').waitFor();
  if(!candidate){result.dialogFrames=await page.locator('#clue-reveal-modal [data-modal-dialog]').evaluate(el=>{const a=el.getAnimations()[0];if(!a)throw Error('missing dialog animation');a.pause();const frames=[0,120,240].map(t=>{a.currentTime=t;const s=getComputedStyle(el);return {t,transform:s.transform,opacity:Number(s.opacity)};});a.finish();return frames;});assert.equal(result.dialogFrames[0].opacity,0);assert.ok(result.dialogFrames[1].opacity>0&&result.dialogFrames[1].opacity<1);assert.equal(result.dialogFrames[2].opacity,1);assert.match(result.dialogFrames[0].transform,/0.94/);}
  await page.waitForTimeout(300);
  await snap('clue-reveal');
  result.formalTitleFonts=await platformFonts(page,'#evidence-lock-title');
  if(!candidate){
    result.formalBodyFonts=await platformFonts(page,'#evidence-lock-text');
    assert.ok(result.formalTitleFonts.some(f=>f.postScriptName==='MicrosoftYaHei-Bold'));
    assert.ok(result.formalBodyFonts.some(f=>f.familyName==='Microsoft YaHei'));
    await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    result.realTabFocus=await page.locator('#lock-collect').evaluate(el=>{const s=getComputedStyle(el);return {visible:el.matches(':focus-visible'),border:s.borderTopWidth,color:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset};});
    assert.deepEqual(result.realTabFocus,{visible:true,border:'2px',color:'rgb(19, 156, 164)',width:'3px',offset:'3px'});
  }
  if(candidate) await page.screenshot({path:resolve(root,base,'shots/S6-ui02-candidate-reveal.png')});
  await page.locator('#lock-collect').click();
  await page.locator('#clue-collected-modal').waitFor();
  if(!candidate){result.stampFonts=await platformFonts(page,'#collection-stamp-text');result.stampCss=await page.locator('#collection-stamp-frame').evaluate(el=>{const s=getComputedStyle(el),t=getComputedStyle(document.querySelector('#collection-stamp-text'));return {border:s.borderTopWidth,color:s.borderTopColor,bg:s.backgroundColor,weight:t.fontWeight};});assert.deepEqual(result.stampCss,{border:'5px',color:'rgb(171, 61, 50)',bg:'rgba(0, 0, 0, 0)',weight:'900'});assert.ok(result.stampFonts.some(f=>f.familyName==='Microsoft YaHei'));}
  await snap('clue-collected');
  if(!candidate){
    await page.locator('#collection-stamp').evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>a.finish()));
    const actual=await page.locator('#collection-stamp-frame').boundingBox();
    const expected=result.prototype['clue-collected'].find(n=>n.id==='stamp').rect;
    assert.ok([actual.x,actual.y,actual.width,actual.height].every((v,i)=>Math.abs(v-expected[i])<.1));
    result.stampFinalRect=actual;
  }
  if(candidate) await page.screenshot({path:resolve(root,base,'shots/S6-ui02-candidate-collected.png')});
  await snap('disabled');
  await page.locator('#clue-collected-modal').waitFor({state:'detached'});
  await page.mouse.click(1126.732855,170.794258);
  await page.locator('#flavor-archive').waitFor();
  await page.waitForTimeout(250);
  await snap('flavor-result');
  await page.locator('#flavor-continue').click();
  await page.locator('#flavor-archive').waitFor({state:'detached'});
  await page.mouse.click(1056.503906,579.347656);
  await page.locator('#prints-collect').waitFor();
  await page.locator('#prints-collect').click();
  await page.locator('#investigation-completed-modal').waitFor();
  if(!candidate){result.completedFrames=await page.locator('#investigation-completed-modal [data-modal-dialog]').evaluate(el=>{const a=el.getAnimations()[0];a.pause();const frames=[0,300,600].map(t=>{a.currentTime=t;const s=getComputedStyle(el);return {t,transform:s.transform,opacity:Number(s.opacity),shadow:s.boxShadow};});a.finish();return frames;});assert.equal(result.completedFrames[0].opacity,0);assert.ok(result.completedFrames[1].opacity>0&&result.completedFrames[1].opacity<1);assert.equal(result.completedFrames[2].opacity,1);assert.match(result.completedFrames[2].shadow,/12px/);}
  await page.waitForTimeout(700);
  await snap('completed');
  await page.locator('#completed-restart').click();
  await page.locator('#investigation-completed-modal').waitFor({state:'detached'});
  await page.locator('#exit-investigation').click();
  await page.locator('#exit-confirm-modal').waitFor();
  await snap('exit-confirm');
  await page.locator('#exit-confirm').click();
  await page.locator('#investigation-cancelled-modal').waitFor();
  await snap('cancelled-extra');
  if(candidate) result.candidateSha256=createHash('sha256').update(readFileSync(resolve(root,base,'S6-ui02.candidate.json'))).digest('hex');
  {
    for(const [state,id,rect] of [
      ['clue-reveal','DIV',[310,170,820,560]],
      ['clue-reveal','evidence-image-slot',[362,296,716,274]],
      ['clue-reveal','evidence-lock-image',[369,303,702,260]],
      ['clue-reveal','lock-collect',[970,638.39,108,47]],
      ['clue-collected','DIV',[310,170,820,560]],
      ['clue-collected','collection-image-slot',[362,296,716,274]],
    ]) { const node=result.formal[state].find(r=>r.id===id);assert.ok(node,`missing ${state}/${id}`);assert.ok(node.rect.every((v,i)=>Math.abs(v-rect[i])<.1),`geometry ${id} ${node.rect}`); }
    const img=result.formal['clue-reveal'].find(r=>r.id==='evidence-lock-image');
    assert.equal(img.fit,'cover');assert.equal(img.position,'50% 0%');
    assert.ok(!result.formal['clue-reveal'].some(r=>r.id==='evidence-close'||r.text==='×'));
    assert.equal(createHash('sha256').update(readFileSync(resolve(root,'library/game-clue-investigation/manifest.json'))).digest('hex'),result.manifestSha256,'formal changed during candidate probe');
    result.candidateAssertions='6 exact rectangles + cover/top + no duplicate close chrome + formal unchanged';
  }
  writeFileSync(resolve(root,base,candidate?'S6-ui02-candidate.measurements.json':'S6-visual-map.measurements.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ok:true,manifestSha256:result.manifestSha256,prototypeStates:Object.keys(result.prototype),formalStates:Object.keys(result.formal)}));
} finally {
  await browser?.close();
  if(dev?.proc) {
    stopDevServer(dev.proc);
    if(process.platform==='win32' && dev.proc.exitCode===null) dev.proc.kill('SIGTERM');
    dev.proc.stdout?.destroy();dev.proc.stderr?.destroy();
  }
}
