import { AssetManager, StubAssetLoader } from '../../src/assets/asset-manager.js';
import { mountUI, validateLayoutNode, type LayoutNode, type UITheme } from '../../src/ui/components/index.js';
import { buildLifeStandardUi } from '../../src/assembly/life-host/life-hud.js';
import { lifeUiSkinFixture, lifeUiSkinViewFixture } from '../../src/engine/host/life-ui-skin.fixture.js';

/** In-memory test textures; deliberately no production assets or approvals. */
export async function mountLifeSkinAudit(theme: UITheme): Promise<void> {
  const assets = new AssetManager(new StubAssetLoader());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="2" y="2" width="60" height="60" rx="6" fill="${theme.bg1}" stroke="${theme.gold}" stroke-width="4"/></svg>`;
  const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  for (const key of Object.values(lifeUiSkinFixture.slots)) assets.register({ kind: 'texture', key, src, width: 64, height: 64 });
  await assets.loadAll();
  const resolve = (key: string): string | undefined => {
    const descriptor = assets.get(key)?.descriptor;
    return descriptor?.kind === 'texture' ? descriptor.src : undefined;
  };
  const tree = buildLifeStandardUi(lifeUiSkinViewFixture, { preset: 'life-standard-v1', title: '月影魔王城' }, null,
    { descriptor: { enabled: true, columns: 2, titleLabelKey: 'inventory' }, open: true },
    { descriptor: { enabled: true, defaultTracking: 'first-active', titleLabelKey: 'quests' }, open: true },
    { descriptor: { enabled: true, titleLabelKey: 'profile' }, open: true }, lifeUiSkinFixture, resolve, { width: innerWidth, height: innerHeight });
  // Comparison previews only. Actual mutually exclusive sidebars are audited
  // individually by life-ui-runtime-*-*.audit.ts and the real Host browser probe.
  const frames = tree.children!.filter((node) => node.id.endsWith('-drawer')).map((node) => node.children![0]!);
  for (const frame of frames) frame.layout = { ...frame.layout, flex: 1, height: 420, anim: undefined };
  const hud = tree.children![0]!;
  hud.layout = { ...hud.layout, height: innerWidth <= 1320 ? 320 : 216 };
  const audit: LayoutNode = { type: 'Panel', id: 'life-skin-audit', props: { bg: 'raised' }, layout: { direction: 'column', gap: 12 }, children: [hud,
    { type: 'Panel', id: 'life-skin-drawer-previews', props: { bare: true }, layout: { direction: 'row', align: 'start', gap: 12 }, children: frames },
  ] };
  const issues = validateLayoutNode(audit);
  if (issues.length) throw new Error(`Invalid UI skin audit: ${JSON.stringify(issues)}`);
  for (const id of ['life-host-tracked-quest', 'life-host-world-status', 'life-host-resources', 'life-host-inventory-frame', 'life-host-quest-frame', 'life-host-profile-frame']) {
    if (!JSON.stringify(audit).includes(`"id":"${id}"`)) throw new Error(`Missing skin consumer: ${id}`);
  }
  mountUI(document.getElementById('root')!, audit, {}, theme);
}
