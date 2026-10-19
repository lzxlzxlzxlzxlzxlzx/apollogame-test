import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { deriveAssetSlotBriefFingerprint, parseAssetIndex } from '../src/assets/index.ts';
import { filledSrc } from '../src/assets/asset-index.ts';
import { listPending, locations, mockImage, reviewPending } from './ai-gen.mjs';
import {
  executeLifeAssetGenerationBatch,
  readLifeAssetLibraryRecords,
  readLifeLocalReviews,
  reviewLifeLocalCandidate,
} from './life-asset-generate.mjs';

function slot(id, { prompt = 'moon rabbit', width = 32, height = 32, alpha = 'transparent' } = {}) {
  const value = {
    slotId: id,
    assetKey: `art:batch:${id}`,
    kind: 'item',
    consumers: [{ document: 'life.json', jsonPointer: `/visuals/${id}` }],
    asset: { usage: 'sprite', colorSpace: 'srgb', outputPx: { width, height }, alpha, sampling: 'nearest' },
    render: { display: { unit: 'pixel', width, height }, anchor: { x: 0.5, y: 1 }, fit: 'contain', offset: { x: 0, y: 0 }, fallbackRole: 'item' },
    generation: { briefVersion: 1, styleId: 'pixel', prompt, negativePrompt: ['text', 'border'] },
    governance: { approval: 'placeholder', humanApprovalRequired: true, licenseRequired: true, briefFingerprint: 'pending' },
  };
  value.governance.briefFingerprint = deriveAssetSlotBriefFingerprint(value);
  return value;
}

const manifest = (...slots) => ({
  version: 1,
  game: 'game-batch',
  note: 'Existing placeholders only; asset-manager owns import and registration.',
  slots,
});

function localCandidate() {
  return {
    id: 'library/farmer', type: 'texture', category: 'sprite.character', name: 'farmer', description: 'pixel farmer', tags: ['farmer'],
    source: 'project', sourceLabel: 'assets/', status: 'filled', style: 'pixel', width: 32, height: 32, transparent: true,
    path: 'library/farmer.png', license: 'CC0', usage: 'sprite', colorSpace: 'srgb', sampling: 'nearest',
  };
}

const vendoredFileName = (slotId) => `${String(slotId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64) || 'asset'}-${createHash('sha256').update(String(slotId)).digest('hex').slice(0, 12)}.png`;

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'life-asset-batch-'));
  return Promise.resolve(fn(root)).finally(() => rmSync(root, { recursive: true, force: true }));
}

function seedOldPlaceholder(root, rawManifest) {
  const loc = locations(root, rawManifest.game);
  mkdirSync(join(loc.finalDir, 'textures'), { recursive: true });
  const bytes = Buffer.from('old-placeholder-bytes');
  writeFileSync(join(loc.finalDir, 'textures', 'old.bin'), bytes);
  writeFileSync(loc.indexFile, `${JSON.stringify({ version: 1, assets: [{
    id: rawManifest.slots[0].assetKey,
    type: 'texture',
    description: 'old placeholder',
    status: 'filled',
    path: `/games/${rawManifest.game}/art/textures/old.bin`,
  }] }, null, 2)}\n`);
  return { loc, indexBytes: readFileSync(loc.indexFile), placeholderBytes: readFileSync(join(loc.finalDir, 'textures', 'old.bin')) };
}

function seedTrustedCandidate(root, overrides = {}) {
  const assetsDir = join(root, 'assets');
  const sourceFile = join(assetsDir, 'library', 'farmer.png');
  const bytes = mockImage('trusted-farmer', 32, 32, 'transparent').buffer;
  mkdirSync(join(assetsDir, 'library'), { recursive: true });
  writeFileSync(sourceFile, bytes);
  const entry = {
    id: 'library/farmer', type: 'texture', category: 'sprite.character', description: 'trusted pixel farmer',
    status: 'filled', path: 'library/farmer.png', style: 'pixel', license: 'CC0', source: 'shared-library', tags: ['farmer'],
    spec: { format: 'png', width: 32, height: 32, transparent: true, usage: 'sprite', colorSpace: 'srgb', sampling: 'nearest' },
    provenance: { importedBy: 'test-fixture' },
    ...overrides,
  };
  const indexFile = join(assetsDir, 'index.json');
  writeFileSync(indexFile, `${JSON.stringify({ version: 1, assets: [entry] }, null, 2)}\n`);
  return { indexFile, sourceFile, bytes, entry };
}

function writeCurrentManifest(root, raw) {
  const file = join(root, 'asset-slots.json');
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  return file;
}

function rewriteLocalQueue(root, game, mutate) {
  const file = join(locations(root, game).finalDir, 'local', 'pending.json');
  const value = JSON.parse(readFileSync(file, 'utf8'));
  mutate(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function rewriteTrustedCandidate(source, mutate) {
  mutate(source.entry);
  writeFileSync(source.indexFile, `${JSON.stringify({ version: 1, assets: [source.entry] }, null, 2)}\n`);
}

describe('Life asset generation CLI core', () => {
  it('is import-safe outside Vitest and does not execute the CLI entry point', () => withRoot((root) => {
    const probeFile = join(root, 'import-probe.mjs');
    const modulePath = relative(root, resolve('scripts/life-asset-generate.mjs')).replaceAll('\\', '/');
    writeFileSync(probeFile, `import ${JSON.stringify(modulePath)};\nprocess.stdout.write('import-ok\\n');\n`);
    const env = { ...process.env };
    delete env.VITEST;
    delete env.VITEST_WORKER_ID;
    const result = spawnSync(process.execPath, [
      resolve('node_modules/vite-node/vite-node.mjs'),
      probeFile,
    ], { cwd: process.cwd(), encoding: 'utf8', env });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('import-ok\n');
    expect(result.stderr).toBe('');
  }));

  it('defaults the real CLI entry to a read-only 23-slot Little Valley JSON plan', () => {
    const result = spawnSync(process.execPath, [
      resolve('node_modules/vite-node/vite-node.mjs'),
      resolve('scripts/life-asset-generate.cli.mjs'),
      resolve('games/game-simlife/little-valley.asset-slots.json'),
      '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(true);
    expect(output.batch.valid).toBe(true);
    expect(output.batch.items).toHaveLength(23);
    expect(output.results).toEqual([]);
  });

  it('stages a 3-slot mock batch without local vendoring/index writes or Little Valley mutation', () => withRoot(async (root) => {
    const raw = manifest(
      slot('local', { prompt: 'farmer' }),
      slot('ai-opaque', { prompt: 'moon barn', alpha: 'opaque' }),
      slot('ai-alpha', { prompt: 'moon rabbit', width: 32, height: 48 }),
    );
    const littleValleyIndexFile = join(process.cwd(), 'public', 'games', 'game-simlife', 'art', 'index.json');
    const littleValleyBefore = readFileSync(littleValleyIndexFile);
    const result = await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [localCandidate()], mock: true, generatedAt: '2026-10-11' });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      { slotId: 'ai-alpha', assetKey: 'art:batch:ai-alpha', status: 'pending-human-review', source: 'ai' },
      { slotId: 'ai-opaque', assetKey: 'art:batch:ai-opaque', status: 'pending-human-review', source: 'ai' },
      { slotId: 'local', assetKey: 'art:batch:local', status: 'pending-human-review', source: 'local', candidate: expect.objectContaining({ id: 'library/farmer', source: 'project', score: 100 }) },
    ]);
    const loc = locations(root, raw.game);
    expect(existsSync(loc.indexFile)).toBe(false);
    expect(listPending({ root, game: raw.game })).toHaveLength(2);
    expect(existsSync(join(loc.finalDir, 'textures'))).toBe(false);
    expect(readFileSync(littleValleyIndexFile)).toEqual(littleValleyBefore);
  }));

  it('selects gpt-image or mixed per-slot providers while keeping every candidate pending and packet data secret-free', () => withRoot(async (root) => {
    const raw = manifest(slot('qwen-slot'), slot('gpt-slot', { width: 32, height: 48 }));
    const result = await executeLifeAssetGenerationBatch({
      root, manifest: raw, records: [], mock: true, provider: 'gpt-image', providersBySlot: { 'qwen-slot': 'qwen' }, generatedAt: '2026-10-11',
    });
    expect(result.ok).toBe(true);
    expect(result.batch.items.map((item) => [item.slotId, item.provider])).toEqual([
      ['gpt-slot', 'gpt-image'],
      ['qwen-slot', 'qwen'],
    ]);
    const pending = listPending({ root, game: raw.game });
    expect(pending.map((entry) => [entry.id, entry.source, entry.workflow.provider])).toEqual([
      ['art:batch:gpt-slot', 'ai:gpt-image', 'gpt-image'],
      ['art:batch:qwen-slot', 'ai:qwen', 'qwen'],
    ]);
    expect(pending.every((entry) => entry.previewPath.includes('/art/ai/pending/'))).toBe(true);
    expect(existsSync(locations(root, raw.game).indexFile)).toBe(false);
    const serialized = JSON.stringify(result.batch);
    for (const forbidden of ['"path"', '"url"', '"bytes"', '"apiKey"', 'OPENAI_API_KEY', 'DASHSCOPE_API_KEY', '"license"', '"approval"', '"approved"']) {
      expect(serialized).not.toContain(forbidden);
    }
  }));

  it('normalizes a real-shaped GPT base64 PNG to outputPx before pending, then approves under the original art key', () => withRoot(async (root) => {
    const raw = manifest(slot('hero', { width: 32, height: 48 }));
    const remote = mockImage('remote-gpt-life', 64, 96, 'transparent').buffer;
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: remote.toString('base64') }] }) });
    try {
      const generated = await executeLifeAssetGenerationBatch({
        root, manifest: raw, records: [], mock: false, allowRealProvider: true, provider: 'gpt-image', env: { OPENAI_API_KEY: 'sk-test-only' }, generatedAt: '2026-10-11',
      });
      expect(generated.ok).toBe(true);
      expect(existsSync(locations(root, raw.game).indexFile)).toBe(false);
      const pending = listPending({ root, game: raw.game })[0];
      expect(pending).toMatchObject({ id: 'art:batch:hero', source: 'ai:gpt-image', provenance: { generator: 'gpt-image', model: 'gpt-image-2', mock: false }, workflow: { provider: 'gpt-image' } });
      expect(JSON.stringify(pending)).not.toContain('sk-test-only');
      const approved = reviewPending({ root, game: raw.game, id: 'art:batch:hero', action: 'approve', reviewedBy: 'owner-test', assetSlotManifest: raw });
      expect(approved).toMatchObject({ ok: true, id: 'art:batch:hero' });
      const parsed = parseAssetIndex(JSON.parse(readFileSync(locations(root, raw.game).indexFile, 'utf8')));
      const entry = parsed.assets.find((value) => value.id === 'art:batch:hero');
      expect(entry).toMatchObject({ id: 'art:batch:hero', source: 'ai:gpt-image', spec: { width: 32, height: 48, transparent: true }, provenance: { generator: 'gpt-image', binding: { assetKey: 'art:batch:hero' } } });
      expect(filledSrc(parsed, 'art:batch:hero')).toBe(entry.path);
    } finally { globalThis.fetch = original; }
  }));

  it('vendors an approved trusted project candidate under the original art key and existing loader semantics', () => withRoot(async (root) => {
    const raw = manifest(slot('hero', { prompt: 'farmer' }));
    const source = seedTrustedCandidate(root);
    const old = seedOldPlaceholder(root, raw);
    const records = readLifeAssetLibraryRecords([source.indexFile]);
    const staged = await executeLifeAssetGenerationBatch({ root, manifest: raw, records, mock: true, generatedAt: '2026-10-11' });
    expect(staged.ok).toBe(true);
    expect(listPending({ root, game: raw.game })).toHaveLength(0);
    expect(readLifeLocalReviews({ root, game: raw.game }).pending).toHaveLength(1);
    expect(readFileSync(old.loc.indexFile)).toEqual(old.indexBytes);
    const approved = reviewLifeLocalCandidate({
      root, game: raw.game, slotId: 'hero', action: 'approve', assetSlotManifest: raw, reviewedBy: 'owner-test',
    });
    expect(approved).toMatchObject({ ok: true, action: 'approve', slotId: 'hero', id: 'art:batch:hero', source: { kind: 'project', id: 'library/farmer' } });
    const parsed = parseAssetIndex(JSON.parse(readFileSync(old.loc.indexFile, 'utf8')));
    const entry = parsed.assets.find((value) => value.id === 'art:batch:hero');
    expect(entry).toMatchObject({
      id: 'art:batch:hero', type: 'texture', status: 'filled', style: 'pixel', license: 'CC0', source: 'shared-library',
      spec: { width: 32, height: 32, usage: 'sprite', colorSpace: 'srgb', transparent: true, sampling: 'nearest' },
      provenance: {
        vendoredFrom: { library: 'project', id: 'library/farmer' },
        binding: { game: 'game-batch', slotId: 'hero', assetKey: 'art:batch:hero', briefFingerprint: raw.slots[0].governance.briefFingerprint },
        reviewedBy: 'owner-test',
      },
    });
    expect(filledSrc(parsed, 'art:batch:hero')).toBe(entry.path);
    expect(readFileSync(join(root, 'public', 'games', raw.game, 'art', 'vendor', 'project', vendoredFileName('hero')))).toEqual(source.bytes);
    expect(readFileSync(join(old.loc.finalDir, 'textures', 'old.bin'))).toEqual(old.placeholderBytes);
    expect(readLifeLocalReviews({ root, game: raw.game }).pending).toHaveLength(0);
  }));

  it('keeps local review metadata path-free and reject only removes the candidate', () => withRoot(async (root) => {
    const raw = manifest(slot('hero', { prompt: 'farmer' }));
    const source = seedTrustedCandidate(root);
    const old = seedOldPlaceholder(root, raw);
    await executeLifeAssetGenerationBatch({ root, manifest: raw, records: readLifeAssetLibraryRecords([source.indexFile]), mock: true });
    const reviews = readLifeLocalReviews({ root, game: raw.game });
    expect(reviews.pending).toHaveLength(1);
    expect(reviews.pending[0]).toMatchObject({
      game: raw.game, slotId: 'hero', assetKey: 'art:batch:hero', reviewStatus: 'pending-human-review',
      candidate: { source: 'project', id: 'library/farmer', score: 40, contentFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) },
      spec: { outputPx: { width: 32, height: 32 }, alpha: 'transparent' },
      anchor: { x: 0.5, y: 1 }, consumers: [{ document: 'life.json', jsonPointer: '/visuals/hero' }],
    });
    const text = JSON.stringify(reviews);
    for (const forbidden of ['"path"', '"url"', '"bytes"', '"apiKey"', '"license"', '"approval"', '"approved"']) expect(text).not.toContain(forbidden);
    expect(reviewLifeLocalCandidate({ root, game: raw.game, slotId: 'hero', action: 'reject' })).toEqual({ ok: true, action: 'reject', slotId: 'hero' });
    expect(readFileSync(old.loc.indexFile)).toEqual(old.indexBytes);
    expect(readFileSync(join(old.loc.finalDir, 'textures', 'old.bin'))).toEqual(old.placeholderBytes);
    expect(existsSync(join(old.loc.finalDir, 'vendor', 'project', vendoredFileName('hero')))).toBe(false);
    expect(readLifeLocalReviews({ root, game: raw.game }).pending).toHaveLength(0);
  }));

  it.each([
    ['forged source id', 'after', ({ root, raw }) => rewriteLocalQueue(root, raw.game, (queue) => { queue.pending[0].candidate.id = 'library/forged'; }), 'binding mismatch'],
    ['unsupported source', 'after', ({ root, raw }) => rewriteLocalQueue(root, raw.game, (queue) => { queue.pending[0].candidate.source = 'artlib'; }), 'unsupported local candidate source'],
    ['manifest fingerprint', 'after', ({ raw }) => { raw.slots[0].governance.briefFingerprint = 'asset-slot-v1:00000000'; }, 'manifest/batch'],
    ['manifest spec', 'after', ({ raw }) => { raw.slots[0].asset.outputPx.width = 64; raw.slots[0].governance.briefFingerprint = deriveAssetSlotBriefFingerprint(raw.slots[0]); }, 'slot no longer'],
    ['manifest assetKey', 'after', ({ raw }) => { raw.slots[0].assetKey = 'art:batch:changed'; raw.slots[0].governance.briefFingerprint = deriveAssetSlotBriefFingerprint(raw.slots[0]); }, 'pending item does not match'],
    ['source filled status', 'after', ({ source }) => rewriteTrustedCandidate(source, (entry) => { entry.status = 'tbf'; }), 'slot no longer'],
    ['source texture type', 'after', ({ source }) => rewriteTrustedCandidate(source, (entry) => { entry.type = 'mesh'; }), 'slot no longer'],
    ['source style', 'after', ({ source }) => rewriteTrustedCandidate(source, (entry) => { entry.style = 'cartoon.flat'; }), 'slot no longer'],
    ['source pixel size', 'after', ({ source }) => rewriteTrustedCandidate(source, (entry) => { entry.spec.width = 64; }), 'slot no longer'],
    ['source alpha', 'after', ({ source }) => rewriteTrustedCandidate(source, (entry) => { entry.spec.transparent = false; }), 'slot no longer'],
    ['source format', 'after', ({ source }) => rewriteTrustedCandidate(source, (entry) => { entry.spec.format = 'webp'; }), 'slot no longer'],
    ['source license', 'after', ({ source }) => rewriteTrustedCandidate(source, (entry) => { delete entry.license; }), 'slot no longer'],
    ['missing source file', 'after', ({ source }) => rmSync(source.sourceFile, { force: true }), 'path is missing'],
    ['changed source bytes', 'after', ({ source }) => writeFileSync(source.sourceFile, mockImage('changed-source', 32, 32, 'transparent').buffer), 'source bytes'],
    ['outside-root source path', 'before', ({ root, source }) => {
      writeFileSync(join(root, 'escape.png'), source.bytes);
      source.entry.path = '../escape.png';
      writeFileSync(source.indexFile, `${JSON.stringify({ version: 1, assets: [source.entry] }, null, 2)}\n`);
    }, 'outside assets/'],
    ['cross game', 'after', ({ approve }) => { approve.game = 'game-other'; }, 'does not exist'],
    ['traversal game', 'after', ({ approve }) => { approve.game = '../game-other'; }, 'game id is unsafe'],
  ])('fails closed for %s and preserves the old index/formal bytes', (_label, phase, mutate, expected) => withRoot(async (root) => {
    const raw = manifest(slot('hero', { prompt: 'farmer' }));
    const source = seedTrustedCandidate(root);
    const approve = {};
    if (phase === 'before') mutate({ root, raw, source, approve });
    const old = seedOldPlaceholder(root, raw);
    await executeLifeAssetGenerationBatch({ root, manifest: raw, records: readLifeAssetLibraryRecords([source.indexFile]), mock: true });
    if (phase === 'after') mutate({ root, raw, source, approve });
    const result = reviewLifeLocalCandidate({
      root, game: approve.game ?? raw.game, slotId: 'hero', action: 'approve', assetSlotManifest: raw, reviewedBy: 'owner-test',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain(expected);
    expect(readFileSync(old.loc.indexFile)).toEqual(old.indexBytes);
    expect(readFileSync(join(old.loc.finalDir, 'textures', 'old.bin'))).toEqual(old.placeholderBytes);
    expect(existsSync(join(old.loc.finalDir, 'vendor', 'project', vendoredFileName('hero')))).toBe(false);
  }));

  it('keeps distinct approved files for legal slot ids that normalize to the same slug', () => withRoot(async (root) => {
    const raw = manifest(
      slot('hero.one', { prompt: 'farmer' }),
      slot('hero-one', { prompt: 'baker' }),
    );
    const first = seedTrustedCandidate(root);
    const secondBytes = mockImage('trusted-baker', 32, 32, 'transparent').buffer;
    const secondFile = join(root, 'assets', 'library', 'baker.png');
    writeFileSync(secondFile, secondBytes);
    const secondEntry = {
      ...first.entry,
      id: 'library/baker',
      description: 'trusted pixel baker',
      path: 'library/baker.png',
      tags: ['baker'],
    };
    writeFileSync(first.indexFile, `${JSON.stringify({ version: 1, assets: [first.entry, secondEntry] }, null, 2)}\n`);
    const staged = await executeLifeAssetGenerationBatch({
      root, manifest: raw, records: readLifeAssetLibraryRecords([first.indexFile]), mock: true,
    });
    expect(staged.ok).toBe(true);
    expect(readLifeLocalReviews({ root, game: raw.game }).pending).toHaveLength(2);
    for (const slotId of ['hero.one', 'hero-one']) {
      expect(reviewLifeLocalCandidate({
        root, game: raw.game, slotId, action: 'approve', assetSlotManifest: raw, reviewedBy: 'owner-test',
      }).ok).toBe(true);
    }
    const parsed = parseAssetIndex(JSON.parse(readFileSync(locations(root, raw.game).indexFile, 'utf8')));
    const dotted = parsed.assets.find((entry) => entry.id === 'art:batch:hero.one');
    const dashed = parsed.assets.find((entry) => entry.id === 'art:batch:hero-one');
    expect(dotted?.path).not.toBe(dashed?.path);
    expect(dotted?.path).toContain(vendoredFileName('hero.one'));
    expect(dashed?.path).toContain(vendoredFileName('hero-one'));
    expect(readFileSync(join(root, 'public', ...dotted.path.split('/').filter(Boolean)))).toEqual(first.bytes);
    expect(readFileSync(join(root, 'public', ...dashed.path.split('/').filter(Boolean)))).toEqual(secondBytes);
  }));

  it('exposes explicit generate and approve-local CLI actions while preserving the default plan', () => withRoot((root) => {
    const raw = manifest(slot('hero', { prompt: 'farmer' }));
    seedTrustedCandidate(root);
    const manifestFile = writeCurrentManifest(root, raw);
    const base = [resolve('node_modules/vite-node/vite-node.mjs'), resolve('scripts/life-asset-generate.cli.mjs'), manifestFile, '--target-root', root];
    const generated = spawnSync(process.execPath, [...base, '--generate'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(generated.status).toBe(0);
    expect(JSON.parse(generated.stdout)).toMatchObject({ ok: true, results: [{ slotId: 'hero', source: 'local', status: 'pending-human-review' }] });
    expect(existsSync(locations(root, raw.game).indexFile)).toBe(false);
    const approved = spawnSync(process.execPath, [...base, '--approve-local', 'hero', '--reviewed-by', 'owner-test'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(approved.status).toBe(0);
    expect(JSON.parse(approved.stdout)).toMatchObject({ ok: true, action: 'approve', id: 'art:batch:hero' });
    expect(filledSrc(parseAssetIndex(JSON.parse(readFileSync(locations(root, raw.game).indexFile, 'utf8'))), 'art:batch:hero')).toContain(`/vendor/project/${vendoredFileName('hero')}`);
  }));

  it('exposes an explicit closed GPT provider CLI selection without making a real call', () => withRoot((root) => {
    const raw = manifest(slot('hero'));
    const manifestFile = writeCurrentManifest(root, raw);
    const base = [resolve('node_modules/vite-node/vite-node.mjs'), resolve('scripts/life-asset-generate.cli.mjs'), manifestFile, '--target-root', root];
    const generated = spawnSync(process.execPath, [...base, '--provider', 'gpt-image', '--generate'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(generated.status).toBe(0);
    expect(JSON.parse(generated.stdout)).toMatchObject({ ok: true, batch: { items: [{ provider: 'gpt-image' }] } });
    expect(listPending({ root, game: raw.game })[0]).toMatchObject({ source: 'ai:gpt-image', workflow: { provider: 'gpt-image' } });
    expect(existsSync(locations(root, raw.game).indexFile)).toBe(false);
    const invalid = spawnSync(process.execPath, [...base, '--provider', 'unknown'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(invalid.status).not.toBe(0);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ ok: false, batch: { diagnostics: [expect.objectContaining({ code: 'provider_invalid' })] } });
  }));

  it.each([
    ['valueless approve', ['--approve-local'], '--approve-local requires a value'],
    ['orphan reviewer', ['--reviewed-by', 'owner-test'], '--reviewed-by is only valid with --approve-local'],
  ])('fails closed for %s CLI flags instead of silently falling back to plan', (_label, extra, expected) => withRoot((root) => {
    const raw = manifest(slot('hero', { prompt: 'farmer' }));
    seedTrustedCandidate(root);
    const manifestFile = writeCurrentManifest(root, raw);
    const result = spawnSync(process.execPath, [
      resolve('node_modules/vite-node/vite-node.mjs'), resolve('scripts/life-asset-generate.cli.mjs'), manifestFile,
      '--target-root', root, ...extra,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(expected);
    expect(existsSync(locations(root, raw.game).indexFile)).toBe(false);
    expect(existsSync(join(locations(root, raw.game).finalDir, 'local', 'pending.json'))).toBe(false);
  }));

  it('keeps real provider access behind both an explicit switch and an environment key', () => withRoot(async (root) => {
    const raw = manifest(slot('hero'));
    const implicit = await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: false, allowRealProvider: false, env: {} });
    expect(implicit).toMatchObject({ ok: false, error: 'real provider requires explicit allowRealProvider' });
    const missingKey = await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: false, allowRealProvider: true, env: {} });
    expect(missingKey).toMatchObject({ ok: false, error: 'real provider requires DASHSCOPE_API_KEY' });
    const missingGptKey = await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: false, allowRealProvider: true, provider: 'gpt-image', env: {} });
    expect(missingGptKey).toMatchObject({ ok: false, error: 'real provider requires OPENAI_API_KEY' });
    expect(existsSync(locations(root, raw.game).pendingFile)).toBe(false);
  }));

  it('approves mock AI under the original art key with provenance binding/spec and keeps loader key semantics', () => withRoot(async (root) => {
    const raw = manifest(slot('hero', { width: 32, height: 48 }));
    const result = await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: true, generatedAt: '2026-10-11' });
    expect(result.ok).toBe(true);
    const approval = reviewPending({ root, game: raw.game, id: 'art:batch:hero', action: 'approve', reviewedBy: 'owner-test', assetSlotManifest: raw });
    expect(approval).toMatchObject({ ok: true, action: 'approve', id: 'art:batch:hero' });
    const parsed = parseAssetIndex(JSON.parse(readFileSync(locations(root, raw.game).indexFile, 'utf8')));
    const entry = parsed.assets.find((value) => value.id === 'art:batch:hero');
    expect(entry).toMatchObject({
      id: 'art:batch:hero', type: 'texture', status: 'filled',
      spec: { width: 32, height: 48, usage: 'sprite', colorSpace: 'srgb', transparent: true, sampling: 'nearest' },
      provenance: { generator: 'qwen', binding: { game: 'game-batch', slotId: 'hero', assetKey: 'art:batch:hero', briefFingerprint: raw.slots[0].governance.briefFingerprint } },
    });
    expect(filledSrc(parsed, 'art:batch:hero')).toBe(entry.path);
    expect(listPending({ root, game: raw.game })).toHaveLength(0);
  }));

  it('cannot bypass current-manifest revalidation at the generic pending approval seam', () => withRoot(async (root) => {
    const raw = manifest(slot('hero'));
    await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: true, generatedAt: '2026-10-11' });
    const approval = reviewPending({ root, game: raw.game, id: 'art:batch:hero', action: 'approve' });
    expect(approval).toMatchObject({ ok: false, error: 'life asset approval requires the current AssetSlot manifest' });
    expect(existsSync(locations(root, raw.game).indexFile)).toBe(false);
    expect(listPending({ root, game: raw.game })).toHaveLength(1);
  }));

  it.each([
    ['brief fingerprint', (pending) => { pending.workflow.briefFingerprint = 'asset-slot-v1:00000000'; }, 'brief_fingerprint'],
    ['assetKey', (pending) => { pending.workflow.assetKey = 'art:batch:forged'; }, 'asset_key'],
    ['slotId', (pending) => { pending.workflow.slotId = 'forged'; }, 'slot_id'],
    ['declared size', (pending) => { pending.workflow.spec.outputPx.width = 64; }, 'slot_spec'],
    ['declared alpha', (pending) => { pending.workflow.spec.alpha = 'opaque'; }, 'slot_spec'],
    ['provider binding', (pending) => { pending.workflow.provider = 'gpt-image'; }, 'provider'],
    ['cross game', (pending) => { pending.workflow.game = 'game-other'; }, 'cross_game'],
  ])('rejects tampered %s metadata and preserves old index/formal bytes', (_label, mutate, expected) => withRoot(async (root) => {
    const raw = manifest(slot('hero', { width: 32, height: 48 }));
    const old = seedOldPlaceholder(root, raw);
    await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: true, generatedAt: '2026-10-11' });
    const pendingFile = old.loc.pendingFile;
    const pending = JSON.parse(readFileSync(pendingFile, 'utf8'));
    mutate(pending.pending[0]);
    writeFileSync(pendingFile, `${JSON.stringify(pending, null, 2)}\n`);
    const reviewed = reviewPending({ root, game: raw.game, id: 'art:batch:hero', action: 'approve', assetSlotManifest: raw });
    expect(reviewed).toMatchObject({ ok: false });
    expect(reviewed.error).toContain(expected);
    expect(readFileSync(old.loc.indexFile)).toEqual(old.indexBytes);
    expect(readFileSync(join(old.loc.finalDir, 'textures', 'old.bin'))).toEqual(old.placeholderBytes);
    expect(existsSync(join(old.loc.finalDir, 'ai', 'qwen', 'hero.png'))).toBe(false);
  }));

  it.each([
    ['pixel size', () => mockImage('wrong-size', 16, 48, 'transparent').buffer, 'width:16!=32'],
    ['pixel alpha', () => mockImage('wrong-alpha', 32, 48, 'opaque').buffer, 'alpha:opaque!=transparent'],
  ])('rejects wrong %s bytes before index/formal writes', (_label, bytes, expected) => withRoot(async (root) => {
    const raw = manifest(slot('hero', { width: 32, height: 48 }));
    const old = seedOldPlaceholder(root, raw);
    await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: true, generatedAt: '2026-10-11' });
    const pending = listPending({ root, game: raw.game })[0];
    writeFileSync(join(old.loc.pendingDir, pending.pendingFile), bytes());
    const reviewed = reviewPending({ root, game: raw.game, id: 'art:batch:hero', action: 'approve', assetSlotManifest: raw });
    expect(reviewed).toMatchObject({ ok: false });
    expect(reviewed.error).toContain(expected);
    expect(readFileSync(old.loc.indexFile)).toEqual(old.indexBytes);
    expect(readFileSync(join(old.loc.finalDir, 'textures', 'old.bin'))).toEqual(old.placeholderBytes);
  }));

  it('reject only clears the candidate and leaves the old placeholder active', () => withRoot(async (root) => {
    const raw = manifest(slot('hero'));
    const old = seedOldPlaceholder(root, raw);
    await executeLifeAssetGenerationBatch({ root, manifest: raw, records: [], mock: true, generatedAt: '2026-10-11' });
    expect(reviewPending({ root, game: raw.game, id: 'art:batch:hero', action: 'reject', assetSlotManifest: raw })).toMatchObject({ ok: true, action: 'reject' });
    expect(readFileSync(old.loc.indexFile)).toEqual(old.indexBytes);
    expect(readFileSync(join(old.loc.finalDir, 'textures', 'old.bin'))).toEqual(old.placeholderBytes);
    expect(listPending({ root, game: raw.game })).toHaveLength(0);
  }));
});
