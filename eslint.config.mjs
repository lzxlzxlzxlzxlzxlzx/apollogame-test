// eslint.config.mjs —— ZeroCraft 机器围栏（P0 治理围栏 · docs/design/engine-architecture-review-2026-09-02.md §5 P0）
//
// 定位：**不是风格检查**，是把此前散在 regex 脚本与文件头注释里的纪律变成 AST 级硬门。
// 故意不挂 `@eslint/js` recommended（那是几百条存量风格红·与围栏无关）；只开 zerocraft/* 具名规则 + 两条内置。
// 按「面」开规则（与 CLAUDE.md 的引擎域界一致）：
//   SIM  src/{engine,skills,assembly}（非测试·排除 engine/host 宿主壳）：随机 · 超越函数 · 墙钟 · 定时器
//   NET  src/net（非测试）：随机 · 超越函数 · 墙钟（IO 壳的 now/peerId 行内豁免注明）
//   SVC  src/services（非测试）：随机（时间戳属合法 IO·不禁墙钟）
//   DOM  src/**（非测试）：HTML 注入（ui/components/server.ts 是 LayoutNode 运行时本身·自产串·整文件豁免）
//   TEST src/**·games/** 的 *.test.ts(x)：随机 · 墙钟 · 定时器 · 外部 IO · node 网络模块 import
// games/** 非测试面仍由 scripts/game-skill-audit.mjs 的棘轮基线管（innerHTML/createElement/react 红旗随 audit-baseline），
// 本配置不重复咬；待 P2b/P3e 收口后再并入。
// 豁免纪律：一律行内 `// eslint-disable-next-line zerocraft/<rule> -- <理由>`，理由必填（`--` 后为空 = 复查打回）；
// 禁 JSON 基线、禁目录级放行（就地可见）。
import tseslint from 'typescript-eslint';
import zerocraft from './tools/eslint/zerocraft-rules.mjs';

const TS = ['**/*.ts', '**/*.tsx', '**/*.mts'];
const TEST = ['src/**/*.test.ts', 'src/**/*.test.tsx', 'games/**/*.test.ts', 'games/**/*.test.tsx'];


export default tseslint.config(
  {
    ignores: [
      'node_modules/**', 'dist/**', 'build/**', 'public/**', 'cartridge-station/**', 'dokiworld/**',
      'electron/**', 'steam-publisher/**', 'workshop/**', 'wiki/**', 'docs/**', 'assets/**', 'licenses/**',
      '**/*.gen.ts', '**/*.d.ts', 'src/test-fixtures/**',
      'src/ui/components/art-fonts.ts', 'src/ui/components/art-fonts-cjk.ts', // 字体数据文件（自带 /* eslint-disable */·非代码）
    ],
  },
  // 解析器：所有 TS 走 typescript-eslint parser（无类型信息·秒级）。
  {
    files: TS,
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { zerocraft },
  },
  // SIM 面
  {
    files: ['src/engine/**/*.ts', 'src/skills/**/*.ts', 'src/assembly/**/*.ts'],
    ignores: [...TEST, 'src/engine/host/**'],
    rules: {
      'zerocraft/no-unseeded-random': 'error',
      'zerocraft/no-transcendental': 'error',
      'zerocraft/no-wall-clock': 'error',
      'zerocraft/no-timers': 'error',
    },
  },
  // NET 面
  {
    files: ['src/net/**/*.ts'],
    ignores: TEST,
    rules: {
      'zerocraft/no-unseeded-random': 'error',
      'zerocraft/no-transcendental': 'error',
      'zerocraft/no-wall-clock': 'error',
    },
  },
  // SVC 面
  {
    files: ['src/services/**/*.ts'],
    ignores: TEST,
    rules: { 'zerocraft/no-unseeded-random': 'error' },
  },
  // DOM 面（src 全部非测试源）
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [...TEST, 'src/ui/components/server.ts'],
    rules: { 'zerocraft/no-html-injection': 'error' },
  },
  // TEST 面（测试三禁·docs/playbooks/testing.md 红线）
  {
    files: TEST,
    rules: {
      'zerocraft/no-unseeded-random': 'error',
      'zerocraft/no-wall-clock': 'error',
      'zerocraft/no-timers': 'error',
      'zerocraft/no-external-io': 'error',
      'no-restricted-imports': ['error', {
        paths: ['http', 'https', 'net', 'dgram', 'tls', 'node:http', 'node:https', 'node:net', 'node:dgram', 'node:tls']
          .map((name) => ({ name, message: '测试禁直连外部网络：stub/mock 掉' })),
      }],
    },
  },
);
