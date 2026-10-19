import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLifeAuthoringMaterializationPlan } from '@zerocraft/engine/authoring/life-materializer.js';
import { littleValleyGenerationBundle } from './life-generation-bundle.fixture.js';
import {
  LIFE_BUNDLE_CANDIDATE_FILE,
  LIFE_GENERATION_PATCH_SCHEMA,
  LIFE_GENERATION_SLICE_MANIFEST_SCHEMA,
  composeLifeGenerationBundle,
  type LifeGenerationSliceManifestV1,
} from '@zerocraft/engine/authoring/life-bundle-compose.js';

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const codes = (result: ReturnType<typeof composeLifeGenerationBundle>): string[] => result.diagnostics.map((entry) => entry.code);

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'life-bundle-compose-'));
  try { run(resolve(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

function writeJson(root: string, name: string, value: unknown): void { writeFileSync(join(root, name), json(value)); }

function createFixture(root: string, slug = 'game-compose-fixture', split = false): LifeGenerationSliceManifestV1 {
  const bundle = structuredClone(littleValleyGenerationBundle());
  (bundle.game as { slug: string }).slug = slug;
  (bundle.game.lifePackage as { meta: { id: string } }).meta.id = slug;
  (bundle.assetSlots.draft as { game: string }).game = slug;
  const base = structuredClone(bundle.game.lifePackage) as Record<string, unknown>;
  const playerVisual = base.playerVisual;
  const logic = base.logic;
  delete base.playerVisual;
  delete base.logic;
  const slices = split ? ['actors.patch.json', 'plot.patch.json'] : ['content.patch.json'];
  const manifest: LifeGenerationSliceManifestV1 = {
    schemaVersion: LIFE_GENERATION_SLICE_MANIFEST_SCHEMA,
    session: { id: `${slug}:fixture`, round: 0, createdBy: 'human', promptContractVersion: 'life-generation.prompt.v1' },
    slug,
    world: 'world.life.json',
    slices,
    assetSlots: 'asset-slots.json',
  };
  writeJson(root, 'bundle.sources.json', manifest);
  writeJson(root, manifest.world, base);
  writeJson(root, manifest.assetSlots, bundle.assetSlots.draft);
  if (split) {
    writeJson(root, slices[0]!, { schemaVersion: LIFE_GENERATION_PATCH_SCHEMA, baseWorld: manifest.world, operations: [{ op: 'add', path: '/playerVisual', value: playerVisual }] });
    writeJson(root, slices[1]!, { schemaVersion: LIFE_GENERATION_PATCH_SCHEMA, baseWorld: manifest.world, requiresSlices: [slices[0]], operations: [{ op: 'add', path: '/logic', value: logic }] });
  } else {
    writeJson(root, slices[0]!, { schemaVersion: LIFE_GENERATION_PATCH_SCHEMA, baseWorld: manifest.world, operations: [{ op: 'add', path: '/playerVisual', value: playerVisual }, { op: 'add', path: '/logic', value: logic }] });
  }
  return manifest;
}

function compose(root: string, writeCandidate = false) {
  return composeLifeGenerationBundle({ sourceRoot: root, manifestFile: 'bundle.sources.json', writeCandidate });
}

describe('Life slice bundle composer', () => {
  it('plans deterministic canonical candidates for two slugs and slice layouts without writing', () => {
    for (const [slug, split] of [['game-compose-one', false], ['game-compose-two', true]] as const) withTempRoot((root) => {
      createFixture(root, slug, split);
      const first = compose(root);
      const second = compose(root);
      expect(first.ok).toBe(true);
      expect(first.writesPerformed).toBe(false);
      expect(first.bundle?.game.slug).toBe(slug);
      expect(first.bundleHash).toBe(second.bundleHash);
      expect(first.candidateHash).toBe(second.candidateHash);
      expect(first.candidateBytes).toBeGreaterThan(1000);
      expect(existsSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE))).toBe(false);
    });
  });

  it('rebuilds the reviewed demon-castle visual-semantics candidate and four-file plan', () => {
    const root = resolve('docs/design/game-demon-castle');
    const composed = compose(root);
    expect(composed.ok).toBe(true);
    expect(composed.bundleHash).toBe('sha256:933bcdec3e3062323105fb41caeb7374c0abf56e9395cd925a8cd50ae0a8cb9c');
    const plan = buildLifeAuthoringMaterializationPlan({
      bundle: composed.bundle,
      descriptor: JSON.parse(readFileSync(join(root, 'life-host.candidate.json'), 'utf8')),
      entry: JSON.parse(readFileSync(join(root, 'life-launcher.candidate.json'), 'utf8')),
    });
    expect(plan.files.map((entry) => [entry.path, entry.contentHash])).toEqual([
      ['games/game-demon-castle/life.json', 'sha256:0a3fa40b765117d6617fe9f8917b8b3f02630b8db54a32548f3d7b142d0b1792'],
      ['games/game-demon-castle/asset-slots.json', 'sha256:da569614bab417933e9d1d9eec2373e3d96d24b27c2ecb5c96ad6d4091355c5c'],
      ['games/game-demon-castle/life-host.json', 'sha256:8f47f2892086276b9309679682c676d8aa4d850830d88b1677271b134af0e7d1'],
      ['games/game-demon-castle/life-launcher.json', 'sha256:b16d755111458cfd6d6c543f01a49c3a3056c84502b0bb3129defea0323bbf68'],
    ]);
  });

  it('strictly rejects manifest fields, unsafe paths, noncanonical roots, and source symlinks', () => {
    expect(codes(composeLifeGenerationBundle({ sourceRoot: 'relative', manifestFile: 'bundle.sources.json' }))).toContain('absolute_required');
    withTempRoot((root) => {
      const manifest = createFixture(root);
      writeJson(root, 'bundle.sources.json', { ...manifest, surprise: true });
      expect(codes(compose(root))).toContain('unknown_field');
      writeJson(root, 'bundle.sources.json', { ...manifest, world: '../world.json' });
      expect(codes(compose(root))).toContain('unsafe_source_name');
    });
    withTempRoot((root) => withTempRoot((outside) => {
      createFixture(root);
      rmSync(join(root, 'world.life.json'));
      symlinkSync(outside, join(root, 'world.life.json'), process.platform === 'win32' ? 'junction' : 'dir');
      expect(codes(compose(root))).toContain('unsafe_source');
    }));
  });

  it.each([
    ['slice_schema', (patch: Record<string, unknown>) => { patch.schemaVersion = 'wrong'; }],
    ['base_world', (patch: Record<string, unknown>) => { patch.baseWorld = 'other.json'; }],
    ['slice_dependencies', (patch: Record<string, unknown>) => { patch.requiresSlices = ['wrong.json']; }],
    ['operation', (patch: Record<string, unknown>) => { (patch.operations as Array<Record<string, unknown>>)[0]!.op = 'remove'; }],
    ['json_pointer_forbidden', (patch: Record<string, unknown>) => { (patch.operations as Array<Record<string, unknown>>)[0]!.path = '/__proto__/polluted'; }],
    ['json_pointer_scope', (patch: Record<string, unknown>) => { (patch.operations as Array<Record<string, unknown>>)[0]!.path = '/meta/id'; }],
    ['missing_parent', (patch: Record<string, unknown>) => { (patch.operations as Array<Record<string, unknown>>)[0]!.path = '/scenes/0/missing/child'; }],
    ['array_index', (patch: Record<string, unknown>) => { (patch.operations as Array<Record<string, unknown>>)[0]!.path = '/scenes/999'; }],
    ['duplicate_operation', (patch: Record<string, unknown>) => { const ops = patch.operations as Array<Record<string, unknown>>; ops.push(structuredClone(ops[0]!)); }],
  ])('reports stable %s patch diagnostics without writing', (expected, mutate) => withTempRoot((root) => {
    const manifest = createFixture(root, 'game-compose-invalid', true);
    const path = join(root, manifest.slices[1]!);
    const patch = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    mutate(patch);
    writeJson(root, manifest.slices[1]!, patch);
    const result = compose(root, true);
    expect(codes(result)).toContain(expected);
    expect(result.diagnostics.some((entry) => entry.code === expected && entry.path.startsWith(`/sources/${manifest.slices[1]}`))).toBe(true);
    expect(result.writesPerformed).toBe(false);
    expect(existsSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE))).toBe(false);
  }));

  it('surfaces strict bundle asset and world diagnostics with zero writes', () => {
    withTempRoot((root) => {
      const manifest = createFixture(root);
      const slots = JSON.parse(readFileSync(join(root, manifest.assetSlots), 'utf8')) as { slots: Array<{ consumers: Array<{ jsonPointer: string }> }> };
      slots.slots[0]!.consumers[0]!.jsonPointer = '/missing';
      writeJson(root, manifest.assetSlots, slots);
      const result = compose(root, true);
      expect(codes(result)).toEqual(expect.arrayContaining(['asset_fingerprint', 'consumer_mismatch', 'missing_slot']));
      expect(existsSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE))).toBe(false);
    });
    withTempRoot((root) => {
      const manifest = createFixture(root);
      const world = JSON.parse(readFileSync(join(root, manifest.world), 'utf8')) as { scenes: Array<{ layers: Array<{ tiles: Array<{ count: number }> }> }> };
      world.scenes[0]!.layers[0]!.tiles[0]!.count += 1;
      writeJson(root, manifest.world, world);
      expect(codes(compose(root, true)).some((code) => code.startsWith('life_'))).toBe(true);
      expect(existsSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE))).toBe(false);
    });
  });

  it('writes once, verifies, and returns byte-identical idempotence', () => withTempRoot((root) => {
    createFixture(root);
    const first = compose(root, true);
    const bytes = readFileSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE), 'utf8');
    const second = compose(root, true);
    expect(first.ok).toBe(true);
    expect(first.writesPerformed).toBe(true);
    expect(first.writtenFiles).toBe(1);
    expect(second.ok).toBe(true);
    expect(second.writesPerformed).toBe(false);
    expect(readFileSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE), 'utf8')).toBe(bytes);
    expect(readdirSync(root).filter((name) => name.startsWith('.bundle-candidate-stage-'))).toEqual([]);
  }));

  it.each(['{}', '{"partial":', '{"extra":true}\ntrailing'])('preserves a different, partial, or extra target: %s', (bytes) => withTempRoot((root) => {
    createFixture(root);
    writeFileSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE), bytes);
    const composed = compose(root, true);
    expect(codes(composed)).toContain('target_conflict');
    expect(readFileSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE), 'utf8')).toBe(bytes);
  }));

  it('rejects a symlink target without touching its destination', () => withTempRoot((root) => withTempRoot((outside) => {
    createFixture(root);
    writeFileSync(join(outside, 'marker'), 'outside');
    symlinkSync(outside, join(root, LIFE_BUNDLE_CANDIDATE_FILE), process.platform === 'win32' ? 'junction' : 'dir');
    expect(codes(compose(root, true))).toContain('unsafe_target');
    expect(readFileSync(join(outside, 'marker'), 'utf8')).toBe('outside');
  })));

  it('fails closed when a source changes after planning', () => withTempRoot((root) => {
    const manifest = createFixture(root);
    const worldPath = join(root, manifest.world);
    const before = readFileSync(worldPath, 'utf8');
    const result = composeLifeGenerationBundle({
      sourceRoot: root,
      manifestFile: 'bundle.sources.json',
      writeCandidate: true,
      hooks: { beforeWrite: () => writeFileSync(worldPath, `${before} `) },
    });
    expect(codes(result)).toContain('io_failure');
    expect(result.diagnostics.map((entry) => entry.message).join(' ')).toContain('source_changed');
    expect(existsSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE))).toBe(false);
  }));

  it('fails closed and removes its candidate when a source changes after publication', () => withTempRoot((root) => {
    const manifest = createFixture(root);
    const worldPath = join(root, manifest.world);
    const before = readFileSync(worldPath, 'utf8');
    const result = composeLifeGenerationBundle({
      sourceRoot: root,
      manifestFile: 'bundle.sources.json',
      writeCandidate: true,
      hooks: { afterRename: () => writeFileSync(worldPath, `${before} `) },
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('io_failure');
    expect(result.diagnostics.map((entry) => entry.message).join(' ')).toContain('source_changed');
    expect(readFileSync(worldPath, 'utf8')).toBe(`${before} `);
    expect(existsSync(join(root, LIFE_BUNDLE_CANDIDATE_FILE))).toBe(false);
  }));

  it('preserves external targets in pre- and post-rename races and cleans its own staging', () => {
    withTempRoot((root) => {
      createFixture(root);
      const target = join(root, LIFE_BUNDLE_CANDIDATE_FILE);
      const result = composeLifeGenerationBundle({ sourceRoot: root, manifestFile: 'bundle.sources.json', writeCandidate: true, hooks: { beforeRename: () => writeFileSync(target, 'external') } });
      expect(codes(result)).toContain('io_failure');
      expect(readFileSync(target, 'utf8')).toBe('external');
      expect(readdirSync(root).filter((name) => name.startsWith('.bundle-candidate-stage-'))).toEqual([]);
    });
    for (let attempt = 0; attempt < 32; attempt++) withTempRoot((root) => {
      createFixture(root);
      const target = join(root, LIFE_BUNDLE_CANDIDATE_FILE);
      const displaced = `${target}.displaced`;
      const result = composeLifeGenerationBundle({ sourceRoot: root, manifestFile: 'bundle.sources.json', writeCandidate: true, hooks: { afterRename: () => { renameSync(target, displaced); writeFileSync(target, 'external'); } } });
      expect(codes(result)).toContain('io_failure');
      expect(readFileSync(target, 'utf8')).toBe('external');
      expect(existsSync(displaced)).toBe(true);
    });
  });

  it('fails closed and removes its transaction when staged bytes change before publication', () => withTempRoot((root) => {
    createFixture(root);
    const target = join(root, LIFE_BUNDLE_CANDIDATE_FILE);
    const result = composeLifeGenerationBundle({
      sourceRoot: root,
      manifestFile: 'bundle.sources.json',
      writeCandidate: true,
      hooks: { beforeRename: (stagingPath) => writeFileSync(stagingPath, '{"corrupt":true}\n') },
    });
    expect(codes(result)).toContain('io_failure');
    expect(result.diagnostics.map((entry) => entry.message).join(' ')).toContain('post_verify');
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(root).filter((name) => name.startsWith('.bundle-candidate-stage-'))).toEqual([]);
  }));
});
