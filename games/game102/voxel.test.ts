// Game 102 · 3D 体素立方核心 —— 数据结构不变式自验（确定性世界位 / 外壳只渲表面 / 立方居中 / pivot 自转 / 载入无错）。
import { describe, it, expect } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { Pivot3D, Anim3D, Transform3D } from '@zerocraft/engine/engine/protocol/components.js';
import { VOX, coreBounds, voxelPos, isCoreSurface, coreCubeVoxels, buildVoxelScene } from './voxel.js';

describe('Game 102 · 3D 体素立方（数据结构不变式）', () => {
  it('确定性世界位：同索引恒定 + 核心居中于原点（对称首末格）', () => {
    const { lo, hi } = coreBounds(VOX);
    const a = voxelPos(lo, lo, lo);
    const b = voxelPos(hi, hi, hi);
    // 核心首末格关于原点对称（居中）→ 三轴分量互为相反数。
    expect(a.x).toBeCloseTo(-b.x, 6);
    expect(a.y).toBeCloseTo(-b.y, 6);
    expect(a.z).toBeCloseTo(-b.z, 6);
    // 相邻格间距 = pitch（确定性步距）。
    expect(voxelPos(lo + 1, lo, lo).x - a.x).toBeCloseTo(VOX.pitch, 6);
  });

  it('外壳只渲表面：内部体素不成实体 + 壳数 = core³ - (core-2)³', () => {
    const { ids } = coreCubeVoxels(VOX);
    const shell = VOX.core ** 3 - (VOX.core - 2) ** 3;
    expect(ids.length).toBe(shell);           // core=10 → 1000-512 = 488
    const { lo, hi } = coreBounds(VOX);
    const mid = Math.round((lo + hi) / 2);
    expect(isCoreSurface(mid, mid, mid)).toBe(false); // 正中心 = 内部·不渲
    expect(isCoreSurface(lo, mid, mid)).toBe(true);   // 一轴触边 = 表面
  });

  it('场景载入 + 两拍无错：pivot 收拢全部体素 + 挂自转 Anim3D·相机就位', () => {
    const input = new QueuedInputSource('vox');
    const e = new Engine({ input });
    e.load(buildVoxelScene());
    e.world.tick(); e.world.tick();
    const piv = e.world.getComponent<Pivot3D>('cube-pivot', 'Pivot3D');
    const { ids } = coreCubeVoxels(VOX);
    expect(piv?.children.length).toBe(ids.length);    // 整块一起转
    const anim = e.world.getComponent<Anim3D>('cube-pivot', 'Anim3D');
    expect(anim?.channels.some((c) => c.kind === 'spin' && c.field === 'rotY')).toBe(true);
    // 每个体素都有 Transform3D（渲染定位姿）。
    const t = e.world.getComponent<Transform3D>(ids[0], 'Transform3D');
    expect(t).toBeTruthy();
  });

  it('确定性：同场景两次 hash 一致（体素撒矿脉走整数哈希·非 Math.random）', () => {
    const mk = () => { const e = new Engine({ input: new QueuedInputSource('v') }); e.load(buildVoxelScene()); e.world.tick(); return e; };
    expect(mk().hash()).toBe(mk().hash());
  });
});
