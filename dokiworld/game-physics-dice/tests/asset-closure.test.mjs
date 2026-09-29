import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { exportAppAssetClosure, planAppAssetClosure } from '../../../scripts/app-asset-closure.mjs';

const fixture = () => ({
  version: 1,
  assets: [
    { id: 'g/tex', type: 'texture', status: 'filled', path: '/games/g/art/a.png', license: 'CC0', provenance: { originalPath: 'C:/Users/dev/Downloads/a.png', prompt: 'keep me' } },
    { id: 'g/mesh', type: 'mesh', status: 'filled', path: '/games/g/art/m.glb', provenance: { restoredFrom: '/home/dev/backup' } },
    { id: 'g/mat', type: 'material', status: 'filled', spec: { map: 'g/tex' } },
  ],
});

test('plans a portable index and removes local-machine provenance paths', () => {
  const plan = planAppAssetClosure(fixture(), { publicPrefix: '/games/g/art/', outputPrefix: 'games/g/art' });
  assert.deepEqual(plan.files.map((entry) => entry.outputRelative), ['games/g/art/a.png', 'games/g/art/m.glb']);
  assert.equal(plan.index.assets[0].path, 'games/g/art/a.png');
  assert.equal(plan.index.assets[0].provenance.originalPath, undefined);
  assert.equal(plan.index.assets[0].provenance.prompt, 'keep me');
  assert.equal(plan.index.assets[1].provenance.restoredFrom, undefined);
});

test('rejects traversal, remote assets and dangling material keys', () => {
  const base = { publicPrefix: '/games/g/art/', outputPrefix: 'games/g/art' };
  assert.throws(() => planAppAssetClosure({ version: 1, assets: [{ id: 'x', type: 'texture', status: 'filled', path: '/games/g/art/../secret.png' }] }, base), /escapes/);
  assert.throws(() => planAppAssetClosure({ version: 1, assets: [{ id: 'x', type: 'texture', status: 'filled', path: 'https:\/\/cdn.example/x.png' }] }, base), /remote|must start/);
  const broken = fixture(); broken.assets[2].spec.map = 'g/missing';
  assert.throws(() => planAppAssetClosure(broken, base), /dangling key/);
});

test('exports indexed bytes, extra trees, portable index and closure report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'app-asset-closure-'));
  try {
    const art = join(root, 'art'); const fonts = join(root, 'fonts'); const dist = join(root, 'dist');
    await mkdir(art); await mkdir(fonts); await writeFile(join(art, 'a.png'), 'png'); await writeFile(join(art, 'm.glb'), 'glb'); await writeFile(join(fonts, 'font.woff2'), 'font');
    const indexPath = join(art, 'index.json'); await writeFile(indexPath, JSON.stringify(fixture()));
    const report = await exportAppAssetClosure({
      indexPath, sourceRoot: art, distRoot: dist,
      publicPrefix: '/games/g/art/', outputPrefix: 'games/g/art',
      extraTrees: [{ sourceRoot: fonts, outputPrefix: 'ui-fonts' }],
    });
    assert.equal(report.assetFiles, 2); assert.equal(report.extraFiles, 1);
    assert.equal(await readFile(join(dist, 'games/g/art/a.png'), 'utf8'), 'png');
    assert.equal(await readFile(join(dist, 'ui-fonts/font.woff2'), 'utf8'), 'font');
    const portable = JSON.parse(await readFile(join(dist, 'games/g/art/index.json'), 'utf8'));
    assert.equal(portable.assets[0].path, 'games/g/art/a.png');
    assert.doesNotMatch(JSON.stringify(portable), /C:\/Users|\/home\/dev/);
    assert.equal(JSON.parse(await readFile(join(dist, 'ASSET-CLOSURE.json'), 'utf8')).assetFiles, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

