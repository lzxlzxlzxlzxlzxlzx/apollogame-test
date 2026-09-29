// @vitest-environment happy-dom
// 异形按钮（owner 2026-07-04「异形 UI」需求下沉）：Button.shape 闭集 ShapeToken → 引擎预置 clip-path/border-radius。
//   铁律：只收枚举名（弱 LLM 选得出），绝不收自由 clip-path 坐标。validate 经 catalog 自动拦非法值。
import { describe, it, expect } from 'vitest';
import { ensureUiKeyframes, renderNode } from './index.js';
import { validateLayoutNode } from './validate.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UITheme } from './index.js';

describe('Button.shape · 异形轮廓（闭集 clip-path）', () => {
  it('hexagon → clip-path 六边形多边形', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: '技能', shape: 'hexagon' } });
    expect(html).toContain('clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)');
  });
  it('diamond / shield / ribbon / chevron / tag / cut 各出对应 clip-path', () => {
    const has = (shape: string) => renderNode({ type: 'Button', id: 'b', props: { label: 'x', shape: shape as never } });
    expect(has('diamond')).toContain('clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)');
    expect(has('shield')).toContain('clip-path:polygon(0 0,100% 0,100% 62%,50% 100%,0 62%)');
    expect(has('ribbon')).toContain('92% 50%');
    expect(has('chevron')).toContain('88% 0');
    expect(has('tag')).toContain('12% 0');
    expect(has('cut')).toContain('calc(100% - 10px)');
  });
  it('pill → 全圆 border-radius（非 clip-path）', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: '确定', shape: 'pill' } });
    expect(html).toContain('border-radius:999px');
    expect(html).not.toContain('clip-path');
  });
  it('hero 键异形：shape 覆盖 hero 自带切角（后写 clip-path 生效）', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: '出征', kind: 'hero', shape: 'diamond' } });
    // hero 仍渲染（金底 sheen），末尾追加 diamond clip-path 覆盖 13px 切角
    expect(html).toContain('clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)');
    expect(html.lastIndexOf('clip-path:polygon(50% 0')).toBeGreaterThan(html.indexOf('clip-path:polygon(13px'));
  });
  it('不填 shape → 矩形（既有 border-radius:7px·不回归）', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: 'x' } });
    expect(html).toContain('border-radius:7px');
    expect(html).not.toContain('clip-path');
  });
  it('validate 拦非法 shape（闭集外的自由值报 bad-enum）', () => {
    const bad: LayoutNode = { type: 'Button', id: 'b', props: { label: 'x', shape: 'star' as never } };
    const issues = validateLayoutNode(bad);
    expect(issues.some((i) => i.kind === 'bad-enum' && i.detail.includes('shape'))).toBe(true);
  });
  it('validate 放行合法 shape', () => {
    const ok: LayoutNode = { type: 'Button', id: 'b', props: { label: 'x', shape: 'hexagon' } };
    expect(validateLayoutNode(ok).length).toBe(0);
  });
});

describe('Button.skin · 贴图皮（已解析 URL·同 Image.src 约定）', () => {
  it('skin → 底为该图 cover + 白字投影保可读', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: '开始', skin: '/a/btn.png' } });
    expect(html).toContain("background:url('/a/btn.png') center/cover no-repeat");
    expect(html).toContain('color:#fff');
    expect(html).toContain('text-shadow');
  });
  it('skin url 剥离 url() 逃逸字符防 CSS 注入（引号/括号/空白全剥→无法逃出 url()）', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: 'x', skin: "a.png') ;background:red;x('" } });
    // 逃逸字符 ' ) ( 空白 全被剥 → payload 里的 background:red 只能留在 url('...') 引号内当无害文本，无法成为独立声明。
    expect(html).toContain("url('a.png;background:red;x')"); // 已消毒形态：无中途 ') 破出
    expect(html).not.toContain("') ;"); // 原 payload 的破出序列不复存在
  });
  it('skin + shape 并存（异形贴图键）：clip-path 与贴图皮同出', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: 'x', skin: '/a/s.png', shape: 'shield' } });
    expect(html).toContain('clip-path:polygon(0 0,100% 0,100% 62%,50% 100%,0 62%)');
    expect(html).toContain("url('/a/s.png')");
  });
  it('无 skin → 不加贴图（不回归）', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: 'x' } });
    expect(html).not.toContain('center/cover');
  });
  it('skinSlice → 9-slice border-image（四角固定·任意尺寸不变形）·非 cover', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: 'x', skin: '/a.png', skinSlice: 8 } });
    expect(html).toContain("border-image:url('/a.png') 8 fill / 8px / 0 stretch");
    expect(html).toContain('border-width:8px');
    expect(html).not.toContain('center/cover'); // 9-slice 不用 cover
  });
  it('skin 无 skinSlice → 仍 cover（不回归）', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: 'x', skin: '/a.png' } });
    expect(html).toContain('center/cover');
    expect(html).not.toContain('border-image');
  });
});

describe('UITheme.buttonSkins · 主题级按钮皮（批29 owner 07-15「按键也可换」·一个 kind 一张皮）', () => {
  const skinned: UITheme = { ...SHELL, buttonSkins: { hero: { skin: '/a/hero.png' }, ghost: { skin: '/a/ghost.png', skinSlice: 10 } } };
  it('kind 命中主题皮 → 该 kind 全部按钮换皮（hero=cover·ghost=9-slice）', () => {
    const hero = renderNode({ type: 'Button', id: 'b', props: { label: '出征', kind: 'hero' } }, skinned);
    expect(hero).toContain("url('/a/hero.png') center/cover");
    expect(hero).toContain('data-apollo-skin');
    const ghost = renderNode({ type: 'Button', id: 'b', props: { label: 'x' } }, skinned); // 缺省 kind=ghost
    expect(ghost).toContain("border-image:url('/a/ghost.png') 10 fill / 10px / 0 stretch");
  });
  it('kind 未配主题皮 → 原 kind 底不变（primary 无皮）', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: 'x', kind: 'primary' } }, skinned);
    expect(html).not.toContain('url(');
    expect(html).not.toContain('data-apollo-skin');
  });
  it('node 级 skin 优先于主题皮；skin:\'\' 显式关皮逃生', () => {
    const own = renderNode({ type: 'Button', id: 'b', props: { label: 'x', kind: 'hero', skin: '/mine.png' } }, skinned);
    expect(own).toContain("url('/mine.png')"); expect(own).not.toContain('hero.png');
    const off = renderNode({ type: 'Button', id: 'b', props: { label: 'x', kind: 'hero', skin: '' } }, skinned);
    expect(off).not.toContain('url('); expect(off).not.toContain('data-apollo-skin');
  });
  it('主题无 buttonSkins → 输出与从前逐字节一致（不回归）', () => {
    const before = renderNode({ type: 'Button', id: 'b', props: { label: 'x', kind: 'primary' } }, SHELL);
    expect(before).not.toContain('url('); expect(before).toContain('data-apollo-btn');
  });
});

describe('Button · 交互态标记（按压/悬停反馈·配 server.ts 注入的 [data-apollo-btn] CSS）', () => {
  it('每个按钮带 data-apollo-btn（供全局 :hover/:active 反馈规则命中）', () => {
    expect(renderNode({ type: 'Button', id: 'b', props: { label: 'x' } })).toContain('data-apollo-btn');
    expect(renderNode({ type: 'Button', id: 'b', props: { label: 'x', kind: 'hero' } })).toContain('data-apollo-btn');
  });
  it('贴图按钮额外带 data-apollo-skin（按压更深）', () => {
    expect(renderNode({ type: 'Button', id: 'b', props: { label: 'x', skin: '/a.png' } })).toContain('data-apollo-skin');
    expect(renderNode({ type: 'Button', id: 'b', props: { label: 'x' } })).not.toContain('data-apollo-skin');
  });
  it('普通键和 hero 键都提供主题化 focus-visible 环色令牌，且不以内联 outline 压过共享交互态', () => {
    const normal = renderNode({ type: 'Button', id: 'b', props: { label: 'x' } }, SHELL);
    const hero = renderNode({ type: 'Button', id: 'h', props: { label: 'x', kind: 'hero' } }, SHELL);
    for (const html of [normal, hero]) {
      expect(html).toContain(`--apollo-focus-ring:${SHELL.text}`);
      expect(html).not.toContain('outline:none');
      expect(html).not.toContain('outline:3px solid transparent');
    }
  });
  it('共享交互样式只给非禁用 Button 的键盘 focus-visible 显示焦点环', () => {
    document.getElementById('apollo-ui-keyframes')?.remove();
    ensureUiKeyframes(document);
    const css = document.getElementById('apollo-ui-keyframes')?.textContent ?? '';
    expect(css).toContain('[data-apollo-btn]{outline:none;');
    expect(css).toContain('[data-apollo-btn]:not([disabled]):focus-visible{outline:3px solid var(--apollo-focus-ring);outline-offset:-3px}');
    expect(css).not.toContain('[data-apollo-btn]:focus{outline:');
  });
});
