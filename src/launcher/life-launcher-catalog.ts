import {
  discoverLifeLauncherCatalog,
  type LifeLauncherCatalogItem,
} from './life-launcher-catalog-core.js';

export * from './life-launcher-catalog-core.js';

const lifeLauncherModules = import.meta.glob('../../games/*/life-launcher.json', { eager: true, import: 'default' });
const lifeHostModules = import.meta.glob('../../games/*/life-host.json', { eager: true, import: 'default' });
const lifePackageModules = import.meta.glob('../../games/*/life.json', { eager: true, import: 'default' });
const lifeAssetSlotModules = import.meta.glob('../../games/*/asset-slots.json', { eager: true, import: 'default' });

export const LIFE_LAUNCHER_CATALOG = discoverLifeLauncherCatalog(
  lifeLauncherModules, lifeHostModules, lifePackageModules, lifeAssetSlotModules,
);
export const LIFE_LAUNCHER_GAME_ENTRIES = LIFE_LAUNCHER_CATALOG.gameEntries;
export function findLifeLauncherItem(runtimeId: string): LifeLauncherCatalogItem | undefined {
  return LIFE_LAUNCHER_CATALOG.items.find((item) => item.runtimeId === runtimeId);
}
