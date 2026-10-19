import { mountUI, validateLayoutNode, type UITheme } from '../../src/ui/components/index.js';
import { buildLifeStandardUi } from '../../src/assembly/life-host/life-hud.js';
import { lifeUiSkinFixture as skin, lifeUiSkinViewFixture as view } from '../../src/engine/host/life-ui-skin.fixture.js';

export function mountLifeRuntimeAudit(theme: UITheme, panel: 'quest' | 'inventory' | 'profile'): void {
  // In-memory mock textures only for contrast/layout checks; never registered in production.
  const src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#f6e7c8"/></svg>')}`;
  const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=';
  const iconKeys = [skin.slots.questIcon, skin.slots.inventoryIcon, skin.slots.profileIcon];
  const tree = buildLifeStandardUi(view, { preset: 'life-standard-v1', title: 'Life' }, null,
    { descriptor: { enabled: true, columns: 3, titleLabelKey: 'inventory' }, open: panel === 'inventory' },
    { descriptor: { enabled: true, defaultTracking: 'first-active', titleLabelKey: 'quests' }, open: panel === 'quest' },
    { descriptor: { enabled: true, titleLabelKey: 'profile' }, open: panel === 'profile' },
    // Real ribbon art is inspected in actual Host screenshots, not this mock audit.
    { ...skin, slots: { trackedQuestFrame: skin.slots.trackedQuestFrame, panelFrame: skin.slots.panelFrame,
      questIcon: skin.slots.questIcon, inventoryIcon: skin.slots.inventoryIcon, profileIcon: skin.slots.profileIcon } },
    (key) => iconKeys.includes(key) ? icon : src,
    { width: innerWidth, height: innerHeight });
  const issues = validateLayoutNode(tree);
  if (issues.length) throw new Error(JSON.stringify(issues));
  mountUI(document.getElementById('root')!, tree, {}, theme);
}
