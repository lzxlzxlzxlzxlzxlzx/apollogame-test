// launcher.tsx 拆分而来（2026-07-16 纯搬运·行为不变）：游戏运行时 —— GameOverlayMenu / GameRunner / BareListRetry。
import React, { useState, useEffect } from 'react';
import { SHELL, sGearBtn, sMenuPanel, sMenuItem } from '../ui/shell-theme.js';

// ══════════════════════════════════════
//  Game Runtime
// ══════════════════════════════════════

interface OverlayMenuItem { label: string; onClick: () => void; }

// 全游戏统一的壳层菜单：齿轮钮 → 浮层，收纳「返回主界面」等全局动作（壳层所有，游戏代码不掺和）。
// 收编旧的常驻「返回」pill —— 缩成一颗齿轮、按需展开，给未来壳层级开关（全屏/重开/静音…）留好统一的位置；今天只放返回。
// Esc / 点浮层外关闭；齿轮常显、不藏，退出仍一眼可寻。
function GameOverlayMenu({ items }: { items: OverlayMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}>
      <button onClick={() => setOpen((o) => !o)} style={sGearBtn(open)} aria-label="菜单" aria-expanded={open} title="菜单">
        ⚙
      </button>
      {open && (
        <div style={sMenuPanel()} role="menu">
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              style={sMenuItem(hover === i)}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 只读调试口安装/拆卸（REQ-RENDERCHECK R2b·dev 模式限定·launcher 域=Lead 自持）：见 src/global.d.ts
// 的 Window.__zcProbe 类型注释——纯读挂载好的 DOM 快照，零副作用、不碰 sim/hash。
function installZcProbe(gameId: string, host: HTMLElement): void {
  window.__zcProbe = {
    gameId,
    actions: () => Array.from(host.querySelectorAll<HTMLElement>('[data-action]')).map((el) => ({
      action: el.dataset['action'] ?? '',
      arg: el.dataset['arg'],
      uiId: el.dataset['uiId'],
      disabled: (el as HTMLButtonElement).disabled === true,
    })),
  };
}
function teardownZcProbe(): void { delete window.__zcProbe; }

export function GameRunner({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // mount 第二参 host（可选·向后兼容）：把壳层「退出到游戏库」钩子传给游戏，让游戏可把退出收进自己的设置菜单（owner 2026-06-21）。
    const loaders: Record<string, () => Promise<{ mount: (el: HTMLElement, host?: { exit: () => void }) => () => void }>> = {
      'game-mcfight': () => import('@games/game-mcfight/game-mcfight.js'),
      'game-e': () => import('@games/game-e/game-e.js'),
      'game-d': () => import('@games/game-d/game-d.js'),
      'game-f': () => import('@games/game-f/game-f.js'),
      'game-g': () => import('@games/game-g/game-g.js'),
      'game-i': () => import('@games/game-i/game-i.js'),
      'game-z': () => import('@games/game-z/game-z.js'),
      'game-b': () => import('@games/game-b/game-b.js'),
      'game-a': () => import('@games/game-a/game-a.js'),
      'game-c': () => import('@games/game-c/game-c.js'),
      'game-103': () => import('@games/game-103/game-103.js'),
      'game101': () => import('@games/game101/game101.js'),
      'game102': () => import('@games/game102/game102.js'),
      'game108': () => import('@games/game108/game108.js'),
      'game-105': () => import('@games/game-105/game-105.js'),
      'game211': () => import('@games/game211/game211.js'),
      'game109': () => import('@games/game109/game109.js'),
    };
    const loader = loaders[gameId];
    if (!loader) return;
    // 异步竞态防护：若组件在 loader 完成前已卸载（快速切游戏 / 退回主页），late-resolve 不得再 mount
    // ——否则前一个游戏的引擎在新画面里成孤儿后台空跑（"两个引擎"症状的一种来源）。
    let disposed = false;
    let cleanup: (() => void) | undefined;
    loader().then(mod => {
      if (disposed || !containerRef.current) return;
      cleanup = mod.mount(containerRef.current, { exit: onBack });
      if (disposed) { cleanup?.(); cleanup = undefined; } // mount 期间又被卸载 → 立即清
      else if (import.meta.env.DEV) installZcProbe(gameId, containerRef.current);
    });
    return () => { disposed = true; cleanup?.(); teardownZcProbe(); };
  }, [gameId]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: SHELL.bg0 }}>
      {/* 全游戏统一的壳层菜单（齿轮 → 收纳「返回主界面」等全局动作；游戏代码不掺和）—— 视觉基调见 ui/shell-theme.ts。
          game-g 已把退出收进自己的设置菜单（owner 2026-06-21「去掉右上角返回·收进设置」，经 mount(el,{exit}) 接走）→ 壳层不再为它叠这颗。 */}
      {gameId !== 'game-g' && (
        <GameOverlayMenu items={[{ label: '⟵ 返回主界面', onClick: onBack }]} />
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// bare 装载页的等待护栏：每 2s 促发一次库列表重拉；15s 仍未就绪给明报（多为 :4000 创作服务没起）。
export function BareListRetry({ onStuck, onRetry, onBack }: { onStuck: () => void; onRetry: () => void; onBack: () => void }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setInterval(onRetry, 2000);
    const dead = setTimeout(() => { setStuck(true); onStuck(); }, 15000);
    return () => { clearInterval(t); clearTimeout(dead); };
  }, [onRetry, onStuck]);
  if (!stuck) return null;
  return (
    <div style={{ textAlign: 'center', fontSize: 12, color: SHELL.warn, lineHeight: 1.8 }}>
      15 秒没等到游戏库——多半是创作服务（:4000）没在跑。<br />
      终端确认 <code>python zerocraft.py workshop</code> 还活着，然后
      <button onClick={onBack} style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 6, background: SHELL.jadeWash, color: SHELL.jade, border: `1px solid ${SHELL.jadeLine}`, cursor: 'pointer' }}>← 回创作台</button>
    </div>
  );
}
