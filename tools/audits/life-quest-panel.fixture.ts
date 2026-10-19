import type { LifeHostViewModel } from '../../src/assembly/life-host/life-presenter.js';
import { buildLifeQuestPanel } from '../../src/assembly/life-host/life-hud.js';

const view: LifeHostViewModel = {
  scene: 'moon-courtyard', x: 10, y: 9, poseX: 10, poseY: 9,
  date: 'Eclipse 1日（第1天）', slot: 'Dawn', placeLabel: '月影庭院',
  canInteract: false, interactionSummary: '附近没有可互动对象',
  inventory: [], inventoryItems: [], inventoryCapacity: { usedSlots: 0, freeSlots: 12, totalSlots: 12 },
  allowedActions: [], nearby: [], nearbyWarps: [], affordances: [], results: {}, objective: '收集月木与影矿，修复庭院中的王座厅。',
  questItems: [
    { chapterId: 'chapter.return', chapterTitle: '月影归城', questId: 'quest.restore', title: '点亮王座厅', summary: '月影归城', state: 'active', completedNodes: 0, visibleNodes: 3, tracked: true, nextObjective: '收集月木与影矿，修复庭院中的王座厅。' },
    { chapterId: 'chapter.return', chapterTitle: '月影归城', questId: 'quest.archive', title: '查阅旧档', summary: '月影归城', state: 'locked', completedNodes: 0, visibleNodes: 2, tracked: false, nextObjective: '等待王座厅重新点亮。' },
    { chapterId: 'chapter.prologue', chapterTitle: '序章', questId: 'quest.arrival', title: '重返城堡', summary: '序章', state: 'completed', completedNodes: 1, visibleNodes: 1, tracked: false, nextObjective: '已完成' },
  ],
  relationships: [],
};

const hud = { preset: 'life-standard-v1' as const, title: '月影魔王城', labels: { quests: '复兴任务' } };

export const lifeQuestPanelAuditTree = buildLifeQuestPanel(
  view,
  hud,
  { enabled: true, titleLabelKey: 'quests', defaultTracking: 'first-active' },
);
