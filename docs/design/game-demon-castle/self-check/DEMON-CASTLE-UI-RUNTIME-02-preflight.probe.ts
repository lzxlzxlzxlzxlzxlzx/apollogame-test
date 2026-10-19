import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLifeGamePackage } from '../../../../src/assembly/life-package-validate.js';
import { parseLifeHostDescriptor, validateLifeHostCalendarLabels, validateLifeHostDescriptor } from '../../../../src/authoring/life-host-descriptor-core.js';
import { renderNode, validateLayoutNode, type LayoutNode } from '../../../../src/ui/components/index.js';
import { canonicalLifeGenerationJson } from '../../../../src/authoring/life-generation-bundle.js';
import { buildLifeFormalUpdatePlan } from '../../../../src/authoring/life-materializer.js';
import { compileAndParseLifeGamePackage } from '../../../../src/assembly/life-package-compile.js';

// Read-only preflight: all mutations below are isolated in-memory copies.
const world = JSON.parse(readFileSync('games/game-demon-castle/life.json', 'utf8'));
const host = JSON.parse(readFileSync('games/game-demon-castle/life-host.json', 'utf8'));
assert.equal(validateLifeGamePackage(world).ok, true);
assert.equal(validateLifeHostDescriptor(host).ok, true);
assert.deepEqual(world.calendar.seasons, [{ id: 'eclipse', lengthDays: 14 }]);
assert.deepEqual(world.calendar.slots, ['dawn', 'night']);
assert.equal(host.hud.labels.date, '月相');

const titledWorld = structuredClone(world);
titledWorld.calendar.seasons[0].titleKey = '月相季';
const seasonReport = validateLifeGamePackage(titledWorld);
assert.equal(seasonReport.ok, false, 'calendar season title is not an existing authoring field');
console.info('reject/season-title', JSON.stringify(seasonReport.issues));

const titledHost = structuredClone(host);
titledHost.hud.calendarLabels = { seasons: { eclipse: '月相季' }, slots: { dawn: '黎明', night: '夜晚' } };
const hostReport = validateLifeHostDescriptor(titledHost);
// Before Owner A this exact input was rejected as unknown_field. After the
// authorized shared contract lands it must pass, with actual calendar refs.
assert.equal(hostReport.ok, true, JSON.stringify(hostReport.diagnostics));
assert.equal(validateLifeHostCalendarLabels(parseLifeHostDescriptor(titledHost), world.calendar).ok, true);
const unknownHost = structuredClone(titledHost);
unknownHost.hud.calendarLabels.seasons.missing = '不存在的季节';
assert.equal(validateLifeHostCalendarLabels(parseLifeHostDescriptor(unknownHost), world.calendar).ok, false);
console.info('decision/host-calendar-labels', 'Owner A shared mapping accepted; dangling ID rejected.');

const button: LayoutNode = {
  type: 'Button', id: 'read-only-frameless-proof',
  props: { label: '复兴任务', kind: 'quiet', icon: '/fixture/entry.png', iconOnly: { size: 60 }, skin: '', borderWidth: 0 },
  layout: { radius: 0, padding: 0 },
};
assert.deepEqual(validateLayoutNode(button), []);
const html = renderNode(button);
assert.ok(html.includes('aria-label="复兴任务"') && html.includes('data-apollo-icon-only'));
assert.ok(html.includes('background:transparent') && html.includes('border-radius:0px') && html.includes('border-width:var(--apollo-btn-border-width)'));
console.info('decision/frameless-button', 'Existing quiet + iconOnly + borderWidth:0 + radius:0 expresses a transparent native button; no PUI extension needed merely to remove the disk.');
for (const name of ['life.json', 'asset-slots.json', 'life-host.json', 'life-launcher.json']) {
  const bytes = readFileSync('games/game-demon-castle/' + name, 'utf8');
  assert.equal(bytes, canonicalLifeGenerationJson(JSON.parse(bytes)) + '\n', name + ' canonical bytes');
}
compileAndParseLifeGamePackage(world);
const plan = buildLifeFormalUpdatePlan({
  bundle: JSON.parse(readFileSync('docs/design/game-demon-castle/bundle.candidate.json', 'utf8')),
  descriptor: JSON.parse(readFileSync('docs/design/game-demon-castle/life-host.candidate.json', 'utf8')),
  entry: JSON.parse(readFileSync('docs/design/game-demon-castle/life-launcher.candidate.json', 'utf8')),
}, { workspaceRoot: process.cwd() });
assert.equal(plan.writesPerformed, false);
assert.deepEqual(plan.conflicts, []);
assert.equal(plan.currentFilesHash, plan.filesHash);
assert.equal(plan.filesHash, 'sha256:751d4f3f0bf2d38d29fd94b58d77fe747a4f747a6747d41d830b65405ebedca0');
console.info('commit/formal-readback', '4 canonical files, strict compiler/discovery and current/new hash match; zero writes.');
console.info('PREFLIGHT: PASS; no files, World state, or saves written. Owner A shared calendar labels are strictly validated.');
