import type { SteamBridge } from './steamworks-platform.js';

// MockSteamBridge —— 本地「假 Steam」后端。实现与真 Steam **完全相同**的 SteamBridge 契约，
// 走与真 Steam 同一个 SteamworksPlatformPort 代码路径（将来换真账号零改动）。无需 Steam 客户端/
// 真账号即可全程开发验证：假玩家、内存态成就/统计/排行/富状态、可选 localStorage 持久化、
// 解锁时给 Steam 风格 toast「正常回馈」。基础设施（sim 外）→ 用 DOM/localStorage 不进 hash。

export type MockSteamEvent =
  | { kind: 'unlock'; id: string }
  | { kind: 'clear'; id: string }
  | { kind: 'stat'; id: string; value: number }
  | { kind: 'leaderboard'; boardId: string; score: number; board: number[] }
  | { kind: 'richPresence'; key: string; value: string }
  | { kind: 'store' };

export interface MockSteamOptions {
  name?: string;          // 假玩家名（默认「本地开发者 (Mock)」）
  appId?: number;         // 默认 480
  persist?: boolean;      // localStorage 持久化（默认 true·浏览器可用时）
  toast?: boolean;        // 解锁弹 Steam 风格提示（默认 true·有 document 时）
  log?: boolean;          // console 回显（默认 true）
  onEvent?: (e: MockSteamEvent) => void; // 额外事件钩子（UI/测试）
}

interface MockState {
  achievements: string[];
  stats: Record<string, number>;
  leaderboards: Record<string, number[]>;
  richPresence: Record<string, string>;
}

const LS_KEY = 'apollo:steam:mock:state';

function loadState(persist: boolean): MockState {
  const empty: MockState = { achievements: [], stats: {}, leaderboards: {}, richPresence: {} };
  if (!persist) return empty;
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY);
    if (!raw) return empty;
    return { ...empty, ...JSON.parse(raw) };
  } catch { return empty; }
}

function saveState(persist: boolean, s: MockState): void {
  if (!persist) return;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function showToast(title: string, body: string): void {
  if (typeof document === 'undefined' || !document.body) return;
  const id = 'apollo-steam-toast-css';
  if (!document.getElementById(id)) {
    const st = document.createElement('style'); st.id = id;
    st.textContent = `@keyframes apollo-steam-in{0%{transform:translateY(120%);opacity:0}12%{transform:translateY(0);opacity:1}88%{transform:translateY(0);opacity:1}100%{transform:translateY(120%);opacity:0}}
    .apollo-steam-toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;gap:10px;align-items:center;
    background:linear-gradient(180deg,#1b2838,#101822);color:#c7d5e0;border:1px solid #2a475e;border-radius:6px;
    padding:10px 14px;font-family:'Motiva Sans',Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);max-width:320px;
    animation:apollo-steam-in 4s ease forwards}
    .apollo-steam-toast .ico{font-size:22px}.apollo-steam-toast .t{font-size:12px;color:#8f98a0}.apollo-steam-toast .b{font-size:14px;font-weight:700;color:#fff}`;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'apollo-steam-toast';
  // eslint-disable-next-line zerocraft/no-html-injection -- 债：mock Steam 成就吐司（开发工具·title 来自本地成就表）→ P2b 收口改 LayoutNode Float
  el.innerHTML = `<div class="ico">🏆</div><div><div class="t">${title}</div><div class="b"></div></div>`;
  (el.querySelector('.b') as HTMLElement).textContent = body; // textContent 防注入
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4100);
}

/** 造一个假 Steam 桥（available:true）。与 preload 注入的真桥 window.__APOLLO_STEAM__ 同形。 */
export function createMockSteamBridge(opts: MockSteamOptions = {}): SteamBridge {
  const persist = opts.persist ?? true;
  const toast = opts.toast ?? true;
  const log = opts.log ?? true;
  const name = opts.name ?? '本地开发者 (Mock)';
  const appId = opts.appId ?? 480;
  const s = loadState(persist);
  const ach = new Set(s.achievements);

  const emit = (e: MockSteamEvent) => {
    if (log) console.log('[steam:mock]', JSON.stringify(e));
    opts.onEvent?.(e);
  };

  return {
    available: true,
    name,
    appId,
    unlockAchievement(id: string) {
      if (ach.has(id)) return;          // 幂等（同真 Steam）
      ach.add(id); s.achievements = [...ach]; saveState(persist, s);
      emit({ kind: 'unlock', id });
      if (toast) showToast('成就解锁', id);
    },
    clearAchievement(id: string) {
      if (!ach.delete(id)) return;
      s.achievements = [...ach]; saveState(persist, s);
      emit({ kind: 'clear', id });
    },
    setStat(id: string, value: number) {
      s.stats[id] = value; saveState(persist, s);
      emit({ kind: 'stat', id, value });
    },
    getStat(id: string): number { return s.stats[id] ?? 0; },
    uploadLeaderboard(boardId: string, score: number) {
      (s.leaderboards[boardId] ??= []).push(score);
      s.leaderboards[boardId].sort((a, b) => b - a);            // 高分在前
      saveState(persist, s);
      // board 快照随事件外发 → 消费端（UI/测试）可经 onEvent 观测榜单顺序，无需读私有态。
      emit({ kind: 'leaderboard', boardId, score, board: [...s.leaderboards[boardId]] });
    },
    setRichPresence(key: string, value: string) {
      s.richPresence[key] = value; saveState(persist, s);
      emit({ kind: 'richPresence', key, value });
    },
    store() { saveState(persist, s); emit({ kind: 'store' }); },
  };
}

/** 抹掉持久化的假 Steam 态（开发/测试复位）。 */
export function resetMockSteam(): void {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}
