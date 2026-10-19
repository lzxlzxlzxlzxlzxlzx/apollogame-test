import { createAppClient } from 'dokiworlds-app-sdk';
import { fnv1a32 } from '@zerocraft/engine/engine/math/hash.js';
import { mountUI, type ActionSink, type MountHandle } from '@zerocraft/engine/ui/components/index.js';
import { LockpickSession } from '../../../games/game-lockpick/session.js';
import { buildLockpickErrorScreen, buildLockpickScreen, LOCKPICK_CANCEL, LOCKPICK_CONFIRM, LOCKPICK_GIVE_UP, LOCKPICK_THEME } from '../../../games/game-lockpick/lockpick-screen.js';
import { projectLockpick } from '../../../games/game-lockpick/presentation.js';
import { playLockpickSfx } from '../../../games/game-lockpick/sfx.js';
import { inputFromContract, isEmptyPreview, lockpickOutput, parseLockpickInput, type LockpickInput } from './contract.js';

const rootElement = document.querySelector<HTMLElement>('#app');
if (!rootElement) throw new Error('#app not found');
const root: HTMLElement = rootElement;
const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
const app = createAppClient({ appId: 'game-lockpick', targetOrigin: '*' });
let game = new LockpickSession('easy', 1);
let ui: MountHandle | undefined;
let isPreview = previewMode;
let confirmGiveUp = false;
let sent = false;
let mounted = true;
let completionTimer: number | undefined;

function render(): void {
  const tree = buildLockpickScreen(projectLockpick(game.state()), confirmGiveUp, isPreview);
  if (ui) ui.update(tree, LOCKPICK_THEME); else ui = mountUI(root, tree, {}, LOCKPICK_THEME, sink);
}
function finishIfTerminal(): void {
  const state = game.state();
  if (isPreview || sent || (state.status !== 'success' && state.status !== 'failure')) return;
  sent = true;
  const delay = state.status === 'success' ? 1_000 : 650;
  completionTimer = window.setTimeout(() => {
    completionTimer = undefined;
    void app.complete(lockpickOutput(state.status === 'success' ? 'success' : 'failure')).catch(() => { sent = false; render(); });
  }, delay);
}
function setSlot(action: string, arg: string | undefined): void {
  const match = /^lockpick\.ui\.set\.(\d+)$/.exec(action);
  if (!match || arg === undefined) return;
  game.set(Number(match[1]), Number(arg)); game.tick();
  const state = game.state();
  playLockpickSfx('lockpick.adjust');
  if (state.status === 'success') playLockpickSfx('lockpick.unlock');
  else if (state.status === 'playing') playLockpickSfx(`lockpick.feedback.${projectLockpick(state).feedbackTier}` as 'lockpick.feedback.cold' | 'lockpick.feedback.dim' | 'lockpick.feedback.warm' | 'lockpick.feedback.bright');
  render(); finishIfTerminal();
}
const sink: ActionSink = { enqueueAction(name, value): void {
  if (name.startsWith('lockpick.ui.set.')) return setSlot(name, value?.arg);
  if (name === LOCKPICK_GIVE_UP) { playLockpickSfx('ui.confirm'); confirmGiveUp = true; return render(); }
  if (name === LOCKPICK_CANCEL) { playLockpickSfx('ui.cancel'); confirmGiveUp = false; return render(); }
  if (name === LOCKPICK_CONFIRM) { playLockpickSfx('ui.confirm'); confirmGiveUp = false; game.giveUp(); game.tick(); playLockpickSfx('lockpick.give-up'); render(); finishIfTerminal(); }
} };
function load(input: LockpickInput, seed: number, preview: boolean): void { game = new LockpickSession(input.difficulty, seed); isPreview = preview; confirmGiveUp = false; sent = false; render(); }
function seedForSession(): number { return fnv1a32(`${app.instanceId}:${app.runId ?? ''}`); }

const disconnect = app.connect();
if (previewMode) load(parseLockpickInput({ difficulty: 'easy' }), 1, true);
void app.whenReady({ timeoutMs: 10_000 }).then((envelope) => {
  if (!mounted) return;
  if (isEmptyPreview(envelope.data)) return load(parseLockpickInput({ difficulty: 'easy' }), 1, true);
  load(inputFromContract(envelope), seedForSession(), false);
}).catch((error) => {
  if (!mounted) return;
  if (previewMode) return render();
  const message = error instanceof Error ? error.message : 'Invalid DokiWorld launch input.';
  const tree = buildLockpickErrorScreen(message);
  if (ui) ui.update(tree, LOCKPICK_THEME); else ui = mountUI(root, tree, {}, LOCKPICK_THEME);
  app.requestExit();
});
window.addEventListener('pagehide', () => { mounted = false; if (completionTimer !== undefined) window.clearTimeout(completionTimer); disconnect(); app.dispose(); ui?.(); }, { once: true });
