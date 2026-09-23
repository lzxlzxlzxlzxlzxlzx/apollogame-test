// 宿主薄层：只把 UI action 放进 InputQueue；所有规则仍由 blueprint capability 执行。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/commands.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { Resource, GameFlow } from '@zerocraft/engine/engine/protocol/components.js';
import { buildBlueprint, END_TURN_ACTION, PLAY_CARD_ACTION } from './blueprint.js';
import { DEFAULT_RHETORIC_CONFIG, validateRhetoricGameConfig, type RhetoricGameConfig } from './config.js';

export type RhetoricSnapshot = Readonly<{
  progress: number;
  pressure: number;
  focus: number;
  turns: number;
  hand: readonly string[];
  deck: readonly string[];
  discard: readonly string[];
  phase: string;
}>;

type IdentityCardPileView = Readonly<{ type: 'IdentityCardPile'; hand: readonly string[]; deck: readonly string[]; discard: readonly string[] }>;

function resource(world: Engine['world'], id: string): number {
  for (const [eid] of world.query('Resource')) {
    const entry = world.getComponent<Resource>(eid, 'Resource');
    if (entry?.id === id) return entry.current;
  }
  return 0;
}

/** 可被 LayoutNode ActionSink 调用的内部会话，不解释任何卡牌文本。 */
export class RhetoricDuelSession {
  readonly engine: Engine;
  readonly input = new QueuedInputSource('rhetoric-ui');
  readonly config: RhetoricGameConfig;

  constructor(source: RhetoricGameConfig = DEFAULT_RHETORIC_CONFIG) {
    this.config = validateRhetoricGameConfig(source);
    this.engine = new Engine({ input: this.input });
    this.engine.load(buildBlueprint(this.config));
    this.tick(); // 初始化洗牌及开局抽牌。
  }

  play(cardId: string): void { this.input.enqueueAction(PLAY_CARD_ACTION, { arg: cardId }); this.tick(); }
  endTurn(): void { this.input.enqueueAction(END_TURN_ACTION); this.tick(); }
  tick(): void {
    applyCommands(this.engine.world, this.input.commandsForTick(this.engine.world.getVersion() + 1));
    this.engine.world.tick();
  }

  snapshot(): RhetoricSnapshot {
    const pile = this.engine.world.getComponent<IdentityCardPileView>('pile', 'IdentityCardPile');
    const flow = this.engine.world.getComponent<GameFlow>('flow', 'GameFlow');
    return {
      progress: resource(this.engine.world, 'progress'), pressure: resource(this.engine.world, 'pressure'),
      focus: resource(this.engine.world, 'focus'), turns: resource(this.engine.world, 'turns'),
      hand: [...(pile?.hand ?? [])], deck: [...(pile?.deck ?? [])], discard: [...(pile?.discard ?? [])],
      phase: flow?.current ?? 'duel',
    };
  }
}
