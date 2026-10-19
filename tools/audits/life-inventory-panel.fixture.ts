import type { LifeHostViewModel } from '../../src/assembly/life-host/life-presenter.js';
import { buildLifeInventoryPanel } from '../../src/assembly/life-host/life-hud.js';

const view: LifeHostViewModel = {
  scene: 'moon-courtyard', x: 10, y: 9, poseX: 10, poseY: 9,
  date: 'Eclipse 1日（第1天）', slot: 'Dawn', placeLabel: '月影庭院',
  canInteract: false, interactionSummary: '附近没有可互动对象',
  inventory: [{ itemId: 'seed.moonbell', count: 4 }, { itemId: 'resource.moonwood', count: 2 }],
  inventoryItems: [
    { id: 'seed.moonbell', title: 'Moonbell Seed', kind: 'seed', count: 4, skinKey: 'art:seed' },
    { id: 'resource.moonwood', title: 'Moonwood', kind: 'resource', count: 2, skinKey: 'art:wood' },
    { id: 'resource.shadow-ore', title: 'Shadow Ore', kind: 'resource', count: 1, skinKey: 'art:ore' },
  ],
  inventoryCapacity: { usedSlots: 3, freeSlots: 9, totalSlots: 12 },
  allowedActions: [], nearby: [], nearbyWarps: [], affordances: [], results: {}, objective: '复兴月影城堡', questItems: [], relationships: [],
};

const hud = {
  preset: 'life-standard-v1' as const,
  title: '月影魔王城',
  labels: { inventory: '魔王行囊' },
};

export const lifeInventoryPanelAuditTree = buildLifeInventoryPanel(
  view,
  hud,
  { enabled: true, columns: 3, titleLabelKey: 'inventory' },
);
