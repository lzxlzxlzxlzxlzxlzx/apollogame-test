import { LIFE_MOVE_STATE_ACTION } from '../protocol/life-sim.js';

export interface LifeKeyboardSink {
  enqueueAction(name: string, arg?: { arg?: string }): void;
  requestInteraction(): void;
  cycleInteraction(delta: 1 | -1): void;
  confirmInteraction(): void;
  backInteraction(): void;
  closeInteraction(): void;
}
export type LifeKeyboardBinding = (() => void) & { readonly releaseAll: () => void };
export interface LifeInputState { readonly heldCodes: readonly string[] }
export type LifeInputEvent =
  | { readonly kind: 'keydown'; readonly code: string; readonly repeat?: boolean; readonly shiftKey?: boolean }
  | { readonly kind: 'keyup'; readonly code: string }
  | { readonly kind: 'blur' }
  | { readonly kind: 'visibility' };
export type LifeInputEffect = { readonly kind: 'action'; readonly name: string; readonly arg?: string } | { readonly kind: 'interaction'; readonly operation: 'request' | 'next' | 'previous' | 'confirm' | 'back' | 'close' };
export interface LifeInputReduction { readonly state: LifeInputState; readonly effects: readonly LifeInputEffect[]; readonly preventDefault: boolean }
export const EMPTY_LIFE_INPUT_STATE: LifeInputState = Object.freeze({ heldCodes: [] });
const DIRECTIONS: Readonly<Record<string, 'up' | 'down' | 'left' | 'right'>> = Object.freeze({ KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' });
const DIRECTION_BITS = Object.freeze({ up: 1, down: 2, left: 4, right: 8 } as const);

function movementStateEffect(codes: readonly string[]): LifeInputEffect {
  let mask = 0;
  for (const code of codes) {
    const direction = DIRECTIONS[code];
    if (direction) mask |= DIRECTION_BITS[direction];
  }
  return { kind: 'action', name: LIFE_MOVE_STATE_ACTION, arg: String(mask) };
}

/** Pure reducer. DOM installation below only dispatches these semantic effects. */
export function reduceLifeInput(state: LifeInputState, event: LifeInputEvent): LifeInputReduction {
  if (event.kind === 'blur' || event.kind === 'visibility') return { state: EMPTY_LIFE_INPUT_STATE, effects: state.heldCodes.length === 0 ? [] : [movementStateEffect([])], preventDefault: false };
  const direction = DIRECTIONS[event.code];
  if (event.kind === 'keyup') {
    if (!direction) return { state, effects: [], preventDefault: false };
    if (!state.heldCodes.includes(event.code)) return { state, effects: [], preventDefault: true };
    const heldCodes = state.heldCodes.filter((code) => code !== event.code);
    return { state: { heldCodes }, effects: [movementStateEffect(heldCodes)], preventDefault: true };
  }
  if (direction) {
    // A browser repeat is not a new intent and must not duplicate a move start.
    if (event.repeat || state.heldCodes.includes(event.code)) return { state, effects: [], preventDefault: true };
    const heldCodes = [...state.heldCodes, event.code];
    return { state: { heldCodes }, effects: [{ kind: 'interaction', operation: 'close' }, movementStateEffect(heldCodes)], preventDefault: true };
  }
  const operation: Readonly<Record<string, LifeInputEffect>> = {
    KeyE: { kind: 'interaction', operation: 'request' },
    Tab: { kind: 'interaction', operation: event.shiftKey ? 'previous' : 'next' },
    Enter: { kind: 'interaction', operation: 'confirm' },
    Escape: { kind: 'interaction', operation: 'back' },
    KeyT: { kind: 'action', name: 'life.advance-time' },
    KeyN: { kind: 'action', name: 'life.advance-day' },
  };
  const effect = operation[event.code];
  if (!effect) return { state, effects: [], preventDefault: false };
  if (event.repeat) return { state, effects: [], preventDefault: true };
  if (effect.kind === 'interaction') return { state, effects: [effect], preventDefault: true };
  return { state: EMPTY_LIFE_INPUT_STATE, effects: [...(state.heldCodes.length === 0 ? [] : [movementStateEffect([])]), effect], preventDefault: true };
}

export function installLifeKeyboard(target: EventTarget, sink: LifeKeyboardSink, visibilityTarget?: EventTarget): LifeKeyboardBinding {
  let state: LifeInputState = EMPTY_LIFE_INPUT_STATE;
  const dispatch = (event: LifeInputEvent, keyboardEvent?: KeyboardEvent): void => {
    const result = reduceLifeInput(state, event);
    state = result.state;
    if (result.preventDefault) keyboardEvent?.preventDefault();
    for (const effect of result.effects) {
      if (effect.kind === 'action') sink.enqueueAction(effect.name, effect.arg === undefined ? undefined : { arg: effect.arg });
      else if (effect.operation === 'request') sink.requestInteraction();
      else if (effect.operation === 'next') sink.cycleInteraction(1);
      else if (effect.operation === 'previous') sink.cycleInteraction(-1);
      else if (effect.operation === 'confirm') sink.confirmInteraction();
      else if (effect.operation === 'back') sink.backInteraction();
      else sink.closeInteraction();
    }
  };
  const down = (event: KeyboardEvent): void => dispatch({ kind: 'keydown', code: event.code, repeat: event.repeat, shiftKey: event.shiftKey }, event);
  const up = (event: KeyboardEvent): void => dispatch({ kind: 'keyup', code: event.code }, event);
  const blur = (): void => dispatch({ kind: 'blur' });
  const visibility = (): void => dispatch({ kind: 'visibility' });
  const releaseAll = (): void => dispatch({ kind: 'blur' });
  target.addEventListener('keydown', down as EventListener); target.addEventListener('keyup', up as EventListener); target.addEventListener('blur', blur as EventListener);
  visibilityTarget?.addEventListener('visibilitychange', visibility as EventListener);
  const dispose = (() => { releaseAll(); target.removeEventListener('keydown', down as EventListener); target.removeEventListener('keyup', up as EventListener); target.removeEventListener('blur', blur as EventListener); visibilityTarget?.removeEventListener('visibilitychange', visibility as EventListener); }) as LifeKeyboardBinding;
  Object.defineProperty(dispose, 'releaseAll', { value: releaseAll });
  return dispose;
}
