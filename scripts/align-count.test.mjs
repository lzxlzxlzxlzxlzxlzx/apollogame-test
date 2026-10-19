import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitRow, verdictOf, parseAlignment, evaluate, alignPath } from './align-count.mjs';

// align-count = 自证循环的收敛判据。这里钉的是「照写单人自己写的结论，还剩几条没完」——
// 不钉「这条算不算对齐」（那是人判，脚本只数不改）。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sheet = (rows, head = '| # | GDD 承诺 | 结论 | 证据 |') =>
  [head, '|---|---|---|---|', ...rows].join('\n');

describe('列定位：找表头里的「结论」列，不硬编码列序', () => {
  it('结论列在第 3 列 / 第 1 列 / 最后一列都数得对', () => {
    expect(evaluate(parseAlignment(sheet(['| 1 | 承诺 | ✅ | 证据 |']))).ok).toBe(1);
    expect(evaluate(parseAlignment(sheet(['| ✅ | 承诺 | 证据 |'], '| 结论 | GDD 承诺 | 证据 |'))).ok).toBe(1);
    expect(evaluate(parseAlignment(sheet(['| 1 | 承诺 | 证据 | ❌ |'], '| # | 承诺 | 证据 | 结论 |'))).bad).toBe(1);
  });

  it('没有「结论」列 → 一条都数不到（空单骗不过去：total=0 判未收敛）', () => {
    const r = evaluate(parseAlignment(sheet(['| 1 | 承诺 | ✅ | 证据 |'], '| # | 承诺 | 状态 | 证据 |')));
    expect(r.total).toBe(0);
    expect(r.converged).toBe(false);
  });

  it('多张表逐张累加（样板单就是分节多表）', () => {
    const two = sheet(['| 1 | a | ✅ | e |']) + '\n\n## 二、交互\n\n' + sheet(['| 2 | b | ❌ | e |']);
    const r = evaluate(parseAlignment(two));
    expect([r.total, r.ok, r.bad]).toEqual([2, 1, 1]);
  });
});

describe('结论符号：首个非空白字符必须是 ✅/⚠/❌', () => {
  it('首字符是符号才算；说明行/续行不被误数', () => {
    expect(verdictOf('✅')).toBe('✅');
    expect(verdictOf(' ⚠ **降格**')).toBe('⚠');
    expect(verdictOf('❌ **缺**')).toBe('❌');
    expect(verdictOf('基本 ✅')).toBe(null);        // 符号不在首位 = 不算结论
    expect(verdictOf('见下 / TBD')).toBe(null);
    expect(verdictOf('')).toBe(null);
  });

  it('splitRow 只认竖线行；正文段落不进表', () => {
    expect(splitRow('| a | b |')).toEqual(['a', 'b']);
    expect(splitRow('这是一段正文，里面也有 ✅')).toBe(null);
  });
});

describe('收敛判据：❌ 归零 ∧ 每条 ⚠ 有裁决去向', () => {
  it('全 ✅ → 收敛', () => {
    expect(evaluate(parseAlignment(sheet(['| 1 | a | ✅ | e |', '| 2 | b | ✅ | e |']))).converged).toBe(true);
  });

  it('有 ❌ → 未收敛（并点名是哪几条）', () => {
    const r = evaluate(parseAlignment(sheet(['| 1 | a | ✅ | e |', '| 2 | 立绘未做 | ❌ | 缺 |'])));
    expect(r.converged).toBe(false);
    expect(r.badRows[0]).toContain('立绘未做');
  });

  it('★ ⚠ 写了去向 → 收敛；⚠ 没写去向 = 默降 → 未收敛', () => {
    const withRoute = sheet(['| 1 | a | ⚠ 降格 | 差在重刻，已开 REQ-108-ENG-08 报 owner 判 |']);
    const orphan = sheet(['| 1 | a | ⚠ 降格 | 先这样吧，以后再说 |']);
    expect(evaluate(parseAlignment(withRoute)).converged).toBe(true);
    const r = evaluate(parseAlignment(orphan));
    expect(r.orphanWarn).toBe(1);
    expect(r.converged).toBe(false);          // 默降是 self-check.md 明令禁止的那条
  });

  it('去向凭据认多种写法：报 owner 裁 / REQ- 单号 / capgap / requests.md', () => {
    for (const note of ['报 owner 裁', '已开 REQ-111-ENG-04', '走 capgap 立单', '挂在 requests.md']) {
      expect(evaluate(parseAlignment(sheet([`| 1 | a | ⚠ | ${note} |`]))).converged).toBe(true);
    }
  });
});

describe('真文件 + CLI 退出码（不采信纯函数绿·端到端再量一次）', () => {
  const run = (args) => {
    try {
      return { code: 0, out: execFileSync('node', [join(ROOT, 'scripts/align-count.mjs'), ...args], { encoding: 'utf8' }) };
    } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
  };

  it('game108 S4 对齐单在档且数得出（存量样板·锚点断言）', () => {
    const r = run(['--game', 'game108', '--stage', 'S4', '--json']);
    const j = JSON.parse(r.out);
    expect(j.total).toBeGreaterThan(10);           // 存量单 17 条——别退化成「只数到 0 条也算过」
    expect(j.ok).toBeGreaterThan(0);
    expect(j.file).toBe(alignPath(ROOT, 'game108', 'S4'));
    expect(r.code).toBe(j.converged ? 0 : 1);      // 退出码与判定同源
  });

  it('单不在档 → 退出 2（不是 0·「没写单」不许当「已收敛」）', () => {
    const r = run(['--game', 'no-such-game', '--stage', 'S4']);
    expect(r.code).toBe(2);
    expect(r.out).toContain('不在档');
  });

  it('用法错 → 退出 2', () => {
    expect(run([]).code).toBe(2);
  });
});
