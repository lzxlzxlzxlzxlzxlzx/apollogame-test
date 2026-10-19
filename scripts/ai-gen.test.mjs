// AI 资产生成框架自检（mock 路径·无网络）：两个适配器产合法资产 + buildEntry 带 provenance。
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADAPTERS, buildEntry, mockImage, encodePng, providerSettings, demo, writePending, stagePendingAsset, reviewPending, listPending, locations, provenanceMissing, validateTextureCandidate, seedreamRequest, gptImageRequest, resizePngExact, curlFor, fetchRetry } from './ai-gen.mjs';

describe('fetchRetry 连接层重试（owner 2026-07-27「第一次连不上·第二次连上」·疑代理冷启动）', () => {
  it('首次连接失败·重试后成功（只重试 fetch 抛错）', async () => {
    const orig = globalThis.fetch; let n = 0;
    globalThis.fetch = async () => { n++; if (n < 2) throw new TypeError('fetch failed'); return { ok: true, status: 200 }; };
    try { const r = await fetchRetry('http://x', {}, { tries: 3, baseDelay: 0 }); expect(n).toBe(2); expect(r.status).toBe(200); }
    finally { globalThis.fetch = orig; }
  });
  it('始终失败 → 抛最后一个错（不吞·上层据此分诊）', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    try { await expect(fetchRetry('http://x', {}, { tries: 2, baseDelay: 0 })).rejects.toThrow('fetch failed'); }
    finally { globalThis.fetch = orig; }
  });
});

describe('ai-gen 框架 · 适配器注册表', () => {
  it('注册了 tripo·meshy(3D) + qwen·gpt-image·seedream(2D)，各带 kind/envKey/license', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual(['gpt-image', 'meshy', 'qwen', 'seedream', 'tripo']);
    expect(ADAPTERS.tripo).toMatchObject({ kind: 'mesh', ext: 'glb', envKey: 'TRIPO_API_KEY' });
    expect(ADAPTERS.meshy).toMatchObject({ kind: 'mesh', ext: 'glb', envKey: 'MESHY_API_KEY' });
    expect(ADAPTERS.qwen).toMatchObject({ kind: 'texture', ext: 'png', envKey: 'DASHSCOPE_API_KEY' });
    expect(ADAPTERS['gpt-image']).toMatchObject({ kind: 'texture', ext: 'png', envKey: 'OPENAI_API_KEY', model: 'gpt-image-2' });
    expect(ADAPTERS.seedream).toMatchObject({ kind: 'texture', ext: 'png', envKey: 'ARK_API_KEY' });
  });
});

describe('ai-gen · debug 回显（owner「知道我到底传了什么」）', () => {
  it('seedreamRequest：body 全字段可回显·无密钥（key 走 header 不进 body）', () => {
    const req = seedreamRequest('a red button, isolated subject, transparent background', { model: 'doubao-seedream-5-0-pro-260628', size: '1024x384' });
    expect(req.endpoint).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ model: 'doubao-seedream-5-0-pro-260628', prompt: 'a red button, isolated subject, transparent background', size: '1024x384', response_format: 'url', watermark: false });
    expect(JSON.stringify(req)).not.toMatch(/Bearer|apiKey|ARK_API_KEY=/); // 无密钥泄漏
  });

  it('curlFor：可复制命令行·key 用 $ENV 占位（绝不落真值）', () => {
    const req = seedreamRequest('x', { model: 'm', size: '2K' });
    const curl = curlFor(req, 'ARK_API_KEY');
    expect(curl).toContain(`curl -X POST 'https://ark.cn-beijing.volces.com/api/v3/images/generations'`);
    expect(curl).toContain(`Authorization: Bearer $ARK_API_KEY`); // 占位·非真 key
    expect(curl).toContain('"watermark":false');
    expect(curl).not.toMatch(/ark-[0-9a-f]/); // 不含真 key 形态
  });

  it('seedream 适配器：mock 也返回 request（免花 key 就能核对本该发什么）+ 尊重 opts.size', async () => {
    const g = await ADAPTERS.seedream.generate('a button', { mock: true, size: '1024x384' });
    expect(g.mock).toBe(true);
    expect(g.request).toBeTruthy();
    expect(g.request.size).toBe('1024x384'); // 传入尺寸生效（非硬编码 2K）
    expect(g.request.body.prompt).toBe('a button');
  });

  it('gptImageRequest：官方 Image endpoint、模型/透明度/方向显式且无密钥', () => {
    const request = gptImageRequest('pixel demon queen, no text', { width: 32, height: 48, alpha: 'transparent' });
    expect(request).toEqual({
      provider: 'gpt-image', endpoint: 'https://api.openai.com/v1/images/generations', method: 'POST', model: 'gpt-image-2',
      body: { model: 'gpt-image-2', prompt: 'pixel demon queen, no text', size: '1024x1536', quality: 'medium', background: 'transparent', output_format: 'png' },
    });
    expect(JSON.stringify(request)).not.toMatch(/OPENAI_API_KEY|Bearer|sk-/);
  });

  it('gpt-image requires explicit real permission and key, then decodes base64 PNG without leaking the key', async () => {
    await expect(ADAPTERS['gpt-image'].generate('x', { mock: false, apiKey: 'sk-test' })).rejects.toThrow('explicit allowRealProvider');
    await expect(ADAPTERS['gpt-image'].generate('x', { mock: false, allowRealProvider: true })).rejects.toThrow('OPENAI_API_KEY');
    const original = globalThis.fetch;
    const source = mockImage('remote-gpt', 64, 64, 'transparent').buffer;
    let captured;
    globalThis.fetch = async (_url, options) => {
      captured = options;
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: source.toString('base64') }] }) };
    };
    try {
      const generated = await ADAPTERS['gpt-image'].generate('x', { mock: false, allowRealProvider: true, apiKey: 'sk-test-secret', width: 32, height: 48, alpha: 'transparent' });
      expect(generated).toMatchObject({ model: 'gpt-image-2', mock: false, request: { provider: 'gpt-image' } });
      expect(generated.buffer).toEqual(source);
      expect(JSON.stringify(generated.request)).not.toContain('sk-test-secret');
      expect(captured.headers.authorization).toBe('Bearer sk-test-secret');
      expect(JSON.stringify(JSON.parse(captured.body))).not.toContain('sk-test-secret');
    } finally { globalThis.fetch = original; }
  });

  it('gpt-image reports only HTTP status even when the provider error payload echoes the key', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'sk-openai-supersecret-1234', message: 'Bearer sk-openai-supersecret-1234' } }) });
    try {
      const attempt = ADAPTERS['gpt-image'].generate('x', { mock: false, allowRealProvider: true, apiKey: 'sk-openai-supersecret-1234' });
      await expect(attempt).rejects.toThrow(/^gpt-image: HTTP 401$/);
    } finally { globalThis.fetch = original; }
  });

  it('exact PNG resize preserves the slot alpha contract', () => {
    const resized = resizePngExact(mockImage('large-alpha', 64, 96, 'transparent').buffer, 32, 48);
    const entry = { type: 'texture', path: 'x.png', spec: { width: 32, height: 48, transparent: true } };
    expect(resized.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(validateTextureCandidate(entry, resized)).toEqual([]);
  });
});

describe('ai-gen 框架 · mock 生成产合法资产', () => {
  it('tripo mock → 合法 glb（magic + spec）', async () => {
    const g = await ADAPTERS.tripo.generate('a wooden chair', { mock: true });
    expect(g.mock).toBe(true);
    expect(g.buffer.length).toBeGreaterThan(20);
    expect(g.buffer.readUInt32LE(0)).toBe(0x46546c67); // glTF magic
    expect(g.spec).toMatchObject({ scale: 1, genCollision: 'hull' });
  });

  it('meshy mock → 合法 glb（magic + spec·model 标 meshy-mock）', async () => {
    const g = await ADAPTERS.meshy.generate('a stone golem', { mock: true });
    expect(g.mock).toBe(true);
    expect(g.buffer.readUInt32LE(0)).toBe(0x46546c67); // glTF magic
    expect(g.model).toBe('meshy-mock');
    expect(g.spec).toMatchObject({ scale: 1, genCollision: 'hull' });
  });

  it('qwen mock → 合法 png，且 prompt 播种（不同词不同图）', async () => {
    const a = await ADAPTERS.qwen.generate('red pixel sword', { mock: true });
    expect(a.mock).toBe(true);
    expect(a.buffer.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG 签名
    expect(a.spec).toMatchObject({ format: 'png', usage: 'sprite' });
    const b = await ADAPTERS.qwen.generate('blue round shield', { mock: true });
    expect(b.buffer.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(a.buffer.equals(b.buffer)).toBe(false);
  });

  it('gpt-image mock → 精确槽位 PNG 并保留显式模型/provenance 输入', async () => {
    const generated = await ADAPTERS['gpt-image'].generate('demon castle icon', { mock: true, width: 32, height: 48, alpha: 'transparent' });
    expect(generated).toMatchObject({ model: 'gpt-image-2-mock', mock: true, spec: { width: 32, height: 48, transparent: true } });
    expect(generated.request.body).toMatchObject({ model: 'gpt-image-2', background: 'transparent', output_format: 'png' });
  });

  it('seedream mock → 合法 png·prompt 播种·model 标 seedream-mock（真调需 ARK_API_KEY+网络）', async () => {
    const a = await ADAPTERS.seedream.generate('ink wash koi', { mock: true });
    expect(a.buffer.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(a.model).toBe('seedream-mock');
    expect(a.mock).toBe(true);
    expect(a.spec).toMatchObject({ format: 'png', usage: 'sprite' });
    const b = await ADAPTERS.seedream.generate('golden dragon', { mock: true });
    expect(a.buffer.equals(b.buffer)).toBe(false); // prompt 播种
    // 缺 key 非 mock → 回退 mock（不炸）
    const c = await ADAPTERS.seedream.generate('x', { mock: false, apiKey: undefined });
    expect(c.mock).toBe(true);
    expect(Buffer.compare(a.buffer, b.buffer)).not.toBe(0); // 不同 prompt → 不同 mock 图
  });

  it('缺 key 且非 mock → 回退 mock（不炸·真调需 key+网络）', async () => {
    const g = await ADAPTERS.tripo.generate('x', { mock: false, apiKey: undefined });
    expect(g.mock).toBe(true);
  });

  it('encodePng/mockImage：纯 Node PNG 可解码', () => {
    const { buffer, w, h } = mockImage('hello', 32);
    expect(w).toBe(32); expect(h).toBe(32);
    expect(buffer.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(encodePng(2, 2, Buffer.alloc(2 * 2 * 3)).slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});

describe('ai-gen 框架 · 落库条目（连资产索引这个"数据库"）', () => {
  it('buildEntry 带 provenance（generator/prompt/mock）+ 正确类型/许可', () => {
    const e = buildEntry({ adapter: 'tripo', prompt: 'a chair', id: 'ai/tripo/a-chair', kind: 'mesh', spec: { scale: 1, genCollision: 'hull' }, model: 'tripo-mock', license: 'Tripo (按订阅商用授权)', mock: true, servedPath: '/games/game-z/art/ai/tripo/a-chair.glb', at: '2026-07-04T00:00:00Z' });
    expect(e).toMatchObject({ id: 'ai/tripo/a-chair', type: 'mesh', status: 'filled', source: 'ai:tripo' });
    expect(e.provenance).toMatchObject({ generator: 'tripo', prompt: 'a chair', mock: true });
    expect(e.tags).toContain('ai-gen'); expect(e.tags).toContain('mock');
  });
  it('qwen 图 → texture/ai-gen 类', () => {
    const e = buildEntry({ adapter: 'qwen', prompt: 'sword', id: 'ai/qwen/sword', kind: 'texture', spec: { format: 'png', width: 128, height: 128, usage: 'sprite' }, model: 'wanx-mock', license: 'Qwen/DashScope', mock: true, servedPath: 'ai/qwen/sword.png', at: '' });
    expect(e).toMatchObject({ type: 'texture', category: 'ai-gen', source: 'ai:qwen' });
  });
});

describe('ai-gen 框架 · 一键自测 demo（临时目录·跑完清理·零仓库污染）', () => {
  it('demo 两适配器各产一个合法条目（tripo→mesh · qwen→texture），产物字节 > 0', async () => {
    const out = await demo({ TRIPO_API_KEY: '', DASHSCOPE_API_KEY: '' });
    expect(out.map((o) => o.entry.type)).toEqual(['mesh', 'texture']);
    expect(out.every((o) => o.bytes > 0)).toBe(true);
    expect(out[0].entry.provenance.mock).toBe(true);
    // 临时文件已被清理（finally rmSync）——不残留、不碰仓库
    expect(existsSync(out[0].file)).toBe(false);
    expect(existsSync(out[1].file)).toBe(false);
  });
});

describe('ai-gen 框架 · 设置视图（开放 key 配置·打码不回明文）', () => {
  it('providerSettings 列出 envKey + 是否已配 + 打码', () => {
    const s = providerSettings({ TRIPO_API_KEY: 'tk-abcdef1234567890', DASHSCOPE_API_KEY: '', OPENAI_API_KEY: 'sk-openai-secret-1234' });
    const tripo = s.find((p) => p.id === 'tripo');
    expect(tripo).toMatchObject({ envKey: 'TRIPO_API_KEY', keyConfigured: true });
    expect(tripo.apiKeyMasked).toBe('tk-***7890'); // 前3***尾4·绝不回明文
    expect(tripo.apiKeyMasked).not.toContain('abcdef');
    expect(s.find((p) => p.id === 'qwen')).toMatchObject({ keyConfigured: false, apiKeyMasked: '' });
    expect(s.find((p) => p.id === 'gpt-image')).toMatchObject({ envKey: 'OPENAI_API_KEY', model: 'gpt-image-2', keyConfigured: true, apiKeyMasked: 'configured' });
    expect(JSON.stringify(s)).not.toContain('openai-secret');
  });
});

// ── 人审门（M2.5·REQ-ART）：生成落待审区 → approve 才登记 index；provenance 硬校验 ──
describe('ai-gen 框架 · 人审门（待审区 + approve/reject·provenance 硬校验）', () => {
  const withRoot = (fn) => {
    const root = mkdtempSync(join(tmpdir(), 'aigen-review-'));
    try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const genOne = (root, { adapter = 'qwen', prompt = 'red pixel sword', game, model = 'wanx-mock' } = {}) => {
    const { buffer } = mockImage(prompt, 32);
    return writePending({ root, adapter, prompt, game, buffer, spec: { format: 'png' }, model, mock: true, at: '2026-07-06T00:00:00Z' });
  };

  it('生成落待审区：写 pending.json + 预览 URL，且**绝不**进 index.json', () => withRoot((root) => {
    const w = genOne(root);
    expect(w.ok).toBe(true);
    expect(w.pending).toBe(true);
    expect(w.previewPath).toBe('/assets/ai/pending/qwen-red-pixel-sword.png');
    expect(listPending({ root })).toHaveLength(1);
    // 宪法：生成即登记必须已消灭 —— index 文件此刻还不存在
    expect(existsSync(locations(root, null).indexFile)).toBe(false);
  }));

  it('approve：provenance 全 → 移出待审 + 登记 index（干净条目·无审门机制字段泄漏）+ 清待审', () => withRoot((root) => {
    const w = genOne(root);
    const r = reviewPending({ root, id: w.id, action: 'approve' });
    expect(r).toMatchObject({ ok: true, action: 'approve', id: w.id });
    const idx = JSON.parse(readFileSync(locations(root, null).indexFile, 'utf8'));
    const e = idx.assets.find((a) => a.id === w.id);
    expect(e).toBeTruthy();
    expect(e.provenance).toMatchObject({ generator: 'qwen', prompt: 'red pixel sword', model: 'wanx-mock' });
    expect(e).not.toHaveProperty('previewPath'); // 机制字段不泄漏进 index
    expect(e).not.toHaveProperty('pendingFile');
    expect(e).not.toHaveProperty('finalRel');
    expect(listPending({ root })).toHaveLength(0); // 待审清空
  }));

  it('reject：删待审文件 + 清项，且**不**登记 index', () => withRoot((root) => {
    const w = genOne(root, { prompt: 'discard me' });
    const r = reviewPending({ root, id: w.id, action: 'reject' });
    expect(r).toMatchObject({ ok: true, action: 'reject' });
    expect(listPending({ root })).toHaveLength(0);
    expect(existsSync(locations(root, null).indexFile)).toBe(false); // 从未入库
  }));

  it('provenance 硬校验：缺 model → approve 被拒、条目留在待审（不误登记）', () => withRoot((root) => {
    const w = genOne(root, { prompt: 'no model', model: '' });
    const r = reviewPending({ root, id: w.id, action: 'approve' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('provenance');
    expect(r.error).toContain('model');
    expect(listPending({ root })).toHaveLength(1); // 拒登记后仍在待审，可弃置或修
  }));

  it('provenanceMissing 逐字段（model/prompt/date/license 缺一即列出）', () => {
    expect(provenanceMissing({ license: 'x', provenance: { model: 'm', prompt: 'p', generatedAt: 'd' } })).toEqual([]);
    expect(provenanceMissing({ provenance: {} })).toEqual(['model', 'prompt', 'date', 'license']);
  });

  it('游戏本地落点：pending/最终位在 public/games/<g>/art 下，approve 后进本地 index（站点绝对 path）', () => withRoot((root) => {
    const w = genOne(root, { game: 'game-z', prompt: 'local tex' });
    expect(w.scope).toBe('game:game-z');
    expect(w.previewPath).toBe('/games/game-z/art/ai/pending/qwen-local-tex.png');
    const r = reviewPending({ root, id: w.id, action: 'approve', game: 'game-z' });
    expect(r.ok).toBe(true);
    const idx = JSON.parse(readFileSync(locations(root, 'game-z').indexFile, 'utf8'));
    const e = idx.assets.find((a) => a.id === w.id);
    expect(e.path).toBe('/games/game-z/art/ai/tripo/local-tex.png'.replace('tripo', 'qwen'));
  }));

  it('art-replace 共用 pending 审门：审前 index 不存在，approve 才登记 hash/人审证据并回填台账', () => withRoot((root) => {
    const loc = locations(root, 'game-z'); mkdirSync(loc.finalDir, { recursive: true });
    writeFileSync(join(loc.finalDir, 'art-ledger.json'), JSON.stringify({ version: 1, rows: [{ no: 'art-01', skinKey: 'art:hero', status: 'placeholder', gen: null }] }));
    const entry = { id: 'art:hero', type: 'texture', status: 'filled', path: '/games/game-z/art/gen/art-01.png', description: 'candidate', license: 'CC0', spec: { usage: 'sprite', colorSpace: 'srgb', width: 32, height: 32, transparent: false }, provenance: { generator: 'test', model: 'm', prompt: 'p', generatedAt: '2026-10-09' } };
    stagePendingAsset({ root, game: 'game-z', entry, buffer: mockImage('candidate', 32).buffer, finalRel: 'gen/art-01.png', pendingFile: 'art-replace-art-01.png', workflow: { kind: 'art-replace', rowNo: 'art-01' } });
    expect(existsSync(loc.indexFile)).toBe(false);
    expect(reviewPending({ root, game: 'game-z', id: 'art:hero', action: 'approve', reviewedBy: 'owner' }).ok).toBe(true);
    const approved = JSON.parse(readFileSync(loc.indexFile, 'utf8')).assets[0];
    expect(approved.provenance).toMatchObject({ reviewedBy: 'owner' }); expect(approved.provenance.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const row = JSON.parse(readFileSync(join(loc.finalDir, 'art-ledger.json'), 'utf8')).rows[0];
    expect(row).toMatchObject({ status: 'approved', gen: { localId: 'art:hero', pending: false }, provenance: { reviewedBy: 'owner' } });
  }));

  it('approve fail-closed when PNG bytes violate outputPx/alpha metadata', () => withRoot((root) => {
    const buffer = mockImage('opaque-32', 32).buffer;
    const entry = { id: 'art:bad', type: 'texture', status: 'filled', path: '/games/game-z/art/gen/bad.png', description: 'bad', license: 'CC0', spec: { usage: 'sprite', colorSpace: 'srgb', width: 64, height: 32, transparent: true }, provenance: { generator: 'test', model: 'm', prompt: 'p', generatedAt: '2026-10-09' } };
    stagePendingAsset({ root, game: 'game-z', entry, buffer, finalRel: 'gen/bad.png' });
    const result = reviewPending({ root, game: 'game-z', id: 'art:bad', action: 'approve' });
    expect(result).toMatchObject({ ok: false }); expect(result.error).toContain('width:32!=64'); expect(result.error).toContain('alpha:opaque!=transparent');
    expect(listPending({ root, game: 'game-z' })).toHaveLength(1); expect(existsSync(locations(root, 'game-z').indexFile)).toBe(false);
  }));

  it('未知待审项 approve/reject → ok:false（不炸）', () => withRoot((root) => {
    expect(reviewPending({ root, id: 'ai/qwen/nope', action: 'approve' }).ok).toBe(false);
    expect(reviewPending({ root, id: 'ai/qwen/nope', action: 'reject' }).ok).toBe(false);
  }));
});
