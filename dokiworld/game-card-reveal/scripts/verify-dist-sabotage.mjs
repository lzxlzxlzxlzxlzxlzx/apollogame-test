// Short-lived adversarial test. Mutates only copies inside a task-owned temp dir.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, cp, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDist = resolve(appRoot, 'dist');
const verifier = resolve(appRoot, 'scripts', 'verify-dist.mjs');
const scratch = await mkdtemp(resolve(tmpdir(), 'card-reveal-s8-'));
function verify(copy) {
  return spawnSync(process.execPath, [verifier, '--dist', copy], { cwd: appRoot, encoding: 'utf8' });
}
async function caseRun(name, mutate, expected) {
  const copy = resolve(scratch, name);
  await cp(sourceDist, copy, { recursive: true });
  await mutate(copy);
  const result = verify(copy);
  assert.equal(result.status, 1, `${name} unexpectedly passed: ${result.stdout}`);
  assert.match(result.stderr, expected, `${name} failed for the wrong reason`);
  console.log(`SABOTAGE: ${name} → expected red`);
}
try {
  assert.equal(verify(sourceDist).status, 0, 'baseline dist must pass before sabotage');
  await caseRun('missing-document', (copy) => unlink(resolve(copy, 'docs', 'integration.zh-CN.md')), /missing package-root docs\/integration\.zh-CN\.md/);
  await caseRun('bad-manifest', async (copy) => {
    const path = resolve(copy, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.runtime.protocolVersion = 1;
    await writeFile(path, JSON.stringify(manifest));
  }, /runtime must be dokiworld\.app\/2/);
  await caseRun('absolute-asset-root', async (copy) => {
    const js = (await readdir(resolve(copy, 'assets'))).find((name) => name.endsWith('.js'));
    assert.ok(js, 'bundle JS anchor exists');
    await appendFile(resolve(copy, 'assets', js), '\nconst s8Invalid = "/games/game-card-reveal/art/";\n');
  }, /source absolute asset root/);
  await caseRun('bad-sha', async (copy) => {
    const path = resolve(copy, 'SHA256SUMS.txt');
    const sums = await readFile(path, 'utf8');
    await writeFile(path, `${sums[0] === 'A' ? 'B' : 'A'}${sums.slice(1)}`);
  }, /SHA mismatch/);
} finally {
  // scratch is exactly the mkdtemp result under OS temp; never target a workspace root.
  assert.ok(scratch.startsWith(resolve(tmpdir(), 'card-reveal-s8-')));
  await rm(scratch, { recursive: true, force: true });
}
