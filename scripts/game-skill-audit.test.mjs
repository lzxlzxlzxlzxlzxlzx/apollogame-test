// scripts/game-skill-audit.test.mjs —— Q1 三条新 regex 的行为契约测试（8/4 大评审消费路径批·2026-08-10）。
// 跑真 CLI（spawn node scripts/game-skill-audit.mjs）+ 全 hermetic fixture：
//   mkdtemp 造 games/<fx>/ 违规样本当被测源（cwd 指过去·GAMES_DIR 相对 cwd），
//   基线用 ZEROCRAFT_AUDIT_BASELINE 指向临时固定文件（照 audit-ratchet.test.mjs 的既有模式·不碰真基线）。
// 断言分档语义（Q1 spec）：
//   ① React 屏逃逸（.tsx 文件 / from 'react'）= 红（判 FAIL + 棘轮拦）·点名文件；
//   ② 墙钟 Date.now/performance.now = ⚠ 建议档·不进判词不改退出码；
//   ③ DOM 逃生（insertAdjacentHTML/document.write）= 红·与 innerHTML 同级·点名 file:line；
//   ④ 新指标走同一棘轮：Lead 批注基线覆盖 → 显示但不红判（存量豁免可见·新增拦截）。
// 快车道友好：4 个 fixture 游戏共 5 次 spawn，纯 node/fs 秒级。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = join(ROOT, 'scripts', 'game-skill-audit.mjs');

let TMP;
beforeAll(() => {
  TMP = mkdtempSync(join(tmpdir(), 'audit-q1-'));
  const put = (rel, text) => {
    mkdirSync(dirname(join(TMP, rel)), { recursive: true });
    writeFileSync(join(TMP, rel), text);
  };
  // ① React 屏逃逸两式
  put('games/fx-react/hud.tsx', 'export const Hud = () => null;\n');
  put('games/fx-import/screen.ts', "import { useState } from 'react';\nexport const s = useState;\n");
  // ② 墙钟（唯一问题=建议档；黄旗零能力/零测试不影响退出码）
  put('games/fx-clock/sim.ts', 'export const t0 = Date.now();\nexport const t1 = performance.now();\n');
  // ③ DOM 逃生两式同文件
  put('games/fx-dom/hack.ts', "document.body.insertAdjacentHTML('beforeend', '<b>x</b>');\ndocument.write('y');\n");
  put('games/fx-cart-ledger/logic.ts', 'export const value = 1;\n');
  put('library/fx-cart-ledger/manifest.json', '{}\n');
  put('library/fx-cart-ledger/art/art-ledger.json', '{"rows":[]}\n');
  put('games/fx-cart-shadow/logic.ts', 'export const value = 1;\n');
  put('library/fx-cart-shadow/manifest.json', '{}\n');
  put('public/games/fx-cart-shadow/art/art-ledger.json', '{"rows":[]}\n');
});
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function runAudit(games, baselineObj) {
  const bl = join(TMP, `bl-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(bl, JSON.stringify(baselineObj ?? { games: {} }));
  const r = spawnSync('node', [AUDIT, ...games], {
    cwd: TMP, // GAMES_DIR='games' 相对 cwd → 只扫 fixture
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, ZEROCRAFT_AUDIT_BASELINE: bl },
  });
  return { code: r.status, all: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('卡带美术台账路径', () => {
  it('library 台账消除假缺账；同名 public 旧账不能掩盖卡带缺账', () => {
    const found = runAudit(['fx-cart-ledger']);
    expect(found.code).toBe(0);
    expect(found.all).not.toContain('无美术台账');
    const shadow = runAudit(['fx-cart-shadow']);
    expect(shadow.code).toBe(0);
    expect(shadow.all).toContain('无美术台账');
  });
});

describe('Q1 新红旗 ①：React 屏逃逸（.tsx / from react）', () => {
  it('.tsx 文件 → 红判 FAIL + 棘轮拦 + 点名文件', () => {
    const { code, all } = runAudit(['fx-react']);
    expect(code).toBe(1);
    expect(all).toContain('React屏×1');
    expect(all).toContain('games/fx-react/hud.tsx (.tsx)');
    expect(all).toContain('AUDIT: FAIL');
    expect(all).toContain('RATCHET: FAIL'); // 新游戏红旗·无基线条目即拦
  }, 60000);

  it(".ts 里 from 'react' → 红判 FAIL + 点名 file:line", () => {
    const { code, all } = runAudit(['fx-import']);
    expect(code).toBe(1);
    expect(all).toContain('React屏×1');
    expect(all).toContain('games/fx-import/screen.ts:1');
    expect(all).toContain('AUDIT: FAIL');
  }, 60000);
});

describe('Q1 新建议档 ②：墙钟 Date.now/performance.now（不阻断）', () => {
  it('命中只出 ⚠·不进判词不改退出码（黄旗仍 WARNINGS=0）', () => {
    const { code, all } = runAudit(['fx-clock']);
    expect(code).toBe(0); // 建议档绝不拦——升红须另裁
    expect(all).toContain('墙钟×2');
    expect(all).toContain('AUDIT: WARNINGS'); // 只剩黄旗（零能力/零测试），墙钟不参与
    expect(all).not.toContain('AUDIT: FAIL');
    expect(all).toContain('RATCHET: PASS');
  }, 60000);
});

describe('Q1 新红旗 ③：DOM 逃生（insertAdjacentHTML/document.write·innerHTML 同级）', () => {
  it('两式各计一处 → 红判 FAIL + 点名 file:line', () => {
    const { code, all } = runAudit(['fx-dom']);
    expect(code).toBe(1);
    expect(all).toContain('DOM逃生×2');
    expect(all).toContain('games/fx-dom/hack.ts:1');
    expect(all).toContain('games/fx-dom/hack.ts:2');
    expect(all).toContain('AUDIT: FAIL');
    expect(all).toContain('RATCHET: FAIL');
  }, 60000);
});

describe('Q1 新指标接入棘轮：Lead 批注基线覆盖 → 显示不红判', () => {
  it('reactScreen 灌基线（approvedBy:LEAD 三字段齐）→ 退出码 0·批注覆盖·RATCHET PASS', () => {
    const { code, all } = runAudit(['fx-react'], {
      games: { 'fx-react': { reactScreen: 1, approvedBy: 'LEAD', date: '2026-08-10', reason: '测试样本·存量灌入语义验证' } },
    });
    expect(code).toBe(0);
    expect(all).toContain('React屏×1'); // 仍显示（豁免可见）
    expect(all).toContain('批注覆盖');
    expect(all).toContain('RATCHET: PASS');
    expect(all).not.toContain('AUDIT: FAIL');
  }, 60000);
});
