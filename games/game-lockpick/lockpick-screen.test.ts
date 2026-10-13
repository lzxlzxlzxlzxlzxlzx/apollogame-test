// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountUI, renderNode, validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { buildLockpickScreen } from './lockpick-screen.js';
import type { LockpickView } from './presentation.js';

const playing = (correctProgress = 0): LockpickView => ({
  status: 'playing', values: [0, 1, 2], slotCount: 3, correctProgress,
  feedbackTier: correctProgress === 0 ? 'cold' : 'warm',
});

describe('机关锁 UI · relay-ratchet feedback', () => {
  it('mounts the fixed brass lock plus one aggregate-only relay rotor and no signal-light layers', () => {
    const tree = buildLockpickScreen(playing(1 / 3));
    expect(validateLayoutNode(tree)).toEqual([]);
    const html = renderNode(tree);
    expect(html).toContain('lockpick-padlock-body-retro.png');
    expect(html).toContain('lockpick-padlock-shackle-retro.png');
    expect(html).toContain('lockpick-relay-rotor-retro.png');
    expect(html).toContain('lockpick-lock-assembly');
    expect(html).toContain('lockpick-relay-rotor');
    expect(html).toContain('width:118px;height:118px');
    const rotor = html.match(/<img[^>]*id="lockpick-relay-rotor"[^>]*>/)?.[0] ?? '';
    expect(rotor).toContain('transition:transform 280ms ease-out');
    expect(rotor).toContain('left:91px;top:57px');
    expect(html).not.toContain('lockpick-feedback-');
    expect(html).not.toContain('lockpick-engagement-mark-');
    expect(html).not.toContain('signal-lamp');
    expect(html).not.toContain('signal-lens');
    expect(html).not.toContain('signal-halo');
    expect(html).not.toContain('lamp-round-retro');
    expect(html).not.toContain('lamp-white-retro');
    expect(html).not.toContain('lamp-red-retro');
    expect(html).not.toContain('lamp-amber-retro');
    expect(html).not.toContain('lamp-green-retro');
    expect(html).not.toContain('apollo-transformFrom');
    expect(html).not.toContain('apollo-glow');
    expect(html).not.toContain('box-shadow');
    expect(html).not.toContain('apollo-pulse');
    expect(html).not.toContain('lockpick-title');
    expect(html).not.toContain('lockpick-instruction');
  });

  it('uses one anonymous relay stage across 3, 4, and 5 tumbler sessions', () => {
    for (const slotCount of [3, 4, 5] as const) {
      const view: LockpickView = { ...playing(1 / slotCount), slotCount, values: Array(slotCount).fill(0) };
      const html = renderNode(buildLockpickScreen(view));
      expect(html).toContain('lockpick-relay-rotor');
      expect(html).not.toContain('lockpick-engagement-mark-');
    }
  });

  it('keeps the shared relay rotor alive and advances one mechanical detent for an aggregate change', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const ui = mountUI(host, buildLockpickScreen(playing(0)));
    const before = host.querySelector('#lockpick-relay-rotor') as HTMLElement;
    const beforeStyle = before.getAttribute('style');
    ui.update(buildLockpickScreen(playing(1 / 3)));
    const after = host.querySelector('#lockpick-relay-rotor') as HTMLElement;
    expect(after).toBe(before);
    expect(after.getAttribute('style')).toContain('transition:transform 280ms ease-out');
    expect(after.getAttribute('style')).not.toBe(beforeStyle);
    ui(); host.remove();
  });

  it('keeps all tumbler counts playable: the matching 3/4/5-rail frame and exact number of sliders mount together', () => {
    for (const slotCount of [3, 4, 5] as const) {
      const view: LockpickView = { ...playing(0), slotCount, values: Array(slotCount).fill(0) };
      const html = renderNode(buildLockpickScreen(view));
      expect(validateLayoutNode(buildLockpickScreen(view))).toEqual([]);
      expect(html).toContain(`lockpick-console-frame-${slotCount}-retro.png`);
      expect((html.match(/data-skin-slider(?:\s|>)/g) ?? [])).toHaveLength(slotCount);
      expect(html).toContain(`lockpick-slider-${slotCount - 1}`);
    }
  });

  it('uses frame-specific calibration so normal and hard end stops stay inside their art sockets', () => {
    const normal = renderNode(buildLockpickScreen({ ...playing(0), slotCount: 4, values: [0, 1, 2, 0] }));
    const hard = renderNode(buildLockpickScreen({ ...playing(0), slotCount: 5, values: [0, 1, 2, 0, 1] }));
    expect(normal).toContain('data-slider-thumb-inset="40"');
    expect(normal).toContain('top:59.11229946524064px');
    expect(hard).toContain('data-slider-thumb-inset="36"');
    expect(hard).not.toContain('data-slider-thumb-inset="40"');
  });

  it('uses the same lock on success: the shackle truly moves from closed to its lifted pose without fading', () => {
    const tree = buildLockpickScreen({ ...playing(1), status: 'success', feedbackTier: 'open' });
    expect(validateLayoutNode(tree)).toEqual([]);
    const html = renderNode(tree);
    expect(html).toContain('id="lockpick-lock-shackle"');
    expect(html).toContain('left:20px;top:-35px');
    expect(html).toContain('rotate(24deg)');
    expect(html).toContain('--transform-from:translate(-20px,35px) rotate(0deg) scale(1)');
    expect(html).toContain('animation:apollo-transformFrom 820ms ease-in-out both');
    expect(html).not.toContain('animation:apollo-flyIn');
    const shackle = html.match(/<img id="lockpick-lock-shackle"[^>]+>/)?.[0] ?? '';
    expect(shackle).not.toContain('opacity:');
    expect(html).not.toContain('lockpick-terminal-bolt');
  });

  it('keeps the completed tumbler board visible but removes terminal slider actions', () => {
    const html = renderNode(buildLockpickScreen({ ...playing(1), status: 'success', feedbackTier: 'open' }));
    expect(html).toContain('lockpick-console-frame-3-retro.png');
    expect((html.match(/data-skin-slider(?:\s|>)/g) ?? [])).toHaveLength(3);
    expect(html).toContain('lockpick-slider-2');
    expect(html).not.toContain('data-action="lockpick.ui.set.0"');
    expect(html).not.toContain('data-action="lockpick.ui.set.1"');
    expect(html).not.toContain('data-action="lockpick.ui.set.2"');
    expect((html.match(/disabled aria-disabled="true"/g) ?? [])).toHaveLength(3);
  });

  it('makes give-up visible as a deliberate secondary action that still opens the confirmation gate', () => {
    const html = renderNode(buildLockpickScreen(playing(0)));
    const button = html.match(/<button[^>]*id="lockpick-give-up"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('background:');
    expect(button).toContain('clip-path:polygon');
    expect(button).toContain('data-action="lockpick.ui.give-up"');
    expect(html).toContain('width:190px');
  });
});
