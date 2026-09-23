// 宿主薄层：只把 UI action 放进 InputQueue；所有规则仍由 blueprint capability 执行。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/commands.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { DebugTrace, Flag, Resource, GameFlow } from '@zerocraft/engine/engine/protocol/components.js';
import { appendTrace, bumpTraceTick, findDebugTrace } from '@zerocraft/engine/skills/debug-trace.js';
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
  canPlay: boolean;
  intentId?: string;
}>;

type IdentityCardPileView = Readonly<{ type: 'IdentityCardPile'; hand: readonly string[]; deck: readonly string[]; discard: readonly string[] }>;

function resource(world: Engine['world'], id: string): number {
  for (const [eid] of world.query('Resource')) {
    const entry = world.getComponent<Resource>(eid, 'Resource');
    if (entry?.id === id) return entry.current;
  }
  return 0;
}

function flag(world: Engine['world'], id: string): boolean {
  for (const [eid] of world.query('Flag')) {
    const entry = world.getComponent<Flag>(eid, 'Flag');
    if (entry?.id === id) return entry.active;
  }
  return false;
}

function addedCards(before: readonly string[], after: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of before) counts.set(id, (counts.get(id) ?? 0) + 1);
  const added: string[] = [];
  for (const id of after) {
    const left = counts.get(id) ?? 0;
    if (left > 0) counts.set(id, left - 1); else added.push(id);
  }
  return added;
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
    const before = this.snapshot();
    applyCommands(this.engine.world, this.input.commandsForTick(this.engine.world.getVersion() + 1));
    bumpTraceTick(this.engine.world);
    this.engine.world.tick();
    this.observe(before, this.snapshot());
  }

  trace(): ReadonlyArray<DebugTrace['events'][number]> { return findDebugTrace(this.engine.world)?.events ?? []; }

  private observe(before: RhetoricSnapshot, after: RhetoricSnapshot): void {
    const trace = findDebugTrace(this.engine.world);
    if (!trace) return;
    if (before.phase !== after.phase) {
      appendTrace(trace, trace.tick ?? 0, 'rhetoric-session', 'transition', `${before.phase}→${after.phase}`);
      if (after.phase === 'victory' || after.phase.startsWith('defeat-')) {
        appendTrace(trace, trace.tick ?? 0, 'rhetoric-session', 'commit', `terminal=${after.phase}`);
      }
    }
    if (after.phase.startsWith('intent-') && after.pressure !== before.pressure) {
      appendTrace(trace, trace.tick ?? 0, 'rhetoric-session', 'decision', `intent=${after.intentId ?? 'unknown'}`);
      appendTrace(trace, trace.tick ?? 0, 'rhetoric-session', 'commit', `pressure ${before.pressure}→${after.pressure}`);
    }
    const drawn = addedCards(before.hand, after.hand);
    if (drawn.length > 0 && after.turns > 0) appendTrace(trace, trace.tick ?? 0, 'rhetoric-session', 'commit', `draw=${drawn.join(',')}`);
  }

  snapshot(): RhetoricSnapshot {
    const pile = this.engine.world.getComponent<IdentityCardPileView>('pile', 'IdentityCardPile');
    const flow = this.engine.world.getComponent<GameFlow>('flow', 'GameFlow');
    const phase = flow?.current ?? 'player-1';
    const roundMatch = /^(?:player|intent)-(\d+)$/.exec(phase);
    const roundIndex = Math.max(0, Number(roundMatch?.[1] ?? Math.min(this.config.encounter.turnLimit, resource(this.engine.world, 'turns') + 1)) - 1);
    return {
      progress: resource(this.engine.world, 'progress'), pressure: resource(this.engine.world, 'pressure'),
      focus: resource(this.engine.world, 'focus'), turns: resource(this.engine.world, 'turns'),
      hand: [...(pile?.hand ?? [])], deck: [...(pile?.deck ?? [])], discard: [...(pile?.discard ?? [])],
      phase,
      canPlay: flag(this.engine.world, 'can-play'),
      intentId: this.config.encounter.intentions[roundIndex]?.id,
    };
  }
}
