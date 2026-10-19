export const SLOT_COUNT = Object.freeze({ easy: 3, normal: 4, hard: 5 } as const);
export type LockpickDifficulty = keyof typeof SLOT_COUNT;
export const LOCKPICK_SESSION = 'lockpick-session';
export const LOCKPICK_SIGNALS = Object.freeze({ set: 'lockpick.set', giveUp: 'lockpick.give-up', feedback: 'lockpick.feedback', success: 'lockpick.success', failure: 'lockpick.failure' });
export function isDifficulty(value: unknown): value is LockpickDifficulty { return value === 'easy' || value === 'normal' || value === 'hard'; }
