import {
  existsSync,
  lstatSync,
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
import { join, parse, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveAssetSlotBriefFingerprint } from '../assets/asset-slot-brief.js';
import { LIFE_LAUNCHER_SCHEMA, type LifeLauncherEntryV1 } from '../launcher/life-launcher-catalog-core.js';
import {
  canonicalLifeGenerationJson,
  lifeGenerationPayload,
  sha256Canonical,
  type LifeGenerationBundleV1,
} from './life-generation-bundle.js';
import { littleValleyGenerationBundle } from './life-generation-bundle.fixture.js';
import { seasideMarketHostDescriptorFixture } from './life-host-descriptor.fixture.js';
import {
  LIFE_MATERIALIZATION_FILES,
  LifeMaterializationError,
  applyLifeAuthoringMaterialization,
  buildLifeAuthoringMaterializationPlan,
  buildLifeFormalUpdatePlan,
  promoteLifeAuthoringMaterialization,
  updateLifeAuthoringMaterialization,
  type LifeMaterializationInputs,
} from './life-materializer.js';

function fixture(slug = 'game-little-valley-generated'): LifeMaterializationInputs {
  const bundle = structuredClone(littleValleyGenerationBundle());
  (bundle.game.lifePackage as { meta: { id: string } }).meta.id = slug;
  (bundle.game as { slug: string }).slug = slug;
  (bundle.assetSlots.draft as { game: string }).game = slug;
  for (const slot of bundle.assetSlots.draft.slots) {
    (slot.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(slot);
  }
  const refreshed = {
    ...bundle,
    provenance: {
      baseHash: sha256Canonical(lifeGenerationPayload(bundle)),
      sourceHashes: {
        lifePackage: sha256Canonical(bundle.game.lifePackage),
        assetSlotsDraft: sha256Canonical(bundle.assetSlots.draft),
      },
    },
  } satisfies LifeGenerationBundleV1;
  const descriptor = structuredClone(seasideMarketHostDescriptorFixture());
  (descriptor as { slug: string }).slug = slug;
  (descriptor as { artSlug: string }).artSlug = slug;
  (descriptor.save as { namespace: string }).namespace = `life:${slug}:v1`;
  const entry: LifeLauncherEntryV1 = {
    schema: LIFE_LAUNCHER_SCHEMA,
    id: slug,
    title: slug === 'game-little-valley-generated' ? '小山谷' : '第二人生',
    subtitle: '受限 Life authoring fixture',
    description: '仅由严格四文件物化器消费的测试条目。',
    color: '#17364a', accentColor: '#62d6c5', icon: '🌱',
  };
  return { bundle: refreshed, descriptor, entry };
}

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'life-materializer-'));
  try { run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function withTempWorkspace(run: (workspace: string) => void): void {
  withTempRoot((workspace) => {
    mkdirSync(join(workspace, 'games'));
    run(workspace);
  });
}

function errorCodes(run: () => unknown): string[] {
  try { run(); return []; }
  catch (error) {
    expect(error).toBeInstanceOf(LifeMaterializationError);
    return (error as LifeMaterializationError).diagnostics.map((issue) => issue.code);
  }
}

describe('Life authoring materializer M0/M1', () => {
  it('builds a deterministic, zero-write four-file plan for Little Valley and a second game', () => {
    for (const inputs of [fixture(), fixture('game-second-life')]) {
      const first = buildLifeAuthoringMaterializationPlan(inputs);
      const second = buildLifeAuthoringMaterializationPlan(structuredClone(inputs));
      expect(first).toEqual(second);
      expect(first.writesPerformed).toBe(false);
      expect(first.conflicts).toEqual([]);
      expect(first.files.map((file) => file.path)).toEqual(LIFE_MATERIALIZATION_FILES.map((name) => `games/${first.slug}/${name}`));
      expect(first.files.every((file) => /^sha256:[0-9a-f]{64}$/.test(file.contentHash) && file.bytes > 0)).toBe(true);
      expect(first.gates).toEqual(['bundle-valid', 'placeholder-assets', 'identity-closed', 'launcher-discovery']);
    }
  });

  it('rejects stale hashes, approved assets, content hashes, unsafe consumers, and strict-contract unknown fields', () => {
    const stale = fixture();
    ((stale.bundle as LifeGenerationBundleV1).provenance as { baseHash: string }).baseHash = `sha256:${'0'.repeat(64)}`;
    expect(errorCodes(() => buildLifeAuthoringMaterializationPlan(stale))).toContain('bundle_base_hash_mismatch');

    const approved = fixture();
    (((approved.bundle as LifeGenerationBundleV1).assetSlots.draft.slots[0]!.governance) as { approval: string }).approval = 'approved';
    expect(errorCodes(() => buildLifeAuthoringMaterializationPlan(approved))).toContain('bundle_approved_forbidden');

    const contentHash = fixture();
    (((contentHash.bundle as LifeGenerationBundleV1).assetSlots.draft.slots[0]!.governance) as { contentHash?: string }).contentHash = `sha256:${'1'.repeat(64)}`;
    expect(errorCodes(() => buildLifeAuthoringMaterializationPlan(contentHash))).toContain('bundle_content_hash_forbidden');

    const unsafe = fixture();
    ((((unsafe.bundle as LifeGenerationBundleV1).assetSlots.draft.slots[0]!.consumers[0]!) as { document: string }).document) = '../life.json';
    expect(errorCodes(() => buildLifeAuthoringMaterializationPlan(unsafe))).toContain('bundle_unsafe_path');

    const unknown = fixture();
    (unknown.entry as unknown as Record<string, unknown>).module = './escape.js';
    expect(errorCodes(() => buildLifeAuthoringMaterializationPlan(unknown))).toContain('entry_unknown_field');
  });

  it.each([
    ['descriptor slug', (inputs: LifeMaterializationInputs) => { (inputs.descriptor as { slug: string }).slug = 'game-other'; }],
    ['descriptor art slug', (inputs: LifeMaterializationInputs) => { (inputs.descriptor as { artSlug: string }).artSlug = 'game-other'; }],
    ['save namespace', (inputs: LifeMaterializationInputs) => { ((inputs.descriptor as { save: { namespace: string } }).save).namespace = 'life:game-other:v1'; }],
    ['launcher id', (inputs: LifeMaterializationInputs) => { (inputs.entry as { id: string }).id = 'game-other'; }],
    ['package id', (inputs: LifeMaterializationInputs) => { ((((inputs.bundle as LifeGenerationBundleV1).game.lifePackage) as { meta: { id: string } }).meta).id = 'game-other'; }],
    ['slot game', (inputs: LifeMaterializationInputs) => { (((inputs.bundle as LifeGenerationBundleV1).assetSlots.draft) as { game: string }).game = 'game-other'; }],
  ])('fails closed on %s identity divergence', (_label, mutate) => {
    const inputs = fixture(); mutate(inputs);
    expect(() => buildLifeAuthoringMaterializationPlan(inputs)).toThrow(LifeMaterializationError);
  });

  it('requires the exact confirmation hash and an absolute, non-workspace root', () => {
    const inputs = fixture(); const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempRoot((root) => {
      expect(errorCodes(() => applyLifeAuthoringMaterialization(inputs, { targetRoot: root, ownerConfirm: `sha256:${'0'.repeat(64)}` }))).toContain('confirmation_mismatch');
      expect(errorCodes(() => applyLifeAuthoringMaterialization(inputs, { targetRoot: 'relative-target', ownerConfirm: plan.confirmationHash }))).toContain('absolute_required');
      expect(errorCodes(() => applyLifeAuthoringMaterialization(inputs, { targetRoot: resolve('.'), ownerConfirm: plan.confirmationHash }))).toContain('workspace_forbidden');
    });
  });

  it('writes exactly four canonical files to scratch, then is byte-idempotent with zero writes', () => {
    const inputs = fixture(); const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempRoot((root) => {
      const first = applyLifeAuthoringMaterialization(inputs, { targetRoot: root, ownerConfirm: plan.confirmationHash });
      expect(first).toMatchObject({ writesPerformed: true, writtenFiles: 4 });
      expect(readdirSync(first.targetDirectory).sort()).toEqual([...LIFE_MATERIALIZATION_FILES].sort());
      const bytes = LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(first.targetDirectory, name), 'utf8'));
      const second = applyLifeAuthoringMaterialization(inputs, { targetRoot: root, ownerConfirm: plan.confirmationHash });
      expect(second).toMatchObject({ writesPerformed: false, writtenFiles: 0 });
      expect(LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(first.targetDirectory, name), 'utf8'))).toEqual(bytes);
      expect(existsSync(join(root, 'public'))).toBe(false);
    });
  });

  it.each([
    ['partial', (directory: string) => writeFileSync(join(directory, 'life.json'), '{}\n')],
    ['extra', (directory: string) => { for (const name of LIFE_MATERIALIZATION_FILES) writeFileSync(join(directory, name), '{}\n'); writeFileSync(join(directory, 'extra.json'), '{}\n'); }],
    ['different', (directory: string) => { for (const name of LIFE_MATERIALIZATION_FILES) writeFileSync(join(directory, name), '{}\n'); }],
  ])('never overwrites an existing %s target', (_label, populate) => {
    const inputs = fixture(); const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempRoot((root) => {
      const directory = join(root, 'games', plan.slug); mkdirSync(directory, { recursive: true }); populate(directory);
      const before = readdirSync(directory).map((name) => [name, readFileSync(join(directory, name), 'utf8')]);
      expect(() => applyLifeAuthoringMaterialization(inputs, { targetRoot: root, ownerConfirm: plan.confirmationHash })).toThrow(LifeMaterializationError);
      expect(readdirSync(directory).map((name) => [name, readFileSync(join(directory, name), 'utf8')])).toEqual(before);
    });
  });

  it('rejects symlinked roots and target path components', () => {
    const inputs = fixture(); const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempRoot((realRoot) => withTempRoot((holder) => {
      const linkedRoot = join(holder, 'linked-root');
      symlinkSync(realRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
      expect(errorCodes(() => applyLifeAuthoringMaterialization(inputs, { targetRoot: linkedRoot, ownerConfirm: plan.confirmationHash }))).toEqual(expect.arrayContaining(['symlink_root']));
      const outside = join(holder, 'outside'); mkdirSync(outside);
      symlinkSync(outside, join(realRoot, 'games'), process.platform === 'win32' ? 'junction' : 'dir');
      expect(errorCodes(() => applyLifeAuthoringMaterialization(inputs, { targetRoot: realRoot, ownerConfirm: plan.confirmationHash }))).toEqual(expect.arrayContaining(['unsafe_directory']));
    }));
  });

  it('rolls back write, rename, and post-rename verification failures without residue', () => {
    const inputs = fixture(); const plan = buildLifeAuthoringMaterializationPlan(inputs);
    for (const hooks of [
      { beforeWrite: (_path: string, index: number) => { if (index === 2) throw new Error('write probe'); } },
      { beforeRename: () => { throw new Error('rename probe'); } },
      { afterRename: () => { throw new Error('verify probe'); } },
    ]) withTempRoot((root) => {
      expect(() => applyLifeAuthoringMaterialization(inputs, { targetRoot: root, ownerConfirm: plan.confirmationHash, hooks })).toThrow(LifeMaterializationError);
      expect(readdirSync(root)).toEqual([]);
    });
  });

  it('sabotage probes turn containment and confirmation guards red before any write', () => {
    const inputs = fixture(); const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempRoot((root) => {
      const protectedRoot = join(root, 'workspace'); mkdirSync(protectedRoot);
      const child = join(protectedRoot, 'scratch'); mkdirSync(child);
      expect(errorCodes(() => applyLifeAuthoringMaterialization(inputs, {
        targetRoot: child, ownerConfirm: plan.confirmationHash, protectedWorkspaceRoot: protectedRoot,
      }))).toContain('workspace_forbidden');
      expect(readdirSync(child)).toEqual([]);
      expect(errorCodes(() => applyLifeAuthoringMaterialization(inputs, {
        targetRoot: root, ownerConfirm: `${plan.confirmationHash}x`,
      }))).toContain('confirmation_mismatch');
      expect(readdirSync(root)).toEqual(['workspace']);
    });
  });
});

describe('Life formal four-file promotion', () => {
  it('promotes exactly four canonical files, verifies discovery, and repeats byte-idempotently', () => {
    const inputs = fixture('game-formal-promotion');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempWorkspace((workspace) => {
      const first = promoteLifeAuthoringMaterialization(inputs, { workspaceRoot: workspace, ownerConfirm: plan.confirmationHash });
      expect(first).toMatchObject({ mode: 'promote', slug: plan.slug, writesPerformed: true, writtenFiles: 4 });
      expect(first.targetDirectory).toBe(join(workspace, 'games', plan.slug));
      expect(readdirSync(first.targetDirectory).sort()).toEqual([...LIFE_MATERIALIZATION_FILES].sort());
      const before = LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(first.targetDirectory, name), 'utf8'));
      const second = promoteLifeAuthoringMaterialization(structuredClone(inputs), { workspaceRoot: workspace, ownerConfirm: plan.confirmationHash });
      expect(second).toMatchObject({ mode: 'promote', writesPerformed: false, writtenFiles: 0 });
      expect(LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(first.targetDirectory, name), 'utf8'))).toEqual(before);
      expect(readdirSync(workspace).sort()).toEqual(['games']);
    });
  });

  it('requires the exact current confirmation hash before touching the workspace', () => {
    const inputs = fixture('game-promote-confirmation');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempWorkspace((workspace) => {
      const missingWorkspace = join(workspace, 'must-not-be-inspected');
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: missingWorkspace, ownerConfirm: `sha256:${'0'.repeat(64)}`,
      }))).toContain('confirmation_mismatch');
      (inputs.entry as { title: string }).title = 'changed after M0';
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: missingWorkspace, ownerConfirm: plan.confirmationHash,
      }))).toContain('confirmation_mismatch');
      expect(readdirSync(join(workspace, 'games'))).toEqual([]);
    });
  });

  it('rejects relative, filesystem-root, missing-games, and symlink workspace roots', () => {
    const inputs = fixture('game-promote-root');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
      workspaceRoot: 'relative-workspace', ownerConfirm: plan.confirmationHash,
    }))).toContain('absolute_required');
    expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
      workspaceRoot: parse(resolve(tmpdir())).root, ownerConfirm: plan.confirmationHash,
    }))).toContain('filesystem_root');
    withTempRoot((workspace) => {
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace, ownerConfirm: plan.confirmationHash,
      }))).toContain('missing_directory');
    });
    withTempRoot((holder) => {
      const fileRoot = join(holder, 'workspace-file'); writeFileSync(fileRoot, 'not a directory');
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: fileRoot, ownerConfirm: plan.confirmationHash,
      }))).toContain('not_directory');
    });
    withTempRoot((workspace) => {
      writeFileSync(join(workspace, 'games'), 'not a directory');
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace, ownerConfirm: plan.confirmationHash,
      }))).toContain('unsafe_directory');
    });
    withTempWorkspace((realWorkspace) => withTempRoot((holder) => {
      const linked = join(holder, 'workspace-link');
      symlinkSync(realWorkspace, linked, process.platform === 'win32' ? 'junction' : 'dir');
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: linked, ownerConfirm: plan.confirmationHash,
      }))).toContain('symlink_root');
    }));
  });

  it('rejects a path-like slug during the M0 chain before creating any target', () => {
    const inputs = fixture('game-promote-path');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    const bundle = inputs.bundle as LifeGenerationBundleV1;
    (bundle.game as { slug: string }).slug = 'game-../escape';
    (bundle.game.lifePackage as { meta: { id: string } }).meta.id = 'game-../escape';
    (bundle.assetSlots.draft as { game: string }).game = 'game-../escape';
    withTempWorkspace((workspace) => {
      expect(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace, ownerConfirm: plan.confirmationHash,
      })).toThrow(LifeMaterializationError);
      expect(readdirSync(join(workspace, 'games'))).toEqual([]);
    });
  });

  it.each([
    ['partial', (directory: string) => writeFileSync(join(directory, 'life.json'), '{}\n')],
    ['extra', (directory: string) => { for (const name of LIFE_MATERIALIZATION_FILES) writeFileSync(join(directory, name), '{}\n'); writeFileSync(join(directory, 'extra.json'), '{}\n'); }],
    ['different', (directory: string) => { for (const name of LIFE_MATERIALIZATION_FILES) writeFileSync(join(directory, name), '{}\n'); }],
  ])('fails closed without changing an existing %s formal target', (_label, populate) => {
    const inputs = fixture('game-promote-conflict');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempWorkspace((workspace) => {
      const directory = join(workspace, 'games', plan.slug); mkdirSync(directory); populate(directory);
      const before = readdirSync(directory).sort().map((name) => [name, readFileSync(join(directory, name), 'utf8')]);
      expect(() => promoteLifeAuthoringMaterialization(inputs, { workspaceRoot: workspace, ownerConfirm: plan.confirmationHash })).toThrow(LifeMaterializationError);
      expect(readdirSync(directory).sort().map((name) => [name, readFileSync(join(directory, name), 'utf8')])).toEqual(before);
    });
  });

  it('rejects games, target, and file symlinks without touching outside bytes', () => {
    const inputs = fixture('game-promote-symlink');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempRoot((workspace) => withTempRoot((outside) => {
      symlinkSync(outside, join(workspace, 'games'), process.platform === 'win32' ? 'junction' : 'dir');
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace, ownerConfirm: plan.confirmationHash,
      }))).toContain('unsafe_directory');
      expect(readdirSync(outside)).toEqual([]);
    }));
    withTempWorkspace((workspace) => withTempRoot((outside) => {
      const target = join(workspace, 'games', plan.slug);
      symlinkSync(outside, target, process.platform === 'win32' ? 'junction' : 'dir');
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace, ownerConfirm: plan.confirmationHash,
      }))).toContain('unsafe_directory');
      expect(readdirSync(outside)).toEqual([]);
    }));
    withTempWorkspace((workspace) => withTempRoot((outside) => {
      const target = join(workspace, 'games', plan.slug); mkdirSync(target);
      for (const name of LIFE_MATERIALIZATION_FILES) {
        const source = join(outside, name); mkdirSync(source); writeFileSync(join(source, 'marker'), 'outside');
        symlinkSync(source, join(target, name), process.platform === 'win32' ? 'junction' : 'dir');
      }
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace, ownerConfirm: plan.confirmationHash,
      }))).toContain('unsafe_file');
      expect(LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(outside, name, 'marker'), 'utf8'))).toEqual(LIFE_MATERIALIZATION_FILES.map(() => 'outside'));
    }));
  });

  it('cleans staging or the newly published target on write, rename, verification, and target-race faults', () => {
    const inputs = fixture('game-promote-rollback');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    const hooks = [
      { beforeWrite: (_path: string, index: number) => { if (index === 2) throw new Error('write probe'); } },
      { beforeRename: () => { throw new Error('rename probe'); } },
      { afterRename: () => { throw new Error('verify probe'); } },
      { beforeRename: (_staging: string, target: string) => { mkdirSync(target); } },
    ];
    for (const hook of hooks) withTempWorkspace((workspace) => {
      expect(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace, ownerConfirm: plan.confirmationHash, hooks: hook,
      })).toThrow(LifeMaterializationError);
      const gamesEntries = readdirSync(join(workspace, 'games'));
      if (gamesEntries.includes(plan.slug)) expect(readdirSync(join(workspace, 'games', plan.slug))).toEqual([]);
      expect(gamesEntries.filter((name) => name.startsWith(`.${plan.slug}.promote-`))).toEqual([]);
    });
  });

  it('preserves an external directory that replaces the published target during post-rename verification', () => {
    const inputs = fixture('game-promote-replacement-race');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempWorkspace((workspace) => {
      const target = join(workspace, 'games', plan.slug);
      const displaced = `${target}.displaced`;
      expect(() => promoteLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace,
        ownerConfirm: plan.confirmationHash,
        hooks: {
          afterRename: (publishedTarget) => {
            renameSync(publishedTarget, displaced);
            mkdirSync(publishedTarget);
            writeFileSync(join(publishedTarget, 'external-marker'), 'external');
          },
        },
      })).toThrow(LifeMaterializationError);
      expect(readFileSync(join(target, 'external-marker'), 'utf8')).toBe('external');
      expect(readdirSync(join(workspace, 'games')).filter((name) => name.startsWith(`.${plan.slug}.promote-`))).toEqual([]);
    });
  });
});

describe('Life formal four-file safe update', () => {
  it('uses a one-way strict bridge to replace a canonical pre-profile formal group', () => {
    const inputs = fixture('game-formal-legacy-viewport');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempWorkspace((workspace) => {
      const promoted = promoteLifeAuthoringMaterialization(inputs, { workspaceRoot: workspace, ownerConfirm: plan.confirmationHash });
      const descriptorPath = join(promoted.targetDirectory, 'life-host.json');
      const packagePath = join(promoted.targetDirectory, 'life.json');
      const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')) as Record<string, unknown>;
      const lifePackage = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
      descriptor.viewport = { fieldW: 1440, fieldH: 900, topBarH: 72, bottomBarH: 48, cellSize: 48, mode: 'responsive', cameraFit: 'cover' };
      lifePackage.camera = { viewportWidthCells: 16, viewportHeightCells: 10, follow: { marginCells: 2, minZoom: 1, maxZoom: 1, deadZone: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 } } };
      writeFileSync(descriptorPath, `${canonicalLifeGenerationJson(descriptor)}\n`);
      writeFileSync(packagePath, `${canonicalLifeGenerationJson(lifePackage)}\n`);

      const preflight = buildLifeFormalUpdatePlan(inputs, { workspaceRoot: workspace });
      expect(preflight.currentFilesHash).not.toBe(plan.filesHash);
      const updated = updateLifeAuthoringMaterialization(inputs, {
        workspaceRoot: workspace,
        ownerConfirm: plan.confirmationHash,
        currentFilesHash: preflight.currentFilesHash,
      });
      expect(updated).toMatchObject({ writesPerformed: true, writtenFiles: 4, filesHash: plan.filesHash });
      expect(JSON.parse(readFileSync(descriptorPath, 'utf8'))).toMatchObject({ viewport: { profile: 'life-standard-v1' } });
      expect(JSON.parse(readFileSync(packagePath, 'utf8'))).toMatchObject({ camera: { profile: 'life-standard-v1' } });
    });
  });

  it('does not let the update bridge normalize non-legacy free viewport fields', () => {
    const inputs = fixture('game-formal-legacy-reject');
    const plan = buildLifeAuthoringMaterializationPlan(inputs);
    withTempWorkspace((workspace) => {
      const promoted = promoteLifeAuthoringMaterialization(inputs, { workspaceRoot: workspace, ownerConfirm: plan.confirmationHash });
      const descriptorPath = join(promoted.targetDirectory, 'life-host.json');
      const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')) as Record<string, unknown>;
      descriptor.viewport = { fieldW: 1440, fieldH: 900, topBarH: 72, cellSize: 48, mode: 'responsive', cameraFit: 'cover', customScale: 2 };
      writeFileSync(descriptorPath, `${canonicalLifeGenerationJson(descriptor)}\n`);
      expect(errorCodes(() => buildLifeFormalUpdatePlan(inputs, { workspaceRoot: workspace }))).toContain('invalid_descriptor');
    });
  });

  it('preflights without writes, requires both hashes, swaps the group, and repeats idempotently', () => {
    const oldInputs = fixture('game-formal-update');
    const oldPlan = buildLifeAuthoringMaterializationPlan(oldInputs);
    const nextInputs = structuredClone(oldInputs);
    (nextInputs.entry as { title: string }).title = '更新后的第二人生';
    const nextPlan = buildLifeAuthoringMaterializationPlan(nextInputs);
    withTempWorkspace((workspace) => {
      const promoted = promoteLifeAuthoringMaterialization(oldInputs, { workspaceRoot: workspace, ownerConfirm: oldPlan.confirmationHash });
      const before = LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(promoted.targetDirectory, name), 'utf8'));
      const preflight = buildLifeFormalUpdatePlan(nextInputs, { workspaceRoot: workspace });
      expect(preflight).toMatchObject({ mode: 'plan-update', writesPerformed: false, currentFilesHash: promoted.filesHash, filesHash: nextPlan.filesHash });
      expect(LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(promoted.targetDirectory, name), 'utf8'))).toEqual(before);

      expect(errorCodes(() => updateLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: workspace, ownerConfirm: nextPlan.confirmationHash, currentFilesHash: `sha256:${'0'.repeat(64)}`,
      }))).toContain('current_files_hash_mismatch');
      expect(LIFE_MATERIALIZATION_FILES.map((name) => readFileSync(join(promoted.targetDirectory, name), 'utf8'))).toEqual(before);

      const updated = updateLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: workspace, ownerConfirm: nextPlan.confirmationHash, currentFilesHash: promoted.filesHash,
      });
      expect(updated).toMatchObject({ mode: 'update', writesPerformed: true, writtenFiles: 4, previousFilesHash: promoted.filesHash, filesHash: nextPlan.filesHash });
      const repeated = updateLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: workspace, ownerConfirm: nextPlan.confirmationHash, currentFilesHash: promoted.filesHash,
      });
      expect(repeated).toMatchObject({ mode: 'update', writesPerformed: false, writtenFiles: 0, filesHash: nextPlan.filesHash });
      expect(readdirSync(join(workspace, 'games')).filter((name) => name.includes('.rollback-') || name.includes('.update-'))).toEqual([]);
    });
  });

  it('fails closed on new confirmation mismatch, current formal drift, and ordinary promote overwrite', () => {
    const oldInputs = fixture('game-formal-update-guards');
    const oldPlan = buildLifeAuthoringMaterializationPlan(oldInputs);
    const nextInputs = structuredClone(oldInputs);
    (nextInputs.entry as { title: string }).title = 'new';
    const nextPlan = buildLifeAuthoringMaterializationPlan(nextInputs);
    withTempWorkspace((workspace) => {
      const promoted = promoteLifeAuthoringMaterialization(oldInputs, { workspaceRoot: workspace, ownerConfirm: oldPlan.confirmationHash });
      expect(errorCodes(() => updateLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: join(workspace, 'not-inspected'), ownerConfirm: oldPlan.confirmationHash, currentFilesHash: promoted.filesHash,
      }))).toContain('confirmation_mismatch');
      expect(errorCodes(() => promoteLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: workspace, ownerConfirm: nextPlan.confirmationHash,
      }))).toContain('content_conflict');
      const entryPath = join(promoted.targetDirectory, 'life-launcher.json');
      const drifted = JSON.parse(readFileSync(entryPath, 'utf8')) as Record<string, unknown>;
      drifted.subtitle = 'external canonical drift';
      writeFileSync(entryPath, `${canonicalLifeGenerationJson(drifted)}\n`);
      expect(errorCodes(() => updateLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: workspace, ownerConfirm: nextPlan.confirmationHash, currentFilesHash: promoted.filesHash,
      }))).toContain('current_files_hash_mismatch');
      expect((JSON.parse(readFileSync(entryPath, 'utf8')) as { subtitle: string }).subtitle).toBe('external canonical drift');
    });
  });

  it('rolls back ordinary faults and preserves an external post-publication replacement plus the old recovery group', () => {
    const oldInputs = fixture('game-formal-update-race');
    const oldPlan = buildLifeAuthoringMaterializationPlan(oldInputs);
    const nextInputs = structuredClone(oldInputs);
    (nextInputs.entry as { title: string }).title = 'race update';
    const nextPlan = buildLifeAuthoringMaterializationPlan(nextInputs);
    for (const hooks of [
      { beforeWrite: (_path: string, index: number) => { if (index === 2) throw new Error('write probe'); } },
      { beforeRename: () => { throw new Error('swap probe'); } },
      { afterRename: () => { throw new Error('verify probe'); } },
    ]) withTempWorkspace((workspace) => {
      const promoted = promoteLifeAuthoringMaterialization(oldInputs, { workspaceRoot: workspace, ownerConfirm: oldPlan.confirmationHash });
      expect(() => updateLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: workspace, ownerConfirm: nextPlan.confirmationHash, currentFilesHash: promoted.filesHash, hooks,
      })).toThrow(LifeMaterializationError);
      expect(buildLifeFormalUpdatePlan(nextInputs, { workspaceRoot: workspace }).currentFilesHash).toBe(promoted.filesHash);
      expect(readdirSync(join(workspace, 'games')).filter((name) => name.includes('.rollback-') || name.includes('.update-'))).toEqual([]);
    });

    withTempWorkspace((workspace) => {
      const promoted = promoteLifeAuthoringMaterialization(oldInputs, { workspaceRoot: workspace, ownerConfirm: oldPlan.confirmationHash });
      const target = promoted.targetDirectory;
      const displaced = `${target}.displaced-update`;
      expect(() => updateLifeAuthoringMaterialization(nextInputs, {
        workspaceRoot: workspace,
        ownerConfirm: nextPlan.confirmationHash,
        currentFilesHash: promoted.filesHash,
        hooks: {
          afterRename: (publishedTarget) => {
            renameSync(publishedTarget, displaced);
            mkdirSync(publishedTarget);
            writeFileSync(join(publishedTarget, 'external-marker'), 'external');
          },
        },
      })).toThrow(LifeMaterializationError);
      expect(readFileSync(join(target, 'external-marker'), 'utf8')).toBe('external');
      const rollback = readdirSync(join(workspace, 'games')).find((name) => name.includes('.rollback-'));
      expect(rollback).toBeDefined();
      expect(readdirSync(join(workspace, 'games', rollback!)).sort()).toEqual([...LIFE_MATERIALIZATION_FILES].sort());
    });
  });

  it('uses lossless bigint filesystem identities across repeated external replacement races', () => {
    for (let index = 0; index < 4; index++) {
      const oldInputs = fixture(`game-formal-bigint-${index}`);
      const oldPlan = buildLifeAuthoringMaterializationPlan(oldInputs);
      const nextInputs = structuredClone(oldInputs);
      (nextInputs.entry as { title: string }).title = `bigint update ${index}`;
      const nextPlan = buildLifeAuthoringMaterializationPlan(nextInputs);
      withTempWorkspace((workspace) => {
        expect(typeof lstatSync(join(workspace, 'games'), { bigint: true }).ino).toBe('bigint');
        const promoted = promoteLifeAuthoringMaterialization(oldInputs, { workspaceRoot: workspace, ownerConfirm: oldPlan.confirmationHash });
        const target = promoted.targetDirectory;
        const displaced = `${target}.displaced-${index}`;
        expect(() => updateLifeAuthoringMaterialization(nextInputs, {
          workspaceRoot: workspace,
          ownerConfirm: nextPlan.confirmationHash,
          currentFilesHash: promoted.filesHash,
          hooks: {
            afterRename: (publishedTarget) => {
              renameSync(publishedTarget, displaced);
              mkdirSync(publishedTarget);
              writeFileSync(join(publishedTarget, 'external-marker'), `external-${index}`);
            },
          },
        })).toThrow(LifeMaterializationError);
        expect(readFileSync(join(target, 'external-marker'), 'utf8')).toBe(`external-${index}`);
      });
    }
  });
});
