// scripts/lib/render-harness.mjs —— 渲染探针公共件（REQ-RENDERCHECK R1/R3 共用·抽取自 render-probe.mjs）
//
//  R1（render-probe.mjs·S3 门渲染冒烟）与 R3（golden-shot.mjs·S5/S8 门标准照比对）都要「真起本仓
//  vite 开发服 → 真 Chromium 装载游戏 → 走玩家同款深链」——这套机制抽成本模块，两处 import 同一份，
//  不各自维护一份浏览器探测/起服/深链/PNG 解码代码（R3 施工令明文：复用 R1 模块·别复制代码）。
//  render-probe.mjs 已同步改为从本模块 import（其对外导出签名不变，见该文件尾部 re-export）。
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import zlib from 'node:zlib';

// ── 浏览器可执行文件探测 ───────────────────────────────────────────────────
// 首选本容器已知的固定路径（本地 playwright 包解析到的 revision 与容器预置版本不一定对得上——
// 实测踩过：package.json 声明 1.61.1 时 chromium.executablePath() 指向 1228，但 /opt/pw-browsers
// 只预置了 1194，故显式给 executablePath 绕开版本耦合）；找不到则退化到 PATH 上的常见浏览器名。
// 环境变量沿用 RENDER_PROBE_CHROMIUM 这个名字（R1 先起的名·R3 复用同一变量，非另造一个）——
// 两处探针共用同一份「覆盖到哪个 Chromium」的旋钮，测试里的 PATH 遮蔽手法对两者同样有效。
export const DEFAULT_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FALLBACK_BIN_NAMES = process.platform === 'win32'
  ? ['msedge', 'chrome', 'chromium']
  : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
const WINDOWS_BROWSER_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export function detectBrowserRuntime(env = process.env) {
  const explicit = env.RENDER_PROBE_CHROMIUM || DEFAULT_CHROMIUM;
  if (existsSync(explicit)) return { ok: true, execPath: explicit, via: 'explicit' };
  if (!env.RENDER_PROBE_CHROMIUM && process.platform === 'win32') {
    const installed = WINDOWS_BROWSER_PATHS.find((path) => existsSync(path));
    if (installed) return { ok: true, execPath: installed, via: 'installed' };
  }
  for (const bin of FALLBACK_BIN_NAMES) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8', env });
    const p = (r.stdout || '').trim().split('\n')[0];
    if (r.status === 0 && p) return { ok: true, execPath: p, via: 'PATH' };
  }
  return {
    ok: false, code: 'NO_BROWSER',
    reason: `环境无浏览器·探针跳过（未找到 ${explicit}，PATH 上也没有 ${FALLBACK_BIN_NAMES.join('/')}）`,
  };
}

// ── PNG 解码（纯函数·零依赖·不起浏览器）────────────────────────────────────
// Playwright screenshot() 产物固定 8-bit、非隔行——只需覆盖 colorType 0/2/4/6，够用。
export function decodePNG(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG（签名不符）');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatParts = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 8 + len + 4;
  }
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  if (bitDepth !== 8) throw new Error(`不支持 bitDepth=${bitDepth}（只认 8）`);
  const channelsByColorType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (channels === undefined) throw new Error(`不支持 colorType=${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rOff = 0, oOff = 0;
  const prevRow = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[rOff]; rOff += 1;
    const row = out.subarray(oOff, oOff + stride);
    const src = raw.subarray(rOff, rOff + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let val = src[x];
      switch (filter) {
        case 0: break;
        case 1: val = (val + a) & 0xff; break;
        case 2: val = (val + b) & 0xff; break;
        case 3: val = (val + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          val = (val + pr) & 0xff;
          break;
        }
        default: throw new Error(`未知 PNG 滤波类型 ${filter}`);
      }
      row[x] = val;
    }
    prevRow.set(row);
    rOff += stride;
    oOff += stride;
  }
  return { width, height, channels, pixels: out };
}

// ── 深链构造（跟玩家点开启动器走同一条路由·非测试专用路径）──────────────────
export function deepLinkQuery(form, slug) {
  return form === 'cart' ? `game=lib:${slug}` : `game=${slug}`;
}

// ── vite dev 起服（非 build+preview——冷启动快、天然读当前源码）─────────────
const VITE_BASE_PORT = 5700;

export function startDevServer(root, { port = VITE_BASE_PORT } = {}) {
  return new Promise((resolve, reject) => {
    const bin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    const proc = spawn(process.execPath, [bin, '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let buf = '';
    let settled = false;
    const to = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`vite dev 20s 未就绪 · 输出尾：${buf.slice(-400)}`));
    }, 20000);
    const cleanup = () => clearTimeout(to);
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/Local:\s+https?:\/\/[^:]+:(\d+)\//);
      if (m && !settled) {
        settled = true;
        cleanup();
        resolve({ proc, port: Number(m[1]) });
      }
    });
    proc.stderr.on('data', (d) => { buf += d.toString(); });
    proc.on('exit', (code) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(`vite dev 未起服就退出（code ${code}）· 输出尾：${buf.slice(-400)}`));
      }
    });
    proc.on('error', (e) => {
      if (!settled) { settled = true; cleanup(); reject(e); }
    });
  });
}

export function stopDevServer(proc) {
  if (!proc) return;
  try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* 已死或不归我们管 */ }
  setTimeout(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* 收尸 */ } }, 1500);
}
