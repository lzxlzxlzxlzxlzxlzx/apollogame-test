import { mountExternalAppFrame } from '@engine/host/mount-host.js';

/** Local ApolloGame preview descriptor for the independently built DokiWorld Loot Chest App. */
export function mount(container: HTMLElement): () => void {
  return mountExternalAppFrame(container, {
    title: '开启宝箱 · Loot Chest',
    // 引擎库没有 DokiWorld Host；显式预览标记才允许包内 demo 首屏出现。
    src: '/apps/game-loot-chest/index.html?preview=1',
  });
}
