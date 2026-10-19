// Exact-anchor recursion of the browser-safe contract, entirely in memory: no shared-tree edits.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const coreUrl = new URL('../src/authoring/life-host-descriptor-core.ts', import.meta.url);
const viewportUrl = new URL('../src/engine/protocol/life-viewport-profile.ts', import.meta.url);
const original = readFileSync(coreUrl, 'utf8');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const originalHash = hash(original);
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64')}`;
const viewportModule = moduleUrl(readFileSync(viewportUrl, 'utf8'));
const mutants = {
  'plain-text': ["if (UNSAFE_CALENDAR_TEXT.test(name))", 'if (false)'],
  reference: ["if (!known[kind].has(id))", 'if (false)'],
};
function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length - 1, 1, `ANCHOR must match exactly once: ${anchor}`);
  return source.replace(anchor, replacement);
}
const mutation = process.argv[2] === '--mutation' ? process.argv[3] : undefined;
let source = original;
if (mutation) {
  assert.ok(Object.hasOwn(mutants, mutation), 'unknown mutation');
  source = replaceOnce(source, ...mutants[mutation]);
  console.log(`ANCHOR ${mutation}: 1 exact hit`);
}
source = replaceOnce(source, "'../engine/protocol/life-viewport-profile.js'", JSON.stringify(viewportModule));
const core = await import(moduleUrl(source));
const host = {
  schema: 'zerocraft.life-host.v1', slug: 'game-calendar-proof', packagePath: 'life.json', assetSlotsPath: 'asset-slots.json',
  artSlug: 'game-calendar-proof', viewport: { profile: 'life-standard-v1' }, theme: 'starter',
  hud: { preset: 'life-standard-v1', calendarLabels: { seasons: { eclipse: '月相季' }, slots: { dawn: '黎明' } } },
  input: { preset: 'life-keyboard-v1' }, save: { namespace: 'life:game-calendar-proof:v1', schemaVersion: 1, autosave: 'life-commit-v1' },
};
function assertions() {
  const parsed = core.parseLifeHostDescriptor(host);
  assert.equal(core.validateLifeHostCalendarLabels(parsed, { seasons: [{ id: 'eclipse' }], slots: ['dawn', 'night'] }).ok, true, 'positive explicit calendar');
  const unsafe = structuredClone(host);
  unsafe.hud.calendarLabels.slots.dawn = '黎\u202e明';
  assert.equal(core.validateLifeHostDescriptor(unsafe).ok, false, 'guard: plain-text must reject bidi control');
  assert.equal(core.validateLifeHostCalendarLabels(parsed, undefined).ok, false, 'guard: reference must reject names missing from actual calendar');
  const invented = structuredClone(host);
  invented.hud.calendarLabels = { slots: { day: '白昼' } };
  assert.equal(core.validateLifeHostCalendarLabels(core.parseLifeHostDescriptor(invented), undefined).ok, false, 'guard: no invented day slot');
}
assertions();
if (mutation) throw new Error('mutation survived its guard');
console.log('BASELINE: 4 assertions pass');
for (const name of Object.keys(mutants)) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--mutation', name], { encoding: 'utf8', maxBuffer: 65536 });
  assert.equal(child.status, 1, `mutant ${name} must exit 1: ${child.error ?? child.stderr}`);
  assert.ok(child.stdout.includes(`ANCHOR ${name}: 1 exact hit`), `mutant ${name} did not hit its anchor`);
  assert.ok(child.stderr.includes(`guard: ${name} must reject`), `mutant ${name} failed for the wrong reason: ${child.stderr}`);
  console.log(`RED ${name}: exit 1; exact anchor; corresponding guard rejected mutation`);
}
assertions();
assert.equal(hash(readFileSync(coreUrl, 'utf8')), originalHash, 'shared source must remain byte-identical');
console.log(`RESTORED: 4 assertions pass; unchanged source ${originalHash}; no files or browser processes created`);
