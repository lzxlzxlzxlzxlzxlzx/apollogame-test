import { describe, expect, it, vi } from 'vitest';
import { createHostExitController, type HostExitResult } from './host-exit.js';

describe('HostExitController', () => {
  it('defaults to unavailable without inspecting or calling a global host', async () => {
    const audit = vi.fn();
    const controller = createHostExitController(undefined, audit);
    expect(controller.available).toBe(false);
    expect(await controller.requestExit()).toBe('unavailable');
    expect(audit.mock.calls.map(([event]) => event)).toEqual(['request', 'unavailable']);
  });

  it('coalesces pending requests and latches an accepted intent', async () => {
    let settle!: (result: HostExitResult) => void;
    const requestExit = vi.fn(() => new Promise<HostExitResult>((resolve) => { settle = resolve; }));
    const audit = vi.fn();
    const controller = createHostExitController({ requestExit }, audit);
    expect(controller.available).toBe(true);
    const first = controller.requestExit();
    const duplicate = controller.requestExit();
    expect(first).toBe(duplicate);
    await Promise.resolve();
    expect(requestExit).toHaveBeenCalledTimes(1);
    settle('accepted');
    expect(await first).toBe('accepted');
    expect(await duplicate).toBe('accepted');
    expect(await controller.requestExit()).toBe('accepted');
    expect(requestExit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls.map(([event]) => event)).toEqual(['request', 'accepted']);
  });

  it('also coalesces a synchronous reentrant audit callback', async () => {
    const requestExit = vi.fn(() => 'accepted' as const);
    let duplicate: Promise<HostExitResult> | undefined;
    let controller!: ReturnType<typeof createHostExitController>;
    controller = createHostExitController({ requestExit }, (event) => {
      if (event === 'request') duplicate = controller.requestExit();
    });
    const first = controller.requestExit();
    expect(duplicate).toBe(first);
    expect(await first).toBe('accepted');
    expect(requestExit).toHaveBeenCalledTimes(1);
  });

  it.each(['unavailable', 'rejected'] as const)('returns %s honestly and permits a later retry', async (result) => {
    const requestExit = vi.fn()
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce('accepted');
    const controller = createHostExitController({ requestExit });
    expect(await controller.requestExit()).toBe(result);
    expect(await controller.requestExit()).toBe('accepted');
    expect(requestExit).toHaveBeenCalledTimes(2);
  });

  it('fails closed on adapter throw, rejection or malformed result; audit failure cannot change the outcome', async () => {
    const thrown = createHostExitController({ requestExit: () => { throw new Error('private detail'); } });
    const rejected = createHostExitController({ requestExit: () => Promise.reject(new Error('private detail')) });
    const malformed = createHostExitController({ requestExit: () => 'closed' as HostExitResult });
    expect(await thrown.requestExit()).toBe('rejected');
    expect(await rejected.requestExit()).toBe('rejected');
    expect(await malformed.requestExit()).toBe('rejected');
    const accepted = createHostExitController({ requestExit: () => 'accepted' }, () => { throw new Error('audit'); });
    expect(await accepted.requestExit()).toBe('accepted');
  });
});
