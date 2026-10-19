/** 《潜取》的纯数据配置。玩法解释由 t3-risk-reveal-wheel 承担。 */
export interface TheftItemSpec {
  readonly entryId: string;
  readonly itemId: string;
  readonly displayName: string;
  readonly quantity: number;
  /** 可选的调用方物品图；缺省时使用本游戏的演示战利品。 */
  readonly imageUrl?: string;
}

/** 调用方的单一总难度在接入层映射成此档案；档位表见下方纯数据。 */
export interface TheftDifficultyProfile {
  readonly id: string;
  readonly blackSlotCount: number;
  readonly exposureRateBpPerSecond: number;
}

/** SDK 的 0–100 总难度到引擎整数配置的唯一数据表；业务属性不进入小游戏。 */
export const THEFT_DIFFICULTY_TABLE = Object.freeze([
  Object.freeze({ min: 0, max: 19, profile: Object.freeze({ id: 'forgiving', blackSlotCount: 10, exposureRateBpPerSecond: 180 }) }),
  Object.freeze({ min: 20, max: 39, profile: Object.freeze({ id: 'easy', blackSlotCount: 8, exposureRateBpPerSecond: 240 }) }),
  Object.freeze({ min: 40, max: 59, profile: Object.freeze({ id: 'standard', blackSlotCount: 6, exposureRateBpPerSecond: 320 }) }),
  Object.freeze({ min: 60, max: 79, profile: Object.freeze({ id: 'hard', blackSlotCount: 4, exposureRateBpPerSecond: 400 }) }),
  Object.freeze({ min: 80, max: 100, profile: Object.freeze({ id: 'expert', blackSlotCount: 2, exposureRateBpPerSecond: 500 }) }),
] as const);

/** 接入层在规范化输入后调用；越界钳制符合 SDK 合同，非安全整数必须在调用方修正。 */
export function resolveTheftDifficulty(difficulty: number): TheftDifficultyProfile {
  if (!Number.isSafeInteger(difficulty)) throw new TypeError('difficulty 必须是安全整数');
  const normalized = Math.max(0, Math.min(100, difficulty));
  return THEFT_DIFFICULTY_TABLE.find((entry) => normalized >= entry.min && normalized <= entry.max)!.profile;
}

export interface TheftGameConfig {
  readonly sessionId: string;
  readonly title: string;
  readonly targetName: string;
  readonly seed: number;
  readonly difficulty: TheftDifficultyProfile;
  readonly items: readonly TheftItemSpec[];
}

export const THEFT_INNER_SLOTS = 4;
export const THEFT_OUTER_SLOTS = 12;
export const THEFT_SLOT_COUNT = THEFT_INNER_SLOTS + THEFT_OUTER_SLOTS;
export const THEFT_TICKS_PER_SECOND = 60;
export const THEFT_RISK_LIMIT_BP = 10_000;
export const THEFT_QTE_CYCLE_TICKS = 120;
/** 初始金色扇区在正上方；之后 capability 使用种子规则换向。 */
export const THEFT_QTE_IDEAL_TICK = 0;
/** 约 0.2 秒的命中窗，和金色扇区的可见宽度对应；不是像素级点击惩罚。 */
export const THEFT_QTE_PERFECT_RADIUS_TICKS = 6;
export const THEFT_QTE_MAX_PENALTY_BP = 1_400;

/** 当前 5173 的标准档预览；真实接入应从 SDK 的 `difficulty` 经同一表解析。 */
export const PREVIEW_THEFT_DIFFICULTY: TheftDifficultyProfile = resolveTheftDifficulty(50);

export const DEFAULT_THEFT_CONFIG: TheftGameConfig = Object.freeze({
  sessionId: 'preview-theft',
  title: '妙手试探',
  targetName: '巡夜守卫',
  seed: 0x7468_6566,
  difficulty: PREVIEW_THEFT_DIFFICULTY,
  items: Object.freeze([
    Object.freeze({ entryId: 'guard-key', itemId: 'iron-key', displayName: '守卫钥匙', quantity: 1 }),
    Object.freeze({ entryId: 'silver-watch', itemId: 'silver-watch', displayName: '银质怀表', quantity: 1 }),
    Object.freeze({ entryId: 'sealed-letter', itemId: 'sealed-letter', displayName: '密封信件', quantity: 1 }),
  ]),
});

export function validateTheftConfig(config: TheftGameConfig): readonly string[] {
  const issues: string[] = [];
  if (!config.sessionId.trim()) issues.push('sessionId 不能为空');
  if (!config.title.trim()) issues.push('title 不能为空');
  if (!config.targetName.trim()) issues.push('targetName 不能为空');
  if (!Number.isSafeInteger(config.seed)) issues.push('seed 必须是安全整数');
  if (!config.difficulty.id.trim()) issues.push('difficulty.id 不能为空');
  if (!Number.isSafeInteger(config.difficulty.blackSlotCount)
    || config.difficulty.blackSlotCount < 0
    || config.difficulty.blackSlotCount >= THEFT_SLOT_COUNT) issues.push('difficulty.blackSlotCount 必须是 0..15 的整数');
  if (!Number.isSafeInteger(config.difficulty.exposureRateBpPerSecond)
    || config.difficulty.exposureRateBpPerSecond < 1
    || config.difficulty.exposureRateBpPerSecond > THEFT_RISK_LIMIT_BP) {
    issues.push('difficulty.exposureRateBpPerSecond 必须是 1..10000 的整数');
  }
  const maxItems = THEFT_SLOT_COUNT - config.difficulty.blackSlotCount;
  if (config.items.length < 1 || config.items.length > maxItems) issues.push(`items 必须包含 1..${maxItems} 个条目`);
  const ids = new Set<string>();
  config.items.forEach((item, index) => {
    if (!item.entryId.trim()) issues.push(`items[${index}].entryId 不能为空`);
    if (ids.has(item.entryId)) issues.push(`items[${index}].entryId 重复`);
    ids.add(item.entryId);
    if (!item.itemId.trim()) issues.push(`items[${index}].itemId 不能为空`);
    if (!item.displayName.trim()) issues.push(`items[${index}].displayName 不能为空`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) issues.push(`items[${index}].quantity 必须是正整数`);
    if (item.imageUrl !== undefined && !item.imageUrl.trim()) issues.push(`items[${index}].imageUrl 不能为空字符串`);
  });
  return issues;
}
