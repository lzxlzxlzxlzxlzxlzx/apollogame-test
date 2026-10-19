// electron/platform-launch.cjs 纯函数单测（platform-packaging-spec.md D3）。
// 不起真 Electron/真 python 后端（那是 scripts/platform-launch-smoke.mjs 端到端的活）；
// 这里只钉：路径解析规则 / 端口分配 / 清理函数的幂等性。CJS 模块被 vitest 当 ESM 默认导入
// 消费——Node 的 cjs-module-lexer 能从 `module.exports = {a,b,c}` 静态识别具名导出，
// import { x } from '*.cjs' 天然可用（build-platform 生态里 scripts/platform-launch-smoke.mjs
// 已验证同一份 interop 路径在真实端到端场景里也走得通）。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolvePythonBin, findFreePort, killBackend,
} from './platform-launch.cjs';

describe('resolvePythonBin · 内置 python 路径解析', () => {
  it('未打包（resourcesPath=null）→ 非 Windows 回退系统 python3', () => {
    expect(resolvePythonBin(null, 'linux')).toBe('python3');
  });

  it('打包但 pybundle/bin/python3 不存在（占位阶段）→ 非 Windows 回退系统 python3', () => {
    expect(resolvePythonBin('/nonexistent/resources/path', 'linux')).toBe('python3');
  });

  it('打包且 pybundle/bin/python3 真实存在 → 用内置那份（不回退）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pybundle-'));
    try {
      mkdirSync(join(dir, 'pybundle', 'bin'), { recursive: true });
      const bin = join(dir, 'pybundle', 'bin', 'python3');
      writeFileSync(bin, '#!/bin/sh\n');
      expect(resolvePythonBin(dir, 'linux')).toBe(bin);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Windows 平台找 python.exe（供单测跨平台核验·不依赖真机 OS）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pybundle-win-'));
    try {
      mkdirSync(join(dir, 'pybundle', 'bin'), { recursive: true });
      writeFileSync(join(dir, 'pybundle', 'bin', 'python.exe'), '');
      expect(resolvePythonBin(dir, 'win32')).toBe(join(dir, 'pybundle', 'bin', 'python.exe'));
      // 没有内置文件时 win32 的系统回退是 'python' 不是 'python3'。
      expect(resolvePythonBin(null, 'win32')).toBe('python');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('findFreePort · 端口分配', () => {
  it('返回一个可用端口号（1~65535 区间的整数）', async () => {
    const port = await findFreePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it('连续调用两次拿到的端口彼此不冲突（各自 listen 完即释放）', async () => {
    const a = await findFreePort();
    const b = await findFreePort();
    expect(a).not.toBe(b); // 释放顺序下几乎不会撞号；万一撞号说明端口没被正确关闭，值得追查
  });
});

describe('killBackend · 清理幂等性', () => {
  it('child 为 null/undefined → 安全跳过，不抛异常', () => {
    expect(() => killBackend(null)).not.toThrow();
    expect(() => killBackend(undefined)).not.toThrow();
  });

  it('child 已标记 killed → 安全跳过（不重复 kill）', () => {
    let killCalls = 0;
    const fakeChild = { killed: true, exitCode: null, kill: () => { killCalls++; } };
    killBackend(fakeChild);
    expect(killCalls).toBe(0);
  });

  it('child 已退出（exitCode 非 null）→ 安全跳过', () => {
    let killCalls = 0;
    const fakeChild = { killed: false, exitCode: 0, kill: () => { killCalls++; } };
    killBackend(fakeChild);
    expect(killCalls).toBe(0);
  });

  it('存活的 child → 发 SIGTERM（graceMs 给够大，测试自身跑不到 SIGKILL 兜底那步）', () => {
    const calls = [];
    const fakeChild = { killed: false, exitCode: null, kill: (sig) => calls.push(sig) };
    killBackend(fakeChild, 999999);
    expect(calls).toEqual(['SIGTERM']);
  });
});
