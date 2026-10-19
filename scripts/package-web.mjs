#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/package-web.mjs —— 把「库卡带」(library/<slug> 纯数据 manifest) 打成
//  单个自包含 HTML（file:// 双击即玩·零外部请求）。REQ-PKG·发布线/Lead 域。
//
//  用法：node scripts/package-web.mjs <slug> [outFile]
//        缺省 outFile = release/<slug>/<slug>.html
//
//  原理（宪法对味：游戏=数据·引擎=解释器·打包=引擎 bundle + 内联数据）：
//    1. VITE_TARGET_GAME=__inline__ + VITE_SINGLEFILE=1 构建 cartridge → 一个**通用**的
//       「内联数据卡带」单 HTML 外壳（bundle 走 cartridge-inline-run·不静态 import 任何工程游戏）；
//    2. 把该 slug 的 manifest 内联进 <head> 的 window.__APOLLO_INLINE_CART__（在 bundle module 前执行），
//       外壳挂载即读它、走既有 parseManifest+引擎 load 路径直接跑，跳过在线 fetch；
//    3. 覆盖 <title> 为游戏名。产物自包含体检（无 http(s) 外链）不过 → 明报退出码 1。
//
//    P2e：打包前先经 manifest-check（引擎真 parseManifest + 装载探针）取该卡带**真用到的能力 id**，
//    以 VITE_CART_CAPABILITIES 喂给 cartridge 构建 → 懒注册表裁成子集、rollup 只打这些能力
//    （10 能力弹球卡带：外壳 JS ~317 KB → <120 KB）。装不起来的 manifest 在这一步就拒绝打包。
//
//  注：manifest 里未解析的 "art:<query>" 引用在离线包里退化为占位（渲染层不炸加载）；
//      art: 打包期解析 + FreeArtLib/资产 base64 内联=后续件（REQ-PKG 完工回执已登记）。
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 读该 slug 的 manifest（library 优先·public/games 兜底）。找不到→抛。 */
export function readCartManifest(root, slug) {
  const candidates = [
    join(root, 'library', slug, 'manifest.json'),
    join(root, 'public', 'games', slug, 'manifest.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error(`找不到卡带 manifest：library/${slug}/manifest.json（或 public/games/${slug}/manifest.json）`);
}

/** Only local, registered cartridge textures enter a single-file package. */
export function readCartArtBundle(root, slug, cart) {
  const candidates = [join(root, 'library', slug, 'art'), join(root, 'public', 'games', slug, 'art')];
  const artRoot = candidates.find((dir) => existsSync(join(dir, 'index.json')));
  const wanted = new Set();
  let hasSkin = false;
  const maskRefs = [];
  const visitGame = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visitGame);
    const key = value.Sprite?.textureKey;
    if (typeof key === 'string' && !key.startsWith('art:')) wanted.add(key);
    if (value.Clickable?.hitMaskKey) maskRefs.push({ key: value.Clickable.hitMaskKey, textureKey: key });
    Object.values(value).forEach(visitGame);
  };
  visitGame(cart.entities);
  visitGame(cart.templates);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    for (const [name, field] of Object.entries(value)) {
      if (['src', 'image', 'skin', 'icon', 'poster', 'trackSkin', 'thumbSkin'].includes(name)
        && typeof field === 'string' && field.startsWith('asset:')) { wanted.add(field.slice(6)); hasSkin = true; }
      else visit(field);
    }
  };
  visit(cart.presentation?.ui);
  if (!artRoot) {
    if (maskRefs.length || hasSkin) throw new Error(`卡带 ${slug} 引用本地资产，但缺少 art/index.json`);
    return { index: null, assets: {} };
  }
  const index = JSON.parse(readFileSync(join(artRoot, 'index.json'), 'utf8'));
  if (!Array.isArray(index.assets)) throw new Error(`卡带 ${slug} art/index.json 缺 assets 数组`);
  const entries = new Map(index.assets.map((entry) => [entry.id, entry]));
  for (const { key, textureKey } of maskRefs) {
    const entry = entries.get(key);
    if (entry?.type !== 'hit-mask' || entry.status !== 'filled' || !entry.spec
      || entry.spec.sourceTextureKey !== textureKey) {
      throw new Error(`卡带 ${slug} hit-mask ${String(key)} 未登记为同源 filled mask`);
    }
  }
  const assets = {};
  for (const key of wanted) {
    const entry = entries.get(key);
    if (entry?.type !== 'texture' || entry.status !== 'filled' || typeof entry.path !== 'string') throw new Error(`卡带 ${slug} 贴图 ${key} 未在本地索引登记`);
    const prefix = `/games/${slug}/art/`;
    if (!entry.path.startsWith(prefix) || entry.path.includes('..') || entry.path.includes('\\')) throw new Error(`卡带 ${slug} 贴图 ${key} 路径越界`);
    const source = resolve(artRoot, entry.path.slice(prefix.length));
    const safeRoot = realpathSync(artRoot);
    let safeSource;
    try { safeSource = realpathSync(source); }
    catch { throw new Error(`卡带 ${slug} 贴图 ${key} 缺文件：${entry.path}`); }
    if (!safeSource.startsWith(safeRoot + '\\') && !safeSource.startsWith(safeRoot + '/')) throw new Error(`卡带 ${slug} 贴图 ${key} 文件越界`);
    const ext = source.slice(source.lastIndexOf('.')).toLowerCase();
    const mime = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' }[ext];
    if (!mime) throw new Error(`卡带 ${slug} 贴图 ${key} 格式未获离线支持`);
    const bytes = readFileSync(safeSource);
    if (ext === '.png') {
      const valid = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!valid) throw new Error(`卡带 ${slug} 贴图 ${key} 不是有效 PNG`);
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (entry.spec?.width !== undefined && width !== entry.spec.width || entry.spec?.height !== undefined && height !== entry.spec.height) {
        throw new Error(`卡带 ${slug} 贴图 ${key} PNG 尺寸 ${width}×${height} 与索引不符`);
      }
    }
    assets[entry.path] = `data:${mime};base64,${bytes.toString('base64')}`;
  }
  return { index, assets };
}

/** 读该 slug 的展示 meta（title/subtitle）——library/<slug>/meta.json .name/.tagline，缺省回退 slug。 */
export function readCartMeta(root, slug) {
  const p = join(root, 'library', slug, 'meta.json');
  let name = slug;
  let subtitle = '数据驱动卡带';
  if (existsSync(p)) {
    try {
      const m = JSON.parse(readFileSync(p, 'utf8'));
      if (typeof m.name === 'string' && m.name.trim()) name = m.name.trim();
      if (typeof m.tagline === 'string' && m.tagline.trim()) subtitle = m.tagline.trim();
      else if (typeof m.description === 'string' && m.description.trim()) subtitle = m.description.trim().slice(0, 60);
    } catch { /* 坏 meta 不阻塞打包·用回退 */ }
  }
  return { title: name, subtitle };
}

// JSON → 可安全嵌进内联 <script> 的字面量：转义 < > 防 "</script>" 提前闭合，
// 转义 U+2028/U+2029（JS 里是行终止符·裸嵌进 script 会截断）。用 \u 转义写正则（源文件保持纯 ASCII）。
function scriptSafeJson(v) {
  const LINE_SEP = new RegExp("[\\u2028\\u2029]", "g");
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(LINE_SEP, (m) => "\\u" + m.charCodeAt(0).toString(16));
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 把内联卡带 globals 注入 HTML 外壳的 <head>（bundle module 之前执行），并覆盖 <title>。
 * 纯字符串变换（不碰磁盘）——导出供单测。
 */
export function injectInline(html, { cart, meta, assets, artIndex, slug, title }) {
  if (!/<\/head>/i.test(html)) {
    throw new Error('外壳 HTML 缺少 </head>——无法注入内联卡带数据（cartridge.html 结构异常？）');
  }
  const parts = [`window.__APOLLO_INLINE_CART__=${scriptSafeJson(cart)};`];
  if (artIndex) parts.push(`window.__APOLLO_INLINE_ART_INDEX__=${scriptSafeJson(artIndex)};window.__APOLLO_INLINE_SLUG__=${scriptSafeJson(slug)};`);
  if (meta) parts.push(`window.__APOLLO_INLINE_META__=${scriptSafeJson(meta)};`);
  if (assets && Object.keys(assets).length) {
    parts.push(`globalThis.__APOLLO_INLINE_ASSETS__=Object.assign(globalThis.__APOLLO_INLINE_ASSETS__||{},${scriptSafeJson(assets)});`);
  }
  const tag = `<script>${parts.join('')}</script>`;
  let out = html.replace(/<\/head>/i, `${tag}</head>`);
  if (title) out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  return out;
}

/**
 * 自包含体检：扫 HTML 里会触发浏览器网络加载的外部 http(s) 引用（script/link/img/CSS url/@import）。
 * 返回问题列表（空=自包含·file:// 双击不联网）。xmlns 命名空间 URL 不算（不发请求）。导出供单测。
 */
export function scanSelfContainment(html) {
  const issues = [];
  const checks = [
    [/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//gi, '<script src> 外链'],
    [/<link\b[^>]*\bhref\s*=\s*["']https?:\/\//gi, '<link href> 外链'],
    [/<img\b[^>]*\bsrc\s*=\s*["']https?:\/\//gi, '<img src> 外链'],
    [/url\(\s*["']?https?:\/\//gi, 'CSS url() 外链'],
    [/@import[^;]*["']https?:\/\//gi, 'CSS @import 外链'],
  ];
  for (const [re, label] of checks) {
    const m = html.match(re);
    if (m) issues.push(`${label}×${m.length}（如：${m[0].slice(0, 70)}）`);
  }
  return issues;
}

/**
 * 该 manifest 真用到的能力 id：跑 manifest-check（引擎真 parseManifest·含推断 + 装载探针）读其机读回执。
 * 校验/装载不过 → 抛（错误文本 = manifest-check 的 stderr·可回喂 LLM 修）。
 */
export function resolveCartCapabilities(root, cart, slug) {
  let out;
  try {
    const artIndexPath = slug && [join(root, 'library', slug, 'art', 'index.json'), join(root, 'public', 'games', slug, 'art', 'index.json')].find(existsSync);
    out = execFileSync(process.execPath, [join(root, 'node_modules', 'vite-node', 'vite-node.mjs'), 'scripts/manifest-check.mjs', ...(artIndexPath ? ['--art-index', artIndexPath] : [])], {
      cwd: root, input: JSON.stringify(cart), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error(`manifest 未通过引擎校验/装载，拒绝打包：\n${(e.stderr || e.message || '').toString().trim()}`);
  }
  const line = out.trim().split('\n').pop();
  const rep = JSON.parse(line);
  if (!rep.ok || !Array.isArray(rep.capabilities)) throw new Error(`manifest-check 回执异常：${line}`);
  return rep.capabilities;
}

/** 构建「内联数据卡带」外壳（VITE_TARGET_GAME=__inline__·单文件）→ 返回 dist-cartridge/cartridge.html 内容。
 *  subset 给定 → 懒注册表裁成这些能力（VITE_CART_CAPABILITIES）；null → 全量通用外壳。 */
function buildInlineShell(root, subset = null) {
  const env = { ...process.env, VITE_TARGET_GAME: '__inline__', VITE_SINGLEFILE: '1' };
  if (subset) env.VITE_CART_CAPABILITIES = subset.join(',');
  else delete env.VITE_CART_CAPABILITIES;
  execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.config.cartridge.ts'], {
    cwd: root, env, stdio: 'inherit',
  });
  const shell = join(root, 'dist-cartridge', 'cartridge.html');
  if (!existsSync(shell)) throw new Error('构建完成但未找到外壳 dist-cartridge/cartridge.html');
  return readFileSync(shell, 'utf8');
}

export async function packageWeb(root, slug, outFile, { build = true, shellHtml, subset = true } = {}) {
  const cart = readCartManifest(root, slug);
  const meta = readCartMeta(root, slug);
  // --no-build, --full-shell and injected shells must pass the same real parser gate.
  // A syntactically packed mask can otherwise fail only when the offline HTML starts.
  const ids = resolveCartCapabilities(root, cart, slug);
  let shell = shellHtml;
  if (shell == null) {
    if (build) {
      // subset=true（缺省）：按该卡带真用到的能力裁外壳；false：全量通用外壳（调试/对比用）。
      if (subset) process.stdout.write(`[package-web] ${slug} 用到 ${ids.length} 个能力：${ids.join(', ')}\n`);
      shell = buildInlineShell(root, subset ? ids : null);
    } else {
      // --no-build 复用上次外壳：若它是按别的卡带裁的子集，本卡带点名的能力可能不在 → 运行期「未知 capability id」。
      const p = join(root, 'dist-cartridge', 'cartridge.html');
      if (!existsSync(p)) throw new Error('--no-build 但外壳不存在：先构建一次或去掉 --no-build');
      shell = readFileSync(p, 'utf8');
    }
  }

  const art = readCartArtBundle(root, slug, cart);
  const finalHtml = injectInline(shell, { cart, meta, artIndex: art.index, assets: art.assets, slug, title: meta.title });

  const issues = scanSelfContainment(finalHtml);
  if (issues.length) {
    throw new Error(`产物不自包含（有外部网络引用，file:// 双击会联网/缺件）：\n  - ${issues.join('\n  - ')}`);
  }

  const out = outFile || join(root, 'release', slug, `${slug}.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, finalHtml, 'utf8');
  return out;
}

async function main(argv) {
  const noBuild = argv.includes('--no-build');
  const full = argv.includes('--full-shell');
  const args = argv.filter((a) => a !== '--no-build' && a !== '--full-shell');
  const [slug, outFile] = args;
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    process.stderr.write(`用法：node scripts/package-web.mjs <slug> [outFile] [--no-build] [--full-shell]\n非法或缺失 slug：${slug ?? '(缺)'}\n`);
    process.exit(2);
  }
  try {
    const out = await packageWeb(ROOT, slug, outFile, { build: !noBuild, subset: !full });
    const kb = Math.round(readFileSync(out).length / 1024);
    process.stdout.write(`[package-web] ${slug} → ${out}（${kb} KB·自包含·双击即玩）\n`);
  } catch (e) {
    process.stderr.write(`[package-web] 失败：${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) main(process.argv.slice(2));
