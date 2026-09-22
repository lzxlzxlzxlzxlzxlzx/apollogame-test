import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, extname, sep } from 'path';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { copyUsedAssets } from './vite.assets';
import { engineAliases } from './scripts/engine-aliases.mjs';

// 开发期实况伺服 public/games/** 与 public/art/**（owner 07-15 根因·立绘大叉/图标不换）：
// 这两处目录在下方 server.watch.ignored 里（避开 assets/ 3.7 万文件的启动监听风暴）。副作用是
// Vite 内建 publicDir 中间件对**dev 启动后新建/上传的美术文件视而不见** → 请求落到 SPA 兜底
// 返回 index.html（200 text/html）→ 浏览器把 HTML 当图片解码失败 → 立绘显示大叉、图标静默不换。
// 工坊「⬆ 上传本地图 / ⚡ 生成」写盘即在这些目录下 → 正撞此坑。加一条前置中间件按盘直取（防穿越·
// 与 zerocraft.py 的 _serve_public_games 同源同 content-type·no-cache），新文件无需重启 vite 即刻可见。
const ASSET_CT: Record<string, string> = {
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
};
function serveLiveGameAssets() {
  const roots: Record<string, string> = {
    '/games/': resolve(__dirname, 'public/games'),
    '/art/': resolve(__dirname, 'public/art'),
  };
  return {
    name: 'zerocraft-serve-live-game-assets',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void } & NodeJS.WritableStream, next: () => void) => void) => void } }) {
      // 直接 use（非返回后置钩子）→ 排在 Vite 内建中间件之前，抢在 SPA 兜底之前命中真文件。
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const prefix = Object.keys(roots).find((p) => url.startsWith(p));
        if (!prefix) return next();
        let rel: string;
        try { rel = decodeURIComponent(url.slice(prefix.length)); } catch { return next(); }
        const base = roots[prefix];
        // 卡带 art 回退（REQ-CARTART·与 server.py `_serve_public_games` 刻意孪生·规则见 scripts/art-paths.mjs）：
        // `/games/<slug>/art/**` 若该 slug 是创作台卡带 → 解析到 library/<slug>/art/**（不入引擎仓）。
        // 命中即出，落空照旧回退 public 根 —— 内置游戏与非 art 子路径行为一字不变。
        const cart = prefix === '/games/' && /^([a-z0-9][a-z0-9-]*)\/art\//.exec(rel);
        if (cart) {
          const libBase = resolve(__dirname, 'library', cart[1], 'art');
          const libTarget = resolve(libBase, rel.slice(`${cart[1]}/art/`.length));
          if (libTarget !== libBase && !libTarget.startsWith(libBase + sep)) { res.statusCode = 403; res.end('forbidden'); return; }
          if (existsSync(libTarget) && statSync(libTarget).isFile()) {
            res.setHeader('Content-Type', ASSET_CT[extname(libTarget).toLowerCase()] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-cache');
            createReadStream(libTarget).pipe(res);
            return;
          }
        }
        const target = resolve(base, rel);
        if (target !== base && !target.startsWith(base + sep)) { res.statusCode = 403; res.end('forbidden'); return; } // 防路径穿越
        if (!existsSync(target) || !statSync(target).isFile()) return next(); // 非文件 → 交回 Vite（可能是应用路由）
        res.setHeader('Content-Type', ASSET_CT[extname(target).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(target).pipe(res);
      });
    },
  };
}

// 平台打包（D2·scripts/build-platform.mjs 设）：JS/CSS/字体产物挪出默认的 dist/assets/，
// 因为 main_entry/server.py 早占了 `/assets/*` 这条路由给共享素材库 FreeArtLib（ROOT/assets/**·
// assets/index.json + 缩略图，见 _serve_assets）——不挪会撞名：构建产物覆盖同名路径，浏览器把
// 素材库当 JS 解析/把 JS 当素材 404，两头都坏。挪到 `app/` 只影响平台构建；不设该 env 时
// （日常 `npm run dev`/`npm run build`）assetsDir 仍是 Vite 默认 'assets'，零回归。
// copyPublicDir 同理为 false：平台构建改由 build-platform.mjs 精选拷贝 public/games/<9 白名单>，
// 不能让 Vite 内建的"整个 public/ 原样搬进 dist/"把被过滤掉的游戏素材（game-f/d/a 等）也塞进去。
const PLATFORM_BUILD = process.env.VITE_PLATFORM_BUILD === '1';

export default defineConfig({
  plugins: [react(), serveLiveGameAssets(), copyUsedAssets(__dirname, 'dist')],
  build: {
    assetsDir: PLATFORM_BUILD ? 'app' : 'assets',
    copyPublicDir: !PLATFORM_BUILD,
  },
  // 启动提速（owner 07-15「老开发库启动要好久」·诊断根因#1）：chokidar 缺省盯全仓 39,283 个文件，
  // 其中 assets/ 素材库就 37,004 个——listen 后初扫风暴把事件循环饿死（"ready in 270ms" 但首响应 6.6s，
  // 冷盘机器分钟级）。这些目录全是运行时 HTTP fetch 消费、无 HMR 价值 → 不监听（A/B 实测 6.63s→1.74s，
  // inotify 39,283→1,451）。用绝对路径钉根目录，**不误伤 src/assets（引擎代码要 HMR）**。
  // 代价（接受）：手改 public/games 下 JSON 不再自动整页刷新（工坊走 API 写、运行器 no-cache fetch，无感）；
  // library/<slug>/logic.ts 装载带 ?v= 版本参——PUT 后新 URL 重新 transform，不靠 watch。
  server: {
    watch: {
      ignored: [
        resolve(__dirname, 'assets') + '/**',
        resolve(__dirname, 'public/games') + '/**',
        resolve(__dirname, 'docs') + '/**',
        resolve(__dirname, 'wiki') + '/**',
        resolve(__dirname, 'library') + '/**',
        resolve(__dirname, '.zerocraft') + '/**',
        resolve(__dirname, '.apollo') + '/**', // 旧目录名过渡期兜底（REQ-PKG·去 Apollo 化）
      ],
    },
  },
  resolve: {
    alias: {
      ...engineAliases(__dirname),
      '@games': resolve(__dirname, 'games'),
    },
  },
  // 3D 渲染线的重依赖藏在**动态 import 的 3D 游戏**背后。Vite 冷启动扫描会跟进动态 import 把 three
  // 核预打包（.vite/deps 里已见 three.js），但 three/addons/* 这些深子路径常被漏扫 → 首次开 3D 游戏
  // 才现发现 → 触发"依赖再优化 + 整页 reload"（launcher.tsx:716 那条"依赖再优化把人弹回主页"即此症）。
  // 预声明全部深子路径，逼 Vite 冷启动一次性预打包、之后不再中途重优化——开 3D 游戏不再卡一下/弹一下。
  // three 本就在预打包集里（此处不增冷启动成本，只补齐 addons）；列表 = 源码实际 import 的那些，改依赖时同步。
  optimizeDeps: {
    include: [
      'three',
      'cannon-es',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/geometries/ConvexGeometry.js',
      'three/addons/utils/SkeletonUtils.js',
      'three/addons/postprocessing/EffectComposer.js',
      'three/addons/postprocessing/RenderPass.js',
      'three/addons/postprocessing/ShaderPass.js',
      'three/addons/postprocessing/UnrealBloomPass.js',
      'three/addons/postprocessing/GTAOPass.js',
      'three/addons/postprocessing/OutputPass.js',
      'three/addons/postprocessing/SMAAPass.js',
      'three/addons/shaders/HorizontalTiltShiftShader.js',
      'three/addons/shaders/VerticalTiltShiftShader.js',
      'three/addons/math/ConvexHull.js', // convex 碰撞形（physics.ts）
      'three/addons/renderers/CSS3DRenderer.js', // Diegetic3D UI 贴 3D 面
    ],
  },
  test: {
    // P1a 严格模式缺省开（system-view.ts）：系统对未申报组件的访问一跑就炸·只读组件深冻结。
    // 生产（浏览器）无 process.env → off；这里只影响 vitest。要盘点全库改 ZEROCRAFT_STRICT=report。
    env: { ZEROCRAFT_STRICT: process.env.ZEROCRAFT_STRICT ?? '1' },
    // 排除并行 Programmer 的 worktree 副本（.claude/worktrees）——否则 vitest 会把副本里的
    // 测试也扫进来、测试数虚高（曾出现 1515 假象）。保留默认的 node_modules/dist 排除。
    //
    // 快/慢双车道（owner 2026-07-21·测试提速体检）：默认 `npm test`=快车道，排除下列
    // DEEP_GLOBS（冻结游戏 + 巨无霸整局通关 + 起子进程的工具测试·占全量 CPU 时间约一半却每次空转）；
    // `npm run test:deep`（ZEROCRAFT_DEEP=1，旧名 APOLLO_DEEP 过渡期仍读）=慢车道跑全部，发版前/定期用。
    // 缩范围只减「每次推」的负担、不减总覆盖——慢车道仍是完整安全网。判据见 docs/playbooks/testing.md「双车道」。
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/.claude/**',
      // DokiWorld 出包线（docs/playbooks/dokiworld-pack.md）：dokiworld/<app>/ 是自带 package.json 的
      // 独立 npm 包，tests 按对方规范走 `node --test`（node:test 风格·vitest 收进来只会报
      // 「No test suite found」假红）。各包 `npm test` 自跑；出包改动照常过本门禁的 tsc/build。
      'dokiworld/**',
      ...((process.env.ZEROCRAFT_DEEP ?? process.env.APOLLO_DEEP) === '1' ? [] : [
        'games/game-f/**', // 冻结游戏（owner 勿删勿迁·2026-08-03 owner 改判「不删了要还原·上架但代码纪律仍冻结」）·26s/133 测·没人开发→只慢车道跑
        'games/game-g/flow-walk.test.ts', // 整局通关走查 8.4s/1 测·33 个单元文件已覆盖各片段
        'games/game211/flow-walk.test.ts', // 整局通关走查 10s/1 测（同 game-g 判据·2026-09-10 测试体检）
        'games/game211/pathfind-scale.bench.test.ts', // 寻路选型压测 25s·量数不判语义（选型已定=流场·REQ-FLOWFIELD）·发版前/改寻路时慢车道跑
        'games/game211/slg-scale.bench.test.ts', // 规模压测 4.6s·阈值宽松只防退化·同上慢车道
        'scripts/manifest-check.test.mjs', // 起进程跑 CLI 7.3s·库 manifest 校验（发版前跑够）
        'scripts/acceptance.test.mjs', // 起进程 3.1s·验收剧本harness
        'scripts/game-pipeline.test.mjs', // 起进程 2.4s·流程板 CLI（人用工具·不常改）
        'scripts/audit-ratchet.test.mjs', // 对 8 游戏各 spawn 一次·红旗棘轮（game-skill-audit 每游戏仍活跑）
      ]),
    ],
  },
});
