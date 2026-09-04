import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('./game-pipeline.mjs', import.meta.url));

const withRoot = (fn: (root: string) => void): void => {
  const root = mkdtempSync(join(tmpdir(), 'stage-review-'));
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
};

const put = (root: string, relative: string, content: string | object): void => {
  const file = join(root, relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
};

const gaps = [{ id: 'GAP-01', title: 'Physics', priority: 'P1', route: 'requests-3d', state: 'delivered', ticket: 'requests-3d.md#R', blocks: ['S3'] }];

function putS2Inputs(root: string): void {
  put(root, 'docs/design/g/brief.md', 'brief');
  put(root, 'docs/design/g/gdd.md', 'rules');
  put(root, 'docs/design/g/capability-plan.md', 'plan');
  put(root, 'docs/design/g/capability-gaps.json', gaps);
  put(root, 'docs/design/g/s1-s2-program-handoff.md', 'handoff');
  put(root, 'docs/design/g/s1-s2-program-evidence.md', 'evidence');
}

function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: root },
  });
}

const review = (root: string, stage: string) => run(root, ['review', 'g', stage, '--verdict', 'PASS', '--note', 'review', '--by', 'other']);
const board = (root: string) => run(root, ['board', 'g']).stdout;
const pipeline = (root: string) => JSON.parse(readFileSync(join(root, 'public/games/g/pipeline.json'), 'utf8'));

function completeS1AndS2(root: string): void {
  expect(run(root, ['concept', 'g', '--name', 'G', '--pitch', 'pipeline fixture']).status).toBe(0);
  expect(run(root, ['signoff', 'g', 'S1', '--note', 'approved']).status).toBe(0);
  expect(review(root, 'S2').status).toBe(0);
  expect(run(root, ['signoff', 'g', 'S2', '--note', 'approved']).status).toBe(0);
}

describe('stage-specific review freshness', () => {
  it('keeps S2 fresh after game source changes and writes reviewHash', () => withRoot((root) => {
    put(root, 'games/g/game.ts', 'export const version = 1;');
    putS2Inputs(root);
    expect(review(root, 'S2').status).toBe(0);
    expect(pipeline(root).reviews.S2.reviewHash).toBeTruthy();
    put(root, 'games/g/game.ts', 'export const version = 2;');
    expect(board(root)).toContain('复查门: ✓ PASS');
  }));

  it('expires S2 when GDD, capability plan, or gaps change', () => withRoot((root) => {
    put(root, 'games/g/game.ts', 'export const version = 1;');
    putS2Inputs(root);
    expect(review(root, 'S2').status).toBe(0);
    put(root, 'docs/design/g/gdd.md', 'changed rules');
    expect(board(root)).toContain('S2 策划/能力输入已变动');
    expect(review(root, 'S2').status).toBe(0);
    put(root, 'docs/design/g/capability-plan.md', 'changed plan');
    expect(board(root)).toContain('S2 策划/能力输入已变动');
    expect(review(root, 'S2').status).toBe(0);
    put(root, 'docs/design/g/capability-gaps.json', [{ ...gaps[0], title: 'Changed physics' }]);
    expect(board(root)).toContain('S2 策划/能力输入已变动');
  }));

  it('expires S3 review and machine evidence after S3 source changes', () => withRoot((root) => {
    put(root, 'games/g/game.ts', 'export const version = 1;');
    expect(review(root, 'S3').status).toBe(0);
    const pf = pipeline(root);
    pf.evidence = { S3: { exit: 0, at: '2026-08-26T00:00:00Z', gameHash: pf.reviews.S3.gameHash } };
    put(root, 'public/games/g/pipeline.json', pf);
    put(root, 'games/g/game.ts', 'export const version = 2;');
    const output = board(root);
    expect(output).toContain('机器门: ⚠ 证据过期');
    expect(output).toContain('复查门: ⚠ 复查过期（游戏文件已变动');
  }));

  it('lets S4 reach its own gate after a signed, stale S3 handoff', () => withRoot((root) => {
    put(root, 'games/g/game.ts', 'export const version = 1;');
    putS2Inputs(root);
    completeS1AndS2(root);
    expect(review(root, 'S3').status).toBe(0);
    const pf = pipeline(root);
    pf.evidence = { S3: { exit: 0, at: '2026-08-26T00:00:00Z', gameHash: pf.reviews.S3.gameHash } };
    put(root, 'public/games/g/pipeline.json', pf);
    expect(run(root, ['signoff', 'g', 'S3', '--note', 'approved']).status).toBe(0);
    put(root, 'games/g/game.ts', 'export const version = 2;');
    const gate = run(root, ['gate', 'g', 'S4']);
    expect(gate.status).not.toBe(0);
    expect(gate.stdout + gate.stderr).toContain('验收剧本不足');
    expect(gate.stdout + gate.stderr).not.toContain('复查前置硬闸');
  }));

  it('keeps S4 blocked when S3 has no independent review', () => withRoot((root) => {
    put(root, 'games/g/game.ts', 'export const version = 1;');
    putS2Inputs(root);
    completeS1AndS2(root);
    const pf = pipeline(root);
    pf.evidence = { S3: { exit: 0, at: '2026-08-26T00:00:00Z', gameHash: 'stale' } };
    put(root, 'public/games/g/pipeline.json', pf);
    expect(run(root, ['signoff', 'g', 'S3', '--note', 'approved']).status).toBe(0);
    const gate = run(root, ['gate', 'g', 'S4']);
    expect(gate.status).not.toBe(0);
    expect(gate.stdout + gate.stderr).toContain('复查前置硬闸');
  }));

  it('shows the current S5 review instead of stale, signed S3/S4 snapshots', () => withRoot((root) => {
    put(root, 'games/g/game.ts', 'export const version = 1;');
    putS2Inputs(root); completeS1AndS2(root);
    expect(review(root, 'S3').status).toBe(0); expect(review(root, 'S4').status).toBe(0);
    let pf = pipeline(root);
    pf.evidence = {
      S3: { exit: 0, at: '2026-08-26T00:00:00Z', gameHash: pf.reviews.S3.gameHash },
      S4: { exit: 0, at: '2026-08-26T00:00:00Z', gameHash: pf.reviews.S4.gameHash },
    };
    put(root, 'public/games/g/pipeline.json', pf);
    expect(run(root, ['signoff', 'g', 'S3', '--note', 'approved']).status).toBe(0);
    expect(run(root, ['signoff', 'g', 'S4', '--note', 'approved']).status).toBe(0);
    put(root, 'games/g/game.ts', 'export const version = 2;');
    expect(review(root, 'S5').status).toBe(0);
    pf = pipeline(root);
    pf.evidence.S5 = { exit: 0, at: '2026-08-26T00:00:00Z', gameHash: pf.reviews.S5.gameHash };
    put(root, 'public/games/g/pipeline.json', pf);
    expect(board(root)).toContain('→ 下一步：S5');
  }));
});
