import { LIFE_MOVE_STATE_ACTION } from '../protocol/life-sim.js';

export interface LifeKeyboardSink {
  enqueueAction(name: string, arg?: { arg?: string }): void;
  requestInteraction(): void;
  cycleInteraction(delta: 1 | -1): void;
  confirmInteraction(): void;
  backInteraction(): void;
  closeInteraction(): void;
  toggleInventory?(): void;
  closeInventory?(): void;
  toggleQuests?(): void;
  closeQuests?(): void;
  toggleProfile?():void;
  closeProfile?():void;
}
export type LifeKeyboardBinding = (() => void) & { readonly releaseAll: () => void };
/** Render-local opt-in routing. Never changes the pure reducer or World actions. */
export interface LifeNativeUiKeyboardPolicy {
  readonly host: HTMLElement;
  readonly playfield?: HTMLElement;
  readonly enabled: () => boolean;
  readonly interactionOpen: () => boolean;
}
export interface LifeInputState { readonly heldCodes: readonly string[] }
export type LifeInputEvent =
  | { readonly kind: 'keydown'; readonly code: string; readonly repeat?: boolean; readonly shiftKey?: boolean }
  | { readonly kind: 'keyup'; readonly code: string }
  | { readonly kind: 'blur' }
  | { readonly kind: 'visibility' };
export type LifeInputEffect =
  | { readonly kind: 'action'; readonly name: string; readonly arg?: string }
  | { readonly kind: 'interaction'; readonly operation: 'request' | 'next' | 'previous' | 'confirm' | 'back' | 'close' }
  | { readonly kind: 'host'; readonly operation: 'inventory-toggle' | 'inventory-close' | 'quest-toggle' | 'quest-close' | 'profile-toggle' | 'profile-close' };
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
  if (event.code === 'KeyI') {
    if (event.repeat) return { state, effects: [], preventDefault: true };
    return { state, effects: [{ kind: 'host', operation: 'inventory-toggle' }], preventDefault: true };
  }
  if (event.code === 'KeyJ') {
    if (event.repeat) return { state, effects: [], preventDefault: true };
    return { state, effects: [{ kind: 'host', operation: 'quest-toggle' }], preventDefault: true };
  }
  if(event.code==='KeyC'){
    if(event.repeat)return{state,effects:[],preventDefault:true};
    return{state,effects:[{kind:'host',operation:'profile-toggle'}],preventDefault:true};
  }
  if (event.code === 'Escape') {
    if (event.repeat) return { state, effects: [], preventDefault: true };
    return { state, effects: [{ kind: 'host', operation: 'inventory-close' }, { kind: 'host', operation: 'quest-close' }, {kind:'host',operation:'profile-close'}, { kind: 'interaction', operation: 'back' }], preventDefault: true };
  }
  const operation: Readonly<Record<string, LifeInputEffect>> = {
    KeyE: { kind: 'interaction', operation: 'request' },
    Tab: { kind: 'interaction', operation: event.shiftKey ? 'previous' : 'next' },
    Enter: { kind: 'interaction', operation: 'confirm' },
    KeyT: { kind: 'action', name: 'life.advance-time' },
    KeyN: { kind: 'action', name: 'life.advance-day' },
  };
  const effect = operation[event.code];
  if (!effect) return { state, effects: [], preventDefault: false };
  if (event.repeat) return { state, effects: [], preventDefault: true };
  if (effect.kind === 'interaction') return { state, effects: [effect], preventDefault: true };
  return { state: EMPTY_LIFE_INPUT_STATE, effects: [...(state.heldCodes.length === 0 ? [] : [movementStateEffect([])]), effect], preventDefault: true };
}

export function installLifeKeyboard(target: EventTarget, sink: LifeKeyboardSink, visibilityTarget?: EventTarget, nativeUi?: LifeNativeUiKeyboardPolicy): LifeKeyboardBinding {
  let state: LifeInputState = EMPTY_LIFE_INPUT_STATE;
  const dispatch = (event: LifeInputEvent, keyboardEvent?: KeyboardEvent): void => {
    const result = reduceLifeInput(state, event);
    state = result.state;
    if (result.preventDefault) keyboardEvent?.preventDefault();
    for (const effect of result.effects) {
      if (effect.kind === 'action') sink.enqueueAction(effect.name, effect.arg === undefined ? undefined : { arg: effect.arg });
      else if (effect.kind === 'host') {
        if (effect.operation === 'inventory-toggle') sink.toggleInventory?.();
        else if (effect.operation === 'inventory-close') sink.closeInventory?.();
        else if (effect.operation === 'quest-toggle') sink.toggleQuests?.();
        else if(effect.operation==='quest-close') sink.closeQuests?.();
        else if(effect.operation==='profile-toggle')sink.toggleProfile?.();
        else sink.closeProfile?.();
      }
      else if (effect.operation === 'request') sink.requestInteraction();
      else if (effect.operation === 'next') sink.cycleInteraction(1);
      else if (effect.operation === 'previous') sink.cycleInteraction(-1);
      else if (effect.operation === 'confirm') sink.confirmInteraction();
      else if (effect.operation === 'back') sink.backInteraction();
      else sink.closeInteraction();
    }
  };
  const down = (event: KeyboardEvent): void => {
    if (nativeUi && (event.code === 'Tab' || event.code === 'Enter' || event.code === 'Space')
      && nativeUi.enabled() && !nativeUi.interactionOpen()) {
      const focused = nativeUi.host.ownerDocument.activeElement;
      const nativeControl = focused && nativeUi.host.contains(focused)
        && focused.matches('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)');
      const entryTab = event.code === 'Tab' && (focused === nativeUi.host.ownerDocument.body
        || (focused?.matches('canvas') && nativeUi.playfield?.contains(focused)));
      // LayoutNode Tooltip is an intentional native tab stop for resource names.
      // Let Tab leave it too; Enter/Space still require a real native control.
      const tooltipTab = event.code === 'Tab' && focused && nativeUi.host.contains(focused)
        && focused.matches('[data-tooltip][tabindex="0"]');
      if (focused && event.target === focused && (nativeControl || entryTab || tooltipTab)) {
        console.debug('[Life keyboard] decision:native-ui', event.code);
        return; // Browser owns Tab/Enter/Space; do not preventDefault or emit a World action.
      }
    }
    dispatch({ kind: 'keydown', code: event.code, repeat: event.repeat, shiftKey: event.shiftKey }, event);
  };
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
