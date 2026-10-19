import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../../../..');
const dir = join(root, 'src/services/gal-ui');
const suffix = randomUUID().replaceAll('-', '');
const hostFile = join(dir, `gal-ui-slice-host.review-${suffix}.ts`);
const testFile = join(dir, `gal-ui-slice-host.review-${suffix}.test.ts`);
const hostSource = await readFile(join(dir, 'gal-ui-slice-host.ts'), 'utf8');
const testSource = await readFile(join(dir, 'gal-ui-slice-host.test.ts'), 'utf8');
const anchor = '{ reducedMotion: this.profile.preferences.reducedMotion }';
const hostImport = "from './gal-ui-slice-host.js'";
const anchorHits = hostSource.split(anchor).length - 1;
const importHits = testSource.split(hostImport).length - 1;
if (anchorHits !== 2 || importHits !== 1) {
  throw new Error(`anchor mismatch: policy=${anchorHits}, import=${importHits}`);
}
const extraTest = `
it('review two mounted GAL hosts keep motion independent and teardown cleans each', async () => {
  const left = await fixture(), right = await fixture();
  const first = document.createElement('div'), second = document.createElement('div');
  document.body.append(first, second);
  const detachLeft = left.host.attach(first), detachRight = right.host.attach(second);
  try {
    await left.host.dispatch('gal.settings.open'); await left.host.dispatch('gal.settings.tab', 'display');
    await right.host.dispatch('gal.settings.open'); await right.host.dispatch('gal.settings.tab', 'display');
    await left.host.dispatch('gal.settings.reduced-motion', 'true');
    expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(true);
    expect(second.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    await right.host.dispatch('gal.settings.reduced-motion', 'true');
    await left.host.dispatch('gal.settings.reduced-motion', 'false');
    expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    expect(second.hasAttribute('data-apollo-reduced-motion')).toBe(true);
  } finally {
    detachLeft(); detachRight();
    expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    expect(second.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    first.remove(); second.remove();
  }
});
`;
const probeSource = testSource.replace(hostImport, `from './gal-ui-slice-host.review-${suffix}.js'`) + extraTest;
const run = (pattern) => spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'),
  'run', testFile, '-t', pattern], { cwd: root, encoding: 'utf8', timeout: 120000 });
try {
  await writeFile(testFile, probeSource);
  await writeFile(hostFile, hostSource);
  const green = run('persists work reduced-motion');
  if (green.status !== 0 || !/1 passed/.test(green.stdout + green.stderr)) {
    throw new Error(`baseline did not pass: ${green.status}\n${green.stdout}\n${green.stderr}`);
  }
  await writeFile(hostFile, hostSource.replaceAll(anchor, '{}'));
  const red = run('persists work reduced-motion');
  const output = red.stdout + red.stderr;
  if (red.status === 0 || !/AssertionError|expected false to be true/i.test(output) ||
      !/1 failed/.test(output) || /Failed to resolve|Transform failed|Cannot find module/i.test(output)) {
    throw new Error(`behavioral mutation did not fail by assertion: ${red.status}\n${output}`);
  }
  await writeFile(hostFile, hostSource);
  const dual = run('review two mounted GAL hosts');
  const dualOutput = dual.stdout + dual.stderr;
  if (dual.status !== 0 || !/1 passed/.test(dualOutput)) {
    throw new Error(`two-mount teardown did not pass: ${dual.status}\n${dualOutput}`);
  }
  console.log(`anchor_hits=${anchorHits}, import_hits=${importHits}; baseline=1 PASS; mutated=1 ASSERTION FAIL`);
  console.log(output.match(/AssertionError[^\n]*|expected false to be true[^\n]*/i)?.[0] ?? 'assertion reported');
  console.log('two-mounted-host teardown=1 PASS: both hosts clear data-apollo-reduced-motion');
} finally {
  await rm(hostFile, { force: true });
  await rm(testFile, { force: true });
}
