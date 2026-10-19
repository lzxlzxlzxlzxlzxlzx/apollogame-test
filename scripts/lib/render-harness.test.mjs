import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseViteReadyPort, stopDevServer, waitForViteReady } from './render-harness.mjs';

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

afterEach(() => vi.useRealTimers());

describe('Vite dev-server readiness and cleanup', () => {
  it('parses the actual local port after ANSI escapes are removed', () => {
    expect(parseViteReadyPort('\u001b[2m➜  Local:\u001b[22m \u001b[36mhttp://localhost:5701/\u001b[0m'))
      .toBe(5701);
  });

  it('accepts a readiness URL split across output chunks', async () => {
    const child = fakeChild();
    const pending = waitForViteReady(child, { timeoutMs: 500, stop: vi.fn() });
    child.stdout.emit('data', Buffer.from('\u001b[2m➜  Local:\u001b[22m \u001b[36mhttp://localhost:'));
    child.stdout.emit('data', Buffer.from('5700/\u001b[0m\n'));
    await expect(pending).resolves.toBe(5700);
  });

  it('accepts readiness announced on stderr', async () => {
    const child = fakeChild();
    const pending = waitForViteReady(child, { timeoutMs: 500, stop: vi.fn() });
    child.stderr.emit('data', Buffer.from('  ➜  Local: http://127.0.0.1:5712/\n'));
    await expect(pending).resolves.toBe(5712);
  });

  it('stops the spawned server when readiness times out', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const stop = vi.fn();
    const pending = waitForViteReady(child, { timeoutMs: 50, stop });
    const rejected = expect(pending).rejects.toThrow('vite dev 0.05s 未就绪');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(stop).toHaveBeenCalledWith(child);
  });

  it('cleans up the complete process tree using Windows taskkill', () => {
    const child = fakeChild();
    const runTaskkill = vi.fn(() => ({ status: 0 }));
    stopDevServer(child, { platform: 'win32', runTaskkill });
    expect(runTaskkill).toHaveBeenCalledWith('taskkill.exe', ['/PID', '4321', '/T', '/F'], {
      encoding: 'utf8', stdio: 'ignore', windowsHide: true,
    });
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('falls back to the child process handle if Windows taskkill is unavailable', () => {
    const child = fakeChild();
    const runTaskkill = vi.fn(() => ({ status: 1 }));
    stopDevServer(child, { platform: 'win32', runTaskkill });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects promptly when Vite exits before readiness', async () => {
    const child = fakeChild();
    const pending = waitForViteReady(child, { timeoutMs: 500, stop: vi.fn() });
    child.emit('exit', 1, null);
    await expect(pending).rejects.toThrow('vite dev 未起服就退出');
  });

  it('cleans up an active child when spawning reports an error', async () => {
    const child = fakeChild();
    const stop = vi.fn();
    const pending = waitForViteReady(child, { timeoutMs: 500, stop });
    child.emit('error', new Error('spawn failure'));
    await expect(pending).rejects.toThrow('spawn failure');
    expect(stop).toHaveBeenCalledWith(child);
  });

  it('does not attempt PID cleanup when spawn failed before a child existed', async () => {
    const child = fakeChild();
    child.pid = undefined;
    const stop = vi.fn();
    const pending = waitForViteReady(child, { timeoutMs: 500, stop });
    child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    await expect(pending).rejects.toThrow('spawn ENOENT');
    expect(stop).not.toHaveBeenCalled();
  });
});
