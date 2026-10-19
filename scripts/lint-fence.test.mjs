// scripts/lint-fence.test.mjs —— P0 治理围栏自测（eslint.config.mjs × tools/eslint/zerocraft-rules.mjs）
//
// 三件事各有红腿（撤修验红律）：
//   ① 规则本体：每条 zerocraft/* 规则对「正则守卫抓不到的写法变体」必咬（Math['random']·解构·globalThis.Math·
//      hypot·Date.now·非空 innerHTML·setTimeout(…,5)），对合法形态不咬（sqrt·innerHTML=''·setTimeout(…,0)）。
//   ② 面分配：同一段代码放在不同路径下命中不同——sim 面咬 Date.now，services 面不咬；renderer 面不咬 Math.random；
//      测试面咬 fetch(·node:http import；ui/components/server.ts 整文件豁免 innerHTML。
//   ③ 包装入口：engine-random-guard / test-hygiene-check 对真仓退出 0 且末行判词 PASS（现状干净）。
// 用 ESLint Node API 的 lintText + 虚拟 filePath 走真实配置（配置按路径 glob 分面·文件不必真存在）。
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });
async function ruleIds(code, filePath) {
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.map((m) => m.ruleId ?? `FATAL:${m.message}`);
}
const SIM = 'src/skills/tier2/__probe__.ts';

describe('zerocraft/* 规则本体（写法变体必咬·合法形态不咬）', () => {
  it('no-unseeded-random：Math.random 五种写法全咬（regex 版只抓第 1 种）', async () => {
    for (const code of [
      'export const a = Math.random();',
      "export const b = Math['random']();",
      'const { random } = Math; export const c = random();',
      'export const d = globalThis.Math.random();',
      'export const e = window.Math.random();',
    ]) expect(await ruleIds(code, SIM), code).toContain('zerocraft/no-unseeded-random');
    expect(await ruleIds('export const f = crypto.getRandomValues(new Uint8Array(4));', SIM)).toContain('zerocraft/no-unseeded-random');
    // 动态计算属性（Math[k]）无法静态知 → 一律咬（否则成万能绕过口）
    expect(await ruleIds('export const g = (k: string) => (Math as any)[k]();', SIM)).toContain('zerocraft/no-unseeded-random');
  });

  it('no-unseeded-random：注释里的 Math.random / 同行含 "http://" 的真调用——AST 不受行注释欺骗', async () => {
    expect(await ruleIds('// 绝不 Math.random()\nexport const x = 1;', SIM)).toEqual([]);
    const sneaky = 'export const url = "http://x"; export const r = Math.random();'; // 旧 regex 守卫把 // 当注释起点放行
    expect(await ruleIds(sneaky, SIM)).toContain('zerocraft/no-unseeded-random');
  });

  it('no-transcendental：hypot/cos/pow 咬·sqrt/floor/abs/imul 不咬', async () => {
    for (const fn of ['hypot', 'cos', 'sin', 'atan2', 'pow', 'exp', 'log']) {
      expect(await ruleIds(`export const v = Math.${fn}(1, 2);`, SIM), fn).toContain('zerocraft/no-transcendental');
    }
    for (const fn of ['sqrt', 'floor', 'abs', 'imul', 'min', 'max', 'round', 'trunc', 'sign']) {
      expect(await ruleIds(`export const v = Math.${fn}(1, 2);`, SIM), fn).toEqual([]);
    }
    expect(await ruleIds('const { cos } = Math; export const v = cos(1);', SIM)).toContain('zerocraft/no-transcendental');
  });

  it('no-wall-clock：Date.now / new Date() / performance.now 咬·new Date(ts) 不咬', async () => {
    expect(await ruleIds('export const t = Date.now();', SIM)).toContain('zerocraft/no-wall-clock');
    expect(await ruleIds('export const t = new Date();', SIM)).toContain('zerocraft/no-wall-clock');
    expect(await ruleIds('export const t = performance.now();', SIM)).toContain('zerocraft/no-wall-clock');
    expect(await ruleIds('export const t = new Date(0).getTime();', SIM)).toEqual([]);
  });

  it('no-timers：setTimeout(fn, 5) / setInterval / requestAnimationFrame 咬·零延时让步 setTimeout(fn, 0) / setTimeout(fn) 不咬', async () => {
    expect(await ruleIds('setTimeout(() => {}, 5);', SIM)).toContain('zerocraft/no-timers');
    expect(await ruleIds('setInterval(() => {}, 0);', SIM)).toContain('zerocraft/no-timers');
    expect(await ruleIds('requestAnimationFrame(() => {});', SIM)).toContain('zerocraft/no-timers');
    expect(await ruleIds('setTimeout(() => {}, 0);', SIM)).toEqual([]);
    expect(await ruleIds('setTimeout(() => {});', SIM)).toEqual([]);
  });

  it('no-html-injection：非空 innerHTML= / insertAdjacentHTML( 咬·innerHTML="" 清空不咬·textContent 不咬', async () => {
    const DOM = 'src/studio/__probe__.ts';
    expect(await ruleIds('declare const el: HTMLElement; el.innerHTML = "<b>x</b>";', DOM)).toContain('zerocraft/no-html-injection');
    expect(await ruleIds('declare const el: HTMLElement; el["innerHTML"] = `<b>${1}</b>`;', DOM)).toContain('zerocraft/no-html-injection');
    expect(await ruleIds('declare const el: HTMLElement; el.insertAdjacentHTML("beforeend", "<b/>");', DOM)).toContain('zerocraft/no-html-injection');
    expect(await ruleIds('declare const el: HTMLElement; el.innerHTML = "";', DOM)).toEqual([]);
    expect(await ruleIds('declare const el: HTMLElement; el.textContent = "<b>x</b>";', DOM)).toEqual([]);
  });

  it('豁免纪律：eslint-disable-next-line zerocraft/<rule> -- 理由 生效（就地可见·无 JSON 基线）', async () => {
    const code = '// eslint-disable-next-line zerocraft/no-unseeded-random -- 探针：验证豁免语法\nexport const a = Math.random();';
    expect(await ruleIds(code, SIM)).toEqual([]);
  });
});

describe('面分配（同一代码·不同路径·不同判决）', () => {
  it('Date.now：sim 面（engine/skills/assembly/net）咬·services 面不咬（时间戳属合法 IO）·engine/host 宿主壳不咬', async () => {
    const code = 'export const t = Date.now();';
    for (const p of ['src/engine/core/__p.ts', 'src/skills/atoms/__p.ts', 'src/assembly/__p.ts', 'src/net/__p.ts']) {
      expect(await ruleIds(code, p), p).toContain('zerocraft/no-wall-clock');
    }
    expect(await ruleIds(code, 'src/services/save/__p.ts')).toEqual([]);
    expect(await ruleIds(code, 'src/engine/host/__p.ts')).toEqual([]);
  });

  it('Math.random：services 面仍咬·renderer/ui/runtime/studio 面不咬（表现侧不在确定性域）', async () => {
    const code = 'export const r = Math.random();';
    expect(await ruleIds(code, 'src/services/audio/__p.ts')).toContain('zerocraft/no-unseeded-random');
    for (const p of ['src/renderer/__p.ts', 'src/ui/components/__p.ts', 'src/runtime/__p.ts', 'src/studio/__p.tsx']) {
      expect(await ruleIds(code, p), p).toEqual([]);
    }
  });

  it('测试面（src+games 的 *.test.ts）：fetch( / new WebSocket / node:http import / Math.random / setTimeout(…,10) 全咬', async () => {
    for (const p of ['src/skills/tier2/__p.test.ts', 'games/game-a/__p.test.ts']) {
      expect(await ruleIds('fetch("http://x");', p), p).toContain('zerocraft/no-external-io');
      expect(await ruleIds('new WebSocket("ws://x");', p), p).toContain('zerocraft/no-external-io');
      expect(await ruleIds('import http from "node:http"; http;', p), p).toContain('no-restricted-imports');
      expect(await ruleIds('export const r = Math.random();', p), p).toContain('zerocraft/no-unseeded-random');
      expect(await ruleIds('setTimeout(() => {}, 10);', p), p).toContain('zerocraft/no-timers');
    }
  });

  it('innerHTML：src 全域咬·ui/components/server.ts（LayoutNode 运行时自产串）整文件豁免·games 非测试面不由 eslint 管（归 audit 棘轮）', async () => {
    const code = 'declare const el: HTMLElement; el.innerHTML = "<b/>";';
    expect(await ruleIds(code, 'src/services/__p.ts')).toContain('zerocraft/no-html-injection');
    expect(await ruleIds(code, 'src/ui/components/server.ts')).toEqual([]);
    expect(await ruleIds(code, 'games/game-a/__p.ts')).toEqual([]);
  });
});

describe('包装入口（真仓现状干净·判词与退出码）', () => {
  it('engine-random-guard.mjs：exit 0 + 末行 ENGINE-RANDOM: PASS', () => {
    const r = spawnSync('node', ['scripts/engine-random-guard.mjs'], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.trim().split('\n').at(-1)).toBe('ENGINE-RANDOM: PASS');
  }, 120_000);

  it('test-hygiene-check.mjs：exit 0 + 末行 HYGIENE: PASS', () => {
    const r = spawnSync('node', ['scripts/test-hygiene-check.mjs'], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.trim().split('\n').at(-1)).toBe('HYGIENE: PASS');
  }, 120_000);
});
