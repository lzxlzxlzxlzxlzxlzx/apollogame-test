// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderNode, validateLayoutNode, type LayoutNode } from '../../ui/components/index.js';
import { seasideMarketHostDescriptorFixture } from '../../authoring/life-host-descriptor.fixture.js';
import { buildLifeStandardUi } from '../../assembly/life-host/life-hud.js';
import { lifeUiSkinFixture as skin, lifeUiSkinViewFixture as view } from './life-ui-skin.fixture.js';

const inventory = { enabled: true, columns: 3, titleLabelKey: 'inventory' } as const;
const quests = { enabled: true, defaultTracking: 'first-active', titleLabelKey: 'quests' } as const;
const profile = { enabled: true, titleLabelKey: 'profile' } as const;
const hud = seasideMarketHostDescriptorFixture().hud;
export function findSkinNode(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) { const found = findSkinNode(child, id); if (found) return found; }
  return undefined;
}
const build = (open: 'inventory' | 'quest' | 'profile', uiSkin = skin, resolve: (key: string) => string | undefined = (key) => `/fixture/${key.split(':').at(-1)}.png`) => buildLifeStandardUi(view, hud, null,
  { descriptor: inventory, open: open === 'inventory' }, { descriptor: quests, open: open === 'quest' }, { descriptor: profile, open: open === 'profile' }, uiSkin, resolve);

describe('Life UI skin consumption', () => {
  it.each(['inventory', 'quest', 'profile'] as const)('renders panelFrame inside the actual %s Drawer with dynamic content', (open) => {
    const tree = build(open);
    const frame = findSkinNode(tree, `life-host-${open}-frame`)!;
    expect(frame).toBeDefined();
    expect(frame.props).toMatchObject({ skin: '/fixture/panel.png', skinSlice: 12, skinBorderWidth: 6 });
    expect(findSkinNode(tree, `life-host-${open}-drawer`)?.children).toContain(frame);
    const html = renderNode(tree);
    expect(html).toContain('panel.png'); expect(html).toContain('border-image');
    expect(html).toContain(open === 'inventory' ? '月木' : open === 'quest' ? '点亮王座厅' : '月影魔王档案');
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it.each(['inventory', 'quest', 'profile'] as const)('keeps exact default tree/HTML when %s skin textures are missing', (open) => {
    const missing = build(open, skin, () => undefined);
    const legacy = buildLifeStandardUi(view, hud, null, { descriptor: inventory, open: open === 'inventory' }, { descriptor: quests, open: open === 'quest' }, { descriptor: profile, open: open === 'profile' });
    expect(missing).toEqual(legacy); expect(renderNode(missing)).toBe(renderNode(legacy));
  });

  it('uses one resolver for all seven slots and keeps live labels after a view refresh', () => {
    const resolve = vi.fn((key: string) => Object.values(skin.slots).includes(key) ? `/fixture/${key.split(':').at(-1)}.png` : undefined);
    const before = JSON.stringify(view);
    const tree = build('quest', skin, resolve);
    expect(findSkinNode(tree, 'life-host-tracked-quest')?.props).toMatchObject({ skin: '/fixture/tracker.png', skinSlice: 8, skinBorderWidth: 4 });
    expect(findSkinNode(tree, 'life-host-world-status')?.props).toMatchObject({ skin: '/fixture/world-status.png' });
    expect(findSkinNode(tree, 'life-host-resources')?.props).toMatchObject({ skin: '/fixture/chrome.png' });
    for (const key of Object.values(skin.slots)) expect(resolve).toHaveBeenCalledWith(key);
    const changed = { ...view, date: '蚀月季第 2 日', placeLabel: '月影森林', inventoryItems: view.inventoryItems.map((item) => ({ ...item, count: 7 })), questItems: view.questItems.map((q) => ({ ...q, title: '修复月井' })), profile: { ...view.profile!, title: '月影城主新档案', attributes: view.profile!.attributes.map((a) => ({ ...a, value: 65 })) } };
    const next = buildLifeStandardUi(changed, hud, null, { descriptor: inventory }, { descriptor: quests }, { descriptor: profile }, skin, resolve);
    expect(findSkinNode(next, 'life-host-status-line')?.props).toMatchObject({ text: '月影森林 · 蚀月季第 2 日 · 黎明' });
    expect(JSON.stringify(next)).toContain('月影森林'); expect(JSON.stringify(next)).toContain('修复月井');
    expect(findSkinNode(next, 'life-host-resource-value-0')?.props).toMatchObject({ text: '65' });
    const bag = buildLifeStandardUi(changed, hud, null, { descriptor: inventory, open: true }, {}, {}, skin, resolve);
    expect(findSkinNode(bag, 'life-host-inventory-count-moonwood')?.props).toMatchObject({ text: '数量 ×7' });
    const person = buildLifeStandardUi(changed, hud, null, {}, {}, { descriptor: profile, open: true }, skin, resolve);
    expect(findSkinNode(person, 'life-host-profile-name')?.props).toMatchObject({ text: '月影城主新档案' });
    expect(findSkinNode(person, 'life-host-profile-value-0')?.props).toMatchObject({ text: '65' });
    expect(JSON.stringify(view)).toBe(before);
  });

  it.each(['quest', 'inventory', 'profile'] as const)('binds %s entry art through the same resolver, with native text fallback for missing icons', (kind) => {
    const key = skin.slots[`${kind}Icon`]!;
    const tree = build(kind);
    expect(findSkinNode(tree, `life-host-${kind}-open`)?.props).toMatchObject({ icon: `/fixture/entry-${kind}.png`, action: `life.host.${kind}.toggle` });
    const missing = build(kind, skin, (assetKey) => assetKey === key ? undefined : `/fixture/${assetKey.split(':').at(-1)}.png`);
    const button = findSkinNode(missing, `life-host-${kind}-open`)!;
    expect(button.type).toBe('Button');
    expect(button.props).not.toHaveProperty('icon');
    expect(button.props).toHaveProperty('label', kind === 'inventory' ? '货箱' : kind === 'quest' ? '任务日志' : '人物档案');
    expect(validateLayoutNode(missing)).toEqual([]);
    expect(renderNode(missing)).not.toContain(`/fixture/entry-${kind}.png`);
  });
});
