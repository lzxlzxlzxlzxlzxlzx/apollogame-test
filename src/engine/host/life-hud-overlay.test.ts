// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderNode, validateLayoutNode, type LayoutNode } from '../../ui/components/index.js';
import { buildLifeStandardUi } from '../../assembly/life-host/life-hud.js';
import { lifeUiSkinFixture as skin, lifeUiSkinViewFixture as view } from './life-ui-skin.fixture.js';

const find = (node: LayoutNode, id: string): LayoutNode | undefined => node.id === id ? node : node.children?.flatMap((child) => find(child, id) ?? [])[0];
const nodes = (node: LayoutNode): LayoutNode[] => [node, ...(node.children ?? []).flatMap(nodes)];
const resolve = (key: string) => '/fixture/' + encodeURIComponent(key) + '.png';
const build = (panel: 'inventory' | 'quest' | 'profile', width = 1440, height = 900, data = view) => buildLifeStandardUi(data,
  { preset: 'life-standard-v1' }, null,
  { descriptor: { enabled: true, columns: 3, titleLabelKey: 'inventory' }, open: panel === 'inventory', resolveSkin: resolve },
  { descriptor: { enabled: true, defaultTracking: 'first-active', titleLabelKey: 'quests' }, open: panel === 'quest' },
  { descriptor: { enabled: true, titleLabelKey: 'profile' }, open: panel === 'profile', resolveSkin: resolve }, skin, resolve, { width, height });

describe('Life Host approved overlay composition', () => {
  it.each([[1440, 900], [1920, 1080], [1060, 760], [760, 900], [420, 900], [375, 812]])('uses measured %sx%s viewport without scaling the world or centering the entire UI', (width, height) => {
    const tree = build('quest', width, height);
    expect(validateLayoutNode(tree)).toEqual([]);
    expect(find(tree, 'life-host-audit-root')?.layout?.height).toBe(0); // no invisible full-map hit rectangle
    const status = find(tree, 'life-host-world-status')!;
    expect(status.layout!.height).toBeGreaterThanOrEqual(56);
    expect(status.layout!.x! + status.layout!.width! / 2).toBe(width / 2);
    expect(find(tree, 'life-host-quest-drawer')?.layout).toMatchObject({ y: width <= 560 ? 420 : width <= 1320 ? 310 : 216 });
    expect(nodes(tree).some((node) => node.type === 'Drawer')).toBe(false); // no global modal scrim
    expect(find(tree, 'life-host-quest-paper')?.props).toMatchObject({ bg: { custom: '#f6e7c8' } });
  });

  it('shows only authoritative HUD numbers with names in tooltip/alt, never invents a third resource or clock', () => {
    const tree = build('profile');
    expect(find(tree, 'life-host-resource-value-0')?.props).toMatchObject({ text: '30' });
    expect(find(tree, 'life-host-resource-title-0')).toBeUndefined();
    expect(find(tree, 'life-host-resource-value-1')).toBeUndefined();
    expect(find(tree, 'life-host-resource-tip-0')?.props).toMatchObject({ content: '魔王威仪' });
    expect(find(tree, 'life-host-status-line')?.props).toMatchObject({ text: `${view.placeLabel} · ${view.date} · 黎明` });
    expect(renderNode(tree)).not.toContain('20:40');
  });

  it.each([1440, 760])('keeps %spx ribbon text transparent and width-bounded inside the artwork', (width) => {
    const tree = build('quest', width);
    const content = find(tree, 'life-host-status-ink')!;
    expect(content.props).toEqual({ bare: true });
    expect(nodes(content).filter((node) => node.type === 'Panel').every((node) => (node.props as { bare?: boolean }).bare)).toBe(true);
    expect(find(tree, 'life-host-status-line')?.props).not.toHaveProperty('font');
    expect(content.children).toHaveLength(1);
    expect(content.children![0]!.type).toBe('Label');
    expect(content.layout!.width! + content.layout!.x!).toBeLessThan(find(tree, 'life-host-world-status')!.layout!.width!);
  });

  it.each([1440, 760, 420, 375])('consumes approved entry art without a button disk at %spx', (width) => {
    const tree = build('quest', width);
    for (const [kind, iconSlot] of [['quest', 'questIcon'], ['inventory', 'inventoryIcon'], ['profile', 'profileIcon']] as const) {
      const entry = find(tree, `life-host-${kind}-open`)!;
      expect(entry.props).toMatchObject({ icon: resolve(skin.slots[iconSlot]!), iconOnly: { size: width <= 760 ? 50 : 60 }, kind: 'quiet', skin: '', borderWidth: 0 });
      expect(entry.props).not.toHaveProperty('stateColors');
      expect(entry.layout).toMatchObject({ width: width <= 760 ? 50 : 60, height: width <= 760 ? 50 : 60, radius: 0 });
      expect(entry.layout).not.toHaveProperty('press3d');
      const html = renderNode(entry);
      expect(html).toContain('type="button"');
      expect(html).toContain('aria-label=');
      expect(html).toContain('data-apollo-icon-only');
      expect(find(tree, `life-host-${kind}-entry-tip`)?.props).toMatchObject({ content: (entry.props as { label: string }).label, placement: 'bottom' });
    }
  });

  it.each([1440, 760, 420, 375])('keeps resource and entry groups in a single %spx row with explicit narrow overflow', (width) => {
    const tree = build('quest', width);
    const right = find(tree, 'life-host-resource-actions')!;
    expect(right.layout).toMatchObject({ direction: 'row', align: 'start' });
    expect(right.children!.map((child) => child.id)).toEqual(['life-host-resources', 'life-host-panel-entries']);
    expect((right.props as { scroll?: boolean }).scroll).toBe(width <= 560 ? true : undefined);
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it('keeps native visible labels and key badges when the entry textures are unavailable', () => {
    const tree = buildLifeStandardUi(view, { preset: 'life-standard-v1' }, null,
      { descriptor: { enabled: true, columns: 3, titleLabelKey: 'inventory' }, open: false },
      { descriptor: { enabled: true, defaultTracking: 'first-active', titleLabelKey: 'quests' }, open: false },
      { descriptor: { enabled: true, titleLabelKey: 'profile' }, open: false }, skin,
      (key) => key === skin.slots.panelFrame ? resolve(key) : undefined);
    for (const kind of ['quest', 'inventory', 'profile']) {
      const entry = find(tree, `life-host-${kind}-open`)!;
      expect(entry.props).not.toHaveProperty('iconOnly');
      expect(entry.props).not.toHaveProperty('icon');
      expect((entry.props as { label: string }).label).toMatch(/\S/u);
      expect(find(tree, `life-host-${kind}-key`)).toBeDefined();
    }
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it.each(['quest', 'inventory', 'profile'] as const)('keeps %s close actions and dynamic content in the same opaque scrollable skeleton', (panel) => {
    const before = JSON.stringify(view);
    const tree = build(panel);
    expect(find(tree, `life-host-${panel}-body`)?.props).toMatchObject({ scroll: true });
    expect(find(tree, `life-host-${panel}-close`)?.props).toMatchObject({ action: `life.host.${panel}.close` });
    expect(find(tree, `life-host-${panel}-key`)?.props).toMatchObject({ text: { quest: 'J', inventory: 'I', profile: 'C' }[panel] });
    expect(JSON.stringify(view)).toBe(before);
  });

  it('does not truncate long tracked text, and keeps true inventory/quest empty states', () => {
    const long = '长标题与下一目标完整显示，不省略。'.repeat(12);
    const tree = build('quest', 1440, 900, { ...view, questItems: view.questItems.map((q) => ({ ...q, title: long, nextObjective: long })) });
    expect(find(tree, 'life-host-tracked-quest-title')?.props).toMatchObject({ text: long });
    expect(find(tree, 'life-host-tracked-quest-objective')?.props).toMatchObject({ text: long });
    expect(find(build('quest', 1440, 900, { ...view, questItems: [] }), 'life-host-quest-empty-label')?.props).toMatchObject({ text: '当前没有进行中的任务' });
    expect(find(build('inventory', 1440, 900, { ...view, inventoryItems: [] }), 'life-host-inventory-empty-label')?.props).toMatchObject({ text: '当前分类没有物品' });
    expect(find(build('profile', 1440, 900, { ...view, profile: { ...view.profile!, attributes: [] } }), 'life-host-profile-empty-label')?.props).toMatchObject({ text: '暂无档案属性' });
  });
});
