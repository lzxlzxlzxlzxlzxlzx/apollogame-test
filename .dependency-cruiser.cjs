// .dependency-cruiser.cjs —— 模块边界围栏（P0 治理围栏 · docs/design/engine-architecture-review-2026-09-02.md §5 P0）
//
// 取代 scripts/decouple-check.mjs 的 regex 版本（它只吃带引号的 specifier：模板字面量动态 import、
// import.meta.glob、变量 specifier 全漏）。dependency-cruiser 走真实解析（tsconfig paths · exports 字段），
// 且**解析不到的 import 直接判红**——绕过面从「写法」收窄到「必须真能解析」。
//
// 规则（与 decouple-check 一字对齐 + 架构评审 §1.2 实测干净的层向关系钉死成门）：
//   games-no-relative-escape  games/<g>/** 的相对导入不得逃出自己目录（碰引擎只许走别名/包名）
//   src-no-games              src/** 不得 import games/**（装配层 launcher/cartridge* 与 Studio 三处既有产品耦合放行）
//   engine-core-is-bottom     src/engine/** 不得依赖上层（skills/assembly/renderer/ui/services/net/runtime/studio/launcher）；
//                             仅类型导入放行（engine/protocol → ui LayoutNode 类型·评审 §1.2 记为债·P3d 收口）
//   skills-no-presentation    src/skills/** 不得依赖 renderer/ui/services/runtime/studio/launcher/assembly
//   net-no-presentation       src/net/** 不得依赖 renderer/ui/services/runtime/studio/launcher
//   not-to-unresolvable       任何解析不到的 import = 红（`?raw`/`?url` 资源查询串除外）
// 用法：npx depcruise --config .dependency-cruiser.cjs src games   （门禁常驻·退出码=结果）
module.exports = {
  forbidden: [
    {
      name: 'games-no-relative-escape',
      severity: 'error',
      comment: '游戏用相对路径逃出自己目录（逃到别的游戏/逃进 src/）——碰引擎只许走 @zerocraft/engine/* 或 @engine/* 等别名',
      // pathNot = decouple-check 原 A_GRANDFATHERED 两条既有跨界（锚点守卫读真实导出插件·game-f 冻结政策封锁的教程 raw 导入）
      from: { path: '^games/([^/]+)/', pathNot: '^games/game-c/dokiworld-export\\.test\\.ts$|^games/game-f/lobby\\.tsx$' },
      to: { pathNot: '^games/$1/', dependencyTypes: ['local'], dependencyTypesNot: ['aliased'] }, // 别名解析后也带 local 标·排除 aliased 才是「相对路径」
    },
    {
      name: 'src-no-games',
      severity: 'error',
      comment: '引擎 src/** 反向依赖游戏内容——只有装配层（launcher/cartridge*）与 Studio 三处既有产品耦合放行（decouple-check 原白名单）',
      from: {
        path: '^src/',
        pathNot: '^src/launcher(/|\\.tsx$)|^src/cartridge|^src/studio/(AssetLibrary\\.tsx|StudioInspector\\.tsx|assets-model\\.ts)$',
      },
      to: { path: '^games/' },
    },
    {
      name: 'engine-core-is-bottom',
      severity: 'error',
      comment: 'src/engine 是最底层：不得运行时依赖 skills/assembly/renderer/ui/services/net/runtime/studio/launcher（类型导入暂放行·债见评审 §1.2）',
      from: { path: '^src/engine/', pathNot: '\\.test\\.tsx?$' },
      to: { path: '^src/(skills|assembly|renderer|ui|services|net|runtime|studio|launcher)', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'skills-no-presentation',
      severity: 'error',
      comment: 'capability 层只依赖 engine（与同层/更低 tier）：不得碰渲染/UI/服务/宿主/装配',
      from: { path: '^src/skills/', pathNot: '\\.test\\.tsx?$' },
      to: { path: '^src/(renderer|ui|services|runtime|studio|launcher|assembly)', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'net-no-presentation',
      severity: 'error',
      comment: 'net 只依赖 engine/skills/assembly：不得碰渲染/UI/服务/宿主',
      from: { path: '^src/net/', pathNot: '\\.test\\.tsx?$' },
      to: { path: '^src/(renderer|ui|services|runtime|studio|launcher)', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: '解析不到的 import（typo / 删了文件 / 动态串）——regex 守卫抓不到的一类，这里硬红',
      from: {},
      to: { couldNotResolve: true, pathNot: '\\?(raw|url|inline)$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)node_modules/|^dist/|^build/|^public/' },
    tsPreCompilationDeps: true, // 记录仅类型导入并标 dependencyTypes: type-only（层向规则据此放行）
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
      extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: false } },
  },
};
