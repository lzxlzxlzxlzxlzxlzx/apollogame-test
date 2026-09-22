// 现场调参台端到端接线守卫（REQ-DEMO-调参台·owner「展台要能调、更动态」）：
// 每个新旋钮改一档 → 对应蓝图组件字段真变；缺省（空 tune）= 原值零回归（默认档已在 three3d.test 覆盖）。
// 证明「点档即改渲染数据」不是摆设——弱模型选个档，蓝图数据就变，渲染器实时重烘。
import { describe, it, expect } from 'vitest';
import {
  post3dBlueprint, nav3dBlueprint, ao3dBlueprint, vfx3dBlueprint, material3dBlueprint,
  fog3dBlueprint, pointlight3dBlueprint, surface3dBlueprint, model3dBlueprint,
  primitives3dBlueprint, worldui3dBlueprint, toon3dBlueprint, billboard3dBlueprint,
  path3dBlueprint, spring3dBlueprint, particle3dBlueprint,
} from './three3d.js';

const ents = (bp: { entities: Record<string, unknown> }): any => bp.entities;

describe('3D 展台 · 现场调参台接线（旋钮改一档 → 蓝图字段真变）', () => {
  it('② Post 景深泛光：虚化量/泛光强/焦平面', () => {
    const d = ents(post3dBlueprint()).post.Post3D, t = ents(post3dBlueprint({ 'ps.tilt': 'strong', 'ps.bloom': 'high', 'ps.focus': 'high' })).post.Post3D;
    expect([d.tiltShift.intensity, d.bloom.strength, d.tiltShift.focus]).toEqual([3.6, 0.7, 0.52]);
    expect([t.tiltShift.intensity, t.bloom.strength, t.tiltShift.focus]).toEqual([6.0, 1.4, 0.7]);
  });
  it('③ Nav 寻路：追速/网格精度', () => {
    const d = ents(nav3dBlueprint()), t = ents(nav3dBlueprint({ 'nav.spd': 'fast', 'nav.cell': 'fine' }));
    expect([d['seeker-1'].NavAgent.speed, d.nav.NavMesh.cellSize]).toEqual([0.5, 3]);
    expect([t['seeker-1'].NavAgent.speed, t.nav.NavMesh.cellSize]).toEqual([0.85, 2]);
  });
  it('⑦ AO 遮蔽：强度/半径', () => {
    const t = ents(ao3dBlueprint({ 'ao.str': 'high', 'ao.rad': 'wide' })).post.Post3D.ao;
    expect([t.intensity, t.radius]).toEqual([2.4, 9]);
  });
  it('⑧ Vfx 粒子：喷量/重力/初速倍率', () => {
    const t = ents(vfx3dBlueprint({ 'vfx.rate': 'high', 'vfx.grav': 'high', 'vfx.spd': 'high' }))['fx-gold'].Vfx3D;
    expect([t.rate, t.gravity, t.speed]).toEqual([120, 24, 16 * 1.5]); // fx-gold 基速 16 × 1.5
  });
  it('⑨ Material 材质：自发光/曝光/饱和', () => {
    const t = ents(material3dBlueprint({ 'mat.emit': 'high', 'mat.expo': 'bright', 'mat.sat': 'high' }));
    expect(t['m-emit'].Material3D.emissiveIntensity).toBe(3.5);
    expect([t.post.Post3D.grade.exposure, t.post.Post3D.grade.saturation]).toEqual([1.4, 1.6]);
  });
  it('⑩ Fog 距离雾：新增雾起点 f.near', () => {
    expect(ents(fog3dBlueprint()).fog.Fog3D.near).toBe(40);
    expect(ents(fog3dBlueprint({ 'f.near': 'near' })).fog.Fog3D.near).toBe(15);
  });
  it('⑪ 点光/聚光：点光强/聚光强/锥角', () => {
    const t = ents(pointlight3dBlueprint({ 'pl.warm': 'bright', 'pl.spot': 'bright', 'pl.angle': 'wide' }));
    expect(t['lamp-warm'].Light3D.intensity).toBe(240);
    expect([t['lamp-spot'].Light3D.intensity, t['lamp-spot'].Light3D.angle]).toEqual([280, 0.85]);
  });
  it('⑫ Surface 表面：凹凸强/密度倍率（保三块相对差）', () => {
    const d = ents(surface3dBlueprint())['s-bumps'].Material3D.surface, t = ents(surface3dBlueprint({ 'sf.normal': 'deep', 'sf.tiles': 'fine' }))['s-bumps'].Material3D.surface;
    expect([d.normal, d.tiles]).toEqual([1.4, 5]);
    expect([t.normal, t.tiles]).toEqual([1.4 * 1.7, 10]); // 5×2
  });
  it('⑬ Model 模型：转速/机位', () => {
    const t = ents(model3dBlueprint({ 'mdl.spin': 'fast', 'mdl.cam': 'far' }));
    expect([t['duck-main'].Tween.duration, t.cam.Camera3D.distance]).toEqual([130, 110]);
  });
  it('⑭ Primitives 图元：转速/机位', () => {
    const t = ents(primitives3dBlueprint({ 'prm.spin': 'fast', 'prm.cam': 'far' }));
    expect([t['p-box'].Tween.duration, t.cam.Camera3D.distance]).toEqual([130, 150]);
  });
  it('⑮ WorldUI 面板：机位', () => {
    expect(ents(worldui3dBlueprint({ 'wui.cam': 'far' })).cam.Camera3D.distance).toBe(120);
  });
  it('⑯ Toon 卡通：色阶数（混=保各件差·数字=全统一）+ 描边粗', () => {
    const d = ents(toon3dBlueprint()); // 缺省 mix：cyl=2 / cone=4（各件不同）
    expect([d['tn-cyl'].Material3D.toonSteps, d['tn-cone'].Material3D.toonSteps]).toEqual([2, 4]);
    const t = ents(toon3dBlueprint({ 'tn.steps': '4', 'tn.outline': 'bold' })); // 统一 4 阶
    expect([t['tn-cyl'].Material3D.toonSteps, t['tn-cone'].Material3D.toonSteps]).toEqual([4, 4]);
    expect(t['tn-cyl'].Material3D.outline.width).toBe(0.5);
  });
  it('⑰ Billboard：浮动幅/阴影浓/币大小', () => {
    const t = ents(billboard3dBlueprint({ 'bb.bob': 'high', 'bb.shadow': 'dark', 'bb.size': 'large' }))['coin-1'];
    expect([t.Billboard3D.size, t.Anim3D.channels[0].amp, t.Decal3D.opacity]).toEqual([10, 3.2, 0.6]);
  });
  it('⑱ Path 路径：巡速倍率', () => {
    expect(ents(path3dBlueprint()).platform.Path3D.duration).toBe(9);
    expect(ents(path3dBlueprint({ 'pt.speed': 'fast' })).platform.Path3D.duration).toBe(4.5); // 9×0.5
  });
  it('⑲ Spring 弹簧：弹频倍率（不动 damping·保回弹对比）', () => {
    const d = ents(spring3dBlueprint())['sp-1'].Anim3D.channels[0], t = ents(spring3dBlueprint({ 'sp.freq': 'fast' }))['sp-1'].Anim3D.channels[0];
    expect([d.freq, d.damping]).toEqual([3.2, 0.12]);
    expect([t.freq, t.damping]).toEqual([3.2 * 1.56, 0.12]); // freq 变·damping 不变
  });
  it('⑤ Particle 粒子：喷速/火花数/泛光', () => {
    const t = ents(particle3dBlueprint({ 'pa.count': 'many', 'pa.bloom': 'high' }));
    expect(Object.keys(t.library.PrefabLibrary.templates['boom-gold'].entities).length).toBe(18); // 火花数 many
    expect(t.post.Post3D.bloom.strength).toBe(1.6);
  });
});
