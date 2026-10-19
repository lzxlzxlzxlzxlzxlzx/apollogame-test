// Exact-anchor projection regression, bundled only in memory; never edits the
// shared presenter or a real World, save, descriptor, or browser profile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const path = new URL('../src/assembly/life-host/life-presenter.ts', import.meta.url);
const original = readFileSync(path, 'utf8');
const sha = (source) => createHash('sha256').update(source).digest('hex');
const anchor = 'calendarLabels ? `${seasonLabel}·第${calendar.dayOfSeason}天`';
assert.equal(original.split(anchor).length - 1, 1, 'projection ANCHOR must hit exactly once');

async function load(source) {
  const compiled = await build({ entryPoints: [path.pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true,
    platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    plugins: [{ name: 'in-memory-presenter', setup(plugin) {
      plugin.onLoad({ filter: /life-presenter\.ts$/ }, () => ({ contents: source, loader: 'ts' }));
    } }],
  });
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
}

function assertions(presenter) {
  const calendar = { seasonId: 'starlight', slotId: 'blue-shift', dayOfSeason: 9, totalDay: 37 };
  const position = { sceneId: 'test-square', x: 2, y: 3 };
  const before = JSON.stringify({ calendar, position });
  const world = {
    getComponent(id, type) {
      if (id === 'life:calendar' && type === 'LifeCalendar') return calendar;
      if (id === 'life:player' && type === 'LifePosition') return position;
      return undefined;
    },
    query() { return []; },
  };
  const configured = presenter.selectLifeHostView(world, {}, {}, { seasons: { starlight: '星火季' }, slots: { 'blue-shift': '晨风' } });
  assert.equal(configured.date, '星火季·第9天', 'guard: projection must use authored season and live day');
  assert.equal(configured.slot, '晨风', 'guard: projection must use authored slot');
  assert.equal(presenter.selectLifeHostView(world).date, 'Starlight 9日（第37天）', 'legacy date must be unchanged');
  assert.equal(JSON.stringify({ calendar, position }), before, 'read-only port data must remain unchanged');
}

assertions(await load(original));
console.info('BASELINE: 4 projection assertions pass');
let red = false;
try {
  const mutated = original.replace(anchor, 'calendarLabels ? `BROKEN·第${calendar.dayOfSeason}天`');
  assertions(await load(mutated));
} catch (error) {
  assert.match(error.message, /guard: projection must use authored season and live day/);
  red = true;
  console.info('RED projection: 1 exact anchor, correct authored-season assertion failed');
}
assert.ok(red, 'projection mutation must not survive');
assertions(await load(original));
assert.equal(sha(readFileSync(path, 'utf8')), sha(original));
console.info('RESTORED: 4 projection assertions pass; source unchanged; no files or processes left behind');
