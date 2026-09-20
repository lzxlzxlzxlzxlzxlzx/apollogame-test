// scripts/render-probe.test.mjs —— REQ-RENDERCHECK R1 自检：
//   ① 像素方差判定（构造纯色/花屏假图·不起真浏览器·纯函数）
//   ② 环境无浏览器优雅降级（PATH 遮蔽 + 显式路径覆盖模拟「哪都找不到浏览器」→ 退出码 3）
//   ③ S3 门接线读码（game-pipeline.mjs interpretRenderProbe 纯函数·不 spawn 不起浏览器）
//
// 真浏览器起服+装载的端到端验证（对 game-i/game-e 跑一次完整 `gate S3`）是本单交付的**手动核证**
// 动作（回报里附退出码/证据），不进本文件常跑的自动化套件——本仓 gate CLI 测试的既有惯例是全部
// 走 mkdtempSync 沙盒临时根（不碰真仓库状态）；渲染探针天生要连「真运行中的 app」（真 vite+真
// Chromium+真游戏注册表），跟沙盒隔离前提冲突，硬塞进来会变成每次 `npm test` 都重复写真游戏的
// public/games/<slug>/probe/**·pipeline.json（噪声递增，且拖慢日常跑测）——故拆开：读码逻辑用
// 纯函数单测钉死（下方③），真连通性用一次性手动验证（回报记录）。
import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  decodePNG, pixelVariance, isBlank, DEFAULT_VARIANCE_THRESHOLD, deepLinkQuery, detectBrowserRuntime,
} from './render-probe.mjs';
import { interpretRenderProbe } from './game-pipeline.mjs';
import { parseDevServerPort } from './lib/render-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'render-probe.mjs');

// ── 测试专用极简 PNG 编码器（decodePNG 的镜像·仅供本文件构造假图·不进产物代码）──────
// decodePNG 不校验 CRC（screenshot 来源可信·省一份 crc32 实现），故这里 CRC 段留假值即可。
function encodePNG(width, height, colorAt) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bitDepth
  ihdr.writeUInt8(2, 9);  // colorType=2（truecolor RGB）
  const stride = width * 3;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + stride);
    raw[rowOff] = 0; // filter=None
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      raw[rowOff + 1 + x * 3] = r;
      raw[rowOff + 1 + x * 3 + 1] = g;
      raw[rowOff + 1 + x * 3 + 2] = b;
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const solid = (w, h, rgb) => encodePNG(w, h, () => rgb);
const checkerboard = (w, h) => encodePNG(w, h, (x, y) => ((x + y) % 2 === 0 ? [10, 10, 10] : [245, 245, 245]));
// 「花屏」：每像素伪随机颜色（比棋盘格更接近真实游戏画面的高熵内容）。
const noise = (w, h, seed = 1) => {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % 256; };
  return encodePNG(w, h, () => [rnd(), rnd(), rnd()]);
};

// ═══ ① 像素方差判定（≥4 例：纯色×3 + 花屏×1，外加棋盘格与阈值边界补充）═══
describe('pixelVariance / isBlank（纯色 vs 花屏·不起真浏览器）', () => {
  it('纯黑 40×30 → 方差=0 → 判空白（红）', () => {
    const { variance } = pixelVariance(solid(40, 30, [0, 0, 0]));
    expect(variance).toBe(0);
    expect(isBlank(variance)).toBe(true);
  });
  it('纯白 40×30 → 方差=0 → 判空白（红）', () => {
    const { variance } = pixelVariance(solid(40, 30, [255, 255, 255]));
    expect(variance).toBe(0);
    expect(isBlank(variance)).toBe(true);
  });
  it('单一中灰 40×30 → 方差=0 → 判空白（红）——「单色」不止黑白两端', () => {
    const { variance } = pixelVariance(solid(40, 30, [128, 128, 128]));
    expect(variance).toBe(0);
    expect(isBlank(variance)).toBe(true);
  });
  it('花屏（每像素伪随机高熵）→ 方差远超阈值 → 判非空白（绿）', () => {
    const { variance } = pixelVariance(noise(60, 60, 7));
    expect(variance).toBeGreaterThan(DEFAULT_VARIANCE_THRESHOLD * 10);
    expect(isBlank(variance)).toBe(false);
  });
  it('黑白棋盘格（二值高对比）→ 方差远超阈值 → 判非空白（绿）', () => {
    const { variance } = pixelVariance(checkerboard(40, 40));
    expect(variance).toBeGreaterThan(DEFAULT_VARIANCE_THRESHOLD * 10);
    expect(isBlank(variance)).toBe(false);
  });
  it('解码尺寸与像素还原正确（RGB round-trip·非只测方差数字）', () => {
    const { width, height, channels, pixels } = decodePNG(solid(5, 4, [12, 34, 56]));
    expect({ width, height, channels }).toEqual({ width: 5, height: 4, channels: 3 });
    expect([pixels[0], pixels[1], pixels[2]]).toEqual([12, 34, 56]); // 左上角像素
  });
});

// ═══ 假信心自查记录（阈值置 0 的效果，作为可执行文档钉死；真正的「改源码→跑测→复原」
//     ceremony 见 R1 提交说明——此处只固化其数学前提，供后人重放核对）═══
describe('假信心自查·阈值语义', () => {
  it('threshold=0 时 isBlank 恒为 false（"一切都算非空白"）——纯色图不再被判红', () => {
    const { variance } = pixelVariance(solid(10, 10, [0, 0, 0])); // variance===0
    expect(isBlank(variance, 0)).toBe(false); // 0 < 0 恒假 → 纯色图漏判——证明阈值=0 会让判定失能
    expect(isBlank(variance, DEFAULT_VARIANCE_THRESHOLD)).toBe(true); // 默认阈值下仍正确判红
  });
});

// ═══ deepLinkQuery（形态 → URL 深链，纯字符串拼装）═══
describe('deepLinkQuery（游戏形态 → 深链 query·跟玩家点开启动器同一条路由）', () => {
  it('compiled/builtin 走 game=<slug>；cart 走 game=lib:<slug>', () => {
    expect(deepLinkQuery('compiled', 'game-e')).toBe('game=game-e');
    expect(deepLinkQuery('builtin', 'g2')).toBe('game=g2');
    expect(deepLinkQuery('cart', 'my-cart')).toBe('game=lib:my-cart');
  });
});

// ═══ parseDevServerPort（vite 就绪行 → 端口，纯函数·不 spawn）═══
// 2026-09-18 实撞：vite 5 在 Windows 上经 picocolors 上色（其 isColorSupported 含
// `process.platform==='win32'`，**无视 TTY**），stdio 是 pipe 也照样吐 ANSI。原正则没剥 ANSI，
// → 20s 超时 → 所有编译期游戏的渲染门在 Windows 上假红。下面第 2 条用的就是当时抓到的原文。
describe('parseDevServerPort（剥 ANSI 后解析 vite 端口）', () => {
  it('Linux/无色输出：逐字同前', () => {
    expect(parseDevServerPort('  ➜  Local:   http://localhost:5700/\n')).toBe(5700);
    expect(parseDevServerPort('  ➜  Local:   http://127.0.0.1:5199/')).toBe(5199);
  });

  it('Windows 上色输出（实测原文·端口被 \\x1b[1m 夹住 + Local 与 : 之间夹 \\x1b[22m）', () => {
    const raw = '  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5199\x1b[22m/\x1b[39m\n';
    expect(parseDevServerPort(raw)).toBe(5199);
  });

  it('未就绪 / 无关输出 → null（不误报端口）', () => {
    expect(parseDevServerPort('')).toBeNull();
    expect(parseDevServerPort('VITE v5.4.21  ready in 1634 ms')).toBeNull();
    expect(parseDevServerPort('  ➜  Network: use --host to expose')).toBeNull();
  });

  it('跨 chunk 拼接：半行到达时给 null，整行到齐才给端口（订阅者按每次 data 调用）', () => {
    const whole = '  ➜  Local:   http://localhost:5700/\n';
    const cut = 20;
    expect(parseDevServerPort(whole.slice(0, cut))).toBeNull();
    expect(parseDevServerPort(whole)).toBe(5700);
  });
});

// ═══ ② 环境无浏览器优雅降级（PATH 遮蔽 + 覆盖显式路径 → 探测双双落空 → 退出码 3）═══
describe('detectBrowserRuntime / CLI 退出码 3（环境无浏览器·探针跳过不算失败）', () => {
  it('detectBrowserRuntime：显式路径覆盖到不存在的文件 + env 无 PATH → ok=false/NO_BROWSER', () => {
    const r = detectBrowserRuntime({ RENDER_PROBE_CHROMIUM: '/nonexistent/chrome-does-not-exist' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NO_BROWSER');
  });
  it('真容器本有浏览器（零覆盖）→ ok=true（对照组：证明上一条红的是覆盖·不是探测函数本身坏了）', () => {
    expect(detectBrowserRuntime(process.env).ok).toBe(true);
  });
  it('CLI：PATH 遮蔽（指向空目录）+ RENDER_PROBE_CHROMIUM 指到不存在路径 → 双探测路都落空 → 退出码 3', () => {
    const r = spawnSync(process.execPath, [CLI, '--game', 'game-e'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/nonexistent-bin-dir-for-path-shadow-test', RENDER_PROBE_CHROMIUM: '/nonexistent/chrome-does-not-exist' },
      timeout: 15000,
    });
    expect(r.status).toBe(3);
    const out = JSON.parse(r.stdout.trim());
    expect(out.ok).toBe(false);
    expect(out.code).toBe('NO_BROWSER');
    expect(out.reason).toContain('环境无浏览器');
  });
  it('CLI：缺 --game → 退出码 2（用法错）；未知游戏 → 退出码 2', () => {
    const noArg = spawnSync(process.execPath, [CLI], { encoding: 'utf8', timeout: 10000 });
    expect(noArg.status).toBe(2);
    const unknown = spawnSync(process.execPath, [CLI, '--game', 'totally-not-a-real-game-xyz'], { encoding: 'utf8', timeout: 10000 });
    expect(unknown.status).toBe(2);
  });
});

// ═══ ③ S3 门接线读码（纯函数·不 spawn·不起浏览器）═══
describe('interpretRenderProbe（game-pipeline.mjs S3 门怎么读探针退出码）', () => {
  it('探针 exit 0 → 门绿·summary 带「渲染探针过」', () => {
    const r = interpretRenderProbe('编译期游戏免 manifest 校验', 0, '');
    expect(r.exit).toBe(0);
    expect(r.summary).toContain('渲染探针过');
  });
  it('探针 exit 3（环境无浏览器）→ 门仍绿（不算红）·summary 明确标注「未跑·环境无浏览器」', () => {
    const r = interpretRenderProbe('编译期游戏免 manifest 校验', 3, '');
    expect(r.exit).toBe(0);
    expect(r.summary).toContain('未跑');
    expect(r.summary).toContain('环境无浏览器');
  });
  it('探针 exit 1（渲染判红）→ 门红', () => {
    const r = interpretRenderProbe('parse+引擎装载（load+2tick）零 error', 1, '✗ 空白/控制台有 error');
    expect(r.exit).toBe(1);
    expect(r.summary).toContain('✗ 渲染探针未过');
    expect(r.summary).toContain('空白/控制台有 error');
  });
  it('探针非常规退出码（如 137·被 kill）同样门红（非白名单一律红·不因未知码放行）', () => {
    const r = interpretRenderProbe('编译期游戏免 manifest 校验', 137, '');
    expect(r.exit).toBe(1);
  });
});
