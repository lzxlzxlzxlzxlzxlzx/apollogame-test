import { describe, expect, it } from 'vitest';
import { cartTheme } from './cart-run-core.js';
import { renderNode } from '@ui/components/render.js';

describe('cartridge installed font slot', () => {
  it('uses YaHei only when explicitly selected and leaves house default unchanged', () => {
    const node = { type: 'Label', id: 'headline', props: { text: '搜证完成', size: 30 } } as const;
    const old = renderNode(node, cartTheme({ theme: 'apolloOnyx' }));
    const exact = renderNode(node, cartTheme({ theme: 'apolloOnyx', font: 'system-yahei' }));
    expect(old).toContain("font-family:'Noto Sans SC'");
    expect(exact).toContain("font-family:'Microsoft YaHei', '微软雅黑', sans-serif");
    expect(renderNode(node, cartTheme({ theme: 'apolloOnyx' }))).toBe(old);
  });
});
