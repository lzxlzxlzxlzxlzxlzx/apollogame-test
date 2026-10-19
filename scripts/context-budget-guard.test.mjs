// 上下文预算守卫（REQ-CTX）门禁：真仓库必须在预算内 + 检查核语义自证。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkBudget } from './context-budget-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const budget = JSON.parse(readFileSync(join(ROOT, 'scripts', 'context-budget-baseline.json'), 'utf8'));

describe('context-budget-guard — 真仓库在预算内（门禁）', () => {
  it('requests 池/游戏当前单 ≤ 封顶 · T0 必读各 ≤ 封顶 · 每本手册 ≤行数封顶 + ≤字符封顶 · requests-3d ≤ 封顶', () => {
    const t0Chars = {};
    for (const f of Object.keys(budget.t0MaxChars)) t0Chars[f] = readFileSync(join(ROOT, f), 'utf8').length;
    const playbookLines = {};
    const playbookChars = {};
    for (const f of readdirSync(join(ROOT, 'docs', 'playbooks'))) {
      if (!f.endsWith('.md')) continue;
      const text = readFileSync(join(ROOT, 'docs', 'playbooks', f), 'utf8');
      playbookLines[`docs/playbooks/${f}`] = text.split('\n').length;
      playbookChars[`docs/playbooks/${f}`] = text.length;
    }
    const requests3dChars = readFileSync(join(ROOT, 'docs/workflow/requests-3d.md'), 'utf8').length;
    const gameRequestsChars = {};
    const gameRequestsLines = {};
    for (const d of readdirSync(join(ROOT, 'docs', 'design'))) {
      try {
        const file = `docs/design/${d}/requests.md`;
        const text = readFileSync(join(ROOT, file), 'utf8');
        gameRequestsChars[file] = text.length;
        gameRequestsLines[file] = text.split('\n').length;
      } catch { /* 该游戏无需求单 */ }
    }
    const actual = {
      requestsChars: readFileSync(join(ROOT, 'docs/workflow/requests.md'), 'utf8').length,
      t0Chars, playbookLines, playbookChars, gameRequestsChars, gameRequestsLines, requests3dChars,
    };
    expect(checkBudget(actual, budget)).toEqual([]); // 超预算即红·点名文件与数字
  });
});

describe('context-budget-guard — 检查核语义（自证）', () => {
  const B = { requestsPoolMaxEntries: 10, requestsPoolMaxChars: 100, t0MaxChars: { 'a.md': 50 }, playbookMaxLines: 80 };
  it('10 硬槽：第 11 条被拒（owner 2026-07-15「做不完不许加新的·先清后加」）', () => {
    const i = checkBudget({ requestsEntries: 11, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {} }, B);
    expect(i).toHaveLength(1);
    expect(i[0]).toContain('硬槽');
    expect(checkBudget({ requestsEntries: 10, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {} }, B)).toEqual([]);
  });
  it('池超顶点名', () => {
    const i = checkBudget({ requestsEntries: 1, requestsChars: 101, t0Chars: { 'a.md': 10 }, playbookLines: {} }, B);
    expect(i).toHaveLength(1);
    expect(i[0]).toContain('requests.md');
  });
  it('T0 超顶/缺文件点名', () => {
    expect(checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 51 }, playbookLines: {} }, B)[0]).toContain('a.md');
    expect(checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: {}, playbookLines: {} }, B)[0]).toContain('缺文件');
  });
  it('游戏需求单超顶点名（owner 07-15 批②·done 票迁归档纪律）', () => {
    const B2 = { ...B, gameRequestsMaxChars: 100, gameRequestsMaxLines: 10 };
    const i = checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {}, gameRequestsChars: { 'docs/design/game-g/requests.md': 101 }, gameRequestsLines: { 'docs/design/game-g/requests.md': 10 } }, B2);
    expect(i).toHaveLength(1);
    expect(i[0]).toContain('game-g');
    expect(checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {}, gameRequestsChars: { 'docs/design/game-g/requests.md': 100 }, gameRequestsLines: { 'docs/design/game-g/requests.md': 10 } }, B2)).toEqual([]);
  });
  it('游戏需求单行数超顶点名', () => {
    const B2 = { ...B, gameRequestsMaxChars: 100, gameRequestsMaxLines: 10 };
    const i = checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {}, gameRequestsChars: { 'docs/design/game-g/requests.md': 100 }, gameRequestsLines: { 'docs/design/game-g/requests.md': 11 } }, B2);
    expect(i).toHaveLength(1);
    expect(i[0]).toContain('11 行');
  });
  it('旧游戏需求单按兼容棘轮封顶，降到统一线后要求删兼容项', () => {
    const file = 'docs/design/legacy/requests.md';
    const B2 = { ...B, gameRequestsMaxChars: 100, gameRequestsMaxLines: 10, gameRequestsLegacyMaxChars: { [file]: 150 }, gameRequestsLegacyMaxLines: { [file]: 15 } };
    const base = { requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {} };
    expect(checkBudget({ ...base, gameRequestsChars: { [file]: 150 }, gameRequestsLines: { [file]: 15 } }, B2)).toEqual([]);
    expect(checkBudget({ ...base, gameRequestsChars: { [file]: 151 }, gameRequestsLines: { [file]: 15 } }, B2)[0]).toContain('兼容棘轮');
    const cleaned = checkBudget({ ...base, gameRequestsChars: { [file]: 100 }, gameRequestsLines: { [file]: 10 } }, B2);
    expect(cleaned).toHaveLength(2);
    expect(cleaned.join('\n')).toContain('删除 gameRequestsLegacyMaxChars');
    expect(cleaned.join('\n')).toContain('删除 gameRequestsLegacyMaxLines');
  });
  it('手册超 80 行点名', () => {
    const i = checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: { 'docs/playbooks/x.md': 81 } }, B);
    expect(i).toHaveLength(1);
    expect(i[0]).toContain('x.md');
  });
  it('手册超字符封顶点名（行数达标·字符密度超顶）', () => {
    const B3 = { ...B, playbookMaxChars: 100 };
    const i = checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: { 'docs/playbooks/x.md': 5 }, playbookChars: { 'docs/playbooks/x.md': 101 } }, B3);
    expect(i).toHaveLength(1);
    expect(i[0]).toContain('x.md');
    expect(checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: { 'docs/playbooks/x.md': 5 }, playbookChars: { 'docs/playbooks/x.md': 100 } }, B3)).toEqual([]);
  });
  it('requests-3d 超封顶点名（此前完全在监控盲区）', () => {
    const B4 = { ...B, requests3dMaxChars: 100 };
    const i = checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {}, requests3dChars: 101 }, B4);
    expect(i).toHaveLength(1);
    expect(i[0]).toContain('requests-3d.md');
    expect(checkBudget({ requestsEntries: 1, requestsChars: 1, t0Chars: { 'a.md': 10 }, playbookLines: {}, requests3dChars: 100 }, B4)).toEqual([]);
  });
  it('全在预算内 → 空', () => {
    expect(checkBudget({ requestsEntries: 1, requestsChars: 99, t0Chars: { 'a.md': 50 }, playbookLines: { 'docs/playbooks/x.md': 80 } }, B)).toEqual([]);
  });
});

describe('context-budget-guard — CLI 红腿（测试加固批·2026-08-24）', () => {
  it('超顶树 → exit 1 + FAIL 判词（此前只测纯函数·CLI「问题→退出码 1」映射零覆盖）', () => {
    // 守卫的 ROOT/BASELINE 由脚本自身位置推导（无 cwd/参数注入口）→ hermetic 姿势 = 把守卫
    // 复制进临时根（它只 import node 内建·零仓内依赖）+ 种一棵超顶的最小树。绝不写真仓。
    const root = mkdtempSync(join(tmpdir(), 'ctx-budget-cli-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(root, 'docs', 'playbooks'), { recursive: true });
      mkdirSync(join(root, 'docs', 'workflow'), { recursive: true });
      copyFileSync(join(ROOT, 'scripts', 'context-budget-guard.mjs'), join(root, 'scripts', 'context-budget-guard.mjs'));
      writeFileSync(join(root, 'scripts', 'context-budget-baseline.json'),
        JSON.stringify({ requestsPoolMaxEntries: 10, requestsPoolMaxChars: 10, t0MaxChars: {}, playbookMaxLines: 100 }));
      writeFileSync(join(root, 'docs', 'workflow', 'requests.md'), 'x'.repeat(50)); // 50 字符 > 封顶 10 → 超顶
      const r = spawnSync(process.execPath, [join(root, 'scripts', 'context-budget-guard.mjs')], { encoding: 'utf8', timeout: 30000 });
      expect(r.status, r.stdout + r.stderr).toBe(1); // 撤修验红本体：守卫失能则等不到 1
      expect(r.stdout).toContain('CONTEXT-BUDGET: FAIL');
      expect(r.stdout).toContain('requests.md'); // 锚点命中：点名的确是种下的超顶文件
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
