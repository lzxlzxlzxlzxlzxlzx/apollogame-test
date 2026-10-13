import React, { useEffect, useState } from 'react';
import { mountLifeGame, type LifeGameMountHandle } from '../engine/host/life-game-host.js';
import type { AssetManager } from '../assets/index.js';
import { createStoragePort, type StoragePort } from '../services/storage/index.js';
import { SHELL } from '../ui/shell-theme.js';
import { findLifeLauncherItem, type LifeLauncherCatalogItem } from './life-launcher-catalog.js';

export interface LifeLauncherMountOptions {
  readonly storage?: StoragePort;
  readonly exit?: () => void;
  /** Native/test host hook only; catalog data can never provide executable loaders. */
  readonly loadArt?: (assets: AssetManager, artSlug: string) => Promise<boolean>;
}

/** The only launcher-to-Life execution bridge. It accepts an already-discovered fixed catalog item. */
export function mountLifeLauncherItem(
  container: HTMLElement,
  item: LifeLauncherCatalogItem,
  options: LifeLauncherMountOptions = {},
): LifeGameMountHandle {
  if (!item.bundle || item.diagnostics.length > 0) throw new Error('Life launcher entry is not runnable');
  return mountLifeGame(container, {
    descriptor: item.bundle.descriptor,
    lifePackage: item.bundle.lifePackage,
    assetSlots: item.bundle.assetSlots,
    storage: options.storage ?? createStoragePort(),
    host: { ...(options.exit ? { exit: options.exit } : {}) },
    ...(options.loadArt ? { loadArt: options.loadArt } : {}),
  });
}

export function LifeGameRunner({
  gameId, onBack, onReady,
}: {
  readonly gameId: string;
  readonly onBack: () => void;
  readonly onReady?: (host: HTMLElement) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setError(null);
    const item = findLifeLauncherItem(gameId);
    if (!item?.bundle || item.diagnostics.length > 0) {
      setError('此 Life 游戏条目未通过严格校验，已阻止运行。');
      return;
    }
    let active = true;
    let handle: LifeGameMountHandle | undefined;
    try {
      handle = mountLifeLauncherItem(container, item, { exit: onBack });
      void handle.ready.then(() => {
        if (active) onReady?.(container);
      }).catch(() => {
        if (!active) return;
        handle?.dispose();
        setError('Life 游戏启动失败，运行环境已安全清理。');
      });
    } catch {
      setError('Life 游戏启动失败，未创建运行环境。');
    }
    return () => { active = false; handle?.dispose(); };
  }, [gameId, onBack, onReady]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {error && (
        <div
          data-life-runner-error="true"
          role="alert"
          style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            padding: 24, background: SHELL.bg0, color: SHELL.warn, textAlign: 'center',
            fontFamily: SHELL.fontUi, fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
