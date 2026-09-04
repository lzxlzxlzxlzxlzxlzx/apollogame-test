import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGame } from '../../scripts/acceptance-run.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('game-105 same-seed acceptance determinism', () => {
  it('produces the same complete scenario traces in two fresh sessions', async () => {
    const first = await runGame(root, 'game-105');
    const second = await runGame(root, 'game-105');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(snapshot(second)).toEqual(snapshot(first));
  }, 120_000);
});

function snapshot(result: Awaited<ReturnType<typeof runGame>>) {
  return result.scenarios.map(({ file, ok, res }) => ({
    file,
    ok,
    trace: res?.trace,
    error: res?.error,
  }));
}
