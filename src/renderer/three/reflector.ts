import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { IWorld } from '@engine/core/types.js';
import type { Reflector3D, Transform3D } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/reflector —— 平面反射镜面（Reflector3D·render-only·REQ-3D-PLANAR-REFLECT）。
//  three.Reflector：每帧把场景从**镜像相机**渲进一张 RTT 贴图 → 平面上照出真实倒影（比 SSR 干净·无屏幕空间
//  噪声/掠射漏光）。反射渲染由 three 在主渲染的 `onBeforeRender` 里自动做（用当前相机）——本系统只管：按
//  Reflector3D 数据 建/更新/移除镜面 mesh + 摆位姿（同实体 Transform3D）+ 染色/透明度。自由 GL 只在引擎写一次。
//
//  脏帧：镜面不自播动画（live=0）；反射随「场景/相机变」而变，而那些变化本就会脏 renderSig（位姿 hash/camSig）→
//  重渲时反射自动跟着更新。`contentSig` 让「加/删/移镜面·改参数」也脏帧。
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TINT = 0x8892a0; // 冷银（blendOverlay 叠加·中性倒影）

// 需重建的结构签名（尺寸/朝向/贴图边长变 → 换 mesh；color/opacity 可原地改 uniform·不进此签名）。
function reflectorSig(r: Reflector3D): string {
  return `${r.width}x${r.height}|${r.orientation ?? 'floor'}|${r.quality ?? 512}`;
}

// 建一块镜面：PlaneGeometry + three.Reflector（RTT）。floor→翻成水平(法线+Y)；wall→保持竖直(法线+Z)。
//  opacity<1 → patch 片元 alpha（three.Reflector 原生输出 alpha=1·不透）让倒影与下方底色混合＝半反射湿地板。
function buildReflector(r: Reflector3D, dpr: number): Reflector {
  const q = Math.max(128, Math.round((r.quality ?? 512) * Math.min(dpr, 2)));
  const geo = new THREE.PlaneGeometry(r.width, r.height);
  geo.computeBoundingSphere(); // 供 cull() 视锥相交测
  const mesh = new Reflector(geo, {
    color: (r.color ?? DEFAULT_TINT) & 0xffffff,
    textureWidth: q, textureHeight: q, clipBias: 0.003,
  });
  if ((r.orientation ?? 'floor') === 'floor') mesh.rotation.x = -Math.PI / 2; // 平面默认朝 +Z → 翻成水平(法线+Y)
  const opacity = r.opacity ?? 1;
  if (opacity < 1) {
    const mat = mesh.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.uniforms['uReflOpacity'] = { value: opacity };
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform vec3 color;', 'uniform vec3 color;\nuniform float uReflOpacity;')
      .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
        'gl_FragColor = vec4( blendOverlay( base.rgb, color ), uReflOpacity );'); // 倒影 alpha=opacity → 混下方底色
    mat.needsUpdate = true;
  }
  mesh.renderOrder = -1; // 镜面先画（半透倒影铺底·上面的物件正常盖）
  return mesh;
}

// 摆位姿 + 原地更新 染色/透明度（不重建）。floor 的 rotY 在自身平面内转；wall 的 rotY 决定朝向。
function applyReflector(mesh: Reflector, r: Reflector3D, t?: Transform3D): void {
  if (t) mesh.position.set(t.x, t.y, t.z);
  const floor = (r.orientation ?? 'floor') === 'floor';
  mesh.rotation.set(floor ? -Math.PI / 2 : 0, floor ? (t?.rotY ?? 0) : (t?.rotY ?? 0), 0, 'YXZ');
  const mat = mesh.material as THREE.ShaderMaterial;
  (mat.uniforms['color']?.value as THREE.Color | undefined)?.setHex((r.color ?? DEFAULT_TINT) & 0xffffff);
  if (mat.uniforms['uReflOpacity']) mat.uniforms['uReflOpacity'].value = r.opacity ?? 1;
}

function disposeReflector(mesh: Reflector): void {
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
  mesh.getRenderTarget().dispose(); // RTT 也回收（防显存泄漏·同 RENDERHYG 纪律）
}

export class ReflectorSystem {
  private readonly refs = new Map<string, { mesh: Reflector; sig: string }>();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();

  // 视锥剔除（省真浪费）：镜面**不在相机视锥内 → `mesh.visible=false`**——three.Reflector 只在 mesh 可见时才触发
  //  onBeforeRender 把**整个场景**渲进 RTT，故不可见的镜子零 RTT 成本（否则每个非跳渲帧白付一次全场景渲染）。
  //  须在**相机定位后、主渲染前**调（拿当帧相机）。用包围球（PlaneGeometry 已 computeBoundingSphere）+ mesh 世界矩阵。
  cull(camera: THREE.Camera): void {
    if (this.refs.size === 0) return;
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    for (const [, e] of this.refs) {
      e.mesh.updateMatrixWorld();
      e.mesh.visible = this.frustum.intersectsObject(e.mesh); // 包围球相交才画（保守·边缘留可见·不误剔真镜）
    }
  }

  sync(scene: THREE.Scene, world: IWorld, dpr: number): void {
    const seen = new Set<string>();
    for (const [id] of world.query('Reflector3D')) {
      const r = world.getComponent<Reflector3D>(id, 'Reflector3D');
      if (!r) continue;
      seen.add(id);
      const sig = reflectorSig(r);
      let entry = this.refs.get(id);
      if (!entry || entry.sig !== sig) {
        if (entry) { scene.remove(entry.mesh); disposeReflector(entry.mesh); }
        const mesh = buildReflector(r, dpr);
        scene.add(mesh);
        entry = { mesh, sig };
        this.refs.set(id, entry);
      }
      applyReflector(entry.mesh, r, world.getComponent<Transform3D>(id, 'Transform3D'));
    }
    for (const [id, e] of this.refs) if (!seen.has(id)) { scene.remove(e.mesh); disposeReflector(e.mesh); this.refs.delete(id); }
  }

  // 内容签名（进 renderSig）：加/删/移镜面·改参数 → 脏帧重渲（反射跟着更新）。
  contentSig(world: IWorld): string {
    const parts: string[] = [];
    for (const [id] of world.query('Reflector3D')) {
      const r = world.getComponent<Reflector3D>(id, 'Reflector3D');
      const t = world.getComponent<Transform3D>(id, 'Transform3D');
      if (r) parts.push(`${id}:${reflectorSig(r)}.${r.color ?? ''}.${r.opacity ?? ''}:${t?.x ?? ''},${t?.y ?? ''},${t?.z ?? ''},${t?.rotY ?? ''}`);
    }
    return parts.join('|');
  }

  dispose(scene: THREE.Scene): void {
    for (const [, e] of this.refs) { scene.remove(e.mesh); disposeReflector(e.mesh); }
    this.refs.clear();
  }
}
