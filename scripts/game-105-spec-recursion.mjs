// S4 Local AI M1 recursive verification: mutate an isolated snapshot, never the shared worktree.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gameHash } from './game-pipeline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'game-105-recursion-'));
const evidenceFile = join(ROOT, 'public', 'games', 'game-105', 'probe', 'S4-recursion.json');
const session = 'games/game-105/tower-session.ts';
const lifecycle = 'games/game-105/tower-lifecycle.ts';
const CASES = [
  ['92% 抽离线', lifecycle, 'return pullDistance >= EXTRACTION_DISTANCE;', 'return pullDistance >= 0;', 'acceptance'],
  ['玩家完成互动按颜色计心动值', session, 'if (completed) this.heartDelta += card.block.score;', 'if (completed) this.heartDelta += 0;', 'session'],
  ['完整抽离进入互动队列', session, 'this.interactionQueue.push(card);', 'void card;', 'session'],
  ['玩家互动后交给 AI', session, "this.turn = 'ai'; this.phase = 'ai-observe';", "this.turn = 'player'; this.phase = 'player-ready';", 'acceptance'],
  ['AI 模板回应只显示一次', session, 'this.aiReplyCount++;\n    this.aiReplyVisible = true;', 'this.aiReplyCount++;\n    this.aiReplyVisible = false;', 'acceptance'],
  ['残留失稳至少三块才即时判负', session, 'if (this.unstableBlocks.size >= COLLAPSE_BLOCK_COUNT) { this.lockCollapse(); return; }', 'if (this.unstableBlocks.size >= COLLAPSE_BLOCK_COUNT) { return; }', 'session'],
  ['同一失稳块去重', session, 'this.unstableBlocks.add(id);', 'this.unstableBlocks.add(`${id}-${this.unstableBlocks.size}`);', 'session'],
  ['抓取期间回拉重新计入塔体', session, 'this.extractedBlocks.delete(block.id);', 'void block;', 'session'],
  ['连续 30 帧稳定窗口', session, 'if (this.stableFrames < 30) return;', 'if (this.stableFrames < 1) return;', 'session'],
  ['900 帧未稳定终局兜底', session, 'if (++this.settlingFrames >= SETTLING_TIMEOUT_FRAMES) { this.lockCollapse(); return; }', 'if (++this.settlingFrames >= SETTLING_TIMEOUT_FRAMES) { return; }', 'session'],
  ['睡眠前不得显示战利品', session, 'if (!sleepingIds.has(id)) continue;', 'if (false) continue;', 'session'],
  // S4 玩法增量：每条都以 GD 剧本或最小会话回归证明故意破坏后会转红。
  ['本局回应最多 140 字', session, 'setDraftResponse(value: string): void { this.draftResponse = value.slice(0, 140); }', 'setDraftResponse(value: string): void { this.draftResponse = value.slice(0, 0); }', 'acceptance'],
  ['每局只有一次同频道换卡', session, 'this.swapsRemaining--; card.text = replacement; this.lastSwapWasUnseenSameChannel = true;', 'this.swapsRemaining += 0; card.text = replacement; this.lastSwapWasUnseenSameChannel = true;', 'acceptance'],
  ['非直接抓取的真实落块必须退役', session, 'this.pendingExtractionIds.set(block.id, this.pendingExtractionIds.get(block.id) ?? ++this.extractionSeq);\n      this.retiredBlocks.add(block.id);', 'this.pendingExtractionIds.set(block.id, this.pendingExtractionIds.get(block.id) ?? ++this.extractionSeq);\n      void block;', 'session'],
  ['余波最多两张独立卡并将其余合并', session, 'if (index >= 3) { this.aftershockSummary++; this.overflowAftershocks.push(block); continue; }', 'if (index >= 99) { this.aftershockSummary++; this.overflowAftershocks.push(block); continue; }', 'acceptance'],
  ['AI 收尾只生成一次', session, 'this.aiWrapCount++;', 'this.aiWrapCount += 2;', 'acceptance'],
];

for (const name of ['games', 'docs', 'scripts', 'src']) cpSync(join(ROOT, name), join(scratch, name), { recursive: true });
for (const name of ['package.json', 'tsconfig.json', 'vite.config.ts', 'vite.assets.ts']) cpSync(join(ROOT, name), join(scratch, name));
symlinkSync(join(ROOT, 'node_modules'), join(scratch, 'node_modules'), 'junction');

const run = (kind) => spawnSync(process.execPath, kind === 'acceptance'
  ? [join(scratch, 'node_modules', 'vite-node', 'vite-node.mjs'), join(scratch, 'scripts', 'acceptance-run.mjs'), '--game', 'game-105']
  : [join(scratch, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'games/game-105/tower-session.test.ts'], {
  cwd: scratch, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ZEROCRAFT_ACCEPTANCE_ROOT: scratch, ZEROCRAFT_ACCEPTANCE_CLI: '1' },
});
let failed = false;
let baseline = false;
const results = [];
try {
  const originals = new Map([...new Set(CASES.map(([, path]) => path))].map((path) => [path, readFileSync(join(scratch, path), 'utf8')]));
  for (const kind of ['acceptance', 'session']) {
    const result = run(kind);
    if ((result.status ?? 1) !== 0) {
      const detail = (result.stderr || result.stdout || '').trim().slice(-1200);
      throw new Error(`baseline ${kind} is not green${detail ? `\n${detail}` : ''}`);
    }
  }
  baseline = true;
  console.log('baseline PASS');
  for (const [clause, path, find, replace, judge] of CASES) {
    const target = join(scratch, path); const original = originals.get(path);
    if (!original?.includes(find)) throw new Error(`anchor missing: ${clause}`);
    writeFileSync(target, original.replace(find, replace));
    const result = run(judge);
    const guarded = (result.status ?? 1) !== 0;
    results.push({ clause, judge, guarded, exit: result.status ?? 1 });
    console.log(`${guarded ? 'PASS' : 'FAIL'} ${clause}`);
    if (!guarded) failed = true;
    writeFileSync(target, original);
  }
} finally {
  mkdirSync(dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, JSON.stringify({ gameHash: gameHash(ROOT, 'game-105'), baseline, ok: baseline && !failed && results.length === CASES.length, cases: results, at: new Date().toISOString() }, null, 2) + '\n');
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
