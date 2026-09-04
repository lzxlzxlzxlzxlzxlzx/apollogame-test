// scripts/golden-shot.test.mjs —— REQ-RENDERCHECK R3 自检：
//   ① 像素 diff 数学（构造合成解码图·不起真浏览器·纯函数）+ 假信心自查（容差置 Infinity 应漏判）
//   ② 稳帧循环 captureStableScreenshot（假 page 对象·验证「两张哈希相同才判稳／耗尽仍不稳=flaky」）
//   ③ bless 人门语义（--note 空拒 / 无候选照拒）· compare 无基准平凡通过（不碰浏览器）·
//     CLI 用法校验（退出码 2）· 环境无浏览器（PATH 遮蔽·退出码 3——沿 R1 同款手法）
//   ④ blessedStates 台账读（S5/S8 门用它决定要不要起浏览器）
//   ⑤ interpretGoldenCompare（game-pipeline.mjs S5/S8 门怎么读 compare 退出码·纯函数）
//
// 真起服+真浏览器的端到端验证（对 game-e/game-i 各 capture+bless+compare 一轮 + 一次真漂移演示）
// 是本单交付的**手动核证**动作（回报里附产物路径/退出码），不进本文件常跑套件——理由同 R1
// render-probe.test.mjs 头注：沙盒 CLI 测试全走 mkdtempSync 临时根，真浏览器天生要连「真运行中的
// app」（真 vite + 真 Chromium + 真游戏注册表），两者前提冲突；接线/数学逻辑由本文件纯函数测试
// 常驻盖，真连通性用一次性手动验证。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  diffPixels, blessedStates, captureStableScreenshot, CHANNEL_TOLERANCE, DIFF_RATIO_THRESHOLD,
} from './golden-shot.mjs';
import { interpretGoldenCompare } from './game-pipeline.mjs';

const withRoot = (fn) => {
  const r = mkdtempSync(join(tmpdir(), 'golden-shot-'));
  try { return fn(r); } finally { rmSync(r, { recursive: true, force: true }); }
};
const putGame = (root, slug) => {
  const dir = join(root, 'public', 'games', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ name: slug, capabilities: [], entities: {} }));
};
const putBlessedLedger = (root, slug, state = 'boot') => {
  const dir = join(root, 'public', 'games', slug, 'golden');
  mkdirSync(dir, { recursive: true });
  const ledger = {
    version: 1, slug,
    states: { [state]: { status: 'blessed', sha256: 'deadbeef', viewport: { width: 1280, height: 800 }, blessedAt: new Date().toISOString(), blessedBy: 'fixture', note: 'fixture row（本测试不读真 png——退出码 3 在读盘前就短路）' } },
    history: [],
  };
  writeFileSync(join(dir, 'golden-ledger.json'), JSON.stringify(ledger, null, 2));
};

// ── 合成"解码后 PNG"测试夹具（不走真 PNG 编解码——diffPixels 只吃 {width,height,channels,pixels} 形状）──
function img(w, h, ch, fill) {
  const pixels = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fill(x, y);
      const o = (y * w + x) * ch;
      for (let k = 0; k < ch; k++) pixels[o + k] = c[k] ?? 0;
    }
  }
  return { width: w, height: h, channels: ch, pixels };
}
// 伪随机字节流（LCG·同 render-probe.test.mjs 的 noise() 手法）——两个不同种子生成"内容整体不同"的图。
const lcg = (seed) => { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % 256; }; };

// ═══ ① 像素 diff 数学（≥4 例：同图/容差边界×2/平移噪声，外加比例边界补充）═══
describe('diffPixels（逐像素 diff·合成解码图·不起真浏览器）', () => {
  it('同图 vs 同图 → 0 差异·判过', () => {
    const a = img(20, 20, 3, () => [50, 60, 70]);
    const b = img(20, 20, 3, () => [50, 60, 70]);
    const d = diffPixels(a, b);
    expect(d.diffCount).toBe(0);
    expect(d.ratio).toBe(0);
    expect(d.maxChannelDiff).toBe(0);
    expect(d.pass).toBe(true);
  });

  it('单像素差=容差边界值本身（=CHANNEL_TOLERANCE）→「≤N 忽略」被吞·不计入 diffCount', () => {
    const base = [40, 40, 40];
    const a = img(20, 20, 3, () => base);
    const b = img(20, 20, 3, (x, y) => (x === 0 && y === 0) ? [40 + CHANNEL_TOLERANCE, 40, 40] : base);
    const d = diffPixels(a, b);
    expect(d.maxChannelDiff).toBe(CHANNEL_TOLERANCE);
    expect(d.diffCount).toBe(0);
    expect(d.pass).toBe(true);
  });

  it('单像素差=容差+1（刚超出边界）→ 计入 diffCount=1（占比仍小·整体仍判过——验证"计数"与"判过"是两件事）', () => {
    const base = [40, 40, 40];
    const a = img(20, 20, 3, () => base); // 400 px
    const b = img(20, 20, 3, (x, y) => (x === 0 && y === 0) ? [40 + CHANNEL_TOLERANCE + 1, 40, 40] : base);
    const d = diffPixels(a, b);
    expect(d.diffCount).toBe(1);
    expect(d.ratio).toBeCloseTo(1 / 400, 6);
    expect(d.pass).toBe(true); // 1/400=0.25% < 0.5%
  });

  it('平移噪声（内容整体不同·两个不同种子的高熵图）→ 超差像素占比远超阈值 → 判红', () => {
    const w = 40, h = 40;
    const rndA = lcg(11), rndB = lcg(97);
    const a = img(w, h, 3, () => [rndA(), rndA(), rndA()]);
    const b = img(w, h, 3, () => [rndB(), rndB(), rndB()]);
    const d = diffPixels(a, b);
    expect(d.ratio).toBeGreaterThan(DIFF_RATIO_THRESHOLD * 10);
    expect(d.pass).toBe(false);
  });

  it('超差像素占比恰好=0.5%（1000 像素中 5 个超差）→ 判过（"≤0.5%"含等号）', () => {
    const w = 25, h = 40; // total=1000
    const base = [10, 10, 10];
    const a = img(w, h, 3, () => base);
    const b = img(w, h, 3, (x, y) => (y * w + x) < 5 ? [10 + CHANNEL_TOLERANCE + 1, 10, 10] : base);
    const d = diffPixels(a, b);
    expect(d.diffCount).toBe(5);
    expect(d.ratio).toBeCloseTo(0.005, 6);
    expect(d.pass).toBe(true);
  });

  it('超差像素占比略超 0.5%（1000 像素中 6 个超差）→ 判红', () => {
    const w = 25, h = 40;
    const base = [10, 10, 10];
    const a = img(w, h, 3, () => base);
    const b = img(w, h, 3, (x, y) => (y * w + x) < 6 ? [10 + CHANNEL_TOLERANCE + 1, 10, 10] : base);
    const d = diffPixels(a, b);
    expect(d.diffCount).toBe(6);
    expect(d.pass).toBe(false);
  });
});

// ═══ 假信心自查：容差置 Infinity 应让"平移噪声判红"漏判（本应红的图不再判红）═══
// 真正的「临时把 golden-shot.mjs 里 CHANNEL_TOLERANCE 改成 Infinity → 跑本文件 → 上面「平移噪声→
// 判红」那条测试须转红（fail）→ 复原 → 重跑转绿」ceremony 已实做一遍（见 R3 提交说明/回报）；
// 这里固化其数学前提为可执行文档，供后人不用真改源码就能重放核对同一个论点。
describe('假信心自查·容差语义（阈值失能 vs 生效对照）', () => {
  it('容差=Infinity → 同一对"平移噪声"图漏判（pass=true）；默认阈值下仍判红——证明容差常数真的在把关', () => {
    const w = 40, h = 40;
    const rndA = lcg(11), rndB = lcg(97); // 与上面"平移噪声→红"用例同一对种子
    const a = img(w, h, 3, () => [rndA(), rndA(), rndA()]);
    const b = img(w, h, 3, () => [rndB(), rndB(), rndB()]);
    const normal = diffPixels(a, b, { tolerance: CHANNEL_TOLERANCE, ratioThreshold: DIFF_RATIO_THRESHOLD });
    expect(normal.pass).toBe(false);
    const sabotaged = diffPixels(a, b, { tolerance: Infinity, ratioThreshold: DIFF_RATIO_THRESHOLD });
    expect(sabotaged.pass).toBe(true); // 容差放到无穷 → 一切都算"未变" → 本应判红的图漏判
  });
});

// ═══ ② 稳帧循环（假 page 对象·不碰真浏览器·验证"两张哈希相同才判稳／耗尽仍不稳=flaky"）═══
describe('captureStableScreenshot（稳帧循环·假 page 对象）', () => {
  it('连续两次截图相同 → 提前判稳·返回命中时的迭代计数', async () => {
    const frames = [Buffer.from('A'), Buffer.from('B'), Buffer.from('B'), Buffer.from('C')];
    let i = 0;
    const page = { screenshot: async () => frames[Math.min(i++, frames.length - 1)], waitForTimeout: async () => {} };
    const r = await captureStableScreenshot(page, { attempts: 5, intervalMs: 0 });
    expect(r.stable).toBe(true);
    expect(r.attempts).toBe(3); // A(i=0)，B(i=1)，B(i=2)：第 3 张与第 2 张哈希相同→判稳
    expect(r.screenshot.toString()).toBe('B');
  });
  it('每次截图都不同（永不稳定）→ 耗尽 attempts 后 stable=false·仍返回最后一张（不空手而归）', async () => {
    let i = 0;
    const page = { screenshot: async () => Buffer.from(`frame-${i++}`), waitForTimeout: async () => {} };
    const r = await captureStableScreenshot(page, { attempts: 4, intervalMs: 0 });
    expect(r.stable).toBe(false);
    expect(r.attempts).toBe(4);
    expect(r.screenshot.toString()).toBe('frame-3');
  });
});

// ═══ ④ blessedStates（台账读 fs·纯函数·S5/S8 门用它决定要不要起浏览器）═══
describe('blessedStates（台账读·纯 fs）', () => {
  it('无 ledger 文件 → 空数组', () => withRoot((root) => {
    putGame(root, 'g');
    expect(blessedStates(root, 'g')).toEqual([]);
  }));
  it('ledger 有 candidate 无 blessed → 空数组；混有 blessed → 只列出 blessed 那些', () => withRoot((root) => {
    putGame(root, 'g');
    const dir = join(root, 'public', 'games', 'g', 'golden');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'golden-ledger.json');
    writeFileSync(p, JSON.stringify({ version: 1, slug: 'g', states: { boot: { status: 'candidate' } }, history: [] }));
    expect(blessedStates(root, 'g')).toEqual([]);
    writeFileSync(p, JSON.stringify({ version: 1, slug: 'g', states: { boot: { status: 'blessed' }, menu: { status: 'candidate' } }, history: [] }));
    expect(blessedStates(root, 'g')).toEqual(['boot']);
  }));
});

// ═══ ⑤ interpretGoldenCompare（game-pipeline.mjs S5/S8 门怎么读 compare 退出码·纯函数）═══
describe('interpretGoldenCompare（S5/S8 门读 compare 退出码）', () => {
  it('compare exit 0 → 门绿·summary 带「标准照比对过」', () => {
    const r = interpretGoldenCompare('tsc+vitest+build 三绿', 0, '');
    expect(r.exit).toBe(0);
    expect(r.summary).toContain('标准照比对过');
  });
  it('compare exit 3（环境无浏览器）→ 门仍绿·summary 明确标注「未跑·环境无浏览器」', () => {
    const r = interpretGoldenCompare('tsc+vitest+build 三绿', 3, '');
    expect(r.exit).toBe(0);
    expect(r.summary).toContain('未跑');
    expect(r.summary).toContain('环境无浏览器');
  });
  it('compare exit 1（漂移）→ 门红·summary 提示「有意变更请…bless」', () => {
    const r = interpretGoldenCompare('tsc+vitest+build 三绿', 1, '✗ state boot 漂移');
    expect(r.exit).toBe(1);
    expect(r.summary).toContain('标准照漂移');
    expect(r.summary).toContain('bless');
  });
  it('探针非常规退出码（如 137·被 kill）同样门红（非白名单一律红）', () => {
    const r = interpretGoldenCompare('base', 137, '');
    expect(r.exit).toBe(1);
  });
});

// ═══ ③ CLI 端到端（沙盒临时根·不碰真仓库·同 game-pipeline.test.mjs 的 runCli 手法）═══
const CLI = fileURLToPath(new URL('./golden-shot.mjs', import.meta.url));
const runCli = (root, args, envExtra = {}) =>
  spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: root, ...envExtra }, encoding: 'utf8', timeout: 15000 });

describe('CLI 用法校验（退出码 2·不碰浏览器）', () => {
  it('未知子命令 → 2', () => withRoot((root) => {
    const r = runCli(root, ['frobnicate', '--game', 'g']);
    expect(r.status).toBe(2);
  }));
  it('缺 --game → 2', () => withRoot((root) => {
    const r = runCli(root, ['capture']);
    expect(r.status).toBe(2);
  }));
  it('未知游戏 → 2', () => withRoot((root) => {
    const r = runCli(root, ['capture', '--game', 'totally-not-a-real-game-xyz']);
    expect(r.status).toBe(2);
  }));
  it('capture 非法 --state（路径穿越字符）→ 2', () => withRoot((root) => {
    putGame(root, 'g');
    const r = runCli(root, ['capture', '--game', 'g', '--state', '../evil']);
    expect(r.status).toBe(2);
  }));
  it('capture 已签核 state → 1，且不允许用新照片覆盖基准', () => withRoot((root) => {
    putGame(root, 'g');
    putBlessedLedger(root, 'g', 's4-structure');
    const r = runCli(root, ['capture', '--game', 'g', '--state', 's4-structure'], {
      PATH: '/nonexistent-bin-dir-for-path-shadow-test',
      RENDER_PROBE_CHROMIUM: '/nonexistent/chrome-does-not-exist',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝覆盖已签核基准');
  }));
});

describe('bless CLI（人门语义：--note 必填·不许空签）', () => {
  it('缺 --note → 退出码 1·stderr 点名拒绝原因', () => withRoot((root) => {
    putGame(root, 'g');
    const r = runCli(root, ['bless', '--game', 'g', '--state', 'boot']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('note');
  }));
  it('--note 只有空白字符 → 同样拒（trim 后判空）', () => withRoot((root) => {
    putGame(root, 'g');
    const r = runCli(root, ['bless', '--game', 'g', '--state', 'boot', '--note', '   ']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('note');
  }));
  it('note 齐但候选照未在盘（没 capture 过）→ 拒·点名先 capture', () => withRoot((root) => {
    putGame(root, 'g');
    const r = runCli(root, ['bless', '--game', 'g', '--state', 'boot', '--note', '首基准']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('capture');
  }));
});

// ═══ compare：无 blessed 基准=平凡通过（这条路径设计上不碰浏览器——ledger 一读完就知道结果）═══
describe('compare CLI：无 blessed 基准 → 平凡通过·不起浏览器', () => {
  it('从未 capture/bless 过任何 state → 退出码 0·JSON 标 code=NO_BASELINE', () => withRoot((root) => {
    putGame(root, 'g');
    const r = runCli(root, ['compare', '--game', 'g']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout.trim());
    expect(out.ok).toBe(true);
    expect(out.code).toBe('NO_BASELINE');
    expect(out.states).toEqual([]);
  }));
});

// ═══ 环境无浏览器（有 blessed 基准才会走到这条路径）→ 退出码 3（沿 R1 的 PATH 遮蔽手法）═══
describe('compare CLI：环境无浏览器（PATH 遮蔽 + 覆盖显式路径）→ 退出码 3', () => {
  it('有 blessed 基准 + 双探测路都落空 → 退出码 3·JSON 标 code=NO_BROWSER', () => withRoot((root) => {
    putGame(root, 'g');
    putBlessedLedger(root, 'g'); // 有基准才会碰到 detectBrowserRuntime 这一步（无基准直接 0 退出）
    const r = runCli(root, ['compare', '--game', 'g'], {
      PATH: '/nonexistent-bin-dir-for-path-shadow-test',
      RENDER_PROBE_CHROMIUM: '/nonexistent/chrome-does-not-exist',
    });
    expect(r.status).toBe(3);
    const out = JSON.parse(r.stdout.trim());
    expect(out.ok).toBe(false);
    expect(out.code).toBe('NO_BROWSER');
  }));
  it('真容器本有浏览器（零覆盖·同一 blessed 基准 fixture）→ 不会在 NO_BROWSER 这关落空（对照组）', () => withRoot((root) => {
    putGame(root, 'g');
    putBlessedLedger(root, 'g');
    // 不遮蔽 PATH：走到真 detectBrowserRuntime 应该 ok（真去连 vite/浏览器会因 fixture 根没
    // node_modules 而在更后面的「起服」步骤落红/超时——那条路径不在本文件覆盖范围内，
    // 这里只证明「没被误伤成退出码 3」，用短超时 + 只看它不是 3 即可，不等它跑完起服流程）。
    const r = spawnSync(process.execPath, [CLI, 'compare', '--game', 'g'], {
      env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: root },
      encoding: 'utf8', timeout: 8000,
    });
    expect(r.status).not.toBe(3);
  }));
});
