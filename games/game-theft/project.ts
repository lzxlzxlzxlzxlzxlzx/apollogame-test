import type { RiskRevealWheel } from '@zerocraft/engine/engine/protocol/components.js';
import { DEFAULT_THEFT_CONFIG, THEFT_RISK_LIMIT_BP, type TheftGameConfig } from './config.js';
import { THEFT_PRESS_ACTION, THEFT_REVEAL_ACTION } from './session.js';

export type TheftSlotVisualState = 'black' | 'hidden' | 'empty' | 'acquired';
export interface TheftSlotView {
  readonly index: number;
  readonly ring: 'inner' | 'outer';
  readonly state: TheftSlotVisualState;
  readonly label: string;
  readonly action?: string;
  readonly actionArg?: string;
}

export interface TheftView {
  readonly title: string;
  readonly targetName: string;
  readonly difficultyLabel: string;
  readonly riskBp: number;
  readonly riskLimitBp: number;
  readonly slots: readonly TheftSlotView[];
  readonly acquiredNames: readonly string[];
  /** 底部托盘消费的纯展示物品；名称不烘焙到托盘里。 */
  readonly acquiredLoot: readonly { readonly entryId: string; readonly displayName: string; readonly imageUrl?: string }[];
  readonly revealCredits: number;
  readonly qteAngleDeg: number;
  readonly qteTargetAngleDeg: number;
  readonly qteInPerfectRange: boolean;
  /** 仅表现层的一次性结果闪光；不写入规则状态。 */
  readonly qteFlashTone?: 'gold' | 'danger';
  /** 新取得物品的纯表现层飞行动画；不会反写模拟或回执。 */
  readonly lootFlight?: { readonly entryId: string; readonly slotIndex: number; readonly imageUrl: string };
  readonly primaryAction?: string;
  readonly primaryLabel: string;
  readonly primarySub: string;
  readonly canWithdraw: boolean;
  readonly statusText: string;
}

/** 世界 → UI 的只读投影；槽位结果、翻格权和 QTE 精度均来自通用 capability 已结算状态。 */
export function projectTheftView(config: TheftGameConfig = DEFAULT_THEFT_CONFIG, session?: RiskRevealWheel): TheftView {
  const black = new Set(session?.blackSlots ?? []);
  const revealed = new Set(session?.revealedSlots ?? []);
  const acquired = new Set(session?.acquiredIds ?? []);
  const itemByEntry = new Map(config.items.map((item) => [item.entryId, item]));
  const slots = Array.from({ length: 16 }, (_, index): TheftSlotView => {
    const targetId = session?.slotTargetIds?.[index] ?? null;
    const state: TheftSlotVisualState = black.has(index) ? 'black'
      : revealed.has(index) ? targetId ? 'acquired' : 'empty' : 'hidden';
    const target = targetId ? itemByEntry.get(targetId) : undefined;
    return {
      index, ring: index < 4 ? 'inner' : 'outer', state,
      label: state === 'black' ? '×' : state === 'hidden' ? '?' : state === 'empty' ? '空' : target?.displayName ?? '所得',
      ...(state === 'hidden' && session?.phase === 'qte' && (session.revealCredits ?? 0) > 0
        ? { action: THEFT_REVEAL_ACTION, actionArg: String(index) } : {}),
    };
  });
  const acquiredNames = config.items.filter((item) => acquired.has(item.entryId)).map((item) => item.displayName);
  const acquiredLoot = config.items.filter((item) => acquired.has(item.entryId)).map((item) => ({
    entryId: item.entryId, displayName: item.displayName, imageUrl: item.imageUrl,
  }));
  const qteTick = session?.qteTick ?? 0;
  const cycle = session?.qteCycleTicks ?? 1;
  const ideal = session?.qteIdealTick ?? 0;
  const qteInPerfectRange = session !== undefined && Math.abs(qteTick - ideal) <= session.qtePerfectRadiusTicks;
  const primaryAction = session?.phase === 'qte' ? THEFT_PRESS_ACTION : undefined;
  const primaryLabel = session?.phase === 'terminal' ? '行动结束' : '出手';
  const primarySub = session?.phase === 'terminal' ? (session.terminal ?? 'aborted')
    : qteInPerfectRange ? '完美时机' : '指针进入金色刻度时点击';
  const lastFeedback = session && session.qteAttempts! > 0
    ? session.lastQtePenaltyBp === 0 ? '完美 · 暴露 +0'
      : `未命中 · 偏移 ${session.lastQteOffsetTicks} · 暴露 +${session.lastQtePenaltyBp}`
    : '';
  return {
    title: config.title, targetName: config.targetName,
    difficultyLabel: config.difficulty.id === 'preview-unbalanced' ? '预览档' : config.difficulty.id,
    riskBp: session?.riskBp ?? 0, riskLimitBp: session?.riskLimitBp ?? THEFT_RISK_LIMIT_BP,
    slots, acquiredNames, acquiredLoot, revealCredits: session?.revealCredits ?? 0,
    qteAngleDeg: Math.round(qteTick / Math.max(1, cycle) * 360),
    qteTargetAngleDeg: Math.round(ideal / Math.max(1, cycle) * 360), qteInPerfectRange,
    primaryAction, primaryLabel, primarySub,
    canWithdraw: session?.phase === 'qte' || session?.phase === 'reveal',
    statusText: session?.phase === 'terminal' ? `会话结束 · ${session.terminal ?? 'aborted'}`
      : (session?.revealCredits ?? 0) > 0 ? `开门机会 ×${session?.revealCredits} · 可随时开启一扇门`
        : lastFeedback,
  };
}
