import { mountExternalAppFrame } from '@engine/host/mount-host.js';

/** Local ApolloGame preview descriptor for the independently built DokiWorld Loot Chest App. */
export function mount(container: HTMLElement): () => void {
  return mountExternalAppFrame(container, {
    title: '开启宝箱 · Loot Chest',
    src: '/apps/game-loot-chest/index.html',
  });
}
