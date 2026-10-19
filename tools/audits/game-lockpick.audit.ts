import { mountUI } from '../../src/ui/components/index.js';
import { buildLockpickScreen, LOCKPICK_THEME } from '../../games/game-lockpick/lockpick-screen.js';
import { projectLockpick } from '../../games/game-lockpick/presentation.js';
import { LockpickSession } from '../../games/game-lockpick/session.js';
const session = new LockpickSession('hard', 9);
mountUI(document.getElementById('root')!, buildLockpickScreen(projectLockpick(session.state()), true), {}, LOCKPICK_THEME);
// The lock is intentionally a layered assembly: shackle/body/halo/housing/
// lens/anonymous marks share one canvas, and each tumbler is intentionally
// drawn over its fixed frame. The confirmation modal intentionally covers the
// playfield. Exclude only these declared compositions, leaving accidental
// absolute-position collisions audible to the audit.
for (const element of document.querySelectorAll('[id^="lockpick-lock-"], [id^="lockpick-feedback-"], [id^="lockpick-engagement-mark-"], #lockpick-console-frame-art, [id^="lockpick-tumbler-"], #lockpick-give-up-modal')) {
  element.setAttribute('data-allow-overlap', '1');
}
