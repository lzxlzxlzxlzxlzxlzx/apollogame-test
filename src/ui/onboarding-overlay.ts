import type { IWorld } from '@engine/core/types.js';
import { collectActiveCoachmarks, coachmarkGeometry, type Rect } from '../renderer/coachmark.js';

// ═══════════════════════════════════════════════════════════════
//  OnboardingOverlay —— 新手引导高亮的 **live DOM 解释器**（REQ-ARCH-COACH ②③）。薄胶水：
//  读 world 激活 Coachmark（@renderer/coachmark）→ 按 `data-anchor` 在 anchorRoot 里 querySelector 取锚点 rect
//  → 渲全屏遮罩（spotlight：锚点处透明块 + 巨大 box-shadow 压暗四周，经典法）+ 气泡(text)。
//  覆盖**两套 UI**：GameShell（UINode.anchor 落 data-anchor）+ 手写 DOM 屏（元素上加 data-anchor）。零重构。
//  纯表现：只读 world / DOM 几何，不写 sim、不进 hash。游戏每帧/每 tick 调 update()；destroy() 卸载。
// ═══════════════════════════════════════════════════════════════

export interface OnboardingOverlay { update: () => void; destroy: () => void; }

const escapeHtml = (s: string): string => s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
const rgba = (color: number, alpha: number): string => `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;

export function mountOnboardingOverlay(host: HTMLElement, world: IWorld, anchorRoot: ParentNode = host.ownerDocument ?? document): OnboardingOverlay {
  const doc = host.ownerDocument ?? document;
  const layer = doc.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
  host.appendChild(layer);

  const escAttr = (k: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(k) : k.replace(/["\\]/g, '\\$&'));
  const rectOf = (key: string): Rect | null => {
    const el = anchorRoot.querySelector(`[data-anchor="${escAttr(key)}"]`) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  const update = (): void => {
    const vp = { w: window.innerWidth, h: window.innerHeight };
    let html = '';
    for (const m of collectActiveCoachmarks(world)) {
      const rect = rectOf(m.anchor);
      if (!rect) continue; // 锚点元素未渲出 → 本帧跳过（下一帧再试）
      const g = coachmarkGeometry(rect, vp, m);
      const c = g.cutout, b = g.bubble;
      const dim = rgba(m.dimColor ?? 0x000000, m.dimAlpha ?? 0.6);
      const radius = c.shape === 'circle' ? '50%' : '8px';
      // 镂空：锚点处一块（无背景）+ 巨大 box-shadow 把四周压暗（spotlight 经典法，零 SVG mask）。
      html += `<div style="position:absolute;left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${radius};box-shadow:0 0 0 9999px ${dim};transition:all .15s"></div>`;
      // 高亮金边圈（让"要点的位置"醒目·owner 2026-06-21「没有高亮」）。
      html += `<div style="position:absolute;left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${radius};box-shadow:0 0 0 3px #e0973a,0 0 18px 4px rgba(224,151,58,.6);pointer-events:none"></div>`;
      // 指向箭头（朝高亮元素·owner「有个箭头指向它」）。仅上下放置时画。
      if (g.placement === 'top' || g.placement === 'bottom') {
        const up = g.placement === 'bottom'; // 气泡在下→箭头朝上指；在上→朝下指
        const ax = Math.max(b.x + 11, Math.min(c.x + c.w / 2, b.x + b.w - 11));
        html += `<div style="position:absolute;left:${ax - 9}px;top:${up ? c.y + c.h + 2 : c.y - 14}px;width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;${up ? 'border-bottom:11px solid #e0973a' : 'border-top:11px solid #e0973a'};pointer-events:none"></div>`;
      }
      // 气泡（**pointer-events:none**：纯文案·绝不拦截对高亮目标的点击）。朝上放置时按**底边**锚定→气泡向上长·绝不盖住按钮（owner 2026-06-21「挡住了按钮·往上一点」）。
      const vpos = g.placement === 'top' ? `bottom:${Math.round(vp.h - (c.y - 13))}px` : `top:${b.y}px`;
      html += `<div style="position:absolute;left:${b.x}px;${vpos};width:${b.w}px;min-height:${b.h}px;` +
        `background:#1b1822;border:1px solid #e0973a;border-radius:10px;color:#ece6f5;font:14px/1.5 sans-serif;padding:10px 14px;box-sizing:border-box;` +
        `box-shadow:0 8px 24px #0009;pointer-events:none">${escapeHtml(m.text)}</div>`;
    }
    // eslint-disable-next-line zerocraft/no-html-injection -- 债（评审 2026-09-02 D8）：手拼 HTML 游离于 LayoutNode 外 → P2b 改 Float/Panel 数据·PUI 域
    layer.innerHTML = html;
  };

  update();
  return { update, destroy: () => layer.remove() };
}
