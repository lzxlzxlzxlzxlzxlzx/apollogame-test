import { describe, it, expect } from 'vitest';
import { validateComponentData, validateAssetRefs, formatIssues } from './validate-manifest.js';
import { parseManifest } from './manifest.js';
import { resourceCapability, flagCapability, spriteCapability, soundCapability } from '@atom-skills/index.js';
import type { EntityBlueprint } from './demo.assembly.js';
import { buildFixtureBlueprint } from '../test-fixtures/engine-fixture.js';
import { parseAssetIndex } from '@assets/index.js';

const ent = (comps: Record<string, Record<string, unknown>>): Record<string, EntityBlueprint> =>
  comps as unknown as Record<string, EntityBlueprint>;

describe('Clickable hit-mask 加载绑定', () => {
  const manifest = { capabilities: ['t2-clickable'], entities: { clue: {
    Clickable: { action: 'inspect', hitMaskKey: 'clue.mask' },
    Sprite: { textureKey: 'clue.png', anchorX: 0.5, anchorY: 0.5, zOrder: 1 },
    Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
  } } };
  const texture = { id: 'clue.png', type: 'texture', description: 'clue', status: 'filled', path: 'clue.png', spec: { width: 2, height: 2 } };
  const mask = { id: 'clue.mask', type: 'hit-mask', description: 'mask', status: 'filled',
    spec: { version: 1, width: 2, height: 2, threshold: 127, sourceTextureKey: 'clue.png', rows: ['10', '01'] } };
  it('只从 AssetIndex 绑定，经蓝图传给确定性世界', () => {
    const index = parseAssetIndex({ version: 1, assets: [texture, mask] });
    const bp = parseManifest(manifest, { assetIndex: index });
    expect((bp.entities.clue.Clickable as { hitMask: unknown }).hitMask).toEqual(mask.spec);
    expect((manifest.entities.clue.Clickable as { hitMask?: unknown }).hitMask).toBeUndefined();
  });
  it('来源贴图尺寸不符或 mask 缺失不绑定；作者内联 mask 直接拒绝', () => {
    const missingMask = parseAssetIndex({ version: 1, assets: [texture] });
    expect((parseManifest(manifest, { assetIndex: missingMask }).entities.clue.Clickable as { hitMask?: unknown }).hitMask).toBeUndefined();
    expect((parseManifest(manifest).entities.clue.Clickable as { hitMask?: unknown }).hitMask).toBeUndefined();
    const inline = { ...manifest, entities: { clue: { ...manifest.entities.clue,
      Clickable: { ...manifest.entities.clue.Clickable, hitMask: mask.spec } } } };
    expect(() => parseManifest(inline, { assetIndex: missingMask })).toThrow(/不可内联/);
  });
});

describe('R12 组件数据 schema 校验（复用 provides.fields，不另造）', () => {
  it('合法 Resource → 零 error 零 warning', () => {
    const r = validateComponentData([resourceCapability], ent({ hp: { Resource: { id: 'hp', current: 10, min: 0, max: 100 } } }));
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('字段名拼错（currrent）→ warning（疑似拼错），非 error', () => {
    const r = validateComponentData([resourceCapability], ent({ hp: { Resource: { id: 'hp', currrent: 10, min: 0, max: 100 } } }));
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].field).toBe('currrent');
  });

  it('number 字段给了 string → error（会坏模拟）', () => {
    const r = validateComponentData([resourceCapability], ent({ hp: { Resource: { id: 'hp', current: '10', min: 0, max: 100 } } }));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].field).toBe('current');
    expect(r.errors[0].message).toMatch(/应为 number/);
  });

  it('boolean 字段给了 number → error', () => {
    const r = validateComponentData([flagCapability], ent({ f: { Flag: { id: 'f', active: 1 } } }));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].field).toBe('active');
  });

  it('无 provider 的组件 → 跳过字段校验（结构层另有告警，此处不误报）', () => {
    const r = validateComponentData([resourceCapability], ent({ x: { Nonexistent: { whatever: 1 } } }));
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('type 判别式键被忽略（不当作未知字段）', () => {
    const r = validateComponentData([resourceCapability], ent({ hp: { Resource: { type: 'Resource', id: 'hp', current: 1, min: 0, max: 2 } } }));
    expect(r.warnings).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
  });

  it('真实蓝图 → 零类型 error（数据与声明 schema 一致）', () => {
    const games = [
      ['fixture', buildFixtureBlueprint()],
    ] as const;
    for (const [name, bp] of games) {
      const r = validateComponentData(bp.capabilities, bp.entities);
      expect(r.errors, `${name}: ${formatIssues(r.errors)}`).toHaveLength(0);
    }
  });

  it('Sprite 目标框是原子闭集：缺边、非法 fit、非有限或非正尺寸都拒绝', () => {
    const base = { textureKey: 'hero', anchorX: 0.5, anchorY: 0.5, zOrder: 0 };
    const invalid = [
      { ...base, width: 100 },
      { ...base, width: 100, height: 200 },
      { ...base, width: 100, height: 200, fit: 'stretch' },
      { ...base, width: 0, height: 200, fit: 'cover' },
      { ...base, width: -1, height: 200, fit: 'cover' },
      { ...base, width: Infinity, height: 200, fit: 'cover' },
      { ...base, width: 100, height: NaN, fit: 'contain' },
      { ...base, sampling: 'pixelated' },
    ];
    for (const Sprite of invalid) {
      const r = validateComponentData([spriteCapability], ent({ e: { Sprite } }));
      expect(r.errors, JSON.stringify(Sprite)).not.toHaveLength(0);
    }
    expect(validateComponentData([spriteCapability], ent({ e: { Sprite: { ...base, width: 100, height: 200, fit: 'cover' } } })).errors).toHaveLength(0);
    expect(validateComponentData([spriteCapability], ent({ e: { Sprite: { ...base, sampling: 'smooth' } } })).errors).toHaveLength(0);
    expect(validateComponentData([spriteCapability], ent({ e: { Sprite: { ...base, sampling: 'nearest' } } })).errors).toHaveLength(0);
    expect(() => parseManifest({ entities: { e: { Sprite: { ...base, width: 100 } } } })).toThrow(/width、height 与 fit/);
  });
});

describe('R9 增益 A — 资产 key 硬校验（assetKey 字段对清单）', () => {
  const caps = [spriteCapability, soundCapability];
  const keys = new Set(['hero_idle', 'snd_coin']);

  it('引用清单中存在的 key → 通过', () => {
    const errs = validateAssetRefs(caps, ent({
      h: { Sprite: { textureKey: 'hero_idle', anchorX: 0.5, anchorY: 0.5, zOrder: 0 } },
      c: { Sound: { clipId: 'snd_coin', volume: 1, loop: false } },
    }), keys);
    expect(errs).toHaveLength(0);
  });

  it('引用清单中不存在的 key（AI 编造）→ error', () => {
    const errs = validateAssetRefs(caps, ent({
      h: { Sprite: { textureKey: 'hero_FABRICATED', anchorX: 0.5, anchorY: 0.5, zOrder: 0 } },
    }), keys);
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe('textureKey');
    expect(errs[0].message).toMatch(/不存在的资产 key/);
  });

  it('非 assetKey 字段不受影响（zOrder 等数值字段不查清单）', () => {
    const errs = validateAssetRefs(caps, ent({
      h: { Sprite: { textureKey: 'hero_idle', anchorX: 0.5, anchorY: 0.5, zOrder: 999 } },
    }), keys);
    expect(errs).toHaveLength(0);
  });

  it('parseManifest 提供 assetKeys → 未知 key 拒绝加载（opt-in 硬校验）', () => {
    // entities-only：能力由组件类型推断（含 sprite），免猜 capability id。
    const manifest = {
      entities: { h: { Sprite: { textureKey: 'ghost', anchorX: 0.5, anchorY: 0.5, zOrder: 0 } } },
    };
    // 不提供 assetKeys：放行（opt-in）。
    expect(() => parseManifest(manifest)).not.toThrow();
    // 提供 assetKeys 且不含 'ghost'：拒绝。
    expect(() => parseManifest(manifest, { assetKeys: new Set(['hero_idle']) })).toThrow(/资产引用错误|不存在的资产 key/);
  });
});
