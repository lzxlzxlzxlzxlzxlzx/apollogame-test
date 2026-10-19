import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode } from './types.js';

// P2b · 样式逃生口消毒（engine-architecture-review-2026-09-02 D8）：`{custom}` 与遗留裸串此前原样拼进 style="…"。
// 红腿：注入串被削（渲染层）+ 校验层拒收（数据层）；绿腿：合法 url('…') center/cover 与 linear-gradient(…rgba()) 逐字保留。

const panel = (bg: unknown): LayoutNode => ({ type: 'Panel', id: 'p', props: { bg } as never, children: [] });

describe('resolveFill · safeFill', () => {
  it('注入尝试：引号/分号/尖括号被削·无法越出 style 属性', () => {
    const html = renderNode(panel({ custom: 'red"onmouseover="alert(1)' }), SHELL);
    expect(html).not.toContain('onmouseover="');
    expect(html).not.toMatch(/style="[^"]*"[^>]*onmouseover/);
    const html2 = renderNode(panel({ custom: 'red;background:url(javascript:x)' }), SHELL);
    expect(html2).not.toContain(';background:url(javascript');
  });

  it('合法：url(\'…\') center/cover no-repeat 与 linear-gradient(…rgba()) 逐字保留（game-g/game211/game-i 现用形态）', () => {
    const a = renderNode(panel({ custom: "url('/games/game-g/art/home.png') center/cover no-repeat" }), SHELL);
    expect(a).toContain("url('/games/game-g/art/home.png') center/cover no-repeat");
    const b = renderNode(panel({ custom: 'linear-gradient(180deg,rgba(9,5,12,0.92),rgba(9,5,12,0.15) 82%,rgba(9,5,12,0))' }), SHELL);
    expect(b).toContain('linear-gradient(180deg,rgba(9,5,12,0.92),rgba(9,5,12,0.15) 82%,rgba(9,5,12,0))');
    const c = renderNode(panel({ custom: 'radial-gradient(circle, #ffd27a 30%, transparent 72%)' }), SHELL);
    expect(c).toContain('radial-gradient(circle, #ffd27a 30%, transparent 72%)');
  });

  it("Screen.image：`')` 越出 url() 的尝试被剥（esc 不转单引号）", () => {
    const html = renderNode({ type: 'Screen', id: 's', props: { image: "x.png');background:url(evil" } as never, children: [] }, SHELL);
    expect(html).toContain("url('x.png;background:urlevil')"); // 引号/括号被剥·残串困在 url('…') 内无害
    expect(html).not.toContain("');background:url(evil");
  });
});

describe('validateLayoutNode · unsafe-style（数据层拒收）', () => {
  it("`{custom:'x\"onmouseover=…'}` → unsafe-style 硬错；合法 custom 不报", () => {
    const bad = validateLayoutNode(panel({ custom: 'x"onmouseover=alert(1)' }));
    expect(bad.some((i) => i.kind === 'unsafe-style')).toBe(true);
    expect(validateLayoutNode(panel({ custom: 'red;color:blue' })).some((i) => i.kind === 'unsafe-style')).toBe(true);
    expect(validateLayoutNode(panel({ custom: 'expression(alert(1))' })).some((i) => i.kind === 'unsafe-style')).toBe(true);
    expect(validateLayoutNode(panel({ custom: "url('/a/b.png') center/cover no-repeat" })).some((i) => i.kind === 'unsafe-style')).toBe(false);
    expect(validateLayoutNode(panel({ custom: 'linear-gradient(90deg,#fff,rgba(0,0,0,0.5))' })).some((i) => i.kind === 'unsafe-style')).toBe(false);
  });

  it('repeat：source 必填、template 递归校验（缺 id 也点名到 repeat.template 路径）', () => {
    const node: LayoutNode = { type: 'Panel', id: 'p', props: {}, repeat: { source: '', template: { type: 'Label', id: '', props: { text: 'x' } } } };
    const issues = validateLayoutNode(node);
    expect(issues.some((i) => i.kind === 'bad-repeat')).toBe(true);
    expect(issues.some((i) => i.kind === 'missing-id' && i.path.endsWith('/repeat.template'))).toBe(true);
    const ok: LayoutNode = { type: 'Panel', id: 'p', props: {}, repeat: { source: 'hand', template: { type: 'Label', id: 'x', props: { text: '{{item.face}}' } } } };
    expect(validateLayoutNode(ok)).toEqual([]);
  });
});
