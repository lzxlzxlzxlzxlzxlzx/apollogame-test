import type { AppContract } from 'dokiworlds-app-sdk';
import { isDifficulty, type LockpickDifficulty } from '../../../games/game-lockpick/config.js';

export const LOCKPICK_INPUT_CONTRACT = 'doki.game.lockpick-input';
export const LOCKPICK_RESULT_CONTRACT = 'doki.game.lockpick-result';
export type LockpickInput = Readonly<{ difficulty: LockpickDifficulty }>;
export type LockpickResult = Readonly<{ outcome: 'success' | 'failure' }>;

export function parseLockpickInput(value: unknown): LockpickInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Input data must be a plain object.');
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'difficulty' || !isDifficulty((value as { difficulty?: unknown }).difficulty)) throw new Error('Input must contain only difficulty: easy, normal, or hard.');
  return Object.freeze({ difficulty: (value as { difficulty: LockpickDifficulty }).difficulty });
}
export function inputFromContract(value: AppContract<unknown>): LockpickInput {
  if (value.contract !== LOCKPICK_INPUT_CONTRACT || value.version !== 1) throw new Error('Unsupported lockpick input contract.');
  return parseLockpickInput(value.data);
}
export function lockpickOutput(outcome: LockpickResult['outcome']): AppContract<LockpickResult> {
  return Object.freeze({ contract: LOCKPICK_RESULT_CONTRACT, version: 1, data: Object.freeze({ outcome }) });
}
export function isEmptyPreview(value: unknown): boolean { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0; }
