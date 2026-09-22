import { LockstepClient } from '../lockstep-tab.js';
import type { Channel, ClientView, NetMsg } from '../lockstep-tab.js';

// 帧同步 demo 的浏览器端：BroadcastChannel 当"网线"，键盘当输入，canvas 画服务器…
// 不，没有服务器——每个标签页各跑一份确定性世界，这里只负责 IO + 渲染。

const W = 640;
const H = 400;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusEl = document.getElementById('status')!;

// eslint-disable-next-line zerocraft/no-unseeded-random -- 浏览器 IO 壳造每标签页唯一 peerId（实查 2026-08-16·原 engine-random-guard 白名单）：诉求是「同代码同起点的各标签页互不相同」，与种子 PRNG 相反；id 只作信道身份，不进 sim
const peerId = Math.random().toString(36).slice(2, 8);

// BroadcastChannel：同源、同浏览器的多个标签页互通。
const bc = new BroadcastChannel('apollo-frame-sync');
const channel: Channel = {
  post: (m) => bc.postMessage(m),
  onMessage: (cb) => {
    bc.onmessage = (e) => cb(e.data as NetMsg);
  },
  close: () => bc.close(),
};

// 键盘 → 方向（方向键 / WASD）
const held = new Set<string>();
const MAPPED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS']);
function readDir(): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  if (held.has('ArrowLeft') || held.has('KeyA')) dx -= 1;
  if (held.has('ArrowRight') || held.has('KeyD')) dx += 1;
  if (held.has('ArrowUp') || held.has('KeyW')) dy -= 1;
  if (held.has('ArrowDown') || held.has('KeyS')) dy += 1;
  return { dx, dy };
}
window.addEventListener('keydown', (e) => {
  if (MAPPED.has(e.code)) {
    held.add(e.code);
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (MAPPED.has(e.code)) held.delete(e.code);
});
// 丢焦点（切到别的窗口/标签页）时 keyup 收不到 → 清空按下集合，否则按键会"卡住"持续移动。
const releaseAll = (): void => held.clear();
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseAll();
});

const client = new LockstepClient({ peerId, channel, getInput: readDir, tickRate: 30, inputDelay: 4 });
window.addEventListener('beforeunload', () => client.dispose());

function hex(c: number): string {
  return '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
}

function render(v: ClientView): void {
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, W, H);

  for (const e of v.ents) {
    ctx.fillStyle = hex(e.color);
    if (e.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
    }
    if (e.id === v.youEntityId) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      const w = e.w + 6;
      const h = e.h + 6;
      ctx.strokeRect(e.x - w / 2, e.y - h / 2, w, h);
    }
  }

  // HUD
  ctx.fillStyle = 'rgba(2,6,23,0.62)';
  ctx.fillRect(8, 8, W - 16, 50);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`你是 ${v.youPlayerId}`, 16, 27);
  ctx.fillStyle = hex(v.youColor);
  ctx.fillRect(74, 17, 13, 13);
  ctx.fillStyle = '#94a3b8';
  // 「分叉」≠「对齐中」：desynced 是确诊（红牌不摘），pending 只是 hash 还没回流。
  const sync =
    v.syncState === 'solo'
      ? '单人 — 再开一个本页标签页加入'
      : v.syncState === 'desynced'
        ? `💥 分叉 @tick ${v.desyncTick}（状态已不可信）`
        : v.syncState === 'synced'
          ? '✅ 帧同步'
          : '… 对齐中';
  if (v.syncState === 'desynced') ctx.fillStyle = '#f87171';
  ctx.fillText(`tick ${v.tick}   hash ${v.hash}   玩家 ${v.peerCount}   ${sync}`, 16, 48);
}

// eslint-disable-next-line zerocraft/no-wall-clock -- 页面 rAF 循环的帧间隔（宿主壳·不进 sim/hash）
let last = performance.now();
function frame(now: number): void {
  const dt = now - last;
  last = now;
  client.pump(dt);
  render(client.view());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

statusEl.textContent = `peer ${peerId} · 方向键 / WASD 移动你的方块`;
