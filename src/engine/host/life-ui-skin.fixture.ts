import type { LifeHostUiSkinDescriptor } from '../../authoring/life-host-descriptor-core.js';
import type { LifeHostViewModel } from '../../assembly/life-host/life-presenter.js';

/** Isolated test skin: no real asset registration, approval, provenance or game data. */
export const lifeUiSkinFixture: LifeHostUiSkinDescriptor = {
  id: 'moonshadow-courtyard',
  slots: {
    trackedQuestFrame: 'art:game-seaside-market:ui:tracker',
    worldStatusRibbon: 'art:game-seaside-market:ui:world-status',
    panelFrame: 'art:game-seaside-market:ui:panel',
    hudChrome: 'art:game-seaside-market:ui:chrome',
    questIcon: 'art:game-seaside-market:ui:entry-quest',
    inventoryIcon: 'art:game-seaside-market:ui:entry-inventory',
    profileIcon: 'art:game-seaside-market:ui:entry-profile',
  },
  slices: { trackedQuestFrame: { source: 8, display: 4 }, panelFrame: { source: 12, display: 6 } },
};
export const lifeUiSkinViewFixture: LifeHostViewModel = {
  scene: 'moon-courtyard', x: 10, y: 9, poseX: 10, poseY: 9, date: '蚀月季第 1 日', slot: '黎明', placeLabel: '月影庭院',
  canInteract: false, interactionSummary: '', inventory: [{ itemId: 'moonwood', count: 2 }],
  inventoryItems: [{ id: 'moonwood', title: '月木', kind: 'resource', count: 2, skinKey: 'art:item' }],
  inventoryCapacity: { usedSlots: 1, freeSlots: 11, totalSlots: 12 }, allowedActions: [], nearby: [], nearbyWarps: [], affordances: [], results: {},
  objective: '重燃城堡的第一盏灯', relationships: [],
  questItems: [{ chapterId: 'chapter.one', chapterTitle: '第一章', questId: 'restore-throne', title: '点亮王座厅', summary: '第一章', state: 'active', completedNodes: 1, visibleNodes: 2, tracked: true, nextObjective: '月木 1/2 · 影矿 0/1' }],
  profile: { title: '月影魔王档案', attributes: [{ id: 'dread', title: '魔王威仪', iconSkinKey: 'art:dread', display: 'gauge', surfaces: ['profile', 'hud'], value: 30, min: 0, max: 100 }] },
};
