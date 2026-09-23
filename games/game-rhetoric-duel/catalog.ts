/**
 * 《言弹交锋》的内部卡牌目录。
 *
 * 这里是内容，不是解释器：`t2-identity-card-play` 消费 cards/effects，
 * 游戏层不按 cardId 分支，也不承载可执行字段。
 */
export type RhetoricResourceId = 'progress' | 'pressure' | 'focus';

export type RhetoricCard = Readonly<{
  cardId: string;
  displayName: string;
  flavorText: string;
  focusCost: number;
  maxCopies: number;
  skinKey: string;
  effects: readonly Readonly<{
    kind: 'modify-resource';
    targetId: RhetoricResourceId;
    op: 'add' | 'set';
    value: number;
  }>[];
}>;

export const RHETORIC_CATALOG_VERSION = 1 as const;

export const RHETORIC_CATALOG: readonly RhetoricCard[] = [
  { cardId: 'probe-question', displayName: '试探提问', flavorText: '先让他把话说完整。', focusCost: 1, maxCopies: 3, skinKey: 'skin.card.probe-question', effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 1 }] },
  { cardId: 'pin-down-detail', displayName: '钉住细节', flavorText: '那就请你把这一处说清。', focusCost: 2, maxCopies: 2, skinKey: 'skin.card.pin-down-detail', effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 3 }] },
  { cardId: 'steady-breath', displayName: '稳住呼吸', flavorText: '别急，先把气息稳下来。', focusCost: 1, maxCopies: 2, skinKey: 'skin.card.steady-breath', effects: [{ kind: 'modify-resource', targetId: 'pressure', op: 'add', value: -2 }] },
  { cardId: 'catch-the-thread', displayName: '接住话头', flavorText: '这句话，恰好说明了问题。', focusCost: 1, maxCopies: 2, skinKey: 'skin.card.catch-the-thread', effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 1 }, { kind: 'modify-resource', targetId: 'pressure', op: 'add', value: -1 }] },
  { cardId: 'press-the-point', displayName: '连环诘问', flavorText: '一个问题答完，再答下一个。', focusCost: 3, maxCopies: 1, skinKey: 'skin.card.press-the-point', effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 4 }] },
  { cardId: 'reframe-the-case', displayName: '换位陈述', flavorText: '若换作是你，也会这样选吗？', focusCost: 2, maxCopies: 2, skinKey: 'skin.card.reframe-the-case', effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 2 }, { kind: 'modify-resource', targetId: 'pressure', op: 'add', value: -1 }] },
  { cardId: 'state-the-line', displayName: '直陈底线', flavorText: '此事没有退让的余地。', focusCost: 2, maxCopies: 1, skinKey: 'skin.card.state-the-line', effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 3 }, { kind: 'modify-resource', targetId: 'pressure', op: 'add', value: 1 }] },
  { cardId: 'hold-the-answer', displayName: '暂缓回应', flavorText: '不必急着接下这句话。', focusCost: 0, maxCopies: 2, skinKey: 'skin.card.hold-the-answer', effects: [{ kind: 'modify-resource', targetId: 'pressure', op: 'add', value: -1 }] },
  { cardId: 'gather-your-thoughts', displayName: '整理思路', flavorText: '把散乱的念头排成一线。', focusCost: 0, maxCopies: 1, skinKey: 'skin.card.gather-your-thoughts', effects: [{ kind: 'modify-resource', targetId: 'focus', op: 'add', value: 1 }] },
  { cardId: 'close-the-argument', displayName: '收束论点', flavorText: '所有证词，都指向同一个答案。', focusCost: 2, maxCopies: 1, skinKey: 'skin.card.close-the-argument', effects: [{ kind: 'modify-resource', targetId: 'progress', op: 'add', value: 3 }] },
] as const;

export const STARTER_CALM_REASON: readonly Readonly<{ cardId: string; copies: number }>[] = [
  { cardId: 'probe-question', copies: 2 },
  { cardId: 'pin-down-detail', copies: 2 },
  { cardId: 'steady-breath', copies: 2 },
  { cardId: 'catch-the-thread', copies: 2 },
  { cardId: 'press-the-point', copies: 1 },
  { cardId: 'reframe-the-case', copies: 2 },
  { cardId: 'state-the-line', copies: 1 },
  { cardId: 'hold-the-answer', copies: 1 },
  { cardId: 'gather-your-thoughts', copies: 1 },
  { cardId: 'close-the-argument', copies: 1 },
] as const;
