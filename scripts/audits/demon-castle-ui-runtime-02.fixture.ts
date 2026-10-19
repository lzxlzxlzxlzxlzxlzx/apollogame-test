import descriptor from '../../games/game-demon-castle/life-host.json';
import lifePackage from '../../games/game-demon-castle/life.json';
import assetSlots from '../../games/game-demon-castle/asset-slots.json';
import { mountLifeGame } from '../../src/assembly/life-host/life-game-host.js';
import { lifeHostPersistentHash } from '../../src/assembly/life-host/life-save.js';
import { selectLifeHostView } from '../../src/assembly/life-host/life-presenter.js';
import { buildLifeStandardUi } from '../../src/assembly/life-host/life-hud.js';
import { mountUI, validateLayoutNode } from '../../src/ui/components/index.js';
import { STARTER_THEME } from '../../src/ui/starters/index.js';

// Real shared Host with the formal descriptor and real AssetManager loader.
// No storage port: no access to Owner saves, localStorage or IndexedDB.
const handle = mountLifeGame(document.getElementById('root')!, { descriptor, lifePackage, assetSlots });
void handle.ready.then((mounted) => {
  Object.assign(window, {
    lifeRuntimeProbe: {
      hash: () => lifeHostPersistentHash(mounted.session.engine.world),
      position: () => {
        const view = selectLifeHostView(mounted.session.engine.world);
        return { x: view.x, y: view.y, scene: view.scene };
      },
      availableActions: () => selectLifeHostView(mounted.session.engine.world).affordances.filter((entry) => entry.available).map((entry) => entry.action),
      dispose: () => handle.dispose(),
      fixture: (mode: 'long' | 'empty' | 'status-long' | 'resources-long', kind: 'quest' | 'inventory' | 'profile') => {
        const base = selectLifeHostView(mounted.session.engine.world, {}, {}, mounted.session.descriptor.hud.calendarLabels);
        const resolve = (key: string) => {
          const d = mounted.session.assets.get(key)?.descriptor;
          return d?.kind === 'texture' ? d.src : undefined;
        };
        // Adversarial read models only, never written to World or persisted.
        const data = mode === 'resources-long' ? { ...base, profile: base.profile && { ...base.profile, attributes: base.profile.attributes.map((attribute) => ({ ...attribute, value: 999999999999 })) } }
          : mode === 'status-long' ? { ...base, placeLabel: '月影城堡北侧古老温室庭院', date: '蚀月季 第999日（第999天）', slot: '暮色' } : mode === 'empty' ? { ...base, questItems: [], inventoryItems: [], profile: base.profile && { ...base.profile, attributes: [] } } : {
          ...base,
          questItems: Array.from({ length: 24 }, (_, i) => ({ ...base.questItems[0]!, questId: 'fixture-' + i, tracked: i === 0, title: '长任务标题完整换行 · 温室与城堡复兴', nextObjective: '收集月木与影矿后返回王座厅，继续检查温室与工坊的修复进展。' })),
          inventoryItems: Array.from({ length: 60 }, (_, i) => ({ id: 'fixture-item-' + i, title: '长名称测试材料 ' + i, kind: 'resource', count: i + 1, skinKey: base.inventoryItems[0]?.skinKey ?? '' })),
          profile: base.profile && { ...base.profile, attributes: [
            ...base.profile.attributes,
            ...Array.from({ length: Math.max(0, 28 - base.profile.attributes.length) }, (_, i) => ({ ...base.profile!.attributes[0]!, id: 'fixture-' + i, surfaces: ['profile' as const] })),
          ] },
        };
        const tree = buildLifeStandardUi(data, mounted.session.descriptor.hud, null,
          { descriptor: mounted.session.descriptor.inventoryPanel, open: kind === 'inventory', resolveSkin: resolve },
          { descriptor: mounted.session.descriptor.questPanel, open: kind === 'quest' },
          { descriptor: mounted.session.descriptor.profilePanel, open: kind === 'profile', resolveSkin: resolve },
          mounted.session.descriptor.uiSkin, resolve, { width: innerWidth, height: innerHeight });
        const issues = validateLayoutNode(tree);
        if (issues.length) throw new Error(JSON.stringify(issues));
        handle.dispose();
        document.getElementById('root')!.replaceChildren();
        mountUI(document.getElementById('root')!, tree, {}, STARTER_THEME);
      },
    },
  });
});

