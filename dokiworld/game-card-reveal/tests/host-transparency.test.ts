// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { CARD_REVEAL_CANVAS_OPTIONS, CARD_REVEAL_HOST_OPTIONS } from '../src/host-config.js';

describe('S4 transparent overlay host', () => {
  it('does not inject an opaque scene, wrapper or renderer background', () => {
    expect(CARD_REVEAL_HOST_OPTIONS).toEqual({ fieldW: 1440, fieldH: 900, bottomBarH: 0 });
    expect(CARD_REVEAL_HOST_OPTIONS).not.toHaveProperty('sceneBackground');
    expect(CARD_REVEAL_HOST_OPTIONS).not.toHaveProperty('wrapperBackground');
    expect(CARD_REVEAL_HOST_OPTIONS).not.toHaveProperty('sceneBgSkin');
    expect(CARD_REVEAL_CANVAS_OPTIONS).toEqual({ width: 1440, height: 900, background: 'transparent' });

    const root = document.createElement('main');
    document.body.appendChild(root);
    const host = mountHost(root, CARD_REVEAL_HOST_OPTIONS);
    expect(host.wrapper.style.background).toBe('');
    expect(host.scene.style.background).toBe('');
    expect(host.playfieldHost).toBe(host.scene);
    host.teardown();
    root.remove();
  });
});
