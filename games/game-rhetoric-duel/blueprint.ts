// 《言弹交锋》内部可运行核。所有规则为组件数据，由共享 capability 消费。
import type { EntityBlueprint, WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { inputCaptureCapability, randomCapability, resourceCapability } from '@zerocraft/engine/atom-skills/index.js';
import { effectApplyCapability, eventWhenCapability, identityCardPlayCapability, keybindCapability } from '@zerocraft/engine/skills/tier2/index.js';
import { flowCapability } from '@zerocraft/engine/skills/tier3/index.js';
import { DEFAULT_RHETORIC_CONFIG, RHETORIC_CATALOG, validateRhetoricGameConfig, type RhetoricGameConfig } from './config.js';

export const PLAY_CARD_ACTION = 'rhetoric.play-card';
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
        phase: 'duel', playPhase: 'duel',
      },
    },
    'identity-input': {
      IdentityCardInput: { action: PLAY_CARD_ACTION, phase: 'action', source: 'rhetoric-ui', sequence: 0 },
    },
    progress: { Resource: { id: 'progress', current: 0, min: 0, max: encounter.progressTarget } },
    pressure: { Resource: { id: 'pressure', current: 0, min: 0, max: encounter.pressureLimit } },
    focus: { Resource: { id: 'focus', current: encounter.focusPerTurn, min: 0, max: encounter.focusPerTurn } },
    turns: { Resource: { id: 'turns', current: 0, min: 0, max: encounter.turnLimit } },
    'end-turn-binding': { KeyBinding: { key: END_TURN_ACTION, signal: END_TURN_ACTION, phase: 'action' } },
    'end-turn-count': { Effect: { onSignal: END_TURN_ACTION, kind: 'modify-resource', targetId: 'turns', op: 'add', value: 1 } },
    'end-turn-focus': { Effect: { onSignal: END_TURN_ACTION, kind: 'modify-resource', targetId: 'focus', op: 'set', value: encounter.focusPerTurn } },
    flow: {
      GameFlow: {
        id: 'rhetoric-duel', current: 'duel',
        states: [
          { id: 'duel', transitions: [
            { when: { kind: 'resource', id: 'progress', cmp: 'gte', value: encounter.progressTarget }, to: 'victory' },
            { when: { kind: 'resource', id: 'pressure', cmp: 'gte', value: encounter.pressureLimit }, to: 'defeat-pressure' },
            { when: { kind: 'resource', id: 'turns', cmp: 'gte', value: encounter.turnLimit }, to: 'defeat-turns' },
          ] },
          { id: 'victory' }, { id: 'defeat-pressure' }, { id: 'defeat-turns' },
        ],
      },
    },
  };

  // 固定有序脚本：每条意图由 event-when + effect-apply 消费，无自适应 AI。
  for (const [index, intent] of encounter.intentions.entries()) {
    const signal = `rhetoric.intent.${intent.id}`;
    entities[`intent-gate-${index}`] = {
      EventWhen: { signal, when: { kind: 'resource', id: 'turns', cmp: 'gte', value: index + 1 }, mode: 'edge', armed: false },
    };
    entities[`intent-effect-${index}`] = {
      Effect: intent.effects[0] ? { onSignal: signal, ...intent.effects[0] } : { onSignal: signal, kind: 'modify-resource', targetId: 'pressure', op: 'add', value: 0 },
    };
  }

  return {
    meta: { tickRate: 60 },
    capabilities: [
      inputCaptureCapability, randomCapability, resourceCapability,
      identityCardPlayCapability, keybindCapability, eventWhenCapability, effectApplyCapability, flowCapability,
    ],
    entities: entities as Record<string, EntityBlueprint>,
  };
}
