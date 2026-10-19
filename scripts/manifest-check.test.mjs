// scripts/manifest-check.test.mjs —— manifest-check CLI 的行为契约测试。
// 跑真 CLI（子进程 vite-node），断言退出码：合法 manifest→0，非法组件字段→1，坏 JSON→1。
// 校验逻辑本身归引擎 parseManifest 的单测；这里只钉「CLI 契约=退出码正确 + 错误进 stderr」。
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runCheck(input) {
  const viteNode = resolve(ROOT, 'node_modules/vite-node/vite-node.mjs');
  const r = spawnSync(process.execPath, [viteNode, 'scripts/manifest-check.mjs'], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    timeout: 60000,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const LEGAL = JSON.stringify({
  name: 'legal',
  capabilities: ['a1-transform', 'b1-velocity', 'c1-shape', 'l2-color'],
  entities: {
    ball: {
      Transform: { x: 320, y: 60, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 2, vy: 0, angular: 0 },
      Shape: { kind: 'circle', radius: 12 },
      Color: { tint: 4886754, alpha: 1 },
    },
  },
});

// Transform.x 声明为 number，给字符串 → 引擎 parseManifest 判 error → 拒绝。
const ILLEGAL = JSON.stringify({
  name: 'illegal',
  capabilities: ['a1-transform', 'c1-shape'],
  entities: {
    ball: {
      Transform: { x: 'NOT_A_NUMBER', y: 60, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'circle', radius: 12 },
    },
  },
});

describe('manifest-check CLI', () => {
  it('合法 manifest → exit 0，stdout 含 ok:true', () => {
    const { code, stdout } = runCheck(LEGAL);
    expect(code).toBe(0);
    expect(stdout).toContain('"ok":true');
  }, 60000);

  it('非法组件字段（number 给了 string）→ exit 1，stderr 有错误清单', () => {
    const { code, stderr } = runCheck(ILLEGAL);
    expect(code).toBe(1);
    expect(stderr).toContain('Transform.x');
  }, 60000);

  it('坏 JSON → exit 1', () => {
    const { code } = runCheck('not json{');
    expect(code).toBe(1);
  }, 60000);
});
