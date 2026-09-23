/** 对手不运行 AI：意图是按回合顺序消费的纯数据脚本。 */
export type RhetoricIntent = Readonly<{ id: string; label: string; pressure: number }>;

export type RhetoricEncounter = Readonly<{
  id: string;
  title: string;
  goal: string;
  progressTarget: number;
  pressureLimit: number;
  turnLimit: number;
  openingHand: number;
  handLimit: number;
  focusPerTurn: number;
  intentions: readonly RhetoricIntent[];
}>;

const encounter = (
  id: string, title: string, goal: string, progressTarget: number, pressureLimit: number,
  focusPerTurn: number, pressures: readonly number[],
): RhetoricEncounter => ({
  id, title, goal, progressTarget, pressureLimit, turnLimit: 4, openingHand: 5, handLimit: 6, focusPerTurn,
  intentions: pressures.map((pressure, index) => ({ id: `${id}-intent-${index + 1}`, label: `第 ${index + 1} 回合施压`, pressure })),
});

export const RHETORIC_ENCOUNTERS: readonly RhetoricEncounter[] = [
  encounter('gatekeeper-shi', '旧巷之门', '让石七打开被私占的巷门', 10, 10, 3, [1, 2, 2, 3]),
  encounter('merchant-luo', '药铺旧约', '说服罗掌柜兑现先前的口头约定', 11, 9, 3, [1, 2, 2, 2]),
  encounter('instructor-jiang', '讲堂论策', '让姜教习承认处置方案可行', 12, 10, 4, [1, 2, 3, 2]),
] as const;

export const DEFAULT_RHETORIC_ENCOUNTER = RHETORIC_ENCOUNTERS[0];
