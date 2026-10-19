// 平面反射镜面（REQ-3D-PLANAR-REFLECT）：Reflector3D → three.Reflector 建/摆位/染色/透明度 patch/增删。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ReflectorSystem } from './reflector.js';
import { World } from '@engine/core/world.js';
import type { Reflector3D, Transform3D } from '@engine/protocol/components.js';

function scene(): { sys: ReflectorSystem; scn: THREE.Scene; w: World } {
  return { sys: new ReflectorSystem(), scn: new THREE.Scene(), w: new World() };
}
function addRefl(w: World, id: string, r: Partial<Reflector3D>, t?: Partial<Transform3D>): void {
  w.createEntity(id);
  w.addComponent<Reflector3D>(id, { type: 'Reflector3D', width: 20, height: 14, ...r });
  if (t) w.addComponent<Transform3D>(id, { type: 'Transform3D', x: 0, y: 0, z: 0, ...t });
}
const meshOf = (scn: THREE.Scene): THREE.Mesh | undefined => scn.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;

describe('ReflectorSystem：建镜面 + 摆位姿', () => {
  it('挂 Reflector3D → 场景多一块镜面 mesh·摆到 Transform3D 位置', () => {
    const { sys, scn, w } = scene();
    addRefl(w, 'floor', { width: 30, height: 24 }, { x: 5, y: 0.1, z: -3 });
    sys.sync(scn, w, 1);
    const m = meshOf(scn)!;
    expect(m).toBeTruthy();
    expect(m.position.toArray()).toEqual([5, 0.1, -3]);
  });
  it('floor 缺省 → 平面翻成水平（rotation.x = -π/2·法线 +Y）；wall → 竖直（x=0）', () => {
    const { sys, scn, w } = scene();
    addRefl(w, 'f', { orientation: 'floor' }, {});
    addRefl(w, 'wl', { orientation: 'wall' }, {});
    sys.sync(scn, w, 1);
    const meshes = scn.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    const rotX = meshes.map((m) => Math.round(m.rotation.x * 100) / 100).sort();
    expect(rotX).toContain(Math.round(-Math.PI / 2 * 100) / 100); // floor 翻平
    expect(rotX).toContain(0); // wall 竖直
  });
});

describe('ReflectorSystem：染色 / 透明度', () => {
  it('color → color uniform；缺省冷银', () => {
    const { sys, scn, w } = scene();
    addRefl(w, 'r', { color: 0xffcc00 }, {});
    sys.sync(scn, w, 1);
    const mat = (meshOf(scn)!.material as THREE.ShaderMaterial);
    expect((mat.uniforms['color'].value as THREE.Color).getHex()).toBe(0xffcc00);
  });
  it('opacity<1 → 片元 patch 出 uReflOpacity + transparent（半反射混下方底色）', () => {
    const { sys, scn, w } = scene();
    addRefl(w, 'r', { opacity: 0.7 }, {});
    sys.sync(scn, w, 1);
    const mat = (meshOf(scn)!.material as THREE.ShaderMaterial);
    expect(mat.transparent).toBe(true);
    expect(mat.uniforms['uReflOpacity'].value).toBe(0.7);
    expect(mat.fragmentShader).toContain('uReflOpacity'); // 片元真被 patch
    expect(mat.fragmentShader).not.toContain('blendOverlay( base.rgb, color ), 1.0'); // 原硬 alpha=1 已替掉
  });
  it('opacity 缺省=1 → 纯镜·不 patch（fragment 保原样 alpha=1）', () => {
    const { sys, scn, w } = scene();
    addRefl(w, 'r', {}, {});
    sys.sync(scn, w, 1);
    const mat = (meshOf(scn)!.material as THREE.ShaderMaterial);
    expect(mat.uniforms['uReflOpacity']).toBeUndefined();
    expect(mat.transparent).toBe(false);
  });
});

describe('ReflectorSystem：增删 + 内容签名', () => {
  it('实体删除 → 镜面从场景移除（不泄漏）', () => {
    const { sys, scn, w } = scene();
    addRefl(w, 'r', {}, {});
    sys.sync(scn, w, 1);
    expect(meshOf(scn)).toBeTruthy();
    w.destroyEntity('r');
    sys.sync(scn, w, 1);
    expect(meshOf(scn)).toBeUndefined();
  });
  it('contentSig：加/移/改参数 → 签名变（脏帧重渲·倒影跟着更新）', () => {
    const { sys, w } = scene();
    expect(sys.contentSig(w)).toBe('');
    addRefl(w, 'r', { color: 0x112233 }, { x: 0, y: 0, z: 0 });
    const s0 = sys.contentSig(w);
    expect(s0).not.toBe('');
    w.getComponent<Transform3D>('r', 'Transform3D')!.z = 9; // 移动
    expect(sys.contentSig(w)).not.toBe(s0);
  });
});

describe('ReflectorSystem.cull：视锥剔除（不可见镜子零 RTT）', () => {
  it('视锥内镜面 visible=true·视锥外(相机后方) visible=false', () => {
    const { sys, scn, w } = scene();
    addRefl(w, 'front', { width: 20, height: 20 }, { x: 0, y: 0, z: 0 });
    addRefl(w, 'behind', { width: 20, height: 20 }, { x: 0, y: 0, z: -100 }); // 相机后方
    sys.sync(scn, w, 1);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    cam.position.set(0, 5, -30); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    sys.cull(cam);
    const meshes = scn.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    const front = meshes.find((m) => m.position.z === 0)!;
    const behind = meshes.find((m) => m.position.z === -100)!;
    expect(front.visible).toBe(true);   // 视锥内 → 画倒影
    expect(behind.visible).toBe(false); // 相机后方 → 剔除·零 RTT
  });
  it('空镜面集 → cull 早退不炸', () => {
    const { sys } = scene();
    const cam = new THREE.PerspectiveCamera();
    expect(() => sys.cull(cam)).not.toThrow();
  });
});
