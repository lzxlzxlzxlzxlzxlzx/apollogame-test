// 审计入口：game111《小都会》看板（主屏）。
// 用法：node tools/ui-audit.mjs tools/audits/game111-board.audit.ts
//
// 为什么这里手搓 view 而不是跑真世界：审计包是 IIFE，不支持顶层 await，而 `runTurn` 是异步的。
// 换来的好处反而更大——**这里喂的是最坏情况**：最长的分区名、最长的动作文案、最长的帖子、
// 全部称号同时解锁 + 庆祝粒子。重叠审计要的正是最坏情况，不是平均情况。
// 文案一律从 `ui.ts` 的真模板现推，不另抄一份 → 模板改了这里跟着变，不会悄悄失真。
import { mountUI } from '../../src/ui/components/index.js';
import { apolloOnyx } from '../../src/ui/components/apollo-kit.js';
import { buildTownBoard, ACTION_TEXT, FEED_TEXT, labelOf } from '../../games/game111/ui.js';
import type { TownView } from '../../games/game111/ui.js';
import { NPCS, NEEDS, ZONES, TITLES, AGENT_NPC_IDS } from '../../games/game111/world-data.js';

const longest = <T>(xs: readonly T[], len: (x: T) => number): T =>
  xs.reduce((a, b) => (len(b) > len(a) ? b : a));

const longZone = longest(ZONES, (z) => z.name.length);
const longAct = longest(Object.values(ACTION_TEXT), (s) => s.length);
const longFeed = longest(Object.values(FEED_TEXT), (s) => s.length);
const nameOf = new Map(NPCS.map((n) => [n.id, n.name]));

const needsAt = (v: number): Record<string, number> =>
  Object.fromEntries(NEEDS.map((n) => [n.key, v]));

const view: TownView = {
  turn: 8888, // 宽数字：回合号别在四位数时把顶栏挤开
  npcs: AGENT_NPC_IDS.map((id, i) => ({
    id,
    name: nameOf.get(id) ?? id,
    zone: longZone.id,
    needs: needsAt([100, 55, 12][i % 3]), // 三档着色（ok/warn/danger）各出现一次
    affinity: [0, 62, 100][i % 3],
    lastAction: longAct.replace('{o}', labelOf(longZone.id)),
    fallback: i % 2 === 1, // 降级标记那条也进审计
  })),
  // 长列表：40 条，最长文案
  feed: Array.from({ length: 40 }, (_, i) => ({
    id: `m${String(i).padStart(3, '0')}`,
    who: nameOf.get(AGENT_NPC_IDS[i % AGENT_NPC_IDS.length]) ?? '？',
    text: longFeed.replace('{o}', labelOf(longZone.id)),
    turn: 8888 - i,
    strength: 100 - i,
    source: i % 3 === 0 ? 'fallback' : i % 3 === 1 ? 'intent' : 'share:nao',
  })),
  titles: TITLES.map((t) => t.id), // 全解锁 = 称号条最长
  justUnlocked: TITLES[0].id,      // 庆祝粒子分支
};

mountUI(document.getElementById('root')!, buildTownBoard(view), {}, apolloOnyx);
