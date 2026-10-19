import type { MountHostOptions } from '@zerocraft/engine/engine/host/mount-host.js';

/** The card-reveal play-field is a fully transparent overlay with no reserved UI chrome. */
export const CARD_REVEAL_HOST_OPTIONS: MountHostOptions = Object.freeze({
  fieldW: 1440,
  fieldH: 900,
  bottomBarH: 0,
});

export const CARD_REVEAL_CANVAS_OPTIONS = Object.freeze({ width: 1440, height: 900, background: 'transparent' });
