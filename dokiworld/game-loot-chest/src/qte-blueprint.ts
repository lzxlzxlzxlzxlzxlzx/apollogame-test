import type { EntityBlueprint, WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { inputCaptureCapability, resourceCapability, stateCapability, timerCapability } from '@zerocraft/engine/atom-skills/index.js';
import { effectApplyCapability, eventWhenCapability, keybindCapability } from '@zerocraft/engine/skills/tier2/index.js';

export const QTE_START_ACTION = 'chest.qte.start';
export const QTE_ATTEMPT_ACTION = 'chest.qte.attempt';
export const QTE_CYCLE_TICKS = 100;
export const QTE_WINDOW_START = 48;
export const QTE_WINDOW_END = 62;
export const QTE_ASSIST_START = 38;
export const QTE_ASSIST_END = 72;
export const QTE_ASSIST_AFTER_MISSES = 3;
export const QTE_OPENING_TICKS = 48;

const playing = { kind: 'state', fsmId: 'chest-qte', equals: 'playing' } as const;
const unfinished = { kind: 'resource', id: 'qte-locks', cmp: 'lt', value: 3 } as const;
const normalWindow = {
  kind: 'and',
  of: [
    { kind: 'timer', id: 'qte-cycle', cmp: 'gte', value: QTE_WINDOW_START },
    { kind: 'timer', id: 'qte-cycle', cmp: 'lte', value: QTE_WINDOW_END },
  ],
} as const;
const assistWindow = {
  kind: 'and',
  of: [
    { kind: 'resource', id: 'qte-misses', cmp: 'gte', value: QTE_ASSIST_AFTER_MISSES },
    { kind: 'timer', id: 'qte-cycle', cmp: 'gte', value: QTE_ASSIST_START },
    { kind: 'timer', id: 'qte-cycle', cmp: 'lte', value: QTE_ASSIST_END },
  ],
} as const;
const hitWindow = { kind: 'or', of: [normalWindow, assistWindow] } as const;

/** 固定三锁 QTE：玩法全部是既有 capability 消费的蓝图数据。 */
export function buildChestQteBlueprint(): WorldBlueprint {
  const entities: Record<string, Record<string, unknown>> = {
    'qte-state': { State: { fsmId: 'chest-qte', current: 'ready', previous: 'ready' } },
    'qte-feedback': { State: { fsmId: 'chest-qte-feedback', current: 'idle', previous: 'idle' } },
    'qte-cycle': { Timer: { id: 'qte-cycle', elapsed: 0, duration: QTE_CYCLE_TICKS, loop: true } },
    'qte-locks': { Resource: { id: 'qte-locks', current: 0, min: 0, max: 3 } },
    'qte-misses': { Resource: { id: 'qte-misses', current: 0, min: 0, max: 99 } },
    'qte-attempts': { Resource: { id: 'qte-attempts', current: 0, min: 0, max: 999 } },
    'qte-start-binding': {
      KeyBinding: {
        key: QTE_START_ACTION, signal: 'chest.qte.started', phase: 'action',
        when: { kind: 'state', fsmId: 'chest-qte', equals: 'ready' },
      },
    },
    'qte-hit-binding': {
      KeyBinding: {
        key: QTE_ATTEMPT_ACTION, signal: 'chest.qte.hit', phase: 'action',
        when: { kind: 'and', of: [playing, unfinished, hitWindow] },
      },
    },
    'qte-miss-binding': {
      KeyBinding: {
        key: QTE_ATTEMPT_ACTION, signal: 'chest.qte.miss', phase: 'action',
        when: {
          kind: 'and',
          of: [
            playing,
            unfinished,
            { kind: 'timer', id: 'qte-cycle', cmp: 'gte', value: 8 },
            { kind: 'not', of: hitWindow },
          ],
        },
      },
    },
    'qte-start-state': { Effect: { onSignal: 'chest.qte.started', kind: 'set-state', targetId: 'chest-qte', value: 'playing' } },
    'qte-start-feedback': { Effect: { onSignal: 'chest.qte.started', kind: 'set-state', targetId: 'chest-qte-feedback', value: 'idle' } },
    'qte-start-locks': { Effect: { onSignal: 'chest.qte.started', kind: 'modify-resource', targetId: 'qte-locks', op: 'set', value: 0 } },
    'qte-start-misses': { Effect: { onSignal: 'chest.qte.started', kind: 'modify-resource', targetId: 'qte-misses', op: 'set', value: 0 } },
    'qte-start-attempts': { Effect: { onSignal: 'chest.qte.started', kind: 'modify-resource', targetId: 'qte-attempts', op: 'set', value: 0 } },
    'qte-start-reset': { Effect: { onSignal: 'chest.qte.started', kind: 'reset-timer', targetEntity: 'qte-cycle', value: QTE_CYCLE_TICKS } },
    'qte-hit-lock': { Effect: { onSignal: 'chest.qte.hit', kind: 'modify-resource', targetId: 'qte-locks', op: 'add', value: 1, order: 1 } },
    'qte-hit-clear-misses': { Effect: { onSignal: 'chest.qte.hit', kind: 'modify-resource', targetId: 'qte-misses', op: 'set', value: 0, order: 2 } },
    'qte-hit-attempt': { Effect: { onSignal: 'chest.qte.hit', kind: 'modify-resource', targetId: 'qte-attempts', op: 'add', value: 1, order: 3 } },
    'qte-hit-feedback': { Effect: { onSignal: 'chest.qte.hit', kind: 'set-state', targetId: 'chest-qte-feedback', value: 'hit', order: 4 } },
    'qte-hit-reset': { Effect: { onSignal: 'chest.qte.hit', kind: 'reset-timer', targetEntity: 'qte-cycle', value: QTE_CYCLE_TICKS, order: 5 } },
    'qte-miss-count': { Effect: { onSignal: 'chest.qte.miss', kind: 'modify-resource', targetId: 'qte-misses', op: 'add', value: 1, order: 1 } },
    'qte-miss-attempt': { Effect: { onSignal: 'chest.qte.miss', kind: 'modify-resource', targetId: 'qte-attempts', op: 'add', value: 1, order: 2 } },
    'qte-miss-feedback': { Effect: { onSignal: 'chest.qte.miss', kind: 'set-state', targetId: 'chest-qte-feedback', value: 'miss', order: 3 } },
    'qte-miss-reset': { Effect: { onSignal: 'chest.qte.miss', kind: 'reset-timer', targetEntity: 'qte-cycle', value: QTE_CYCLE_TICKS, order: 4 } },
    'qte-complete-event': {
      EventWhen: {
        signal: 'chest.qte.complete', mode: 'edge', armed: false,
        when: { kind: 'and', of: [playing, { kind: 'resource', id: 'qte-locks', cmp: 'gte', value: 3 }] },
      },
    },
    'qte-complete-state': { Effect: { onSignal: 'chest.qte.complete', kind: 'set-state', targetId: 'chest-qte', value: 'opening' } },
    'qte-complete-reset': { Effect: { onSignal: 'chest.qte.complete', kind: 'reset-timer', targetEntity: 'qte-cycle', value: QTE_CYCLE_TICKS } },
    'qte-reveal-event': {
      EventWhen: {
        signal: 'chest.qte.reveal', mode: 'edge', armed: false,
        when: {
          kind: 'and',
          of: [
            { kind: 'state', fsmId: 'chest-qte', equals: 'opening' },
            { kind: 'timer', id: 'qte-cycle', cmp: 'gte', value: QTE_OPENING_TICKS },
          ],
        },
      },
    },
    'qte-reveal-state': { Effect: { onSignal: 'chest.qte.reveal', kind: 'set-state', targetId: 'chest-qte', value: 'revealed' } },
  };

  return {
    meta: { tickRate: 60 },
    capabilities: [
      inputCaptureCapability, resourceCapability, stateCapability, timerCapability,
      keybindCapability, eventWhenCapability, effectApplyCapability,
    ],
    entities: entities as Record<string, EntityBlueprint>,
  };
}
