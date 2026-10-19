// game111《小都会》—— 回合推进的 AI 活世界。玩法 = 数据（blueprint + 引擎能力）；本目录零专属系统代码。
// 架构基石：**LLM 不是解释器，LLM 是输入源**（docs/design/game111/framework.md §1.2）。
export { buildBlueprint, setupTown, ZONE_NAME } from './blueprint.js';
export { buildAgentContext, coLocated } from './agent-context.js';
export { runTurn } from './turn-driver.js';
export type { TurnReport } from './turn-driver.js';
export * from './world-data.js';
export { mount } from './game111.js';
export { buildHome, buildTownBoard, buildTalkScreen, buildRelationGraph, buildFeed, UI_ACTIONS } from './ui.js';
export type { TownView, NpcView, FeedItem, TalkView } from './ui.js';
export { buildTownView } from './project.js';
