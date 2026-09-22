// AI 资产生成框架 —— 文本→资产。适配器：tripo·meshy(文本→3D glb)· qwen(2D png·DashScope 万相)· seedream(2D png·字节火山方舟)。
//
// 架构（同 src/services/aigp 端口哲学）：外部**非确定性 AI 服务**走旁路；产物 = 提交进库的**固定资产**（带
//   provenance：厂商/prompt/模型/日期/许可），**不碰 sim/hash**（渲染层数据·确定性不受威胁）。
// 密钥走 env（TRIPO_API_KEY / DASHSCOPE_API_KEY），**绝不入库**；缺 key 或 --mock → mock 模式（产占位、可测）。
// 本环境 GitHub-only → 真调 API 被挡；用 --mock 把整套框架跑通、门禁全绿。真调等放宽网络的 session。
//
// 用法: node scripts/ai-gen.mjs <tripo|qwen> "<prompt>" [--game <g>] [--id <local-id>] [--mock]
//   例: node scripts/ai-gen.mjs tripo "a wooden chair" --game game-z --mock
//       node scripts/ai-gen.mjs qwen "pixel sword icon" --game game-z --mock
//   自测: node scripts/ai-gen.mjs demo      （两适配器各 mock 一个到临时目录·打印落库条目·跑完自动清理）
//   设置: node scripts/ai-gen.mjs providers （看各 provider 的 envKey / 是否已配 key·打码）

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── 最小 PNG 编码（qwen mock 用·纯 Node·确定性）──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td), 0); return Buffer.concat([l, td, c]); }
export function encodePng(w, h, rgb) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 3)] = 0; rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// prompt 播种的确定性噪声图（mock：不同 prompt→不同图，一眼看出是占位）
export function mockImage(prompt, N = 128) {
  let seed = 2166136261; for (let i = 0; i < prompt.length; i++) { seed ^= prompt.charCodeAt(i); seed = (seed * 16777619) >>> 0; }
  const h2 = (x, y) => { let h = ((x * 374761393) ^ (y * 668265263) ^ seed) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const rgb = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = (h2(Math.floor(x / 8), Math.floor(y / 8)) * 0.7 + h2(x, y) * 0.3), o = (y * N + x) * 3;
    rgb[o] = 40 + v * 180; rgb[o + 1] = 40 + h2(y, x) * 180; rgb[o + 2] = 60 + v * 150;
  }
  return { buffer: encodePng(N, N, rgb), w: N, h: N };
}

// ── 文生图请求构造（纯函数·可测·可回显）——owner debug「到底传了什么」。──
// key 走 header（Authorization）不进 body，故 body 全字段可安全回显/落日志（无密钥泄漏）。
export function seedreamRequest(prompt, { model, size }) {
  return {
    provider: 'seedream',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    method: 'POST',
    model, size, prompt,
    body: { model, prompt, size, response_format: 'url', watermark: false },
  };
}

/** 把请求转成可复制的 curl（key 用 $ENV 占位·绝不落真值）——owner debug「整个命令行」，可自贴 key 复现。 */
export function curlFor(request, keyEnv = 'ARK_API_KEY') {
  const headers = `-H 'Authorization: Bearer $${keyEnv}' -H 'Content-Type: application/json'`;
  return `curl -X ${request.method} '${request.endpoint}' ${headers} -d '${JSON.stringify(request.body)}'`;
}

// fetch + 连接层重试（owner 2026-07-27「第一次连不上·第二次连上」·疑代理/冷启动）：只对 fetch 抛错
// （连接失败=fetch failed/DNS/超时/TLS）重试；HTTP 4xx 是 Response·不抛→不重试（确定性错误不该重试）。
export async function fetchRetry(url, opts = {}, { tries = 3, baseDelay = 500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, opts); }
    catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, baseDelay * (i + 1))); }
  }
  throw last;
}

// ── 适配器（kind=资产类型·envKey=密钥环境变量·generate=产 buffer+meta）──
export const ADAPTERS = {
  tripo: {
    kind: 'mesh', ext: 'glb', envKey: 'TRIPO_API_KEY', license: 'Tripo (按订阅商用授权)',
    async generate(prompt, { mock, apiKey }) {
      if (mock || !apiKey) {
        const cube = join(ROOT, 'assets', 'meshes', 'cube.glb'); // 复用现成基础体作占位 glb
        return { buffer: existsSync(cube) ? readFileSync(cube) : Buffer.alloc(0), model: 'tripo-mock', mock: true, spec: { scale: 1, genCollision: 'hull' } };
      }
      // 真调（网络门控·Tripo v2 openapi）：submit → poll → download glb
      const base = 'https://api.tripo3d.ai/v2/openapi';
      const sub = await fetch(`${base}/task`, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'text_to_model', prompt }) }).then((r) => r.json());
      const taskId = sub?.data?.task_id; if (!taskId) throw new Error('tripo: 无 task_id ' + JSON.stringify(sub));
      let url = null;
      for (let i = 0; i < 60; i++) {
        const st = await fetch(`${base}/task/${taskId}`, { headers: { authorization: `Bearer ${apiKey}` } }).then((r) => r.json());
        const s = st?.data?.status; if (s === 'success') { url = st.data.output?.pbr_model || st.data.output?.model; break; }
        if (s === 'failed' || s === 'banned') throw new Error('tripo 任务失败: ' + s);
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!url) throw new Error('tripo: 轮询超时');
      const buffer = Buffer.from(await fetchRetry(url).then((r) => r.arrayBuffer()));
      return { buffer, model: 'tripo-text-to-model', mock: false, spec: { scale: 1, genCollision: 'hull' } };
    },
  },
  meshy: {
    kind: 'mesh', ext: 'glb', envKey: 'MESHY_API_KEY', license: 'Meshy (按订阅商用授权)',
    async generate(prompt, { mock, apiKey }) {
      if (mock || !apiKey) {
        const cube = join(ROOT, 'assets', 'meshes', 'cube.glb'); // 复用现成基础体作占位 glb
        return { buffer: existsSync(cube) ? readFileSync(cube) : Buffer.alloc(0), model: 'meshy-mock', mock: true, spec: { scale: 1, genCollision: 'hull' } };
      }
      // 真调（网络门控·Meshy v2 openapi text-to-3d·preview 阶段产基础 glb）：submit → poll → download glb
      const base = 'https://api.meshy.ai/openapi/v2/text-to-3d';
      const H = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
      const sub = await fetch(base, { method: 'POST', headers: H, body: JSON.stringify({ mode: 'preview', prompt }) }).then((r) => r.json());
      const taskId = sub?.result; if (!taskId) throw new Error('meshy: 无 task id ' + JSON.stringify(sub));
      let url = null;
      for (let i = 0; i < 60; i++) {
        const st = await fetch(`${base}/${taskId}`, { headers: { authorization: `Bearer ${apiKey}` } }).then((r) => r.json());
        const s = st?.status; if (s === 'SUCCEEDED') { url = st.model_urls?.glb; break; }
        if (s === 'FAILED' || s === 'CANCELED') throw new Error('meshy 任务失败: ' + s);
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!url) throw new Error('meshy: 轮询超时');
      const buffer = Buffer.from(await fetchRetry(url).then((r) => r.arrayBuffer()));
      return { buffer, model: 'meshy-preview-text-to-3d', mock: false, spec: { scale: 1, genCollision: 'hull' } };
    },
  },
  qwen: {
    kind: 'texture', ext: 'png', envKey: 'DASHSCOPE_API_KEY', license: 'Qwen/DashScope 万相 (按订阅授权)',
    async generate(prompt, { mock, apiKey }) {
      if (mock || !apiKey) { const { buffer, w, h } = mockImage(prompt); return { buffer, model: 'wanx-mock', mock: true, spec: { format: 'png', width: w, height: h, usage: 'sprite' } }; }
      // 真调 DashScope 万相 text2image（异步任务·门控）
      const H = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'X-DashScope-Async': 'enable' };
      const sub = await fetchRetry('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', { method: 'POST', headers: H, body: JSON.stringify({ model: 'wanx2.1-t2i-turbo', input: { prompt }, parameters: { n: 1, size: '1024*1024' } }) }).then((r) => r.json());
      const taskId = sub?.output?.task_id; if (!taskId) throw new Error('qwen: 无 task_id ' + JSON.stringify(sub));
      let url = null;
      for (let i = 0; i < 60; i++) {
        const st = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, { headers: { authorization: `Bearer ${apiKey}` } }).then((r) => r.json());
        const s = st?.output?.task_status; if (s === 'SUCCEEDED') { url = st.output.results?.[0]?.url; break; }
        if (s === 'FAILED') throw new Error('qwen 任务失败');
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!url) throw new Error('qwen: 轮询超时');
      const buffer = Buffer.from(await fetchRetry(url).then((r) => r.arrayBuffer()));
      return { buffer, model: 'wanx2.1-t2i-turbo', mock: false, spec: { format: 'png', width: 1024, height: 1024, usage: 'sprite' } };
    },
  },
  seedream: {
    // 字节 Seedream 文生图（火山方舟 Ark·2D 主力·owner 2026-07-21 接入）。与 qwen 不同=**同步**返回（无轮询）。
    // 端点/字段核实自 Ark 官方 images/generations（OpenAI 兼容·`response_format:url`→data[0].url·24h 有效）。
    // 模型默认 doubao-seedream-4-0（env ARK_SEEDREAM_MODEL 可覆盖·owner 试 4-5/5-0 免改码）；尺寸 env ARK_SEEDREAM_SIZE。
    kind: 'texture', ext: 'png', envKey: 'ARK_API_KEY', license: 'ByteDance Seedream/火山方舟 (按订阅商用授权)',
    // opts.size：调用方按行 spec 传目标尺寸（缺省回退 env·再回退 2K）——防 UI 按钮被塞进 2K 方图渲成整场景。
    async generate(prompt, { mock, apiKey, size: sizeOpt } = {}) {
      const model = process.env.ARK_SEEDREAM_MODEL || process.env.ARK_IMAGEGEN_MODEL || 'doubao-seedream-4-0-250828';
      const size = sizeOpt || process.env.ARK_SEEDREAM_SIZE || '2K';
      const request = seedreamRequest(prompt, { model, size }); // 恒构造·mock 也回显「本该发的完整请求」（debug 免花 key）
      if (mock || !apiKey) { const { buffer, w, h } = mockImage(prompt); return { buffer, model: 'seedream-mock', mock: true, spec: { format: 'png', width: w, height: h, usage: 'sprite' }, request }; }
      const H = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
      const res = await fetchRetry(request.endpoint, { method: 'POST', headers: H, body: JSON.stringify(request.body) }).then((r) => r.json());
      const url = res?.data?.[0]?.url;
      if (!url) throw new Error('seedream: 无 image url ' + JSON.stringify(res?.error ?? res).slice(0, 300));
      const buffer = Buffer.from(await fetchRetry(url).then((r) => r.arrayBuffer()));
      return { buffer, model, mock: false, spec: { format: 'png', usage: 'sprite' }, request };
    },
  },
};

// ── 落地：产物 → 文件 + 索引条目（带 provenance）。game 给了=游戏本地 art/ai/；否则=共享货架 assets/ai/。──
export function buildEntry({ adapter, prompt, id, kind, spec, model, license, mock, servedPath, at }) {
  return {
    id, type: kind, description: `${prompt} · AI 生成(${adapter}${mock ? '·mock' : ''})`, status: 'filled',
    ...(servedPath ? { path: servedPath } : {}),
    category: kind === 'mesh' ? 'mesh' : 'ai-gen',
    tags: ['ai-gen', adapter, ...(mock ? ['mock'] : []), ...prompt.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)],
    license, source: `ai:${adapter}`, spec,
    provenance: { generator: adapter, prompt, model, mock: !!mock, generatedAt: at ?? '' },
  };
}

// ── 人审门（M2.5·REQ-ART）：生成产物先落「待审区」（pending.json + assets/ai/pending/），
//    人点「入库」经 reviewPending(approve) 才移进最终位置 + 登记 index；reject 删文件+清单项。
//    宪法「无自动入库」——生成路径**绝不**直写 index.json（唯一入 index 的门=approve 且 provenance 硬校验过）。
// ────────────────────────────────────────────────────────────────

const byIdCmp = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
function readPendingManifest(file) { const m = readJson(file, { version: 1, pending: [] }); if (!Array.isArray(m.pending)) m.pending = []; return m; }
function readIndexFile(file) { const i = readJson(file, { version: 1, assets: [] }); if (!Array.isArray(i.assets)) i.assets = []; return i; }
function writeJsonFile(file, obj) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(obj, null, 2) + '\n'); }

// 落点解析：game 给了=游戏本地 art/；否则=共享货架 assets/。返回待审区 + 最终位置 + servedPath 构造器。
// 保留既有非对称：共享 index 条目 path=相对（消费端补 /assets/）；游戏本地 path=站点绝对 /games/<g>/art/…。
export function locations(root, game) {
  if (game) {
    const artDir = join(root, 'public', 'games', game, 'art');
    return {
      indexFile: join(artDir, 'index.json'),
      pendingFile: join(artDir, 'ai', 'pending.json'),
      pendingDir: join(artDir, 'ai', 'pending'),
      finalDir: artDir,
      finalServed: (fileRel) => `/games/${game}/art/${fileRel}`,
      pendingServed: (base) => `/games/${game}/art/ai/pending/${base}`,
    };
  }
  const assetsDir = join(root, 'assets');
  return {
    indexFile: join(assetsDir, 'index.json'),
    pendingFile: join(assetsDir, 'ai', 'pending.json'),
    pendingDir: join(assetsDir, 'ai', 'pending'),
    finalDir: assetsDir,
    finalServed: (fileRel) => fileRel,
    pendingServed: (base) => `/assets/ai/pending/${base}`,
  };
}

// provenance 硬校验（宪法·§七约束2）：model/prompt/date/license 缺一即拒绝登记。返回缺失字段名数组（空=通过）。
export function provenanceMissing(entry) {
  const p = (entry && entry.provenance) || {};
  const missing = [];
  if (!p.model) missing.push('model');
  if (!p.prompt) missing.push('prompt');
  if (!p.generatedAt) missing.push('date');
  if (!(entry && entry.license)) missing.push('license');
  return missing;
}

// 生成产物 → 待审区（写 pending 文件 + upsert pending.json·绝不碰 index.json）。返回机读结果（含预览 URL）。
export function writePending({ root = ROOT, adapter, prompt, forcedId, game, buffer, spec, model, mock, at }) {
  const A = ADAPTERS[adapter];
  if (!A) return { ok: false, error: `未知适配器: ${adapter}` };
  const slug = (forcedId ?? prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'asset';
  const id = forcedId ?? `ai/${adapter}/${slug}`;
  const finalRel = `ai/${adapter}/${slug}.${A.ext}`;
  const base = `${adapter}-${slug}.${A.ext}`;
  const loc = locations(root, game);
  const pendingAbs = join(loc.pendingDir, base);
  mkdirSync(dirname(pendingAbs), { recursive: true });
  writeFileSync(pendingAbs, buffer);
  const entry = buildEntry({ adapter, prompt, id, kind: A.kind, spec, model, license: A.license, mock, servedPath: loc.finalServed(finalRel), at });
  const scope = game ? `game:${game}` : 'shelf';
  const pendingEntry = { ...entry, previewPath: loc.pendingServed(base), pendingFile: base, finalRel, scope };
  const man = readPendingManifest(loc.pendingFile);
  const prev = man.pending.find((e) => e.id === id);
  if (prev && prev.pendingFile && prev.pendingFile !== base) rmSync(join(loc.pendingDir, prev.pendingFile), { force: true }); // 重生成覆盖旧待审文件
  const byId = new Map(man.pending.map((e) => [e.id, e]));
  byId.set(id, pendingEntry);
  writeJsonFile(loc.pendingFile, { version: 1, pending: [...byId.values()].sort(byIdCmp) });
  return { ok: true, id, type: A.kind, mock: !!mock, pending: true, previewPath: pendingEntry.previewPath, scope, entry: pendingEntry };
}

// 列待审项（endpoint/UI/smoke 用）。
export function listPending({ root = ROOT, game = null } = {}) {
  return readPendingManifest(locations(root, game).pendingFile).pending;
}

// 人审：approve=provenance 硬校验过 → 移文件出待审 + 登记 index + 清待审项；reject=删待审文件 + 清项。
export function reviewPending({ root = ROOT, id, action, game = null }) {
  const loc = locations(root, game);
  const man = readPendingManifest(loc.pendingFile);
  const i = man.pending.findIndex((e) => e.id === id);
  if (i < 0) return { ok: false, error: `待审项不存在: ${id}` };
  const pe = man.pending[i];
  const pendingAbs = join(loc.pendingDir, pe.pendingFile);
  if (action === 'reject') {
    rmSync(pendingAbs, { force: true });
    man.pending.splice(i, 1);
    writeJsonFile(loc.pendingFile, { version: 1, pending: man.pending });
    return { ok: true, action: 'reject', id };
  }
  if (action === 'approve') {
    const { previewPath, pendingFile, finalRel, scope, ...entry } = pe; // 剥掉审门机制字段 → 干净 index 条目
    const missing = provenanceMissing(entry);
    if (missing.length) return { ok: false, error: `provenance 缺字段，拒绝登记: ${missing.join('/')}（宪法硬校验）` };
    if (!existsSync(pendingAbs)) return { ok: false, error: `待审文件已丢失: ${pe.pendingFile}` };
    const finalAbs = join(loc.finalDir, finalRel);
    mkdirSync(dirname(finalAbs), { recursive: true });
    writeFileSync(finalAbs, readFileSync(pendingAbs)); // 移：拷进最终位再删待审（同树 rename 亦可·此写法跨 fs 稳）
    rmSync(pendingAbs, { force: true });
    const index = readIndexFile(loc.indexFile);
    const byId = new Map(index.assets.map((a) => [a.id, a]));
    byId.set(entry.id, entry);
    writeJsonFile(loc.indexFile, { version: index.version ?? 1, assets: [...byId.values()].sort(byIdCmp) });
    man.pending.splice(i, 1);
    writeJsonFile(loc.pendingFile, { version: 1, pending: man.pending });
    return { ok: true, action: 'approve', id, servedPath: entry.path, type: entry.type, scope };
  }
  return { ok: false, error: `未知 action: ${action}（approve|reject）` };
}

// 设置视图（可被 server /api 或 UI 复用）：列出各生成 provider 的 envKey + 是否已配 key（打码·绝不回明文）。
export function providerSettings(env = process.env) {
  const mask = (k) => (k ? k.slice(0, 3) + '***' + k.slice(-4) : '');
  return Object.entries(ADAPTERS).map(([id, a]) => ({
    id, kind: a.kind, license: a.license, envKey: a.envKey,
    keyConfigured: !!env[a.envKey], apiKeyMasked: mask(env[a.envKey]),
  }));
}

// 一键自测：两个适配器各 mock 生成一个到临时目录 → 打印落库条目 → 跑完自动清理（零仓库污染·零网络）。
export async function demo(env = process.env) {
  const dir = join(tmpdir(), 'zerocraft-ai-gen-demo');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const out = [];
  try {
    for (const [name, prompt] of [['tripo', 'a wooden treasure chest'], ['qwen', 'pixel fire sword icon']]) {
      const A = ADAPTERS[name];
      const g = await A.generate(prompt, { mock: true, apiKey: env[A.envKey] });
      const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
      const file = join(dir, `${name}-${slug}.${A.ext}`); writeFileSync(file, g.buffer);
      const entry = buildEntry({ adapter: name, prompt, id: `ai/${name}/${slug}`, kind: A.kind, spec: g.spec, model: g.model, license: A.license, mock: g.mock, servedPath: `ai/${name}/${slug}.${A.ext}`, at: '' });
      out.push({ file, bytes: g.buffer.length, entry });
      console.log(`✓ ${name} mock → ${file} (${g.buffer.length} 字节)  条目 id=${entry.id} type=${entry.type}`);
    }
    console.log('\n待审条目（人审 approve 后 upsert 进 index.json 的正是这个 shape）：');
    console.log(JSON.stringify(out.map((o) => o.entry), null, 2));
    console.log('\n设置视图 providers（key 打码·绝不回明文）：');
    console.log(JSON.stringify(providerSettings(env), null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n已清理临时目录 ${dir}（自测无副作用·未碰仓库文件）`);
  }
  return out;
}

async function run(argv) {
  const adapterName = argv[0];
  if (adapterName === 'demo') { await demo(); return; }
  if (adapterName === 'providers') { console.log(JSON.stringify(providerSettings(), null, 2)); return; }
  // 待审列表：node scripts/ai-gen.mjs pending [--game <g>]
  if (adapterName === 'pending') {
    const gi = argv.indexOf('--game'); const game = gi >= 0 ? argv[gi + 1] : null;
    console.log(JSON.stringify({ pending: listPending({ game }) }));
    return;
  }
  // 游戏封面/图标（表现资产·非美术台账·不过人审门——它替换的是「我的游戏库」卡片外观，不是 manifest 引用的美术）：
  //   node scripts/ai-gen.mjs cover <slug> "<prompt>" [--mock] [--json] → 写 public/games/<slug>/cover.png
  if (adapterName === 'cover') {
    const slug = argv[1];
    const asJson = argv.includes('--json');
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.error('cover: 需要合法 slug'); process.exit(1); }
    const mock = argv.includes('--mock');
    const prompt = argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
    if (!prompt) { console.error('cover: 缺 prompt'); process.exit(1); }
    const A = ADAPTERS.qwen; // 2D 文生图（seedance/nano-banana 适配器待接·当前走 qwen 或 mock 兜底）
    const apiKey = process.env[A.envKey];
    if (!mock && !apiKey) console.warn(`⚠ 未设 ${A.envKey}，改走 mock（真调需 key + 放宽网络）`);
    const g = await A.generate(prompt, { mock, apiKey });
    const rel = `public/games/${slug}/cover.png`;
    const abs = join(ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, g.buffer);
    const res = { ok: true, slug, coverPath: rel, coverUrl: `/games/${slug}/cover.png`, mock: !!g.mock, model: g.model };
    if (asJson) console.log(JSON.stringify(res));
    else console.log(`✓ 封面 → ${rel}${g.mock ? ' (mock)' : ''}·卡片外观即用（刷新看到）`);
    return;
  }
  // 人审：node scripts/ai-gen.mjs review <id> <approve|reject> [--game <g>] [--json]
  if (adapterName === 'review') {
    const id = argv[1]; const action = argv[2];
    const gi = argv.indexOf('--game'); const game = gi >= 0 ? argv[gi + 1] : null;
    const asJson = argv.includes('--json');
    const res = reviewPending({ id, action, game });
    if (asJson) console.log(JSON.stringify(res));
    else console.log(res.ok ? `✓ ${action} ${id}${res.servedPath ? ' → ' + res.servedPath : ''}` : `✕ ${res.error}`);
    if (!res.ok) process.exit(1);
    return;
  }
  const A = ADAPTERS[adapterName];
  if (!A) { console.error(`用法: node scripts/ai-gen.mjs <${Object.keys(ADAPTERS).join('|')}|providers> "<prompt>" [--game <g>] [--id <id>] [--mock]`); process.exit(1); }
  const mock = argv.includes('--mock');
  const asJson = argv.includes('--json'); // 机读：后端/UI 解析用（打印一行 JSON，压过人读行）
  const gi = argv.indexOf('--game'), game = gi >= 0 ? argv[gi + 1] : null;
  const ii = argv.indexOf('--id'), forcedId = ii >= 0 ? argv[ii + 1] : null;
  const prompt = argv.slice(1).filter((a, i) => !a.startsWith('--') && argv[i] !== '--game' && argv[i] !== '--id').join(' ').trim();
  if (!prompt) { console.error('缺 prompt'); process.exit(1); }
  const apiKey = process.env[A.envKey];
  if (!mock && !apiKey) console.warn(`⚠ 未设 ${A.envKey}，改走 mock（真调需 key + 放宽网络）`);

  const g = await A.generate(prompt, { mock, apiKey });
  // 人审门（M2.5）：生成产物落**待审区**，绝不直写 index.json。人经 /api/assets/review approve 才入库。
  const res = writePending({ adapter: adapterName, prompt, forcedId, game, buffer: g.buffer, spec: g.spec, model: g.model, mock: g.mock, at: new Date().toISOString() });
  if (asJson) { console.log(JSON.stringify(res)); return; }
  console.log(`✓ 生成 ${res.id}${g.mock ? ' (mock)' : ''} → 待审区（人点「入库」才登记）· 预览 ${res.previewPath}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) run(process.argv.slice(2));
