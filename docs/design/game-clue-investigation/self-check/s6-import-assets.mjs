// Authoring-only design handoff. Default is zero-write plan; --apply creates absent files only.
// npx vite-node docs/design/game-clue-investigation/self-check/s6-import-assets.mjs [--apply|--verify]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resizeImageTo, deriveRequirements, mergeLedger } from '../../../../scripts/art-replace.mjs';
import { artRoot } from '../../../../scripts/art-paths.mjs';
import { classifyRow, collectManifestArtRefs } from '../../../../scripts/ledger-audit.mjs';
import { missingProvenanceRows } from '../../../../scripts/art-ledger-guard.mjs';
import { decodePng } from '../../../../src/assets/import/png-decode.ts';
import { bakeHitMaskFromPng } from '../../../../src/assets/import/hit-mask.ts';
import { parseAssetIndex } from '../../../../src/assets/asset-index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const game = 'game-clue-investigation';
const dest = artRoot(root, game);
const sourceDir = path.join(root, 'docs/design', game, 'ui-refs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = [
  ['background', 'rainy-archive-background-ai-v1.png', '雨夜档案室背景', '88c458c0a7d9c6e897f72afae7cac903cb104fbcc74c80e8750a11c4983849b7'],
  ['lock', 'damaged-window-latch-ai-v1.png', '破损窗锁', 'c25d535b25bfd4a51423fd9cdbe14d3194d78326c3452e85403f5e368e85cb41'],
  ['shelf', 'archive-bookcase-ai-v1.png', '旧书架', '1bd7da0a14bb4ffc51bc4b7a461fbd5bb9bb747dc094bc382fc584bc508736ed'],
  ['clock', 'stopped-clock-ai-v1.png', '停摆挂钟', 'b18db9040b02cbdc0ff06f6a7a418777031b532994d494e739f0629203f51d3f'],
  ['cup', 'cold-teacup-ai-v1.png', '冷茶杯', 'b2adb1609b7528eaa8d51caed661259e542b7056f3af8d4ca0c9725a44e01f76'],
  ['rug', 'worn-rug-ai-v1.png', '褪色地毯', 'c854535cb62bb5a97c1ebb09308c27cc21da8ff03e552676ca0fa503df7ad778'],
  ['prints', 'wet-footprints-ai-v1.png', '桌上湿脚印', 'a93399b9904fe678781e0a592b3dca86c61ef08081f74ec13566321ef55c0808'],
  ['letter', 'burned-letter-ai-v1.png', '半烧毁信件', '2bcffc67794f8a46a39a1055b02a4582058f5b421197e45e35e841eec865e7c3'],
];
const files = [], assets = [], report = [];
const license = 'Owner-authorized original AI prototype artwork; project use confirmed 2026-10-13';
for (const [id, filename, description, expectedHash] of sources) {
  const source = fs.readFileSync(path.join(sourceDir, filename));
  assert.equal(hash(source), expectedHash, `source drift: ${filename}`);
  const original = decodePng(source);
  const bg = id === 'background';
  const bytes = bg ? source : resizeImageTo(source, Math.round(original.w / 2), Math.round(original.h / 2));
  const image = decodePng(bytes);
  assert.equal(image.w, bg ? original.w : Math.round(original.w / 2));
  assert.equal(image.h, bg ? original.h : Math.round(original.h / 2));
  const key = `${game}/${bg ? 'scene' : 'object'}/${id}`;
  const rel = `textures/${filename}`;
  const provenance = {
    method: 'design-handoff', reference: `docs/design/${game}/prototype.dc.html`,
    originalFile: `docs/design/${game}/ui-refs/${filename}`, sourceSha256: expectedHash,
    sourceWidth: original.w, sourceHeight: original.h, outputSha256: hash(bytes),
    transform: bg ? 'byte-identical' : 'scripts/art-replace.mjs::resizeImageTo; half-size area-average; nearest integer dimensions',
    importedAt: '2026-10-13', license,
    authorization: 'Owner confirmed use of this prototype set, including source and usage permission, in current chat on 2026-10-13',
    generationRecord: 'Prototype identifies original AI artwork; original model and prompt not retained in supplied handoff. Not reconstructed.',
  };
  assets.push({ id: key, type: 'texture', description, status: 'filled',
    path: `/games/${game}/art/${rel}`, category: bg ? 'background' : 'prop',
    spec: { width: image.w, height: image.h, usage: 'sprite', colorSpace: 'srgb', wrap: 'clamp' },
    source: 'design-handoff:prototype.dc.html', license, provenance });
  files.push({ rel, bytes });
  const stats = { id, textureKey: key, sourceSize: [original.w, original.h], size: [image.w, image.h], sourceSha256: expectedHash, sha256: hash(bytes), bytes: bytes.length };
  if (!bg) {
    const mask = bakeHitMaskFromPng(bytes, key, 150);
    let solid = 0, empty = 0, solidSample, emptySample;
    for (let y = 0; y < image.h; y++) for (let x = 0; x < image.w; x++) {
      const alpha = image.px[(y * image.w + x) * 4 + 3];
      assert.equal(mask.rows[y][x], alpha >= 150 ? '1' : '0', `${id} mask mismatch at ${x},${y}`);
      if (alpha >= 150) { solid++; solidSample ??= [x, y]; }
      else { empty++; emptySample ??= [x, y]; }
    }
    assert(solid > 0 && empty > 0, `${id} needs positive and negative pixels`);
    assets.push({ id: `${game}/mask/${id}`, type: 'hit-mask', description: `${description} alpha ≥ 150 同源命中遮罩`, status: 'filled', spec: mask,
      source: 'bakeHitMaskFromPng', license, provenance: { method: 'alpha-mask-bake', sourceTextureKey: key, sourceSha256: hash(bytes), threshold: 150 } });
    Object.assign(stats, { solid, empty, solidSample, emptySample });
  }
  report.push(stats);
}
const index = { version: 1, assets };
parseAssetIndex(index);
files.push({ rel: 'index.json', bytes: Buffer.from(JSON.stringify(index, null, 2) + '\n') });
// Preflight every target before any write: within exact artRoot, no symlinks, no conflicting bytes.
assert.equal(dest, path.join(root, 'library', game, 'art'));
for (const { rel, bytes } of files) {
  const target = path.resolve(dest, rel);
  assert(target.startsWith(dest + path.sep));
  for (let p = target; p.startsWith(root + path.sep); p = path.dirname(p)) {
    if (fs.existsSync(p)) assert(!fs.lstatSync(p).isSymbolicLink(), `symlink: ${p}`);
  }
  if (fs.existsSync(target)) assert.deepEqual(fs.readFileSync(target), bytes, `conflict: ${target}`);
}
const apply = process.argv.includes('--apply'), verify = process.argv.includes('--verify');
assert(!(apply && verify), 'choose --apply or --verify');
if (apply) {
  const created = [];
  try {
    for (const { rel, bytes } of files) {
      const target = path.join(dest, rel);
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: 'wx' });
      created.push(target);
    }
  } catch (error) {
    // Only exact files created by this invocation; never remove preexisting files or directories.
    for (const target of created.reverse()) fs.unlinkSync(target);
    throw error;
  }
}
if (apply || verify) {
  for (const { rel, bytes } of files) assert.deepEqual(fs.readFileSync(path.join(dest, rel)), bytes);
  parseAssetIndex(JSON.parse(fs.readFileSync(path.join(dest, 'index.json'), 'utf8')));
}
let ledgerAudit = null;
if (verify) {
  const ledger = JSON.parse(fs.readFileSync(path.join(dest, 'art-ledger.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'library', game, 'manifest.json'), 'utf8'));
  assert.equal(ledger.rows.length, 8);
  assert.equal(new Set(ledger.rows.map(r => r.skinKey)).size, 8);
  const refs = collectManifestArtRefs(manifest);
  for (const row of ledger.rows) {
    assert.notEqual(classifyRow(row, refs), 'orphan');
    assert.equal(row.status, 'filled', 'this authoring check never signs Owner approval');
    const entry = assets.find(a => a.id === row.skinKey && a.type === 'texture');
    assert(entry);
    assert.equal(manifest.entities[row.slot.entity][row.slot.component][row.slot.field], entry.id);
    assert.equal(row.gen.localId, entry.id);
    assert.equal(row.gen.servedPath, entry.path);
    assert.deepEqual(row.provenance, entry.provenance);
    assert.equal(row.spec.w, entry.spec.width);
    assert.equal(row.spec.h, entry.spec.height);
  }
  assert.equal(missingProvenanceRows(ledger).length, 0);
  const merged = mergeLedger(ledger, deriveRequirements(manifest, { game }), manifest);
  assert.deepEqual(merged.rows.map(r => [r.no, r.skinKey, r.status]), ledger.rows.map(r => [r.no, r.skinKey, r.status]));
  ledgerAudit = { rows: 8, uniqueKeys: 8, orphans: 0, missingProvenance: 0, fileBindings: 8, stableNumbers: true, approvedRows: 0 };
}
console.log(JSON.stringify({ mode: apply ? 'apply' : verify ? 'verify' : 'plan', ok: true, root: dest,
  files: files.map(f => f.rel), entries: assets.length, ledgerAudit, maskPixelsChecked: report.reduce((n, r) => n + (r.solid ?? 0) + (r.empty ?? 0), 0), report }, null, 2));
