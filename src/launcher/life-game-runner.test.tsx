// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LifeLauncherCatalogItem } from './life-launcher-catalog.js';

const { mountLifeGame, createStoragePort, findLifeLauncherItem } = vi.hoisted(() => ({
  mountLifeGame: vi.fn(),
  createStoragePort: vi.fn(() => ({ kind: 'memory' })),
  findLifeLauncherItem: vi.fn(),
}));

vi.mock('../engine/host/life-game-host.js', () => ({ mountLifeGame }));
vi.mock('../services/storage/index.js', () => ({ createStoragePort }));
vi.mock('./life-launcher-catalog.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./life-launcher-catalog.js')>();
  return { ...actual, findLifeLauncherItem };
});

import { LifeGameRunner, mountLifeLauncherItem } from './life-game-runner.js';

function item(id = 'game-seaside-market', runnable = true): LifeLauncherCatalogItem {
  return {
    directory: id,
    runtimeId: `life:${id}`,
    gameEntry: {
      id: `life:${id}`, title: '海风集市', subtitle: '经营', description: '独立内容',
      color: '#17364a', accentColor: '#62d6c5', icon: '🐚', status: runnable ? 'playable' : 'coming-soon',
    },
    diagnostics: runnable ? [] : [{ path: '/host', code: 'invalid_host', message: 'invalid' }],
    ...(runnable ? {
      bundle: {
        entry: { schema: 'zerocraft.life-launcher.v1', id, title: '海风集市', subtitle: '经营', description: '独立内容', color: '#17364a', accentColor: '#62d6c5', icon: '🐚' },
        descriptor: { slug: id } as any,
        lifePackage: { meta: { id } }, assetSlots: { version: 1, game: id, note: 'fixture', slots: [] },
      },
    } : {}),
  };
}

describe('LifeGameRunner', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    vi.clearAllMocks();
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it('mounts the discovered bundle through the single Life host bridge without a caller save slot', () => {
    const discovered = item(); const dispose = vi.fn();
    mountLifeGame.mockReturnValue({ ready: Promise.resolve({}), dispose });
    const handle = mountLifeLauncherItem(host, discovered, { exit: vi.fn() });
    expect(handle.dispose).toBe(dispose);
    expect(mountLifeGame).toHaveBeenCalledWith(host, expect.objectContaining({
      descriptor: discovered.bundle!.descriptor,
      lifePackage: discovered.bundle!.lifePackage,
      assetSlots: discovered.bundle!.assetSlots,
      storage: { kind: 'memory' },
    }));
    expect(mountLifeGame.mock.calls[0]![1]).not.toHaveProperty('slot');
  });

  it('disposes on selection change and on unmount without leaving the prior host active', async () => {
    const first = item('game-seaside-market'); const second = item('game-night-bazaar');
    findLifeLauncherItem.mockImplementation((id: string) => id === first.runtimeId ? first : second);
    const disposes = [vi.fn(), vi.fn()]; let call = 0;
    mountLifeGame.mockImplementation(() => ({ ready: Promise.resolve({}), dispose: disposes[call++] }));
    const onBack = vi.fn();
    await act(async () => { root.render(<LifeGameRunner gameId={first.runtimeId} onBack={onBack} />); await Promise.resolve(); });
    expect(mountLifeGame.mock.calls[0]![1].host.exit).toBe(onBack);
    await act(async () => { root.render(<LifeGameRunner gameId={second.runtimeId} onBack={onBack} />); await Promise.resolve(); });
    expect(disposes[0]).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    expect(disposes[1]).toHaveBeenCalledTimes(1);
    root = createRoot(host);
  });

  it('isolates an invalid catalog item before mount and shows a controlled error', () => {
    findLifeLauncherItem.mockReturnValue(item('game-broken', false));
    act(() => root.render(<LifeGameRunner gameId="life:game-broken" onBack={vi.fn()} />));
    expect(mountLifeGame).not.toHaveBeenCalled();
    expect(host.querySelector('[data-life-runner-error="true"]')?.textContent).toContain('已阻止运行');
  });

  it('disposes a failed asynchronous startup and exposes no raw exception', async () => {
    findLifeLauncherItem.mockReturnValue(item());
    const dispose = vi.fn();
    mountLifeGame.mockReturnValue({ ready: Promise.reject(new Error('SECRET STACK')), dispose });
    await act(async () => { root.render(<LifeGameRunner gameId="life:game-seaside-market" onBack={vi.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    expect(dispose).toHaveBeenCalledTimes(1);
    const alert = host.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('已安全清理'); expect(alert).not.toContain('SECRET');
  });
});
