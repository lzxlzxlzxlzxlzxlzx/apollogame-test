// Independent static browser check: opaque skin layering and hit area.
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../../..');
const direction = process.argv[2] ?? 'column';
if (!['row','column','grid'].includes(direction)) throw new Error('direction must be row, column, or grid');
const screenshot = resolve(import.meta.dirname, `pui-s2-opaque-layer-${direction}-independent.png`);
const source = `
  import { mountUI, apolloOnyx } from './src/ui/components/index.ts';
  const skin = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMjY0MDcwIi8+PC9zdmc+';
  const art = { skin, skinSize:{x:100,y:220}, skinPosition:'center', skinOutset:{x:8,y:5} };
  window.hitCount = 0;
  mountUI(document.getElementById('root'), {
    type:'Panel', id:'panel', props:{skin,skinSize:{x:100,y:160},skinPosition:'center',skinOutset:{x:8,y:5}},
    layout:{padding:24,gap:12,width:450,direction:'${direction}',cols:2}, children:[
      {type:'Label',id:'copy',props:{text:'面板文字必须在深色皮上层',color:'text'}},
      {type:'Button',id:'normal',props:{label:'普通按钮',action:'hit',...art}},
      {type:'Button',id:'hero',props:{label:'主操作',sub:'副标也必须可见',kind:'hero',action:'hit',...art}},
      {type:'Button',id:'disabled',props:{label:'禁用按钮',disabled:true,action:'hit',...art}}
    ]
  }, {hit:()=>{ window.hitCount++; }}, apolloOnyx);
`;
const bundle = await build({ stdin:{contents:source,resolveDir:root,sourcefile:'pui-s2-opaque-review.ts',loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife' });
const candidates = [chromium.executablePath?.(), 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));
let browser;
try {
  browser = await chromium.launch(executablePath ? {executablePath} : {});
  const context = await browser.newContext({viewport:{width:720,height:420},deviceScaleFactor:1});
  const page = await context.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#06080d"><div id="root"></div></body>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForTimeout(100);
  const evidence = await page.evaluate(() => {
    const ids = ['panel','copy','normal','hero','disabled'];
    const rects = Object.fromEntries(ids.map((id) => { const r=document.getElementById(id).getBoundingClientRect(); return [id,{x:r.x,y:r.y,w:r.width,h:r.height}]; }));
    const panel = document.getElementById('panel');
    const panelLayer = panel.querySelector(':scope > [data-ui-skin-layer]');
    const normal = document.getElementById('normal');
    const nr = normal.getBoundingClientRect();
    const centerHit = document.elementFromPoint(nr.x+nr.width/2,nr.y+nr.height/2);
    const outsideHit = document.elementFromPoint(nr.x-3,nr.y+nr.height/2);
    return {rects,panelLayerZ:getComputedStyle(panelLayer).zIndex,panelIsolation:getComputedStyle(panel).isolation,
      centerInside:normal.contains(centerHit)||centerHit===normal,
      outsideInside:normal.contains(outsideHit)||outsideHit===normal,
      normalDisabled:normal.disabled,
      disabledDisabled:document.getElementById('disabled').disabled,
      labelText:document.getElementById('copy').textContent,
      heroSub:document.getElementById('hero').textContent};
  });
  if (evidence.panelLayerZ !== '-1' || evidence.panelIsolation !== 'isolate') throw new Error(`Panel z-order ${evidence.panelLayerZ}/${evidence.panelIsolation}`);
  if (!evidence.centerInside || evidence.outsideInside || evidence.normalDisabled || !evidence.disabledDisabled) throw new Error(`Button hit-state ${JSON.stringify(evidence)}`);
  if (direction === 'column' && evidence.rects.normal.y < evidence.rects.copy.y + evidence.rects.copy.h) throw new Error(`Panel column collapsed ${JSON.stringify(evidence.rects)}`);
  if (direction === 'row' && evidence.rects.normal.x < evidence.rects.copy.x + evidence.rects.copy.w) throw new Error(`Panel row collapsed ${JSON.stringify(evidence.rects)}`);
  if (direction === 'grid' && (evidence.rects.normal.x < evidence.rects.copy.x + evidence.rects.copy.w || evidence.rects.hero.y < evidence.rects.copy.y + evidence.rects.copy.h)) throw new Error(`Panel grid collapsed ${JSON.stringify(evidence.rects)}`);
  if (!evidence.labelText.includes('面板文字') || !evidence.heroSub.includes('副标')) throw new Error('Visible text missing');
  await page.screenshot({path:screenshot});
  console.log(JSON.stringify({result:'PASS',direction,...evidence,screenshot}));
  await context.close();
} finally {
  await browser?.close();
}
