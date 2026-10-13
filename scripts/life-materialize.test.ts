import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveAssetSlotBriefFingerprint } from '../src/assets/asset-slot-brief.js';
import {
  lifeGenerationPayload,
  sha256Canonical,
  type LifeGenerationBundleV1,
} from '../src/authoring/life-generation-bundle.js';
import { littleValleyGenerationBundle } from '../src/authoring/life-generation-bundle.fixture.js';
import { seasideMarketHostDescriptorFixture } from '../src/authoring/life-host-descriptor.fixture.js';
import { LIFE_LAUNCHER_SCHEMA } from '../src/launcher/life-launcher-catalog-core.js';

function writeInputs(directory: string): [string, string, string] {
  const slug = 'game-cli-materialized';
  const bundle = structuredClone(littleValleyGenerationBundle());
  (bundle.game as { slug: string }).slug = slug;
  (bundle.game.lifePackage as { meta: { id: string } }).meta.id = slug;
  (bundle.assetSlots.draft as { game: string }).game = slug;
  for (const slot of bundle.assetSlots.draft.slots) {
    (slot.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(slot);
  }
  const complete: LifeGenerationBundleV1 = {
    ...bundle,
    provenance: {
      baseHash: sha256Canonical(lifeGenerationPayload(bundle)),
      sourceHashes: {
        lifePackage: sha256Canonical(bundle.game.lifePackage),
        assetSlotsDraft: sha256Canonical(bundle.assetSlots.draft),
      },
    },
  };
  const host = structuredClone(seasideMarketHostDescriptorFixture());
  (host as { slug: string }).slug = slug;
  (host as { artSlug: string }).artSlug = slug;
  (host.save as { namespace: string }).namespace = `life:${slug}:v1`;
  const entry = {
    schema: LIFE_LAUNCHER_SCHEMA, id: slug, title: 'CLI Life', subtitle: 'strict fixture',
    description: 'CLI materializer fixture', color: '#17364a', accentColor: '#62d6c5', icon: '🌱',
  };
  const paths: [string, string, string] = [join(directory, 'bundle.json'), join(directory, 'host.json'), join(directory, 'entry.json')];
  for (const [path, value] of [[paths[0], complete], [paths[1], host], [paths[2], entry]] as const) writeFileSync(path, JSON.stringify(value), 'utf8');
  return paths;
}

function invoke(paths: readonly string[], extra: readonly string[]) {
  return spawnSync(process.execPath, [
    resolve('node_modules/vite-node/vite-node.mjs'),
    resolve('scripts/life-materialize.ts'),
    paths[0]!, '--host', paths[1]!, '--entry', paths[2]!, ...extra,
  ], { cwd: process.cwd(), encoding: 'utf8' });
}

describe('life-materialize CLI', () => {
  it('defaults to M0 plan and requires the exact confirmation before M1 scratch apply', () => {
    const directory = mkdtempSync(join(tmpdir(), 'life-materialize-cli-'));
    const target = mkdtempSync(join(tmpdir(), 'life-materialize-target-'));
    try {
      const paths = writeInputs(directory);
      const planned = invoke(paths, []);
      expect(planned.status, planned.stderr).toBe(0);
      const plan = JSON.parse(planned.stdout) as { mode: string; writesPerformed: boolean; confirmationHash: string; files: unknown[] };
      expect(plan).toMatchObject({ mode: 'plan', writesPerformed: false });
      expect(plan.files).toHaveLength(4);
      expect(readFileSync(paths[0]!, 'utf8')).not.toContain('confirmationHash');

      const missing = invoke(paths, ['--apply-authoring', '--target-root', target]);
      expect(missing.status).toBe(2);
      expect(missing.stderr).toContain('requires --owner-confirm');

      const wrong = invoke(paths, ['--apply-authoring', '--target-root', target, '--owner-confirm', `sha256:${'0'.repeat(64)}`]);
      expect(wrong.status).toBe(1);
      expect(wrong.stderr).toContain('confirmation_mismatch');

      const applied = invoke(paths, ['--apply-authoring', '--target-root', target, '--owner-confirm', plan.confirmationHash]);
      expect(applied.status, applied.stderr).toBe(0);
      expect(JSON.parse(applied.stdout)).toMatchObject({ mode: 'apply-authoring', writesPerformed: true, writtenFiles: 4 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('promotes only with mutually exclusive mode, exact confirmation, and explicit workspace root', () => {
    const directory = mkdtempSync(join(tmpdir(), 'life-materialize-promote-cli-'));
    const workspace = mkdtempSync(join(tmpdir(), 'life-materialize-promote-workspace-'));
    mkdirSync(join(workspace, 'games'));
    try {
      const paths = writeInputs(directory);
      const planned = invoke(paths, ['--plan']);
      expect(planned.status, planned.stderr).toBe(0);
      const plan = JSON.parse(planned.stdout) as { confirmationHash: string };

      const mutuallyExclusive = invoke(paths, ['--apply-authoring', '--promote', '--owner-confirm', plan.confirmationHash, '--target-root', workspace, '--workspace-root', workspace]);
      expect(mutuallyExclusive.status).toBe(2);
      expect(mutuallyExclusive.stderr).toContain('mutually exclusive');

      const duplicateMode = invoke(paths, ['--promote', '--promote', '--owner-confirm', plan.confirmationHash, '--workspace-root', workspace]);
      expect(duplicateMode.status).toBe(2);
      expect(duplicateMode.stderr).toContain('duplicate option --promote');

      const missing = invoke(paths, ['--promote', '--workspace-root', workspace]);
      expect(missing.status).toBe(2);
      expect(missing.stderr).toContain('requires --owner-confirm');

      const wrongRootFlag = invoke(paths, ['--promote', '--owner-confirm', plan.confirmationHash, '--target-root', workspace]);
      expect(wrongRootFlag.status).toBe(2);
      expect(wrongRootFlag.stderr).toContain('requires --owner-confirm and --workspace-root');

      const promoted = invoke(paths, ['--promote', '--owner-confirm', plan.confirmationHash, '--workspace-root', workspace]);
      expect(promoted.status, promoted.stderr).toBe(0);
      expect(JSON.parse(promoted.stdout)).toMatchObject({ mode: 'promote', writesPerformed: true, writtenFiles: 4 });

      const repeated = invoke(paths, ['--promote', '--owner-confirm', plan.confirmationHash, '--workspace-root', workspace]);
      expect(repeated.status, repeated.stderr).toBe(0);
      expect(JSON.parse(repeated.stdout)).toMatchObject({ mode: 'promote', writesPerformed: false, writtenFiles: 0 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('plans and applies an owner-confirmed formal update with old and new hashes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'life-materialize-update-cli-'));
    const workspace = mkdtempSync(join(tmpdir(), 'life-materialize-update-workspace-'));
    mkdirSync(join(workspace, 'games'));
    try {
      const paths = writeInputs(directory);
      const originalPlan = JSON.parse(invoke(paths, ['--plan']).stdout) as { confirmationHash: string; filesHash: string };
      const promoted = invoke(paths, ['--promote', '--owner-confirm', originalPlan.confirmationHash, '--workspace-root', workspace]);
      expect(promoted.status, promoted.stderr).toBe(0);
      const entry = JSON.parse(readFileSync(paths[2]!, 'utf8')) as Record<string, unknown>;
      entry.title = 'CLI Life Updated';
      writeFileSync(paths[2]!, JSON.stringify(entry), 'utf8');

      const preflight = invoke(paths, ['--plan-update', '--workspace-root', workspace]);
      expect(preflight.status, preflight.stderr).toBe(0);
      const updatePlan = JSON.parse(preflight.stdout) as { mode: string; writesPerformed: boolean; confirmationHash: string; currentFilesHash: string; filesHash: string };
      expect(updatePlan).toMatchObject({ mode: 'plan-update', writesPerformed: false, currentFilesHash: originalPlan.filesHash });

      const missingOld = invoke(paths, ['--update', '--owner-confirm', updatePlan.confirmationHash, '--workspace-root', workspace]);
      expect(missingOld.status).toBe(2);
      expect(missingOld.stderr).toContain('requires --owner-confirm, --current-files-hash, and --workspace-root');

      const updated = invoke(paths, ['--update', '--owner-confirm', updatePlan.confirmationHash, '--current-files-hash', updatePlan.currentFilesHash, '--workspace-root', workspace]);
      expect(updated.status, updated.stderr).toBe(0);
      expect(JSON.parse(updated.stdout)).toMatchObject({ mode: 'update', writesPerformed: true, writtenFiles: 4, previousFilesHash: originalPlan.filesHash, filesHash: updatePlan.filesHash });
      const repeated = invoke(paths, ['--update', '--owner-confirm', updatePlan.confirmationHash, '--current-files-hash', updatePlan.currentFilesHash, '--workspace-root', workspace]);
      expect(repeated.status, repeated.stderr).toBe(0);
      expect(JSON.parse(repeated.stdout)).toMatchObject({ mode: 'update', writesPerformed: false, writtenFiles: 0 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
