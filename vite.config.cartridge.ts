import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';
import { copyUsedAssets, inlineUsedAssets } from './vite.assets';
import { engineAliases } from './scripts/engine-aliases.mjs';
import { filterRegistrySource, subsetFromEnv } from './scripts/lib/registry-subset.mjs';

const targetGame = process.env.VITE_TARGET_GAME ?? 'game-f';

// 每个游戏的真名（用于把 cartridge.html 的 <title> 从 "ZeroCraft OS" 换成游戏名）。
const GAME_TITLES: Record<string, string> = {
  'game-dice': '轻掷 · Dice Overlay',
  'game-loot-chest': '开启宝箱 · Loot Chest',
  'game-e': '小丑牌 · 卡牌构建',
  'game-f': '像素三分天下 · 自走棋', 'game-g': '翻命扑克 · 3D 掷命骨架',
  'game-i': '控件测试场 · 数据驱动 UI',
};
function setTitlePlugin() {
  const title = GAME_TITLES[targetGame] ?? targetGame;
  return {
    name: 'set-cartridge-title',
    transformIndexHtml(html: string) {
      const titled = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
      // 外部调用的骰子卡带是覆盖层而不是一个黑色页面：独立产物必须让 iframe 透出父平台。
      return targetGame === 'game-dice'
        ? titled.replace('</style>', 'html,body,#game-root{background:transparent!important}</style>')
        : titled;
    },
  };
}
// P2e · 懒能力注册表按子集裁剪（engine-architecture-review-2026-09-02 D10）：
//   VITE_CART_CAPABILITIES="id1,id2,…"（package-web.mjs 按该 manifest 真解析结果注入）→ 注册表只剩这些行，
//   rollup 只打这些能力；未设且目标是 __inline__ → 全量（通用外壳·dev 用）；目标是工程游戏 → 空
//   （工程游戏静态 import 自己的能力，内联运行器在那儿是死分支，不必拖 100+ 个懒 chunk）。
const REGISTRY_GEN = resolve(__dirname, 'src/assembly/capability-registry.gen.ts');
const capSubset: string[] | null = subsetFromEnv() ?? (targetGame === '__inline__' ? null : []);
function capabilitySubsetPlugin() {
  return {
    name: 'capability-subset',
    enforce: 'pre' as const,
    load(id: string) {
      if (capSubset === null || id !== REGISTRY_GEN) return null;
      const { src, kept } = filterRegistrySource(readFileSync(REGISTRY_GEN, 'utf8'), capSubset);
      console.log(`[capability-subset] 懒注册表裁成 ${kept.length} 条${kept.length ? '：' + kept.join(', ') : ''}`);
      return src;
    },
  };
}
// VITE_SINGLEFILE=1 → 把 JS/CSS/字体内联进单个自包含 cartridge.html
// （供 cartridge-station 打成单 HTML OS）。默认关闭，团队正常多文件 tar.gz 构建不受影响。
const singleFile = process.env.VITE_SINGLEFILE === '1';

// 配置写成 async：vite-plugin-singlefile 仅单文件模式按需 import —— 桌面版(Mac/Win)
// 不依赖它、未装也能编译；只有单 HTML 构建才需要（先 npm install 拉取）。
export default defineConfig(async () => ({
  plugins: [
    react(),
    setTitlePlugin(),
    capabilitySubsetPlugin(),
    ...(singleFile
      ? [inlineUsedAssets(__dirname, targetGame), (await import('vite-plugin-singlefile')).viteSingleFile()]
      : [copyUsedAssets(__dirname, 'dist-cartridge')]),
  ],
  root: '.',
  base: './',
  build: {
    outDir: 'dist-cartridge',
    emptyOutDir: true,
    // 单文件模式：把所有资产（字体等 import 的）内联成 data URI，整进单 HTML；
    // 多文件模式用默认阈值（字体仍走外部文件，设备 http.server 部署不变）。
    assetsInlineLimit: singleFile ? 100_000_000 : 4096,
    rollupOptions: {
      input: resolve(__dirname, 'cartridge.html'),
    },
  },
  define: {
    __TARGET_GAME__: JSON.stringify(targetGame),
  },
  resolve: {
    alias: {
      ...engineAliases(__dirname),
      '@games': resolve(__dirname, 'games'),
    },
  },
}));
