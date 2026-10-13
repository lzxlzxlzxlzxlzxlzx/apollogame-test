import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseAssetIndex,
  pendingAssets,
  filledAssets,
  filledSrc,
  registerAssetIndex,
  ASSET_TYPES,
  deriveColorSpace,
  textureSpecOf,
  buildMaterialCatalog,
} from './asset-index.js';
import { AssetManager, StubAssetLoader } from './asset-manager.js';
import { registerTextureGenerator, unregisterTextureGeneratorForTest } from './texture-generators.js';

const good = {
  version: 1,
  assets: [
    { id: 'bg.office', type: 'texture', description: '办公室', status: 'tbf', spec: { width: 1280, height: 720 } },
    { id: 'char_S.neutral', type: 'texture', description: '立绘S', status: 'filled', path: 'texture/char_S/neutral.png', spec: { width: 720, height: 1280 } },
    { id: 'bgm.daily', type: 'sound', description: '日常BGM', status: 'tbf' },
  ],
};

describe('asset-index — 校验', () => {
  it('解析合法索引', () => {
    const idx = parseAssetIndex(good);
    expect(idx.version).toBe(1);
    expect(idx.assets).toHaveLength(3);
  });

  it('拒绝重复 id', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [
        { id: 'x', type: 'texture', description: 'a', status: 'tbf' },
        { id: 'x', type: 'texture', description: 'b', status: 'tbf' },
      ] }),
    ).toThrow(/重复/);
  });

  it('拒绝非法 type', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'blob', description: 'a', status: 'tbf' }] }),
    ).toThrow(/type 非法/);
  });

  it('filled 缺 path 报错', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'a', status: 'filled' }] }),
    ).toThrow(/缺 path/);
  });

  it('拒绝非法 status', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'a', status: 'approved' }] }),
    ).toThrow(/status/);
  });
});

describe('asset-index — 预烘焙 hit-mask', () => {
  const texture = { id: 'suspect.png', type: 'texture', description: '图像', status: 'filled', path: 'suspect.png', spec: { width: 4, height: 2 } };
  const entry = { id: 'suspect.mask', type: 'hit-mask', description: '嫌疑人轮廓', status: 'filled',
    spec: { version: 1, width: 4, height: 2, threshold: 127, sourceTextureKey: 'suspect.png', rows: ['1001', '0110'] } };
  it('合法二值数据免 path，且不注册为渲染资源', () => {
    const index = parseAssetIndex({ version: 1, assets: [texture, entry] });
    const manager = new AssetManager(new StubAssetLoader());
    registerAssetIndex(manager, index);
    expect(manager.has('suspect.mask')).toBe(false);
  });
  it.each([
    { version: 2 }, { width: 3 }, { threshold: 256 }, { rows: ['1001', '01x0'] },
  ])('非法版本/尺寸/阈值/位数据拒收：%j', (change) => {
    expect(() => parseAssetIndex({ version: 1, assets: [texture, { ...entry, spec: { ...entry.spec, ...change } }] })).toThrow(/hit-mask spec 非法|逻辑尺寸不符/);
  });
  it('path 不能夹带原始图像字节', () => {
    expect(() => parseAssetIndex({ version: 1, assets: [texture, { ...entry, path: 'suspect.png' }] })).toThrow(/不得有 path/);
  });
  it('源贴图缺失或尺寸不符拒收', () => {
    expect(() => parseAssetIndex({ version: 1, assets: [entry] })).toThrow(/sourceTextureKey/);
    expect(() => parseAssetIndex({ version: 1, assets: [{ ...texture, spec: { width: 5, height: 2 } }, entry] })).toThrow(/逻辑尺寸不符/);
  });
});

describe('asset-index — TBF 工作面', () => {
  it('pendingAssets 列出待填充', () => {
    const idx = parseAssetIndex(good);
    expect(pendingAssets(idx).map((a) => a.id)).toEqual(['bg.office', 'bgm.daily']);
  });

  it('filledAssets 列出已填充', () => {
    const idx = parseAssetIndex(good);
    expect(filledAssets(idx).map((a) => a.id)).toEqual(['char_S.neutral']);
  });
});

describe('asset-index — 桥接 AssetManager', () => {
  it('只注册 filled 的 texture；tbf / 非 texture 不注册', async () => {
    const idx = parseAssetIndex(good);
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, idx, '/assets/');
    expect(m.has('char_S.neutral')).toBe(true); // filled texture
    expect(m.has('bg.office')).toBe(false); // tbf
    expect(m.has('bgm.daily')).toBe(false); // sound（暂不消费）
    const a = await m.load('char_S.neutral');
    expect(a.descriptor).toMatchObject({ kind: 'texture', key: 'char_S.neutral', src: '/assets/texture/char_S/neutral.png' });
    expect(a.width).toBe(720);
  });

  it('baseUrl 不以 / 结尾 → 防御性补斜杠（不拼成 texhero.png）', async () => {
    const idx = parseAssetIndex(good);
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, idx, '/assets'); // 注意：无尾斜杠
    const a = await m.load('char_S.neutral');
    expect(a.descriptor.src).toBe('/assets/texture/char_S/neutral.png'); // 正确补斜杠
  });

  it('baseUrl 为空 → 直接用 path（不画蛇添足加斜杠）', async () => {
    const idx = parseAssetIndex(good);
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, idx); // baseUrl 缺省 ''
    const a = await m.load('char_S.neutral');
    expect(a.descriptor.src).toBe('texture/char_S/neutral.png');
  });
});

describe('asset-index — v2 字段（资源库）', () => {
  it('category/tags/source/license/provenance 可选且校验类型', () => {
    const idx = parseAssetIndex({
      version: 1,
      assets: [{
        id: 'x', type: 'texture', description: 'a', status: 'tbf',
        category: 'icon.item', tags: ['sword', 'loot'], source: 'import', license: 'CC0',
        provenance: { method: 'import-loose', originalFile: 'Sword.PNG' },
      }],
    });
    expect(idx.assets[0]).toMatchObject({ category: 'icon.item', source: 'import', license: 'CC0' });
    expect(idx.assets[0].tags).toEqual(['sword', 'loot']);
  });

  it('tags 非字符串数组 → 报错；font 是合法类型', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'a', status: 'tbf', tags: [1] }] }),
    ).toThrow(/tags/);
    const idx = parseAssetIndex({ version: 1, assets: [{ id: 'f', type: 'font', description: '字体', status: 'tbf' }] });
    expect(idx.assets[0].type).toBe('font');
  });

  it('spec.sheet → 注册成 sprite-sheet（导入器·精灵表切割的运行时消费）', async () => {
    const idx = parseAssetIndex({
      version: 1,
      assets: [{
        id: 'hero.sheet', type: 'texture', description: '精灵表', status: 'filled',
        path: 'texture/sheet/hero.png',
        spec: { sheet: { frameWidth: 48, frameHeight: 64, columns: 16, count: 32 } },
      }],
    });
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, idx, '/assets/');
    const a = await m.load('hero.sheet');
    expect(a.descriptor).toMatchObject({ kind: 'sprite-sheet', frameWidth: 48, frameHeight: 64, columns: 16, count: 32 });
    const frame = m.resolve('hero.sheet', 17); // 第 17 帧 → 第二行第 2 列
    expect(frame).toMatchObject({ sx: 48, sy: 64, sw: 48, sh: 64 });
  });
});

describe('asset-index — spec 闭集 schema（REQ-Resource ③）', () => {
  it('deriveColorSpace：颜色类→srgb·数据类→linear', () => {
    expect(deriveColorSpace('albedo')).toBe('srgb');
    expect(deriveColorSpace('emissive')).toBe('srgb');
    expect(deriveColorSpace('sprite')).toBe('srgb');
    expect(deriveColorSpace(undefined)).toBe('srgb'); // 缺省 sprite→srgb（向后兼容）
    expect(deriveColorSpace('normal')).toBe('linear');
    expect(deriveColorSpace('roughness')).toBe('linear');
    expect(deriveColorSpace('metalness')).toBe('linear');
    expect(deriveColorSpace('ao')).toBe('linear');
    expect(deriveColorSpace('orm')).toBe('linear');
  });

  it('textureSpecOf：colorSpace 缺省按 usage 推·显式 colorSpace 覆盖', () => {
    expect(textureSpecOf({ usage: 'normal' }).colorSpace).toBe('linear');
    expect(textureSpecOf({ usage: 'albedo' }).colorSpace).toBe('srgb');
    expect(textureSpecOf({ usage: 'normal', colorSpace: 'srgb' }).colorSpace).toBe('srgb'); // 显式覆盖
    expect(textureSpecOf(undefined).colorSpace).toBe('srgb');
  });

  it('非法 usage / colorSpace / wrap 构建期抛错', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'a', status: 'tbf', spec: { usage: 'bogus' } }] }),
    ).toThrow(/usage 非法/);
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'a', status: 'tbf', spec: { colorSpace: 'gamma' } }] }),
    ).toThrow(/colorSpace 非法/);
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'a', status: 'tbf', spec: { wrap: 'mirror' } }] }),
    ).toThrow(/wrap 非法/);
  });

  it('非法 mesh.genCollision 抛错·合法 mesh spec 通过', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'm', type: 'mesh', description: 'a', status: 'tbf', spec: { genCollision: 'sphere' } }] }),
    ).toThrow(/genCollision 非法/);
    const idx = parseAssetIndex({ version: 1, assets: [{ id: 'm', type: 'mesh', description: 'a', status: 'tbf', spec: { scale: 2, genCollision: 'box' } }] });
    expect(idx.assets[0].type).toBe('mesh');
  });

  it('旧 texture 条目（无 usage/colorSpace·带 freeform format）照常通过（向后兼容）', () => {
    const idx = parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'a', status: 'tbf', spec: { format: 'png', width: 64, transparent: true } }] });
    expect(idx.assets).toHaveLength(1);
  });
});

describe('asset-index — 桥接 mesh + texture colorSpace（REQ-Resource ②）', () => {
  it('filled mesh → ModelDescriptor 注册（渲染线取字节）', async () => {
    const idx = parseAssetIndex({
      version: 1,
      assets: [
        { id: 'duck', type: 'mesh', description: '鸭子', status: 'filled', path: '/models/duck.glb' },
        { id: 'wip', type: 'mesh', description: '未填', status: 'tbf' },
      ],
    });
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, idx); // path 已绝对 → baseUrl ''
    expect(m.has('duck')).toBe(true);
    expect(m.has('wip')).toBe(false); // tbf 不注册
    const a = await m.load('duck');
    expect(a.descriptor).toMatchObject({ kind: 'model', key: 'duck', src: '/models/duck.glb' });
  });

  it('texture 带 usage → 描述符 colorSpace 按用途派生（albedo=srgb·normal=linear）', async () => {
    const idx = parseAssetIndex({
      version: 1,
      assets: [
        { id: 'alb', type: 'texture', description: 'albedo', status: 'filled', path: '/t/a.png', spec: { usage: 'albedo', width: 256, height: 256 } },
        { id: 'nrm', type: 'texture', description: 'normal', status: 'filled', path: '/t/n.png', spec: { usage: 'normal', width: 256, height: 256 } },
      ],
    });
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, idx);
    const alb = await m.load('alb');
    const nrm = await m.load('nrm');
    expect(alb.descriptor).toMatchObject({ kind: 'texture', colorSpace: 'srgb' });
    expect(nrm.descriptor).toMatchObject({ kind: 'texture', colorSpace: 'linear' });
  });
});

describe('asset-index — 材质数据资产（REQ-Resource ④）', () => {
  it('material 免 path（数据型·filled 无文件）·buildMaterialCatalog 提取 spec', () => {
    const idx = parseAssetIndex({
      version: 1,
      assets: [
        { id: 'mat/wood', type: 'material', description: '木材质', status: 'filled', spec: { preset: 'wood', map: 'tex/alb', normalMap: 'tex/nrm' } },
        { id: 'mat/tbf', type: 'material', description: '未定', status: 'tbf' },
      ],
    });
    const cat = buildMaterialCatalog(idx);
    expect(cat.has('mat/wood')).toBe(true);
    expect(cat.has('mat/tbf')).toBe(false); // 未 filled 不入目录
    expect(cat.get('mat/wood')).toMatchObject({ preset: 'wood', map: 'tex/alb', normalMap: 'tex/nrm' });
  });

  it('buildMaterialCatalog 携新贴图槽 metalnessMap/emissiveMap/ormMap（REQ-3D ④）', () => {
    const idx = parseAssetIndex({ version: 1, assets: [
      { id: 'mat/metal', type: 'material', description: '金属', status: 'filled', spec: { preset: 'steel', metalnessMap: 'tex/m', emissiveMap: 'tex/e', ormMap: 'tex/orm' } },
    ] });
    expect(buildMaterialCatalog(idx).get('mat/metal')).toMatchObject({ metalnessMap: 'tex/m', emissiveMap: 'tex/e', ormMap: 'tex/orm' });
  });

  it('material 的非法 spec 类型（preset 非字符串）构建期抛错', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'm', type: 'material', description: 'a', status: 'filled', spec: { preset: 123 } }] }),
    ).toThrow(/preset 必须是字符串/);
  });

  it('registerAssetIndex 不把 material 注册进 AssetManager（数据型·不走加载）', () => {
    const idx = parseAssetIndex({ version: 1, assets: [{ id: 'mat/x', type: 'material', description: 'a', status: 'filled', spec: { preset: 'steel' } }] });
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, idx);
    expect(m.has('mat/x')).toBe(false); // 材质走 buildMaterialCatalog·不进 AssetManager
  });
});

describe('asset-index — filledSrc（skinKey/id → URL·背景皮肤槽解析口）', () => {
  const idx = parseAssetIndex({
    version: 1,
    assets: [
      { id: 'scene/bg-menu', type: 'texture', description: '菜单背景', status: 'filled', path: 'game-a/bg/menu.png' },
      { id: 'scene/bg-play', type: 'texture', description: '牌桌背景', status: 'tbf' },
      { id: 'scene/vec', type: 'texture', description: '矢量底纹', status: 'filled', spec: { generator: { name: 'checker', params: { a: '#000', b: '#fff' } } } },
    ],
  });

  it('filled + path：baseUrl 前缀正确拼接（补/去重）', () => {
    expect(filledSrc(idx, 'scene/bg-menu')).toBe('game-a/bg/menu.png');
    expect(filledSrc(idx, 'scene/bg-menu', '/assets')).toBe('/assets/game-a/bg/menu.png');
    expect(filledSrc(idx, 'scene/bg-menu', '/assets/')).toBe('/assets/game-a/bg/menu.png');
  });

  it('filled + generator：解析成 data-URI（矢量条目 generator 胜 path）', () => {
    registerTextureGenerator('checker', () => 'data:image/svg+xml,<svg/>');
    try {
      const src = filledSrc(idx, 'scene/vec');
      expect(src).toBeTruthy();
      expect(src?.startsWith('data:')).toBe(true);
    } finally {
      unregisterTextureGeneratorForTest('checker');
    }
  });

  it('tbf / 未找到 → null（消费方回退）', () => {
    expect(filledSrc(idx, 'scene/bg-play')).toBeNull(); // tbf
    expect(filledSrc(idx, 'does-not-exist')).toBeNull();
  });

  it('防御分支：filled 但既无 path 又无 generator（parseAssetIndex 不会产出·手造畸形入参）→ null', () => {
    const malformed = { version: 1, assets: [{ id: 'x', type: 'texture', description: '', status: 'filled' }] } as unknown as Parameters<typeof filledSrc>[0];
    expect(filledSrc(malformed, 'x')).toBeNull();
  });
});

describe('asset-index — 真实 assets/index.json 自检', () => {
  it('仓库里的 index.json 合法可解析', () => {
    // 运行时读取（不走静态 import）：index.json 已 ~2.9 万项/19MB，静态 import 会让 tsc
    // 推断巨型字面量类型而极慢/卡死。fs 读取把它移出类型图，校验等价、tsc 飞快。
    const realIndex = JSON.parse(readFileSync('assets/index.json', 'utf8'));
    const idx = parseAssetIndex(realIndex);
    expect(idx.version).toBeGreaterThanOrEqual(1);
    for (const a of idx.assets) expect(ASSET_TYPES).toContain(a.type);
  });
});
