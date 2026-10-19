import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cli = resolve('node_modules/vite-node/vite-node.mjs');
const script = resolve('scripts/life-bundle-compose.ts');
const demonRoot = resolve('docs/design/game-demon-castle');

function invoke(args: readonly string[]) {
  return spawnSync(process.execPath, [cli, script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('life-bundle-compose CLI', () => {
  it('defaults to a zero-write deterministic plan and rejects ambiguous modes', () => {
    const before = existsSync(join(demonRoot, 'bundle.candidate.json'))
      ? readFileSync(join(demonRoot, 'bundle.candidate.json'), 'utf8')
      : undefined;
    const manifestPath = join('docs', 'design', 'game-demon-castle', 'bundle.sources.json');
    const planned = invoke([manifestPath, '--source-root', demonRoot]);
    expect(planned.status, planned.stderr).toBe(0);
    expect(JSON.parse(planned.stdout)).toMatchObject({
      ok: true,
      mode: 'plan',
      writesPerformed: false,
      bundleHash: 'sha256:e58f38ff0da5c706c5adac7013e82c809cffad5460cd882486136c625c78e6ba',
    });
    expect(existsSync(join(demonRoot, 'bundle.candidate.json'))
      ? readFileSync(join(demonRoot, 'bundle.candidate.json'), 'utf8')
      : undefined).toBe(before);

    const ambiguous = invoke(['bundle.sources.json', '--source-root', demonRoot, '--plan', '--write-candidate']);
    expect(ambiguous.status).toBe(2);
    expect(ambiguous.stderr).toContain('Usage:');

    for (const unsafeManifest of [
      resolve(manifestPath),
      'docs/design/game-demon-castle/../game-demon-castle/bundle.sources.json',
      'https://example.test/bundle.sources.json',
      join('docs', 'design', 'game-simlife', 'bundle.sources.json'),
    ]) {
      const rejected = invoke([unsafeManifest, '--source-root', demonRoot]);
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toContain('Usage:');
    }
  });

  it('writes only the fixed candidate name and is byte-idempotent', () => {
    const root = mkdtempSync(join(tmpdir(), 'life-bundle-compose-cli-'));
    try {
      for (const name of ['bundle.sources.json', 'world.life.json', 'actors.patch.json', 'construction.patch.json', 'plot.patch.json', 'asset-slots.json']) {
        writeFileSync(join(root, name), readFileSync(join(demonRoot, name)));
      }
      const first = invoke(['bundle.sources.json', '--source-root', resolve(root), '--write-candidate']);
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, mode: 'write-candidate', writesPerformed: true, writtenFiles: 1 });
      const candidatePath = join(root, 'bundle.candidate.json');
      const bytes = readFileSync(candidatePath, 'utf8');

      const second = invoke(['bundle.sources.json', '--source-root', resolve(root), '--write-candidate']);
      expect(second.status, second.stderr).toBe(0);
      expect(JSON.parse(second.stdout)).toMatchObject({ ok: true, mode: 'write-candidate', writesPerformed: false, writtenFiles: 0 });
      expect(readFileSync(candidatePath, 'utf8')).toBe(bytes);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
