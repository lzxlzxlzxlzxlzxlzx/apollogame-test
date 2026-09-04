// scripts/design-ingest-zip.test.mjs —— main_entry/design_ingest.py 整包(zip)收稿安全性单测
// （REQ-DESIGNLINE 二期④）。仓库没装 pytest——Python 侧检查写成具名 case（scripts/design-ingest-zip-
// check.py），vitest 逐 case spawn 直调（零 HTTP·纯函数级），只认退出码 + 把 stdout 带进失败信息。
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'design-ingest-zip-check.py');

function runCase(name) {
  const command = process.env.PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3');
  const args = process.env.PYTHON || process.platform !== 'win32'
    ? [SCRIPT, name]
    : ['-3', SCRIPT, name];
  const r = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

describe('handle_design_ingest_zip · 整包收稿安全性（REQ-DESIGNLINE 二期④）', () => {
  it('zip-slip 条目（路径穿越）→ 整包拒收·无半包落盘', () => {
    const r = runCase('zip-slip');
    expect(r.code, r.out).toBe(0);
  });

  it('解压后总大小超 50MB 上限 → 拒收（防炸弹·非原始包体判据）', () => {
    const r = runCase('oversize');
    expect(r.code, r.out).toBe(0);
  });

  it('扩展名白名单外文件 → 单条跳过（非致命）·不落盘·记 skippedFiles', () => {
    const r = runCase('skip-non-whitelist');
    expect(r.code, r.out).toBe(0);
  });

  it('合法 zip → 台账登记完整性（kind/entryHtml/files sha256/相对路径结构全对）', () => {
    const r = runCase('ledger-integrity');
    expect(r.code, r.out).toBe(0);
  });

  it('未知 case 名 → exit 2（负向腿·测试加固批 2026-08-24：防 case 改名后这里传旧名=恒 0 假绿）', () => {
    const r = runCase('zz-no-such-case');
    expect(r.code, r.out).toBe(2);
    expect(r.out).toContain('未知 case');
  });
});
