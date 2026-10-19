import { describe, expect, it } from 'vitest';
import * as host from '@zerocraft/engine/assembly/life-host/life-game-host.js';
import * as hostLegacy from '@zerocraft/engine/engine/host/life-game-host.js';
import * as save from '@zerocraft/engine/assembly/life-host/life-save.js';
import * as saveLegacy from '@zerocraft/engine/engine/host/life-save.js';
import * as presenter from '@zerocraft/engine/assembly/life-host/life-presenter.js';
import * as presenterLegacy from '@zerocraft/engine/engine/host/life-presenter.js';
import * as interaction from '@zerocraft/engine/assembly/life-host/life-interaction.js';
import * as interactionLegacy from '@zerocraft/engine/engine/host/life-interaction.js';
import * as hud from '@zerocraft/engine/assembly/life-host/life-hud.js';
import * as hudLegacy from '@zerocraft/engine/engine/host/life-hud.js';
import * as overlay from '@zerocraft/engine/assembly/life-host/life-hud-overlay.js';
import * as overlayLegacy from '@zerocraft/engine/engine/host/life-hud-overlay.js';

describe('Life Host public compatibility paths', () => {
  it('resolves old and new paths to the same live module exports', () => {
    for (const [current, legacy] of [
      [host, hostLegacy], [save, saveLegacy], [presenter, presenterLegacy],
      [interaction, interactionLegacy], [hud, hudLegacy], [overlay, overlayLegacy],
    ]) {
      expect(legacy).toEqual(current);
      for (const [key, value] of Object.entries(current)) expect((legacy as Record<string, unknown>)[key]).toBe(value);
    }
  });
});
