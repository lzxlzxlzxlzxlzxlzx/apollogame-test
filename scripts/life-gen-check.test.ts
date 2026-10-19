import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { littleValleyGenerationBundle } from '../games/game-simlife/life-generation-bundle.fixture.js';

describe('life-gen-check CLI', () => {
  it('prints JSON diagnostics and a no-write plan without materializing repository files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'life-gen-cli-'));
    try {
      const path = join(dir, 'bundle.json');
      writeFileSync(path, JSON.stringify(littleValleyGenerationBundle()), 'utf8');
      const result = spawnSync(process.execPath, [
        resolve('node_modules/vite-node/vite-node.mjs'),
        resolve('scripts/life-gen-check.ts'),
        path,
        '--diagnostics',
        'json',
        '--plan',
      ], { cwd: process.cwd(), encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const output = JSON.parse(result.stdout) as { ok: boolean; plan: { mode: string; writesPerformed: boolean } };
      expect(output.ok).toBe(true);
      expect(output.plan).toEqual(expect.objectContaining({ mode: 'dry-run', writesPerformed: false }));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

