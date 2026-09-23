// 《言弹交锋》内部可运行核。所有规则为组件数据，由共享 capability 消费。
import type { EntityBlueprint, WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { flagCapability, inputCaptureCapability, randomCapability, resourceCapability, transformCapability } from '@zerocraft/engine/atom-skills/index.js';
import { effectApplyCapability, eventWhenCapability, identityCardPlayCapability, keybindCapability } from '@zerocraft/engine/skills/tier2/index.js';
import { casterCapability, flowCapability, prefabCapability } from '@zerocraft/engine/skills/tier3/index.js';
import { DEFAULT_RHETORIC_CONFIG, RHETORIC_CATALOG, validateRhetoricGameConfig, type RhetoricGameConfig } from './config.js';

export const PLAY_CARD_ACTION = 'rhetoric.play';
export const END_TURN_ACTION = 'rhetoric.end-turn';

function deckFrom(entries: readonly Readonly<{ cardId: string; copies: number }>[]): string[] {
  return entries.flatMap(({ cardId, copies }) => Array.from({ length: copies }, () => cardId));
}

/** 仅装配数据；没有言弹专属 system 或 cardId 条件分支。 */
export function buildBlueprint(
  source: RhetoricGameConfig = DEFAULT_RHETORIC_CONFIG,
): WorldBlueprint {
  const config = validateRhetoricGameConfig(source);
  const { encounter } = config;
  const gameplayOpen = {
    kind: 'and',
    of: [
      { kind: 'flag', id: 'can-play', equals: true },
      { kind: 'resource', id: 'progress', cmp: 'lt', value: encounter.target },
      { kind: 'resource', id: 'pressure', cmp: 'lt', value: encounter.pressureLimit },
      { kind: 'resource', id: 'turns', cmp: 'lt', value: encounter.turnLimit },
    ],
  } as const;
  const terminal = () => [{ kind: 'set-flag', targetId: 'can-play', value: false }, { kind: 'set-flag', targetId: 'draw-requested', value: false }].map((action) => ({ ...action }));
  const states: Record<string, unknown>[] = [];
  for (let index = 0; index < encounter.turnLimit; index += 1) {
    const round = index + 1;
    const intent = encounter.intentions[index]!;
    states.push({
      id: `player-${round}`,
      onEnter: [
        { kind: 'set-flag', targetId: 'can-play', value: true },
        { kind: 'set-flag', targetId: 'draw-requested', value: false },
      ],
      transitions: [
        { when: { kind: 'resource', id: 'progress', cmp: 'gte', value: encounter.target }, to: 'victory', do: terminal() },
        { when: { kind: 'resource', id: 'pressure', cmp: 'gte', value: encounter.pressureLimit }, to: 'defeat-pressure', do: terminal() },
        { when: { kind: 'flag', id: 'end-turn-requested', equals: true }, to: `intent-${round}`, do: [
          { kind: 'set-flag', targetId: 'can-play', value: false },
          { kind: 'set-flag', targetId: 'end-turn-requested', value: false },
          { kind: 'modify-resource', targetId: 'turns', op: 'add', value: 1 },
        ] },
      ],
    });
    const intentActions = intent.effects.map((entry) => ({ kind: 'modify-resource', targetId: entry.targetId, op: entry.op, value: entry.value }));
    const next = index + 1 < encounter.turnLimit ? `player-${round + 1}` : 'defeat-turns';
    states.push({
      id: `intent-${round}`,
      onEnter: [{ kind: 'set-flag', targetId: 'can-play', value: false }, ...intentActions],
      transitions: [
        { after: 1, when: { kind: 'resource', id: 'pressure', cmp: 'gte', value: encounter.pressureLimit }, to: 'defeat-pressure', do: terminal() },
        { after: 1, when: { kind: 'resource', id: 'turns', cmp: 'gte', value: encounter.turnLimit }, to: 'defeat-turns', do: terminal() },
        { after: 1, to: next, do: index + 1 < encounter.turnLimit ? [
          { kind: 'modify-resource', targetId: 'focus', op: 'set', value: encounter.focusPerTurn },
          { kind: 'set-flag', targetId: 'draw-requested', value: true },
        ] : terminal() },
      ],
    });
  }
  states.push(
    { id: 'victory', onEnter: terminal() },
    { id: 'defeat-pressure', onEnter: terminal() },
    { id: 'defeat-turns', onEnter: terminal() },
  );
  // 新 capability 的组件在生成型 ComponentDataMap 更新前，蓝图保持开放 authoring
  // record；交给 capability 自身 schema 审核，装配出口再收窄为 WorldBlueprint。
  const entities: Record<string, Record<string, unknown>> = {
    rng: { RandomSeed: { seed: config.seed, sequence: 0 } },
    catalog: {
      CardCatalog: {
        version: config.catalogVersion,
        cards: RHETORIC_CATALOG.map(({ cardId, focusCost, maxCopies, effects }) => ({ cardId, focusCost, maxCopies, effects })),
        allowedResources: ['progress', 'pressure', 'focus'],
      },
    },
    pile: {
      IdentityCardPile: {
        deck: deckFrom(config.deck), hand: [], discard: [],
        handLimit: encounter.handLimit, openingHand: encounter.openingHand,
        phase: 'duel', playPhase: 'duel', playWhen: gameplayOpen,
      },
    },
    'identity-input': {
      IdentityCardInput: { action: PLAY_CARD_ACTION, phase: 'action', source: 'rhetoric-ui', sequence: 0 },
    },
    progress: { Resource: { id: 'progress', current: 0, min: 0, max: encounter.target } },
    pressure: { Resource: { id: 'pressure', current: 0, min: 0, max: encounter.pressureLimit } },
    focus: { Resource: { id: 'focus', current: encounter.focusPerTurn, min: 0, max: encounter.focusPerTurn } },
    turns: { Resource: { id: 'turns', current: 0, min: 0, max: encounter.turnLimit } },
    'can-play': { Flag: { id: 'can-play', active: false } },
    'end-turn-requested': { Flag: { id: 'end-turn-requested', active: false } },
    'draw-requested': { Flag: { id: 'draw-requested', active: false } },
    trace: { DebugTrace: { events: [], tick: 0, max: 400 } },
    'end-turn-binding': { KeyBinding: { key: END_TURN_ACTION, signal: END_TURN_ACTION, phase: 'action', when: gameplayOpen } },
    'end-turn-request': { Effect: { onSignal: END_TURN_ACTION, kind: 'set-flag', targetId: 'end-turn-requested', value: true } },
    'draw-event': { EventWhen: { signal: 'rhetoric.draw-next', when: { kind: 'flag', id: 'draw-requested', equals: true }, mode: 'edge', armed: false } },
    'draw-caster': {
      Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      Caster: { onSignal: 'rhetoric.draw-next', template: 'rhetoric-draw-command', at: 'self' },
    },
    'prefab-library': { PrefabLibrary: { seq: 0, templates: { 'rhetoric-draw-command': { entities: { command: { IdentityCardDrawCommand: { count: encounter.drawPerTurn } } } } } } },
    flow: {
      GameFlow: {
        id: 'rhetoric-duel', current: 'player-1', states,
      },
    },
  };

  return {
    meta: { tickRate: 60 },
    capabilities: [
      inputCaptureCapability, randomCapability, resourceCapability, flagCapability, transformCapability,
      identityCardPlayCapability, keybindCapability, eventWhenCapability, effectApplyCapability,
      flowCapability, casterCapability, prefabCapability,
    ],
    entities: entities as Record<string, EntityBlueprint>,
  };
}
