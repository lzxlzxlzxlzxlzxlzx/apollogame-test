import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { SystemPhase } from '@engine/core/types.js';
import type { RandomSeed, Resource } from '@engine/protocol/components.js';
import { nextRandom } from '@atom-skills/random/index.js';
import { queueResourceMod } from '@atom-skills/resource/index.js';
import { appendTrace, findDebugTrace } from '@skills/debug-trace.js';

/** Closed v1 resource mutation; intentionally does not admit callbacks or expressions. */
type ClosedResourceEffect = { kind: 'modify-resource'; targetId: string; op: 'add' | 'set'; value: number };
type CatalogCard = { cardId: string; focusCost: number; maxCopies: number; effects: ClosedResourceEffect[] };
type CardCatalog = { type: 'CardCatalog'; version: number; cards: CatalogCard[]; allowedResources: string[] };
type IdentityCardPile = { type: 'IdentityCardPile'; deck: string[]; hand: string[]; discard: string[]; handLimit: number; openingHand?: number; phase: string; playPhase: string; shuffled?: boolean };
type IdentityCardCommand = { type: 'IdentityCardCommand'; cardId: string; consumed?: boolean };
type IdentityCardDrawCommand = { type: 'IdentityCardDrawCommand'; count: number; consumed?: boolean };

// Keep the manifest representation closed as well as the runtime interpreter.  `refine`
// below owns numeric-domain checks that the structural schema intentionally cannot express.
const closedResourceEffectSchema = t.obj({
  kind: t.lit('modify-resource'),
  targetId: t.str('目标 Resource.id'),
  op: t.enum(['add', 'set'] as const, '闭集资源操作（与 f1-resource 对齐）'),
  value: t.num('资源变更值'),
}, '闭集资源效果');
const catalogCardSchema = t.obj({
  cardId: t.str('稳定 cardId'),
  focusCost: t.num('出牌专注费用'),
  maxCopies: t.num('目录副本上限'),
  effects: t.arr(closedResourceEffectSchema, '按声明顺序执行的闭集效果'),
}, '目录卡定义');

function rngOf(world: Parameters<typeof findDebugTrace>[0]): RandomSeed | undefined {
  for (const [id] of world.query('RandomSeed')) return world.getComponent<RandomSeed>(id, 'RandomSeed');
  return undefined;
}
function resourceEntryOf(world: Parameters<typeof findDebugTrace>[0], id: string): readonly [string, Resource] | undefined {
  for (const [eid] of world.query('Resource')) { const r = world.getComponent<Resource>(eid, 'Resource'); if (r?.id === id) return [eid, r]; }
  return undefined;
}
function reject(world: Parameters<typeof findDebugTrace>[0], why: string): void {
  const trace = findDebugTrace(world); if (trace) appendTrace(trace, trace.tick ?? 0, 'identity-card-play', 'reject', why);
}
function catalogProblem(catalog: CardCatalog): string | undefined {
  if (!Number.isInteger(catalog?.version) || catalog.version < 1 || !Array.isArray(catalog.cards) || !Array.isArray(catalog.allowedResources) || !catalog.allowedResources.every((id) => typeof id === 'string' && id.length > 0)) return '目录版本或结构非法';
  const ids = new Set<string>();
  for (const card of catalog.cards) {
    if (!card || typeof card.cardId !== 'string' || !card.cardId || ids.has(card.cardId) || !Array.isArray(card.effects)) return 'cardId 或效果列表非法';
    ids.add(card.cardId);
    if (!Number.isInteger(card.focusCost) || card.focusCost < 0 || !Number.isInteger(card.maxCopies) || card.maxCopies < 1) return card.cardId + ' 费用或副本上限非法';
    for (const effect of card.effects) if (!effect || effect.kind !== 'modify-resource' || typeof effect.targetId !== 'string' || !catalog.allowedResources.includes(effect.targetId) || !Number.isFinite(effect.value) || !['add', 'set'].includes(effect.op)) return card.cardId + ' 含非法闭集效果';
  }
  return undefined;
}
function pileProblem(pile: IdentityCardPile): string | undefined {
  if (!Array.isArray(pile?.deck) || !Array.isArray(pile.hand) || !Array.isArray(pile.discard)) return '牌区结构非法';
  if (![...pile.deck, ...pile.hand, ...pile.discard].every((id) => typeof id === 'string' && id.length > 0)) return '牌区 cardId 非法';
  if (!Number.isInteger(pile.handLimit) || pile.handLimit < 0) return '手牌上限非法';
  if (pile.openingHand !== undefined && (!Number.isInteger(pile.openingHand) || pile.openingHand < 0 || pile.openingHand > pile.handLimit)) return '开局抽牌数非法';
  if (typeof pile.phase !== 'string' || !pile.phase || typeof pile.playPhase !== 'string' || !pile.playPhase) return '出牌时序非法';
  if (pile.shuffled !== undefined && typeof pile.shuffled !== 'boolean') return '洗牌标记非法';
  return undefined;
}
function shuffle(cards: string[], rng: RandomSeed): void { for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(rng) * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; } }
function drawTo(pile: IdentityCardPile, rng: RandomSeed | undefined, target: number): string | undefined {
  while (pile.hand.length < target) {
    if (!pile.deck.length && pile.discard.length) {
      if (!rng) return '缺 RandomSeed，弃牌回收拒绝';
      pile.deck.push(...pile.discard.splice(0)); shuffle(pile.deck, rng);
    }
    if (!pile.deck.length) return undefined;
    pile.hand.push(pile.deck.shift()!);
  }
  return undefined;
}

/**
 * Versioned identity-card catalog interpreter. It is deliberately additive: numeric poker
 * cards remain owned by t2-card-pile/t2-card-play.
 */
export const identityCardPlayCapability = defineCapability({
  id: 't2-identity-card-play', version: '1.0.0',
  describe: { name: 'identity-card-play', summary: '版本化 cardId 目录、身份牌区与闭集资源效果。', semantic: ['tier2', 'card', 'deterministic'], whenToUse: '非扑克的目录化卡牌：CardCatalog + IdentityCardPile + IdentityCardCommand。', examples: ['CardCatalog{version:1,cards:[{cardId:"advance",focusCost:1,maxCopies:2,effects:[{kind:"modify-resource",targetId:"progress",op:"add",value:2}]}]}'] },
  components: {
    provides: {
      CardCatalog: defineComponent('CardCatalog', { version: t.num('目录版本'), cards: t.arr(catalogCardSchema, '卡定义'), allowedResources: t.arr(t.str('批准资源 id'), 'v1 可写资源闭集') }, { category: 'config', describe: '版本化身份牌目录；无可执行字段。' }),
      IdentityCardPile: defineComponent('IdentityCardPile', { deck: t.arr(t.str('cardId'), '牌库'), hand: t.arr(t.str('cardId'), '手牌'), discard: t.arr(t.str('cardId'), '弃牌'), handLimit: t.num('手牌上限'), openingHand: t.opt(t.num('初始洗牌后抽取张数；缺省=handLimit')), phase: t.str('当前时序'), playPhase: t.str('允许出牌的时序'), shuffled: t.opt(t.bool('内部洗牌标记')) }, { category: 'config', describe: '身份牌 deck/hand/discard；后续抽牌只由 IdentityCardDrawCommand 请求。' }),
      IdentityCardCommand: defineComponent('IdentityCardCommand', { cardId: t.str('请求出牌的 cardId'), consumed: t.opt(t.bool('内部消费标记')) }, { category: 'event', describe: '出牌命令；非法命令 fail-closed。' }),
      IdentityCardDrawCommand: defineComponent('IdentityCardDrawCommand', { count: t.num('本次请求抽牌张数'), consumed: t.opt(t.bool('内部消费标记')) }, { category: 'event', describe: '受控抽牌命令；超手牌上限时仅抽至上限，非法参数 fail-closed。' }),
    },
    reads: ['CardCatalog', 'IdentityCardPile', 'IdentityCardCommand', 'IdentityCardDrawCommand', 'RandomSeed', 'Resource', 'DebugTrace'], writes: ['IdentityCardPile', 'IdentityCardCommand', 'IdentityCardDrawCommand', 'RandomSeed', 'ResourceModify'], consumes: [],
  }, config: {},
  systems: [{ id: 'identity-card-play', phase: SystemPhase.Intent, reads: ['CardCatalog', 'IdentityCardPile', 'IdentityCardCommand', 'IdentityCardDrawCommand', 'RandomSeed', 'Resource', 'DebugTrace'], writes: ['IdentityCardPile', 'IdentityCardCommand', 'IdentityCardDrawCommand', 'RandomSeed', 'ResourceModify'], consumes: [],
    execute(world) {
      const catalogs = [...world.query('CardCatalog')]; const piles = [...world.query('IdentityCardPile')];
      if (catalogs.length !== 1 || piles.length !== 1) { reject(world, `CardCatalog=${catalogs.length}，IdentityCardPile=${piles.length}；要求各一份`); return; }
      const catalog = world.getComponent<CardCatalog>(catalogs[0][0], 'CardCatalog')!; const pile = world.getComponent<IdentityCardPile>(piles[0][0], 'IdentityCardPile')!;
      const rng = rngOf(world);
      const problem = catalogProblem(catalog); if (problem) { reject(world, problem); return; }
      const invalidPile = pileProblem(pile); if (invalidPile) { reject(world, invalidPile); return; }
      const copies = new Map<string, number>(); for (const id of [...pile.deck, ...pile.hand, ...pile.discard]) copies.set(id, (copies.get(id) ?? 0) + 1);
      if ([...copies].some(([id, n]) => { const c = catalog.cards.find((x) => x.cardId === id); return !c || n > c.maxCopies; })) { reject(world, '牌区含未知 cardId 或超过目录副本上限'); return; }
      const initialize = !pile.shuffled;
      if (initialize) { if (!rng) { reject(world, '缺 RandomSeed，洗牌拒绝'); return; } shuffle(pile.deck, rng); pile.shuffled = true; }
      if (initialize) {
        const drawProblem = drawTo(pile, rng, pile.openingHand ?? pile.handLimit);
        if (drawProblem) { reject(world, drawProblem); return; }
      }
      const rejected: string[] = [];
      for (const [eid] of world.query('IdentityCardDrawCommand')) {
        const command = world.getComponent<IdentityCardDrawCommand>(eid, 'IdentityCardDrawCommand')!; if (command.consumed) continue; command.consumed = true;
        if (!Number.isInteger(command.count) || command.count < 1) { rejected.push('抽牌张数非法'); continue; }
        const drawProblem = drawTo(pile, rng, Math.min(pile.handLimit, pile.hand.length + command.count));
        if (drawProblem) rejected.push(drawProblem);
      }
      let reservedFocus = 0;
      const accepted: Array<{ cardId: string; focusCost: number; effects: number }> = [];
      for (const [eid] of world.query('IdentityCardCommand')) {
        const command = world.getComponent<IdentityCardCommand>(eid, 'IdentityCardCommand')!; if (command.consumed) continue; command.consumed = true;
        const card = catalog.cards.find((c) => c.cardId === command.cardId);
        if (!card) { rejected.push(`未知 cardId ${command.cardId}`); continue; }
        if (pile.phase !== pile.playPhase) { rejected.push(`${command.cardId} 时序非法`); continue; }
        const handIndex = pile.hand.indexOf(command.cardId); if (handIndex < 0) { rejected.push(`${command.cardId} 不在手牌`); continue; }
        const focus = resourceEntryOf(world, 'focus'); if (!focus || focus[1].current - reservedFocus < card.focusCost) { rejected.push(`${command.cardId} 专注不足`); continue; }
        const valid = card.effects.every((e) => !!resourceEntryOf(world, e.targetId));
        if (!valid) { rejected.push(`${command.cardId} 含非法闭集效果`); continue; }
        // Resource writes stay in f1-resource: this interpreter only queues closed events.
        // queueResourceMod preserves declared add/set order when fee/effects share a target.
        queueResourceMod(world, focus[0], 'focus', -card.focusCost, 'local'); reservedFocus += card.focusCost;
        pile.hand.splice(handIndex, 1); pile.discard.push(command.cardId);
        for (const effect of card.effects) { const target = resourceEntryOf(world, effect.targetId)!; queueResourceMod(world, target[0], effect.targetId, effect.value, 'local', effect.op); }
        accepted.push({ cardId: command.cardId, focusCost: card.focusCost, effects: card.effects.length });
      }
      // Trace density contract: one decision + one commit + one aggregated reject at most per tick.
      const trace = findDebugTrace(world); if (trace && accepted.length) {
        appendTrace(trace, trace.tick ?? 0, 'identity-card-play', 'decision', `出牌 ${accepted.map((x) => x.cardId).join(',')}`);
        appendTrace(trace, trace.tick ?? 0, 'identity-card-play', 'commit', `扣 focus=${accepted.reduce((sum, x) => sum + x.focusCost, 0)}；effects=${accepted.reduce((sum, x) => sum + x.effects, 0)}`);
      }
      if (rejected.length) reject(world, rejected.join('；'));
    },
  }],
});
