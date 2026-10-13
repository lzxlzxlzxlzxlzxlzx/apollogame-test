import { mountUI, type ActionSink, type MountHandle } from '@zerocraft/engine/ui/components/index.js';
import { LockpickSession } from './session.js';
import { buildLockpickScreen, LOCKPICK_CANCEL, LOCKPICK_CONFIRM, LOCKPICK_GIVE_UP, LOCKPICK_THEME } from './lockpick-screen.js';
import { projectLockpick } from './presentation.js';
import { playLockpickSfx } from './sfx.js';
export function mount(container: HTMLElement): () => void {
  let session = new LockpickSession('easy', 1); let confirming = false; let ui: MountHandle | undefined;
  const render = (): void => { const tree = buildLockpickScreen(projectLockpick(session.state()), confirming, true); if (ui) ui.update(tree, LOCKPICK_THEME); else ui = mountUI(container, tree, {}, LOCKPICK_THEME, sink); };
  const sink: ActionSink = { enqueueAction(action, value): void {
    const slot = /^lockpick\.ui\.set\.(\d+)$/.exec(action);
    if (slot && value?.arg !== undefined) { session.set(Number(slot[1]), Number(value.arg)); session.tick(); const state = session.state(); playLockpickSfx('lockpick.adjust'); playLockpickSfx(state.status === 'success' ? 'lockpick.unlock' : `lockpick.feedback.${projectLockpick(state).feedbackTier}` as 'lockpick.feedback.cold'); render(); return; }
    if (action === LOCKPICK_GIVE_UP) { confirming = true; playLockpickSfx('ui.confirm'); render(); return; }
    if (action === LOCKPICK_CANCEL) { confirming = false; playLockpickSfx('ui.cancel'); render(); return; }
    if (action === LOCKPICK_CONFIRM) { confirming = false; session.giveUp(); session.tick(); playLockpickSfx('lockpick.give-up'); render(); }
  } };
  render(); return () => { ui?.(); };
}
