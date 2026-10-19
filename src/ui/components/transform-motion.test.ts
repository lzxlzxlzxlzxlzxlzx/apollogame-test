// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderNode, validateLayoutNode } from './index.js';
import { mountUI } from './server.js';
import { UI_LAYOUT_CATALOG } from './catalog.js';

describe('LayoutConstraints.transformFrom · non-opacity state motion', () => {
  it('derives a numeric closed-to-open transform animation and preserves the declared terminal pose', () => {
    const html = renderNode({
      type: 'Image', id: 'shackle', props: { src: '/art/shackle.png', alt: '锁梁' },
      layout: {
        x: 20, y: -35, width: 300, height: 300, rotate: 24,
        transformFrom: { x: 0, y: 0, rotate: 0 }, transformMotionMs: 720, transformMotionEasing: 'ease-in-out',
      },
    });
    expect(html).toContain('--transform-from:translate(-20px,35px) rotate(0deg) scale(1)');
    expect(html).toContain('--transform-to:rotate(24deg)');
    expect(html).toContain('animation:apollo-transformFrom 720ms ease-in-out both');
    expect(html).toContain('left:20px;top:-35px');
    expect(html).not.toContain('opacity:');
  });

  it('defaults safely and rejects a free easing string by falling back to ease-out', () => {
    const html = renderNode({
      type: 'Panel', id: 'door', props: { bare: true },
      layout: { x: 48, y: 12, rotate: 9, transformFrom: {}, transformMotionEasing: 'evil;opacity:0' as never }, children: [],
    });
    expect(html).toContain('animation:apollo-transformFrom 800ms ease-out both');
    expect(html).not.toContain('evil');
    expect(html).not.toContain('opacity:0');
  });

  it('has catalog guidance and rejects invalid transform-motion data before rendering', () => {
    expect(UI_LAYOUT_CATALOG.transformFrom.easing).toEqual(['linear', 'ease-out', 'ease-in-out']);
    const issues = validateLayoutNode({
      type: 'Panel', id: 'invalid-pose', props: { bare: true }, children: [],
      layout: { transformFrom: { x: 'not-a-number' } as never, transformMotionMs: 'fast' as never, transformMotionEasing: 'spring' as never },
    });
    expect(issues.filter((issue) => issue.kind === 'bad-transform')).toHaveLength(3);
  });

  it('does not change pre-existing animation behavior when transformFrom is omitted', () => {
    const html = renderNode({ type: 'Panel', id: 'old-anim', props: { bare: true }, layout: { anim: 'shake', animMs: 420 }, children: [] });
    expect(html).toContain('animation:apollo-shake 420ms both ease-out');
    expect(html).not.toContain('apollo-transformFrom');
  });

  it('injects a transform-only keyframe plus reduced-motion override', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const teardown = mountUI(host, { type: 'Panel', id: 'p', props: { bare: true }, layout: { transformFrom: { x: -20 } }, children: [] });
    const css = document.getElementById('apollo-ui-keyframes')?.textContent ?? '';
    expect(css).toContain('@keyframes apollo-transformFrom');
    const block = css.match(/@keyframes apollo-transformFrom\{[^}]+\}to\{[^}]+\}\}/)?.[0] ?? '';
    expect(block).toContain('transform:');
    expect(block).not.toContain('opacity');
    expect(css).toContain('[data-skin-slider-thumb],[data-transform-transition]{transition-duration:0ms!important}');
    expect(css).toContain('[style*="apollo-transformFrom"],[style*="apollo-signalPulse"],[style*="apollo-signalIgnition"]{animation-duration:0ms!important}');
    teardown(); host.remove();
  });

  it('keeps a same-id node alive and chases only its declared transform state', () => {
    const tree = (rotate: number, label = 'stable') => ({
      type: 'Panel' as const, id: 'relay-rotor', props: { title: label },
      layout: { width: 64, height: 64, rotate, transformTransition: { ms: 280, easing: 'ease-out' as const } }, children: [],
    });
    const host = document.createElement('div'); document.body.appendChild(host);
    const ui = mountUI(host, tree(0));
    const before = host.querySelector('#relay-rotor') as HTMLElement;
    expect(before.getAttribute('style')).toContain('transition:transform 280ms ease-out');
    ui.update(tree(72));
    const chased = host.querySelector('#relay-rotor') as HTMLElement;
    expect(chased).toBe(before);
    expect(chased.getAttribute('style')).toContain('transform:rotate(72deg)');
    ui.update(tree(144, 'changed-prop'));
    expect(host.querySelector('#relay-rotor')).not.toBe(before);
    ui(); host.remove();
  });

  it('catalogues and validates continuous transform transition data', () => {
    expect(UI_LAYOUT_CATALOG.transformTransition.changing).toEqual(['x', 'y', 'rotate', 'scale']);
    const issues = validateLayoutNode({ type: 'Image', id: 'bad-chase', props: { src: '/r.png' }, layout: {
      transformTransition: { ms: 3000, easing: 'spring' as never },
    } });
    expect(issues.filter((issue) => issue.kind === 'bad-transform')).toHaveLength(2);
  });
});
