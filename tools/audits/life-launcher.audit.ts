import rawSlots from '../../games/game-simlife/little-valley.asset-slots.json';
import { threeSceneLifePackage } from '../../src/assembly/life-package.fixture.js';
import { MemoryStoragePort } from '../../src/services/storage/index.js';
import { mountLifeLauncherItem } from '../../src/launcher/life-game-runner.js';
import { LIFE_LAUNCHER_SCHEMA, discoverLifeLauncherCatalog } from '../../src/launcher/life-launcher-catalog.js';

const directory = 'game-seaside-market';
const root = `../../games/${directory}`;
const descriptor = {
  schema: 'zerocraft.life-host.v1', slug: directory, packagePath: 'life.json', assetSlotsPath: 'asset-slots.json', artSlug: directory,
  viewport: { fieldW: 900, fieldH: 620, topBarH: 52, cellSize: 32, mode: 'responsive', cameraFit: 'cover' },
  theme: 'starter',
  hud: { preset: 'life-standard-v1', title: '海风集市', labels: { date: '营业日', inventory: '货箱', interaction: '招呼', objective: '今日计划', 'advance-day': '打烊' } },
  input: { preset: 'life-keyboard-v1' },
  save: { namespace: `life:${directory}:v1`, schemaVersion: 1, autosave: 'life-commit-v1' },
};
const lifePackage = structuredClone(threeSceneLifePackage()) as any;
lifePackage.meta.id = directory; lifePackage.meta.title = 'Seaside Market';
for (const scene of lifePackage.scenes) {
  scene.width = 28; scene.height = 20;
  for (const layer of scene.layers) layer.tiles = [{ tileId: layer.tiles[0].tileId, count: 560 }];
}
const slots = structuredClone(rawSlots) as any; slots.game = directory;
const item = discoverLifeLauncherCatalog(
  { [`${root}/life-launcher.json`]: { schema: LIFE_LAUNCHER_SCHEMA, id: directory, title: '海风集市', subtitle: '潮汐经营', description: '独立 Life 内容', color: '#17364a', accentColor: '#62d6c5', icon: '🐚' } },
  { [`${root}/life-host.json`]: descriptor }, { [`${root}/life.json`]: lifePackage }, { [`${root}/asset-slots.json`]: slots },
).items[0]!;

const host = document.getElementById('root');
if (!host) throw new Error('missing audit root');
Object.assign(document.body.style, { margin: '0', overflow: 'hidden', background: '#08130f' });
Object.assign(host.style, { width: '100vw', height: '100vh' });
mountLifeLauncherItem(host, item, { storage: new MemoryStoragePort(), loadArt: async () => false });
