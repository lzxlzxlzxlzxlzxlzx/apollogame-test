// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { mountUI } from './server.js';
import { validateLayoutNode } from './validate.js';

describe('Image signal tint', () => {
  it('uses one neutral image with bounded continuous red-to-green lens treatment', () => {
    const low = renderNode({ type: 'Image', id: 'low', props: { src: '/lamp.png', tint: { kind: 'signal', progress: -5 } } });
    const high = renderNode({ type: 'Image', id: 'high', props: { src: '/lamp.png', tint: { kind: 'signal', progress: 5 } } });
    expect(low).toContain('hue-rotate(300.0deg)');
    expect(high).toContain('hue-rotate(420.0deg)');
    expect(low).toContain('transition:filter 420ms');
    expect(high).toContain('drop-shadow(0 0 22.0px');
    expect(low).not.toContain('apollo-signalPulse'); // default is a steady, non-animated light.
  });

  it('has a closed off / steady / once / loop emission contract without opacity or box shadows', () => {
    const off = renderNode({ type: 'Image', id: 'off', props: { src: '/lamp.png', tint: { kind: 'signal', progress: 0, emission: 'off' } } });
    const steady = renderNode({ type: 'Image', id: 'steady', props: { src: '/lamp.png', tint: { kind: 'signal', progress: .5, emission: 'steady' } } });
    const once = renderNode({ type: 'Image', id: 'once', props: { src: '/lamp.png', tint: { kind: 'signal', progress: 1, emission: 'once' } } });
    const loop = renderNode({ type: 'Image', id: 'loop', props: { src: '/lamp.png', tint: { kind: 'signal', progress: .5, emission: 'loop' } } });

    expect(off).toContain('hue-rotate(300.0deg)');
    expect(off).not.toContain('drop-shadow');
    expect(off).not.toContain('apollo-signalPulse');
    expect(steady).toContain('drop-shadow(0 0');
    expect(steady).not.toContain('apollo-signalPulse');
    expect(once).toContain('animation:apollo-signalIgnition 420ms ease-out 1 both');
    expect(once).toContain('--signal-flash-core:sepia(1) saturate(2.20) hue-rotate(24deg) brightness(1.75)');
    expect(loop).toContain('animation:apollo-signalPulse 880ms ease-in-out infinite');
    for (const html of [off, steady, once, loop]) {
      expect(html).not.toContain('box-shadow');
      expect(html).not.toContain('opacity:');
      expect(html).not.toContain('transform:');
    }
  });

  it('keeps pulse:true as the legacy spelling of looping signal emission', () => {
    const html = renderNode({ type: 'Image', id: 'legacy-pulse', props: { src: '/lamp.png', tint: { kind: 'signal', progress: .5, pulse: true } } });
    expect(html).toContain('animation:apollo-signalPulse 880ms ease-in-out infinite');
    expect(html).toContain('--signal-core:sepia(1)');
  });

  it('rejects malformed nested signal-emission data before render', () => {
    const issues = validateLayoutNode({
      type: 'Image', id: 'invalid-signal',
      props: { src: '/lamp.png', tint: { kind: 'signal', progress: .5, emission: 'blink' as never } },
    });
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'bad-signal-emission' })]));
  });

  it('injects a transform-free, opacity-free alpha-shaped pulse keyframe', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const teardown = mountUI(host, { type: 'Image', id: 'pulse-css', props: { src: '/lamp.png', tint: { kind: 'signal', progress: .5, pulse: true } } });
    const css = document.getElementById('apollo-ui-keyframes')?.textContent ?? '';
    const signalStart = css.indexOf('@keyframes apollo-signalIgnition');
    const signalEnd = css.indexOf('@keyframes apollo-coin-heads');
    const keyframe = css.slice(signalStart, signalEnd);
    expect(keyframe).toContain('drop-shadow');
    expect(keyframe).toContain('--signal-flash-core');
    expect(keyframe).toContain('hsl(42 100% 62%');
    expect(keyframe).not.toContain('box-shadow');
    expect(keyframe).not.toContain('opacity');
    expect(css).toContain('[style*="apollo-signalIgnition"]{animation-duration:0ms!important}');
    teardown(); host.remove();
  });
  it('keeps the legacy blur image path without an empty filter declaration', () => {
    const html = renderNode({ type: 'Image', id: 'plain', props: { src: '/plain.png', blur: 4 } });
    expect(html).toContain('filter:blur(4px)');
    expect(html).not.toContain('transition:filter');
  });
});
