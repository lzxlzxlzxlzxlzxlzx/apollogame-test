import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve(import.meta.dirname,'../../..'), dir=await mkdtemp(join(tmpdir(),'gal-motion-'));
let browser;
try {
  await build({entryPoints:[join(root,'src/services/gal-ui/gal-ui-live-wheel.audit.ts')],bundle:true,platform:'browser',format:'iife',outfile:join(dir,'audit.js'),tsconfig:join(root,'tsconfig.json')});
  await writeFile(join(dir,'index.html'),'<div id=root style="width:1440px;height:900px"></div><script src=audit.js></script>');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage(); const url=pathToFileURL(join(dir,'index.html')).href; await page.goto(url); await page.waitForFunction(()=>window.__galAudit);
  await page.locator('#gal-home-settings').click(); await page.locator('#gal-settings-tab-display').click();
  const host=page.locator('#root'); if(await host.getAttribute('data-apollo-reduced-motion')) throw Error('default reduced');
  await page.locator('#gal-setting-reduced-motion-control label').click(); await page.waitForFunction(()=>window.__galAudit.reducedMotion());
  if((await host.getAttribute('data-apollo-reduced-motion'))===null) throw Error('work policy missing');
  await page.locator('#gal-settings-reset').click(); await page.waitForFunction(()=>!window.__galAudit.reducedMotion());
  if(await host.getAttribute('data-apollo-reduced-motion')) throw Error('reset did not clear');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.reload(); await page.waitForFunction(()=>window.__galAudit); if((await page.locator('#root').getAttribute('data-apollo-reduced-motion'))===null) throw Error('OS policy missing');
  await page.locator('#gal-home-settings').click(); await page.locator('#gal-settings-tab-display').click(); await page.locator('#gal-setting-reduced-motion-control label').click(); if(!await page.evaluate(()=>window.__galAudit.reducedMotion())) throw Error('OS+work missing');
  console.log('GAL reduced-motion browser work-policy/reset: PASS');
} finally { await browser?.close(); await rm(dir,{recursive:true,force:true}); }
