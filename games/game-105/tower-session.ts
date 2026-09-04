import { COLLAPSE_BLOCK_COUNT, isExtracted, isTowerBlock, SETTLING_TIMEOUT_FRAMES } from './tower-lifecycle.js';
import { TOWER_BLOCKS, type TowerBlock } from './tower-blueprint.js';

export type PlayerId = 'player' | 'ai';
export type GamePhase = 'boot' | 'player-ready' | 'player-pulling' | 'resolving' | 'player-interaction' | 'ai-observe' | 'ai-pulling' | 'ai-response' | 'collapse-locked';

export interface InteractionCard { effectId: string; block: TowerBlock; title: string; text: string; kind: 'main' | 'aftershock' | 'summary'; sequence: number; total: number; }
export interface AIPenaltyCard { effectId: string; id: string; title: string; prompt: string; channel: TowerBlock['channel']; sequence: number; total: number; }

const INTERACTION_TEXT: Record<TowerBlock['channel'], { title: string; text: string }> = {
  pink: { title: '轻松分享', text: '说一件今天让你觉得温暖的小事。' },
  purple: { title: '心动时刻', text: '分享一个最近让你心跳加快的小瞬间。' },
  blue: { title: '默契选择', text: '想一个你希望一起完成的小计划。' },
  gold: { title: '温柔挑战', text: '给对方一句真诚的鼓励。' },
};
const CARD_VARIANTS = [
  '说一个具体的小细节。', '换一个角度回答也可以。', '用一句轻松的话回应。', '选一个让你安心的瞬间。',
  '分享一个你愿意留下的偏好。', '说说你会怎么温柔地做。', '用一个词给这一刻命名。', '给彼此一句小小的鼓励。',
] as const;
const CARD_POOL: Record<TowerBlock['channel'], readonly string[]> = {
  pink: ['今天有什么小事让你觉得被照顾到了？', '说一个让你放松的瞬间。', '分享一个最近的小确幸。', '留下一句温柔的提醒。', '今天最想谢谢谁？', '说说你喜欢的安静时刻。', '选一个让你安心的习惯。', '讲一个轻轻的好消息。'],
  purple: ['和 TA 相处时，你最喜欢哪种安静时刻？', '什么样的陪伴让你舒服？', '分享一个想慢慢了解的偏好。', '今天哪一刻让你心里一暖？', '用一句话形容此刻。', '选一种你喜欢的相处节奏。', '说一个让你微笑的小发现。', '留一句给未来自己的话。'],
  blue: ['在散步、看电影、做饭里，选一个最想一起做的。', '选一个适合慢慢完成的小计划。', '你想把哪段时间留给彼此？', '选一个下次见面的轻松主题。', '一起做什么最不需要赶时间？', '给今晚选一个小小的仪式感。', '选一首适合散步的歌。', '说一个想共同练习的习惯。'],
  gold: ['给 TA 一句具体、真诚的鼓励。', '说一件你欣赏的认真。', '留下一句温暖的肯定。', '用十二个字以内夸夸对方。', '说说对方做得好的地方。', '给这一局一句勇气。', '分享一个值得被看见的优点。', '留下一句可以慢慢实现的话。'],
};
const AI_PENALTY_POOL = [
  { id: 'truthful-close', title: '真心收尾', prompt: '说一句你愿意认真记住的话。' },
  { id: 'brave-admission', title: '勇气承认', prompt: '承认一件刚才没有立刻说出口的小心事。' },
  { id: 'gentle-promise', title: '温柔约定', prompt: '给下一局留一个可以兑现的小约定。' },
  { id: 'specific-encouragement', title: '反向鼓励', prompt: '先给对方一句具体的肯定。' },
] as const;

export class TowerGameSession {
  constructor(private readonly seed = 105) {}
  phase: GamePhase = 'boot';
  turn: PlayerId = 'player';
  heartDelta = 0;
  lastAIResponseBlocks: TowerBlock[] = [];
  readonly aiInteractionQueue: InteractionCard[] = [];
  aiReplyVisible = false;
  aiPenaltyCard: AIPenaltyCard | null = null;
  aiPenaltyCompleted = false;
  aiReplyCount = 0;
  aiPenaltyRequestCount = 0;
  readonly extractedBlocks = new Set<string>();
  /** One-way, session-only rule fact. Retired bodies stay in Cannon but cannot be selected again. */
  readonly retiredBlocks = new Set<string>();
  readonly settledExtractionHistory: string[] = [];
  /** Fully detached blocks awaiting a successful turn resolution, in physical departure order. */
  readonly pendingExtractionIds = new Map<string, number>();
  /** Resolved detached blocks whose bodies have not yet slept in the visible loot area. */
  readonly pendingLootIds = new Set<string>();
  readonly loot: TowerBlock[] = [];
  readonly interactionQueue: InteractionCard[] = [];
  readonly roundResponses: string[] = [];
  draftResponse = '';
  swapsRemaining = 1;
  aftershockSummary = 0;
  wrapUpText = '';
  round = 1;
  playerDraws = 0;
  aiDraws = 0;
  linkedExtractions = 0;
  completedInteractions = 0;
  aiWrapAcknowledged = false;
  aiWrapCount = 0;
  lastSwapWasUnseenSameChannel = false;
  selected: TowerBlock | null = null;
  loser: PlayerId | null = null;
  templateReply = '';
  private releasedDistance = 0;
  private stableFrames = 0;
  private settlingFrames = 0;
  private readonly unstableBlocks = new Set<string>();
  private readonly unseenPrompts: Record<TowerBlock['channel'], Set<string>> = {
    pink: new Set(CARD_POOL.pink), purple: new Set(CARD_POOL.purple), blue: new Set(CARD_POOL.blue), gold: new Set(CARD_POOL.gold),
  };
  private readonly overflowAftershocks: TowerBlock[] = [];
  private effectSeq = 0;
  private extractionSeq = 0;

  beginPull(block: TowerBlock, by: string | undefined): boolean {
    const expected = by === 'player' ? 'player-ready' : by === 'ai' ? 'ai-observe' : null;
    if (!expected || this.phase !== expected || by !== this.turn || this.retiredBlocks.has(block.id) || !isTowerBlock(block.id, this.extractedBlocks)) return false;
    this.selected = block; this.releasedDistance = 0; this.unstableBlocks.clear();
    this.phase = by === 'player' ? 'player-pulling' : 'ai-pulling';
    return true;
  }

  observePullDistance(actualDistance: number): void {
    if (!this.selected || (this.phase !== 'player-pulling' && this.phase !== 'ai-pulling')) return;
    this.observeTowerBlockDistances([{ block: this.selected, distance: actualDistance }]);
  }

  /**
   * Receives measured world-space axial distances from the shared physical executor.
   * This is deliberately a game-rule input, not part of LocalAIObservation.
   */
  observeTowerBlockDistances(entries: readonly { block: TowerBlock; distance: number }[]): void {
    if (this.phase !== 'player-pulling' && this.phase !== 'ai-pulling' && this.phase !== 'resolving') return;
    for (const { block, distance } of entries) {
      const detached = isExtracted(distance);
      if (detached && !this.extractedBlocks.has(block.id)) {
        this.extractedBlocks.add(block.id);
        this.pendingExtractionIds.set(block.id, ++this.extractionSeq);
      } else if (!detached && this.extractedBlocks.has(block.id) && !this.retiredBlocks.has(block.id) && !this.settledExtractionHistory.includes(block.id)
        && (this.phase === 'player-pulling' || this.phase === 'ai-pulling')) {
        // Only an active hand may retract an extracted block. After release, a falling body's
        // horizontal projection may cross the line without returning to the supporting tower.
        this.extractedBlocks.delete(block.id);
        this.pendingExtractionIds.delete(block.id);
        this.pendingLootIds.delete(block.id);
      }
    }
  }

  /** Commits an unintended, real physics departure so neither actor can select the scattered body again. */
  observePhysicalFalls(blocks: readonly TowerBlock[]): void {
    if (this.phase !== 'player-pulling' && this.phase !== 'ai-pulling' && this.phase !== 'resolving') return;
    for (const block of blocks) {
      if (block.id === this.selected?.id || this.retiredBlocks.has(block.id)) continue;
      this.extractedBlocks.add(block.id);
      this.pendingExtractionIds.set(block.id, this.pendingExtractionIds.get(block.id) ?? ++this.extractionSeq);
      this.retiredBlocks.add(block.id);
    }
  }

  /** Loot is visual only after the real detached body has naturally gone to sleep. */
  observeSleepingExtractions(sleepingIds: ReadonlySet<string>): void {
    if (this.phase === 'collapse-locked') return;
    for (const id of [...this.pendingLootIds]) {
      if (!sleepingIds.has(id)) continue;
      const block = this.blockById(id);
      if (block && !this.loot.some((item) => item.id === id)) this.loot.push(block);
      this.pendingLootIds.delete(id);
    }
  }

  release(actualDistance: number): void {
    if (!this.selected || (this.phase !== 'player-pulling' && this.phase !== 'ai-pulling')) return;
    this.releasedDistance = actualDistance;
    this.observeTowerBlockDistances([{ block: this.selected, distance: actualDistance }]);
    if (isExtracted(actualDistance)) this.retiredBlocks.add(this.selected.id);
    this.phase = 'resolving'; this.stableFrames = 0; this.settlingFrames = 0;
  }

  observePhysics(allTowerBodiesSleeping: boolean, toppledBlockIds: readonly string[] = []): void {
    if (this.phase === 'collapse-locked') return;
    for (const id of toppledBlockIds) if (isTowerBlock(id, this.extractedBlocks)) this.unstableBlocks.add(id);
    if (this.unstableBlocks.size >= COLLAPSE_BLOCK_COUNT) { this.lockCollapse(); return; }
    if (this.phase === 'boot') {
      this.stableFrames = allTowerBodiesSleeping ? this.stableFrames + 1 : 0;
      if (this.stableFrames >= 30) this.phase = 'player-ready';
      return;
    }
    if (this.phase !== 'resolving') return;
    if (++this.settlingFrames >= SETTLING_TIMEOUT_FRAMES) { this.lockCollapse(); return; }
    this.stableFrames = allTowerBodiesSleeping ? this.stableFrames + 1 : 0;
    if (this.stableFrames < 30) return;
    this.resolvePull();
  }

  resolveInteraction(completed: boolean): boolean {
    if (this.phase !== 'player-interaction' || this.turn !== 'player' || !this.interactionQueue.length) return false;
    const card = this.interactionQueue.shift()!;
    if (completed) this.heartDelta += card.block.score;
    if (completed && card.kind !== 'summary') this.completedInteractions++;
    if (this.interactionQueue.length || this.enqueueNextOverflowSummary()) return true;
    this.turn = 'ai'; this.phase = 'ai-observe';
    return true;
  }

  setDraftResponse(value: string): void { this.draftResponse = value.slice(0, 140); }
  useQuickReply(value: string): void { this.setDraftResponse(value); }
  submitInteraction(): boolean {
    const response = this.draftResponse.trim();
    if (!response) return false;
    this.roundResponses.push(response); this.draftResponse = '';
    return this.resolveInteraction(true);
  }
  submitWrapUp(): boolean {
    if (this.phase !== 'collapse-locked' || this.loser !== 'player') return false;
    const response = this.draftResponse.trim();
    if (!response) return false;
    this.roundResponses.push(response); this.draftResponse = ''; this.wrapUpText = '我收到了这句话。谢谢你把这一局好好收住。';
    return true;
  }
  skipWrapUp(): boolean {
    if (this.phase !== 'collapse-locked' || this.loser !== 'player') return false;
    this.draftResponse = ''; this.wrapUpText = '这次就轻轻跳过。已完成的互动仍留在本局。';
    return true;
  }
  swapInteraction(): boolean {
    const card = this.interactionQueue[0];
    if (!card || card.kind !== 'main' || this.swapsRemaining < 1) return false;
    const replacement = this.nextPrompt(card.block.channel);
    if (!replacement) return false;
    this.swapsRemaining--; card.text = replacement; this.lastSwapWasUnseenSameChannel = true;
    return true;
  }

  acknowledgeAIWrap(): boolean {
    if (this.phase !== 'collapse-locked' || this.loser !== 'ai' || !this.aiPenaltyCompleted || this.aiWrapAcknowledged) return false;
    this.aiWrapAcknowledged = true;
    this.wrapUpText = '这句收尾已经留在这一局。下一局，我们可以慢一点。';
    return true;
  }

  finishAIResponse(): void {
    if (this.phase !== 'ai-response' || this.aiReplyVisible) return;
    this.aiReplyCount++;
    this.aiReplyVisible = true;
  }

  advanceAIResponse(): void {
    if (this.phase !== 'ai-response' || !this.aiReplyVisible) return;
    this.aiInteractionQueue.shift(); this.aiReplyVisible = false;
    if (this.aiInteractionQueue.length) return;
    this.round++; this.turn = 'player'; this.phase = 'player-ready';
  }

  finishAIPenaltyReply(): void {
    if (this.phase !== 'collapse-locked' || this.loser !== 'ai' || !this.aiPenaltyCard || this.aiPenaltyCompleted) return;
    this.aiPenaltyCompleted = true;
  }

  restart(): void {
    this.phase = 'boot'; this.turn = 'player'; this.heartDelta = 0; this.extractedBlocks.clear(); this.retiredBlocks.clear();
    this.settledExtractionHistory.length = 0; this.pendingExtractionIds.clear(); this.pendingLootIds.clear(); this.loot.length = 0; this.interactionQueue.length = 0; this.roundResponses.length = 0;
    this.selected = null; this.loser = null; this.templateReply = ''; this.lastAIResponseBlocks = []; this.aiInteractionQueue.length = 0; this.aiReplyVisible = false; this.aiPenaltyCard = null; this.aiPenaltyCompleted = false; this.releasedDistance = 0;
    this.stableFrames = 0; this.settlingFrames = 0; this.unstableBlocks.clear(); this.effectSeq = 0; this.extractionSeq = 0; this.draftResponse = ''; this.swapsRemaining = 1; this.aftershockSummary = 0; this.wrapUpText = '';
    this.round = 1; this.playerDraws = 0; this.aiDraws = 0; this.linkedExtractions = 0; this.completedInteractions = 0; this.aiWrapAcknowledged = false; this.aiWrapCount = 0; this.aiReplyCount = 0; this.aiPenaltyRequestCount = 0; this.lastSwapWasUnseenSameChannel = false; this.overflowAftershocks.length = 0;
    for (const prompts of Object.values(this.unseenPrompts)) prompts.clear();
    for (const [channel, prompts] of Object.entries(CARD_POOL) as [TowerBlock['channel'], readonly string[]][]) for (const prompt of prompts) this.unseenPrompts[channel].add(prompt);
  }

  private resolvePull(): void {
    const selectedId = this.selected?.id; this.selected = null;
    const extracted = [...this.pendingExtractionIds]
      .filter(([id]) => this.extractedBlocks.has(id) && !this.settledExtractionHistory.includes(id))
      .sort(([aId, aOrder], [bId, bOrder]) => (aId === selectedId ? -1 : bId === selectedId ? 1 : aOrder - bOrder || aId.localeCompare(bId)))
      .map(([id]) => this.blockById(id))
      .filter((block): block is TowerBlock => !!block);
    if (!extracted.length) { this.phase = this.turn === 'player' ? 'player-ready' : 'ai-response'; return; }
    if (this.turn === 'player') this.playerDraws += extracted.length;
    else this.aiDraws += extracted.length;
    this.linkedExtractions += Math.max(0, extracted.length - 1);
    for (const block of extracted) {
      this.retiredBlocks.add(block.id);
      this.settledExtractionHistory.push(block.id);
      this.pendingExtractionIds.delete(block.id);
      this.pendingLootIds.add(block.id);
    }
    if (this.turn === 'player') {
      this.lastAIResponseBlocks = [];
      this.aftershockSummary = 0; this.overflowAftershocks.length = 0;
      for (const [index, block] of extracted.entries()) {
        if (index >= 3) { this.aftershockSummary++; this.overflowAftershocks.push(block); continue; }
        const content = INTERACTION_TEXT[block.channel];
        const kind = index === 0 ? 'main' : 'aftershock';
        this.queueInteraction({
          effectId: `g105-effect-${++this.effectSeq}`,
          block,
          title: content.title,
          text: kind === 'main' ? this.nextPrompt(block.channel) ?? content.text : CARD_VARIANTS[index % CARD_VARIANTS.length]!,
          kind,
          sequence: index + 1,
          total: Math.min(extracted.length, 3),
        });
      }
      this.phase = 'player-interaction';
      return;
    }
    this.lastAIResponseBlocks = [...extracted]; this.aiInteractionQueue.length = 0; this.aiReplyVisible = false;
    for (const block of extracted) this.heartDelta += block.score;
    for (const [index, block] of extracted.entries()) {
      if (index >= 3) continue;
      const content = INTERACTION_TEXT[block.channel];
      this.aiInteractionQueue.push({
        effectId: `g105-ai-effect-${++this.effectSeq}`,
        block,
        title: content.title,
        text: index === 0 ? this.nextPrompt(block.channel) ?? content.text : CARD_VARIANTS[index % CARD_VARIANTS.length]!,
        kind: index === 0 ? 'main' : 'aftershock', sequence: index + 1, total: Math.min(extracted.length, 3),
      });
    }
    this.templateReply = this.aiInteractionQueue.length ? '' : `我也抽到了 ${extracted.map(contentName).join('、')}，这次的心跳我们一起记下。`;
    this.phase = 'ai-response';
  }

  private lockCollapse(): void {
    this.selected = null; this.interactionQueue.length = 0; this.loser = this.turn;
    if (this.turn === 'ai') {
      this.aiWrapCount++;
      this.aiPenaltyRequestCount++;
      const chosen = AI_PENALTY_POOL[(this.seed + this.round + this.aiDraws) % AI_PENALTY_POOL.length]!;
      this.aiPenaltyCard = { effectId: `g105-ai-penalty-${this.round}-${this.aiDraws}`, ...chosen, channel: 'gold', sequence: 1, total: 1 };
      this.aiPenaltyCompleted = false;
    }
    this.wrapUpText = this.turn === 'ai' ? '这次是我太着急了。下一局我会慢一点。' : '这一局先到这里。你可以留下一句收尾，或轻轻跳过。';
    this.phase = 'collapse-locked';
  }

  /** Draw without replacement until a channel's local eight-card pool is exhausted. */
  private nextPrompt(channel: TowerBlock['channel']): string | null {
    const remaining = [...this.unseenPrompts[channel]];
    if (!remaining.length) return null;
    const prompt = remaining[this.effectSeq % remaining.length]!;
    this.unseenPrompts[channel].delete(prompt);
    return prompt;
  }

  /** Extra departures remain individual facts, but do not create another full question card. */
  private enqueueNextOverflowSummary(): boolean {
    const block = this.overflowAftershocks.shift();
    if (!block) return false;
    const sequence = this.aftershockSummary - this.overflowAftershocks.length;
    this.queueInteraction({
      effectId: `g105-effect-${++this.effectSeq}`,
      block,
      title: `余波 x${this.aftershockSummary}`,
      text: `第 ${sequence} 块余波来自${INTERACTION_TEXT[block.channel].title}。这是一条本局事实，可单独记下或跳过。`,
      kind: 'summary',
      sequence,
      total: this.aftershockSummary,
    });
    return true;
  }

  /** Kept as a narrow mutation target for the S4 interaction-queue rule. */
  private queueInteraction(card: InteractionCard): void {
    this.interactionQueue.push(card);
  }

  private blockById(id: string): TowerBlock | undefined {
    return TOWER_BLOCKS.find((block) => block.id === id);
  }
}

function contentName(block: TowerBlock): string { return INTERACTION_TEXT[block.channel].title; }
