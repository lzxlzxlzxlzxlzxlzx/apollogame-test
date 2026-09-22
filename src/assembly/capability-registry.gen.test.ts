import { describe, it, expect } from 'vitest';
import { ALL_CAPABILITIES, CAPABILITY_REGISTRY, CAPABILITY_INDEX, inferCapabilityIds } from './capability-registry.js';
import { CAPABILITY_LOADERS } from './capability-registry.gen.js';
import { buildCapabilityIndex, loadCapabilities, metaOf, inferCapabilityIdsWith } from './capability-index.js';
import { parseManifest } from './manifest.js';
import { parseManifestAsync, parseManifestDetailedAsync } from './manifest-async.js';
import { hashWorld } from '@net/world-hash.js';
import { Engine } from '../runtime/engine.js';

// P2e · 懒注册表 ⇔ 静态注册表对拍：① 条目 id 与顺序逐一相同（gen 文件过期即红·提示重生成）
// ② provides 元数据逐条相同 → 两边算出的组件索引/推断结果相同 ③ 每条 load() 拿到的**就是**静态注册表里那个对象
// （同一模块单例·重建后行为/hash 一致）④ 异步门面与同步门面对同一 manifest 产出同 hash 的世界 ⑤ 未知 id 判词一致。

const REGEN = '（gen 文件过期：npx vite-node scripts/gen-capability-registry.mjs）';

describe('capability-registry.gen ⇔ ALL_CAPABILITIES', () => {
  it('id 列表与登记序逐一相同' + REGEN, () => {
    expect(CAPABILITY_LOADERS.map((l) => l.id)).toEqual(ALL_CAPABILITIES.map((c) => c.id));
  });

  it('provides 元数据逐条相同 → 组件索引（唯一提供者 / 共用组件）两边同值' + REGEN, () => {
    expect(CAPABILITY_LOADERS.map((l) => ({ id: l.id, provides: [...l.provides] }))).toEqual(ALL_CAPABILITIES.map(metaOf).map((m) => ({ id: m.id, provides: [...m.provides] })));
    const lazy = buildCapabilityIndex(CAPABILITY_LOADERS);
    expect([...lazy.providers]).toEqual([...CAPABILITY_INDEX.providers]);
    expect([...lazy.ambiguous]).toEqual([...CAPABILITY_INDEX.ambiguous]);
    expect(lazy.ambiguous.get('BoardCell')).toEqual(['t3-match3-board', 't3-block-grid']);
    const ents = { a: { Transform: {}, BoardCell: {}, Nope: {} } };
    expect(inferCapabilityIdsWith(lazy, ents)).toEqual(inferCapabilityIds(ents));
    expect(inferCapabilityIdsWith(lazy, ents)).toEqual(['a1-transform']); // 共用/未知组件不猜
  });

  it('每条 load() 解析到的能力对象 === 静态注册表里的同一个对象（同模块单例）', async () => {
    const loaded = await loadCapabilities(CAPABILITY_LOADERS.map((l) => l.id), CAPABILITY_LOADERS);
    loaded.forEach((cap, i) => {
      expect(cap, CAPABILITY_LOADERS[i]!.id).toBe(CAPABILITY_REGISTRY.get(CAPABILITY_LOADERS[i]!.id));
    });
  });

  it('未知 id：装载前整体拒绝（不半装）·判词与同步 resolveCapabilities 同句', async () => {
    await expect(loadCapabilities(['a1-transform', 'zz-nope'], CAPABILITY_LOADERS)).rejects.toThrow('manifest: 未知 capability id: zz-nope（不在能力注册表内）');
    expect(() => parseManifest({ capabilities: ['zz-nope'], entities: {} })).toThrow('manifest: 未知 capability id: zz-nope（不在能力注册表内）');
  });
});

describe('manifest-async ⇔ manifest（同步）', () => {
  const MANIFEST = {
    capabilities: ['a1-transform', 'b1-velocity', 'b2-acceleration', 'c1-shape', 'l2-color', 'd1-overlap-detect', 't1-accel-apply', 't1-motion-apply', 't2-collision-resolve', 't2-bounds-clamp'],
    meta: { tickRate: 60 },
    entities: {
      camera: { Camera: { zoom: 1, offsetX: 320, offsetY: 200, rotation: 0, viewportW: 640, viewportH: 400 } },
      ball: {
        Transform: { x: 320, y: 60, rotation: 0, scaleX: 1, scaleY: 1 },
        Velocity: { vx: 2, vy: 0, angular: 0 }, Acceleration: { ax: 0, ay: 0.5 },
        Shape: { kind: 'circle', radius: 12 }, Color: { tint: 4886754, alpha: 1 },
        Mass: { value: 1 }, Bounds: { minX: 0, minY: 0, maxX: 640, maxY: 400 },
      },
      ground: { Transform: { x: 320, y: 380, rotation: 0, scaleX: 1, scaleY: 1 }, Shape: { kind: 'box', width: 640, height: 40 }, Color: { tint: 3553598, alpha: 1 }, Mass: { value: 0 } },
    },
  };

  function run(bp: ReturnType<typeof parseManifest>): string {
    const e = new Engine({ tickRate: 60 });
    e.load(bp);
    for (let i = 0; i < 120; i++) e.world.tick();
    return hashWorld(e.world);
  }

  it('同一 manifest：能力对象同一·告警同句·跑 120 拍世界 hash 同值', async () => {
    const sync = parseManifest(MANIFEST);
    const det = await parseManifestDetailedAsync(MANIFEST);
    expect(det.blueprint.capabilities).toEqual(sync.capabilities);
    det.blueprint.capabilities.forEach((c, i) => expect(c).toBe(sync.capabilities[i]));
    expect(det.blueprint.meta).toEqual(sync.meta);
    expect(run(det.blueprint)).toBe(run(sync));
  });

  it('未声明 capabilities → 按组件推断（与同步同一份索引）·告警同句', async () => {
    const raw = { entities: { p: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, BoardCell: { row: 0, col: 0 } } } };
    const det = await parseManifestDetailedAsync(raw);
    const sync = parseManifest(raw);
    expect(det.inferredCapabilities).toBe(true);
    expect(det.blueprint.capabilities.map((c) => c.id)).toEqual(sync.capabilities.map((c) => c.id));
    expect(det.warnings.some((w) => w.includes('BoardCell') && w.includes('t3-match3-board / t3-block-grid'))).toBe(true);
  });

  it('子集注册表：manifest 点名了子集之外的能力 → 拒绝（打包子集外壳时的运行期判词）', async () => {
    const subset = CAPABILITY_LOADERS.filter((l) => l.id === 'a1-transform');
    await expect(parseManifestAsync({ capabilities: ['a1-transform', 't2-matrix-duel'], entities: {} }, undefined, subset)).rejects.toThrow(/t2-matrix-duel/);
    const bp = await parseManifestAsync({ capabilities: ['a1-transform'], entities: {} }, undefined, subset);
    expect(bp.capabilities.map((c) => c.id)).toEqual(['a1-transform']);
  });
});
