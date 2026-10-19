// scripts/engine-aliases.mjs — 单一真相：ZeroCraft 引擎十个子路径 → src 对应目录的别名表
// （REQ-PKG-位置无关与正名·Lead 图纸①）。
//
// 供三处消费，避免同一张表在多个 vite/tsc 配置里各抄一份走样：
//   1. vite.config.ts / vite.config.cartridge.ts（仓内开发/构建·两套别名并存：短别名给
//      src/ 内部引用用，`@zerocraft/engine/<sub>` 给 games/** 消费面用）；
//   2. scripts/zerocraft.mjs（外部内容启动器·同一张表接到「真被依赖的引擎根」而非固定 __dirname，
//      让外部游戏目录位置无关：只要 file: 依赖真解析到某个引擎 checkout，别名就照那个 checkout 生成）；
//   3. tools/export-game.mjs 的 ALIASES（导出闭包追踪用·独立词表结构，见该文件头注，未复用本模块——
//      它需要的是「前缀→相对目标目录」的字符串表，形状不同，故仍手工同步维护十条，不在此合并）。
//
// 十个子路径的名字与顺序照 package.json "exports" 字段与图纸①：
//   engine / skills / atom-skills / ui / renderer / services / assets / net / runtime / assembly

import { resolve } from 'node:path';

/** 子路径名 → 相对 engineRoot 的 src 目录（package.json exports 与本表必须一一对应）。 */
export const ENGINE_SUBPATHS = {
  engine: 'src/engine',
  skills: 'src/skills',
  'atom-skills': 'src/skills/atoms',
  ui: 'src/ui',
  renderer: 'src/renderer',
  services: 'src/services',
  assets: 'src/assets',
  net: 'src/net',
  runtime: 'src/runtime',
  assembly: 'src/assembly',
};

/** 旧短别名（src/ 内部相互引用用·不改·见 CLAUDE.md 工作规范）→ 同一批目标目录。 */
const LEGACY_ALIASES = {
  engine: '@engine',
  skills: '@skills',
  'atom-skills': '@atom-skills',
  ui: '@ui',
  renderer: '@renderer',
  services: '@services',
  assets: '@assets',
  net: '@net',
  runtime: '@runtime',
  assembly: '@assembly',
};

/**
 * 给定引擎根目录（仓内=__dirname 上一级；外部消费=真解析到的 node_modules/@zerocraft/engine
 * 实际路径），返回 vite `resolve.alias` 用的对象：**旧短别名 + 新包名子路径**同时存在。
 * 旧别名只服务 src/ 内部既有引用（未改·仍需可解析）；新包名子路径服务 games/** 消费面
 * （REQ-PKG 全量改写后的 import 现状）。外部游戏目录只会用到新包名一侧，旧一侧无害闲置。
 */
export function engineAliases(engineRoot) {
  const out = {};
  // Life Host moved above engine. Keep the exact historical package/short paths
  // resolvable for existing consumers without adding an engine -> assembly re-export.
  // Exact entries must precede the broad `engine` prefix in Vite's alias order.
  for (const leaf of ['life-game-host', 'life-save', 'life-presenter', 'life-interaction', 'life-hud', 'life-hud-overlay']) {
    const target = resolve(engineRoot, `src/assembly/life-host/${leaf}.ts`);
    out[`@engine/host/${leaf}.js`] = target;
    out[`@zerocraft/engine/engine/host/${leaf}.js`] = target;
  }
  for (const [sub, relDir] of Object.entries(ENGINE_SUBPATHS)) {
    const abs = resolve(engineRoot, relDir);
    out[LEGACY_ALIASES[sub]] = abs;
    out[`@zerocraft/engine/${sub}`] = abs;
  }
  // The Life authoring contract is a deliberate package-only entry: game-side
  // descriptors and integration tests may consume it, but src gets no new short alias.
  out['@zerocraft/engine/authoring'] = resolve(engineRoot, 'src/authoring');
  return out;
}
