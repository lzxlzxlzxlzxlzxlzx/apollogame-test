// P2e · 懒注册表子集裁剪：行式契约 ⇔ 真实 gen 文件对拍；裁剪只留点名行；未登记 id 早失败；env 解析。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { registryIds, filterRegistrySource, subsetFromEnv } from './lib/registry-subset.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = readFileSync(resolve(ROOT, 'src/assembly/capability-registry.gen.ts'), 'utf8');
// 只数条目行（文件头注释里也写着 `import(` 字样·不算）。
const entryImports = (src) => (src.match(/^\s*\{ id: '[^']+'.*load: \(\) => import\(/gm) ?? []).length;

describe('registry-subset · 对真实 capability-registry.gen.ts', () => {
  it('行式契约成立：扫到的 id 数 = 文件里 import() 行数（>70）', () => {
    const ids = registryIds(GEN);
    expect(ids.length).toBeGreaterThan(70);
    expect(ids.length).toBe(entryImports(GEN));
    expect(new Set(ids).size).toBe(ids.length); // 无重复
  });

  it('裁成 10 能力弹球子集：只剩这 10 行 import()，matrix-duel 零引用，登记序保持', () => {
    const keep = ['t2-bounds-clamp', 'a1-transform', 'b1-velocity', 'b2-acceleration', 'c1-shape', 'l2-color',
      'd1-overlap-detect', 't1-accel-apply', 't1-motion-apply', 't2-collision-resolve'];
    const { src, kept } = filterRegistrySource(GEN, keep);
    expect(kept).toHaveLength(10);
    expect(kept).toEqual(registryIds(GEN).filter((id) => keep.includes(id))); // 登记序·不是 keep 的顺序
    expect(entryImports(src)).toBe(10);
    expect(src).not.toContain('matrix-duel');
    expect(src).toContain("import type { CapabilityLoader }"); // 非条目行原样保留
    expect(src).toContain('export const CAPABILITY_LOADERS');
  });

  it('空子集 → 零 import()（工程游戏目标的外壳不带任何懒能力）', () => {
    const { src, kept } = filterRegistrySource(GEN, []);
    expect(kept).toEqual([]);
    expect(entryImports(src)).toBe(0);
    expect(src).not.toMatch(/^\s*\{ id:/m);
  });

  it('未登记 id → 打包期抛错点名', () => {
    expect(() => filterRegistrySource(GEN, ['a1-transform', 'zz-nope'])).toThrow(/zz-nope/);
  });

  it('VITE_CART_CAPABILITIES 解析：未设=null（不裁）·空串=[]（全裁）·逗号分隔去空白', () => {
    expect(subsetFromEnv({})).toBeNull();
    expect(subsetFromEnv({ VITE_CART_CAPABILITIES: '' })).toEqual([]);
    expect(subsetFromEnv({ VITE_CART_CAPABILITIES: ' a1-transform, b1-velocity ' })).toEqual(['a1-transform', 'b1-velocity']);
  });
});
