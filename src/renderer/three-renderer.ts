import * as THREE from 'three';
import type { IWorld, RendererBackend } from '@engine/core/types.js';
import type { Mesh3D, Sky3D, Camera3D, Fog3D, Material3D, AnimState3D, Glow3D, Transform3D, Pivot3D, Pickable3D } from '@engine/protocol/components.js';
import type { AssetManager, MaterialSpec } from '@assets/index.js';
import { isImageHandle } from '@assets/index.js';
import { getCamera3D, getSky3D, getLights3D, getPost3D, getFog3D } from '@engine/protocol/camera-view.js';
import { collectRenderables, chooseRenderMode, type Renderable } from './renderable.js';
import {
  renderablePose, poseBounds, mesh3dBatchKey, type Pose3D,
  transform3dPose, groundPose, poseBounds3D, bounds3DCenter, bounds3DExtent, fitDistance3D, rayAabbT,
} from './three-projection.js';
import { mesh3dPose, applyPose, buildMesh3D, buildDieMesh3D, dieMode, buildVoxelMesh3D, voxelMode, buildGlowTexture, buildGeometry, buildSkyTexture, disposeMesh, faceAxisSlots } from './three/geometry.js';
import { buildPbrMesh3D, buildPbrGeoMat, pbrTransmissive, pbrSig, applyMaterialRef, type PbrMaps } from './three/material.js';
import { hashPoses, camSig, postSig } from './three/stats.js';
import { LightRig } from './three/lights.js';
import { PostPipeline, FlashDecay } from './three/post.js';
import { ModelPool } from './three/models.js';
import { InstancedBatches, type InstGroups, type PbrBatchBuild } from './three/batches.js';
import { CameraRig, CameraShake, FollowDamper, type DampedCenter } from './three/camera-rig.js';
import { ColliderDebug } from './three/collider-debug.js';
import { NavDebug } from './three/nav-debug.js';
import { VfxSystem } from './three/vfx.js';
import { TrailSystem } from './three/trail.js';
import { LineSystem } from './three/line3d.js';
import { DecalSystem } from './three/decal.js';
import { UvAnimSystem } from './three/uv-anim.js';
import { DissolveSystem } from './three/dissolve.js';
import { BillboardSystem } from './three/billboard.js';
import { DiegeticLayer } from './three/diegetic.js';
import { ReflectorSystem } from './three/reflector.js';
import { Anim3DSystem } from './three/anim3d.js';
import { PathSystem } from './three/path.js';
import { pivotMatrix, applyPivot } from './three/pivot.js';
import { WorldUiLayer } from './three/world-ui.js';
import { IndexDebug } from './three/index-debug.js';
import { AssetReadyTracker } from './three/asset-ready.js';
import type { PhysicsSystem } from './three/physics.js'; // 运行时**懒加载**（见 ensurePhysics）：physics.ts 依赖 cannon-es 重包·仅在有 RigidBody3D 时才进图，无刚体的游戏(如 game-d)不连带解析 cannon-es（修 vite dev「Failed to resolve cannon-es」）
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { isModelHandle } from '@assets/index.js';

export type { RenderStats } from './three/stats.js';
import type { RenderStats } from './three/stats.js';

// ═══════════════════════════════════════════════════════════════
//  ThreeRenderer —— 通用 3D 渲染后端（RendererBackend 的 Three.js 实现）的**编排核心**。
//  与 Canvas/Ascii 后端读同一份 `collectRenderables`：同一份数据、换渲染方法的 3D 一等后端。
//  本文件只做编排 + 2D-in-3D 扁平层；各子系统拆到 `./three/*`：
//    geometry（几何/材质/位姿工厂）· stats（profiler + 脏标签名）· lights（LightRig）·
//    post（PostPipeline）· models（ModelPool·glTF）· batches（InstancedBatches·W1-A 实例化）。
//
//  纯表现：只读 world、只写 three 对象，不写 sim、不进 hash。**刻意不进 `./index` barrel**（静态 import three，
//  避免 2D 消费者连带打包）——需要 3D 的入口直接 import 本文件，进各自的 3D code-split chunk。
// ═══════════════════════════════════════════════════════════════

const SKY_RADIUS = 2000; // 天空盒大球半径（相机 far 据此收紧）

export interface ThreeRendererOptions {
  width?: number;
  height?: number;
  background?: number; // 0xRRGGBB
  fov?: number;
  zStep?: number; // zOrder → z 深度步长
  assets?: AssetManager; // 提供则 sprite 画真实贴图，否则占位
  materials?: ReadonlyMap<string, MaterialSpec>; // 材质资源目录（REQ-Resource ④·buildMaterialCatalog）：Material3D.materialRef 查此表
  // ── 画质/性能（render-only·不影响 sim）─────────────────────────────────────────
  antialias?: boolean; // 基础上下文 MSAA（缺省 true）。用后处理（SMAA）时置 **false** 省一块多采样后备缓冲（composer 输出不经默认帧缓冲·MSAA 白费）。
  dprCap?: number; // devicePixelRatio 上限（缺省 2）。retina 上每 pass 按 dpr² 放大像素——降到 1.5/1 是**最大单点提帧**（略糊·SMAA 补）。运行时可改（setPixelRatioCap）。
  shadowMapSize?: number; // 主阴影贴图边长（缺省 2048）。**动态场景每帧重算阴影**→降到 1024 直接省一半阴影开销。运行时可改（setShadowMapSize）。
}

export class ThreeRenderer implements RendererBackend {
  private scene!: THREE.Scene;
  private gl!: THREE.WebGLRenderer;
  private frame = 0; // 帧计数（render-only·云飘等表现动画用·不进 hash）
  // 子系统
  private cameras!: CameraRig; // 相机解释器（透视/正交·REQ-3D-Camera）
  private readonly camShake = new CameraShake(); // 震屏 trauma 解释器（Camera3D.shake·render-only·超休闲打击反馈）
  private readonly followDamp = new FollowDamper(); // 跟随柔化解释器（Camera3D.follow·lag/lookAhead·render-only）
  private readonly flash = new FlashDecay(); // 命中闪白 trauma 解释器（Post3D.flash·render-only·超休闲打击反馈）
  private lights!: LightRig;
  private post!: PostPipeline;
  private models!: ModelPool;
  private readonly batches = new InstancedBatches();
  private readonly colliderDebug = new ColliderDebug(); // 碰撞体线框（debug·开关见 setDebugColliders）
  private debugColliders = false;
  private readonly navDebug = new NavDebug(); // 导航图/路径（debug·开关见 setDebugNav）
  private debugNav = false;
  private readonly indexDebug = new IndexDebug(); // 实体编号覆盖（debug·开关见 setDebugIndices）
  private debugIndices = false;
  private readonly assetReady = new AssetReadyTracker(); // 异步资产就绪版本号（折进 renderSig·修静态场景迟到贴图/模型被跳渲吞帧）
  private readonly vfx = new VfxSystem(); // 数据驱动粒子（TA Phase 1·render-only）
  private readonly trails = new TrailSystem(); // 运动拖尾（Trail3D·render-only·超休闲残影）
  private readonly lines = new LineSystem(); // 世界折线（Line3D·瞄准线/牵引/路径·render-only）
  private readonly decals = new DecalSystem(); // 地面贴花（Decal3D·blob 阴影/环/圆·render-only）
  private readonly uvAnim = new UvAnimSystem(); // 材质 UV 动画（Material3D.uvAnim·滚动/序列帧·render-only）
  private readonly dissolve = new DissolveSystem(); // 溶解消散（Material3D.dissolve·shader 溶解 + 发光前沿·render-only·REQ-3D-DISSOLVE）
  private readonly billboards = new BillboardSystem(); // 世界空间贴图广告牌（Billboard3D·朝相机·深度排序·render-only）
  private readonly diegetic = new DiegeticLayer(); // UI 贴进 3D 空间（Diegetic3D·CSS3DObject 真 DOM 面片·render-only）
  private readonly reflectors = new ReflectorSystem(); // 平面反射镜面（Reflector3D·RTT 倒影·render-only·REQ-3D-PLANAR-REFLECT）
  private readonly anim3d = new Anim3DSystem(); // 程序化位姿动画（Anim3D·spin/bob·render-only·把 title 骰自转等从游戏层手写下沉成数据）
  private readonly paths = new PathSystem(); // 路径跟随（Path3D·沿控制点走·移动平台/巡逻/dolly·render-only）
  private readonly worldUi = new WorldUiLayer(); // 世界空间 UI 头顶飘字（TA Phase 3·render-only·走主程 UI 库）
  private physics: PhysicsSystem | null = null; // 真物理刚体（cannon-es·render-only·**懒加载**·仅有 RigidBody3D 时）
  private physicsLoading = false;
  private rollPending = false; // 掷骰子请求（game 调 rollDice 置位·下帧 sync 里执行重掷）
  // 天空盒
  private sky: THREE.Mesh | null = null;
  private skySig = '';
  private fogSig = '';
  // 环境光照（IBL·PMREM 中性影室·懒建一次）：金属/玻璃反射用。强度由 Sky3D.env 数据驱动。
  private envTex: THREE.Texture | null = null;
  private envIntensity = -1; // 当前已设强度（脏标·变才写 scene.environmentIntensity）
  private hdriTex: THREE.Texture | null = null; // 真 HDRI PMREM 环境贴图（REQ-3D ⑤·区别中性影室 envTex）
  private hdriKey = ''; // 当前已装 HDRI 资产 key（脏标·变/就绪才重建）
  // 2D-in-3D 扁平层（sprite/text/shape + 透明 Mesh3D fallback）
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly glows = new Map<string, THREE.Sprite>(); // Glow3D 加性辉光精灵池
  private glowTex: THREE.Texture | null = null; // 共享径向渐变贴图（懒建一次）
  private readonly modeOf = new Map<string, string>();
  private readonly texCache = new Map<string, THREE.Texture>();
  private readonly textSig = new Map<string, string>();
  // 拾取包围盒（Pickable3D·render-only 输入层）：每帧 sync 捕获·pick() 射线求交。entityId → 世界 AABB + 信号名。
  private readonly pickables = new Map<string, { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; signal: string }>();
  // W1-C 脏标跳渲 + profiler
  private cpuMs = 0;
  private rendered = false;
  private lastRenderSig = '';
  private lastShadowSig = '';
  private width: number; // 可变（resize·视窗/容器缩放）
  private height: number;
  private resizeObserver?: ResizeObserver; // 容器尺寸观察者（init 挂·destroy 断）
  private background: number;
  private antialias = true; // 基础 MSAA（用 SMAA 时置 false 省缓冲）
  private dprCap = 2; // devicePixelRatio 上限（运行时可改·提帧最大单点）
  private shadowMapSize = 2048; // 主阴影贴图边长（运行时可改）
  private readonly fov: number;
  private readonly zStep: number;
  private readonly assets?: AssetManager;
  private readonly materials?: ReadonlyMap<string, MaterialSpec>; // 材质资源目录（REQ-Resource ④）

  constructor(opts: ThreeRendererOptions = {}) {
    this.width = opts.width ?? 640;
    this.height = opts.height ?? 400;
    this.background = opts.background ?? 0x0a0a14;
    this.fov = opts.fov ?? 50;
    this.zStep = opts.zStep ?? 0.01;
    this.assets = opts.assets;
    this.materials = opts.materials;
    this.antialias = opts.antialias ?? true;
    this.dprCap = opts.dprCap ?? 2;
    this.shadowMapSize = opts.shadowMapSize ?? 2048;
  }

  init(container: HTMLElement): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.background);
    this.cameras = new CameraRig(this.fov, this.width / this.height); // 透视 + 正交两台·按 Camera3D 选
    this.lights = new LightRig(this.scene, this.shadowMapSize); // 暖白主光（投软影）+ 冷蓝补光（Light3D 在场则数据驱动）
    this.gl = new THREE.WebGLRenderer({ antialias: this.antialias });
    this.gl.setSize(this.width, this.height);
    this.gl.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, this.dprCap)); // W1-D：retina 不糊·上限 dprCap 防超采样（运行时可降提帧）
    this.gl.toneMapping = THREE.ACESFilmicToneMapping; // W1-D：PBR 通透不削顶（天空盒材质 toneMapped:false 保色）
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap; // 软阴影（PCFSoft 在本 three 版已弃用→回退此档）
    this.gl.shadowMap.autoUpdate = false; // W1-C：阴影按需重算（仅投影体/灯变时置 needsUpdate）
    this.gl.info.autoReset = false; // W1-C/profiler：手动重置 → draw 计数跨全 pass 累加
    this.post = new PostPipeline(this.gl, this.width, this.height);
    this.models = new ModelPool(this.assets);
    container.appendChild(this.gl.domElement);
    this.worldUi.init(container); // 世界 UI DOM 叠层（覆于 canvas 上·pointer-events:none）
    this.indexDebug.init(container); // 实体编号 debug 叠层（同上·默认关）
    this.diegetic.init(container, this.width, this.height); // UI 贴进 3D 空间（CSS3DRenderer 叠层·真 DOM 面片）
    // 视窗自适应（render-only·碰所有 3D 游戏）：观察容器盒·尺寸变即 resize。headless/无 ResizeObserver 环境跳过。
    // 容器紧贴画布（如 game-z stage·line-height:0）→ 观测值=当前画布尺寸 → resize 判定未变即空转（无害·保留原固定尺寸+居中）；
    // 容器由布局撑满（width/height:100%）→ 画布自动随视窗缩放（响应式）。
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth, h = container.clientHeight;
        if (w > 0 && h > 0) this.resize(w, h);
      });
      this.resizeObserver.observe(container);
    }
  }

  /**
   * 改渲染尺寸（视窗/容器缩放·render-only·**碰所有 3D 游戏**）：更新 gl 画布 + 后处理渲染目标 + 尺寸字段。
   * 相机 aspect 每帧从 width/height 重算（见 sync）故自动跟；无需碰相机。尺寸未变即跳（防 observer 抖动/反馈环）。
   * init() 挂的 ResizeObserver 自动调它；游戏也可手动调（如自管布局的场景）。
   */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    if (!this.gl || (w === this.width && h === this.height)) { this.width = w; this.height = h; return; }
    this.width = w;
    this.height = h;
    this.gl.setSize(w, h);
    this.gl.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, this.dprCap)); // retina 上限 dprCap·同 init
    this.post.resize(w, h);
    this.diegetic.resize(w, h); // CSS3D 叠层随画布尺寸（投影匹配 WebGL 相机）
    this.lastRenderSig = ''; // 尺寸变但场景签名可能没变 → 强制下帧重渲·别被脏标跳渲留旧缓冲（拉伸/错位）
  }

  /** 运行时改 devicePixelRatio 上限（画质/性能档·render-only）。降 dprCap = 提帧最大单点（每 pass 像素按 dpr² 缩）。 */
  setPixelRatioCap(cap: number): void {
    this.dprCap = Math.max(0.5, cap);
    if (!this.gl) return;
    this.gl.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, this.dprCap));
    this.gl.setSize(this.width, this.height); // 重设让新 pixelRatio 生效
    this.post.resize(this.width, this.height);
    this.lastRenderSig = '';
  }

  /** 运行时改主阴影贴图边长（画质/性能档·render-only）。动态场景每帧重算阴影 → 降边长直接省一半开销（1024 vs 2048）。 */
  setShadowMapSize(size: number): void {
    this.shadowMapSize = Math.max(256, Math.round(size));
    this.lights?.setShadowMapSize(this.shadowMapSize);
    this.lastShadowSig = ''; // 强制下帧重算阴影贴图（新分辨率生效）
    this.lastRenderSig = '';
  }

  // 懒加载物理子系统：仅当场上出现 RigidBody3D 才 `import('./three/physics.js')`（连带 cannon-es 进独立 chunk）。
  // 无刚体的游戏（如 game-d）永不触发 → physics.ts/cannon-es 根本不进模块图，vite dev 也不会因缺包报错。
  private ensurePhysics(world: IWorld): void {
    if (this.physics || this.physicsLoading) return;
    if (world.query('RigidBody3D').length === 0) return;
    this.physicsLoading = true;
    void import('./three/physics.js').then((m) => { this.physics = new m.PhysicsSystem(); }).catch((e) => { console.warn('[renderer] 物理子系统加载失败 → 跳过刚体（纯表现·不影响玩法）', e); });
  }

  /** 运行时改场景清屏底色（相机在天空盒球外时·清屏色即背景）。游戏按屏切换暗/亮氛围用。 */
  setBackground(hex: number): void {
    this.background = hex;
    if (this.scene) this.scene.background = new THREE.Color(hex);
  }

  /** 运行时设场景背景为**图片**（手绘天空渐变图·Cloud Design 素材）。null=回退纯色。 */
  setBackgroundTexture(url: string | null): void {
    if (!this.scene) return;
    if (!url) { this.scene.background = new THREE.Color(this.background); return; }
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
  }

  sync(world: IWorld): void {
    const t0 = performance.now();
    this.gl.info.reset(); // 手动重置 → calls/triangles 跨 scene+post 全 pass 累加（真·每帧 draw 数）
    const seen = new Set<string>();
    const poses: Pose3D[] = [];
    const instGroups: InstGroups = new Map(); // W1-A：不透明 Mesh3D 按视觉签名分批
    const pbrBuilders = new Map<string, PbrBatchBuild>(); // PBR 批构建器（REQ-3D-PBR-INSTANCING·按材质签名·渲染器持贴图解析器故在此建闭包）
    this.frame++;
    const cam3d = getCamera3D(world); // 盒庭模式开关（在场=轨道相机 + 2D 实体落地面 + 柔和阴影）
    const followTarget = cam3d?.mode === 'follow' ? cam3d.target : undefined; // mode:'follow' 注视的实体
    let followPose: Pose3D | undefined; // 收集期捕获 target 的位姿（= 相机注视点）
    const sky = getSky3D(world);
    this.syncSky(sky);
    this.syncEnv(sky); // 环境光照(IBL)：Sky3D.env>0 → 中性影室环境贴图（金属/玻璃反射·TA Phase 5）
    this.syncFog(getFog3D(world)); // 距离雾（scene.fog·远处柔化·TA Phase 4）
    this.syncGlow3D(world); // 加性辉光精灵（Glow3D·火盆/灯笼/门光晕·复刻原型 glowSprite）
    this.lights.sync(this.scene, getLights3D(world), world); // 数据化光照（维护 lightSig 供脏标·含动态局部光位姿）
    // 真物理刚体（cannon-es·render-only·表现非同步）：先按需重掷 → 步进 → 把位置/四元数写回 Transform3D（须在 collect 前）。
    this.ensurePhysics(world); // 有 RigidBody3D 才懒加载 physics.ts（连带 cannon-es）——无刚体的游戏永不触发
    if (this.rollPending && this.physics) { this.physics.roll(world); this.rollPending = false; }
    const physLive = this.physics ? this.physics.sync(world, performance.now()) : 0;
    // VFX 粒子（TA Phase 1·render-only）：每帧 CPU 模拟推进。存活粒子数 >0 → 折进 renderSig 强制重渲（粒子在动）。
    const vfxLive = this.vfx.sync(this.scene, world, performance.now());
    // 运动拖尾采样（Trail3D·render-only）：据实体世界位更新位置历史（相机后才建几何）。有位移的拖尾数 >0 → 折进 renderSig。
    const trailLive = this.trails.sample(world);
    // 地面贴花（Decal3D·render-only·不需相机·世界空间贴地）：管理贴片网格 + 跟随实体地面位。有变化 >0 → 折进 renderSig。
    const decalLive = this.decals.sync(this.scene, world, (k) => this.pbrMapTexture(k, true)); // tex 路取真图（sRGB·同 billboard 先例）
    // 世界空间广告牌（Billboard3D·render-only·Sprite 自朝相机）：管理精灵 + 定位 + 取贴图（sRGB）。有变化 >0 → 折进 renderSig。
    const billboardLive = this.billboards.sync(this.scene, world, (k) => this.pbrMapTexture(k, true));
    this.reflectors.sync(this.scene, world, Math.min(globalThis.devicePixelRatio ?? 1, this.dprCap)); // 平面反射镜面（倒影随场景/相机变自动更新·内容变进 renderSig 脏帧）
    // 程序化位姿动画（Anim3D·render-only）：据壁钟改 Transform3D 分量（spin/bob）——须在 collect 前（渲染读更新后的位姿）。
    const animPoseLive = this.anim3d.sync(world, performance.now());
    // 路径跟随（Path3D·render-only）：据壁钟沿控制点写 Transform3D 位（移动平台/巡逻/dolly）——须在 collect 前。
    const pathLive = this.paths.sync(world, performance.now());
    // Pivot3D 父合成（render-only）：把整组子实体位姿合成到 pivot 变换下 → 整场当一个单元转/缩/移（骰钟转场 §F）。
    // 无 Pivot3D → 空 map·pivotPose 恒等返回·零开销（向后兼容）。
    const pivotMap = new Map<string, THREE.Matrix4>();
    for (const [pid] of world.query('Pivot3D')) {
      const pv = world.getComponent<Pivot3D>(pid, 'Pivot3D');
      const pt = world.getComponent<Transform3D>(pid, 'Transform3D');
      if (!pv || !pt || pv.children.length === 0) continue;
      const M = pivotMatrix({ x: pt.x, y: pt.y, z: pt.z, rotX: pt.rotX ?? 0, rotY: pt.rotY ?? 0, rotZ: pt.rotZ ?? 0, scale: pt.scale ?? 1 }, pv.centerX ?? 0, pv.centerY ?? 0, pv.centerZ ?? 0);
      for (const c of pv.children) pivotMap.set(c, M);
    }
    const pivotPose = (id: string, pose: Pose3D): Pose3D => { const M = pivotMap.get(id); return M ? applyPivot(M, pose) : pose; };

    // 拾取标记（Pickable3D·render-only 输入层）：预收集本帧可拾取实体 → 下面在其位姿算出后捕获世界 AABB（pick() 用）。
    const pickSet = new Map<string, Pickable3D>();
    for (const [pid] of world.query('Pickable3D')) { const pk = world.getComponent<Pickable3D>(pid, 'Pickable3D'); if (pk) pickSet.set(pid, pk); }
    this.pickables.clear();

    for (const r of collectRenderables(world)) {
      // 导入式 glTF 模型（Model3D）：圆润真模型。位姿与 Mesh3D 同套路。未就绪本帧不画（向后兼容）。
      if (r.model3d) {
        const obj = this.models.ensure(this.scene, r.entityId, r.model3d);
        this.assetReady.mark(r.model3d.modelKey, !!obj); // 就绪版本号：迟到模型就绪同样迫使重绘（静态场景防吞帧）
        if (obj) {
          const ms = r.model3d.scale ?? 1;
          const rawPose: Pose3D = (r.transform3d || cam3d)
            ? (r.transform3d ? transform3dPose(r.transform3d) : groundPose(r, 0))
            : renderablePose(r, this.zStep);
          const pose = pivotPose(r.entityId, rawPose); // Pivot3D 父合成（无 pivot 则恒等）
          obj.position.set(pose.x, pose.y, pose.z);
          if (pose.quat) obj.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
          else obj.rotation.set(pose.rx ?? 0, pose.ry ?? 0, pose.rotZ);
          obj.scale.set(pose.sx * ms, pose.sy * ms, (pose.sz ?? 1) * ms);
          if (r.model3d.tint !== undefined) this.models.tint(r.entityId, r.model3d.tint);
          const anim = world.getComponent<AnimState3D>(r.entityId, 'AnimState3D'); // 骨骼动画（render-only·播 glTF clip）
          if (anim) this.models.applyAnim(r.entityId, anim);
          seen.add(r.entityId);
          poses.push(pose);
          if (r.entityId === followTarget) followPose = pose;
        }
        continue;
      }
      // 3D 物件（Mesh3D）：有 Material3D → PBR 单 mesh（特征物件）；否则不透明归批实例化、透明走 fallback。
      if (r.mesh3d) {
        const pose = pivotPose(r.entityId, mesh3dPose(r, r.mesh3d, cam3d, this.zStep));
        poses.push(pose);
        seen.add(r.entityId);
        if (r.entityId === followTarget) followPose = pose;
        const pk = pickSet.get(r.entityId); // 可拾取 → 捕获世界 AABB（半尺寸取 Mesh3D·球=直径的一半）
        if (pk) {
          const m = r.mesh3d, half = m.width / 2;
          this.pickables.set(r.entityId, {
            cx: pose.x, cy: pose.y, cz: pose.z,
            hx: half * Math.abs(pose.sx),
            hy: (m.shape === 'sphere' ? half : m.height / 2) * Math.abs(pose.sy),
            hz: (m.shape === 'sphere' ? half : (m.depth ?? m.width) / 2) * Math.abs(pose.sz ?? 1),
            signal: pk.signal,
          });
        }
        if (r.mesh3d.dieFaces) {
          const mesh = this.ensureDieMesh3D(r, r.mesh3d);
          applyPose(mesh, pose);
        } else if (r.mesh3d.voxelTex) {
          // 体素（voxelTex 提速块贴图）：不透明 → 按 voxelMode 签名**归批实例化**（同款体素 1 draw call·
          //   game102 大立方几百体素只剩 ~几批·「又大又细」·REQ-3D-RENDER-EFFICIENCY 3D 半场）；透明 → 单 mesh。
          if ((r.color?.alpha ?? 1) >= 1) {
            const key = voxelMode(r.mesh3d);
            let g = instGroups.get(key);
            if (!g) { g = []; instGroups.set(key, g); }
            g.push({ r, pose });
          } else {
            const mesh = this.ensureVoxelMesh3D(r, r.mesh3d);
            applyPose(mesh, pose);
          }
        } else if (r.material3d) {
          // PBR/Material3D（REQ-3D-PBR-INSTANCING）：不透明 + 无描边 + 非透明材质 → **按材质签名归批实例化**
          //   （同材质 = 1 InstancedMesh·color 在签名里 → 每色一批·game102 5 色真材质立方 = ~5 draw call·与体素数无关）；
          //   透明（玻璃 transmission / 软混合）/ 描边（背面壳子网格）→ 走单 mesh（排序/子网格·同 W1-A 透明先例）。
          const eff = r.material3d.materialRef ? applyMaterialRef(r.material3d, this.materials?.get(r.material3d.materialRef)) : r.material3d;
          if ((r.color?.alpha ?? 1) >= 1 && !eff.outline && !eff.dissolve && !pbrTransmissive(eff)) { // dissolve 走单 mesh（DissolveSystem 每帧驱动 uniform）
            const maps = this.resolvePbrMaps(eff);
            const mk = `${maps.map ? 'M' : ''}${maps.normalMap ? 'N' : ''}${maps.roughnessMap ? 'R' : ''}${maps.aoMap ? 'A' : ''}${maps.metalnessMap ? 'E' : ''}${maps.emissiveMap ? 'G' : ''}${maps.ormMap ? 'O' : ''}`; // 贴图就绪态入 key（迟到贴图就绪 → 换批挂上·配 AssetReadyTracker 自愈）
            const key = `pbr|${pbrSig(r.mesh3d, eff)}|${mk}`;
            let g = instGroups.get(key);
            if (!g) { g = []; instGroups.set(key, g); pbrBuilders.set(key, () => buildPbrGeoMat(r.mesh3d!, eff, maps)); } // 首见该签名 → 注册构建器（建一次共享材质）
            g.push({ r, pose });
          } else {
            const mesh = this.ensurePbrMesh(r, r.mesh3d, r.material3d);
            applyPose(mesh, pose);
          }
        } else if ((r.color?.alpha ?? 1) >= 1) {
          const key = mesh3dBatchKey(r.mesh3d);
          let g = instGroups.get(key);
          if (!g) { g = []; instGroups.set(key, g); }
          g.push({ r, pose });
        } else {
          const mesh = this.ensureMesh3D(r, r.mesh3d);
          applyPose(mesh, pose);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.paintMesh3D(mesh, r.mesh3d, r.color?.alpha ?? 1);
        }
        continue;
      }
      // 2D 扁平层（sprite/text/shape）。
      const ready = !!(r.sprite && this.assets && this.spriteReady(r.sprite.textureKey, r.frame?.index));
      const mode = chooseRenderMode(r, ready);
      if (mode === 'none') continue;
      seen.add(r.entityId);
      const mesh = this.ensureMesh(r, mode);
      const pose = renderablePose(r, this.zStep);
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.rotation.z = pose.rotZ;
      mesh.scale.set(pose.sx, pose.sy, 1);
      this.paint(mesh, r, mode);
      poses.push(pose);
      if (r.entityId === followTarget) followPose = pose;
    }

    // 骨骼动画推进（render-only·壁钟 delta·须在 applyAnim 后）：活跃混合器 >0 → 折进 renderSig 持续重渲 + 刷骨骼阴影。
    const animLive = this.models.update(performance.now());
    // 材质 UV 动画（Material3D.uvAnim·render-only·须在 mesh 建好后）：逐帧改克隆贴图 offset/repeat（滚动/序列帧）。活跃 >0 → 持续重渲。
    const uvLive = this.uvAnim.sync(world, this.meshes, performance.now());
    const dissolveLive = this.dissolve.sync(world, this.meshes, performance.now()); // 溶解每帧推进 progress/time uniform

    // W1-C 脏标跳渲：渲染签名（投影体姿 + 相机 + 灯 + 后处理 + 天空云飘帧 + 粒子/物理/骨骼动画活跃帧）。与上帧一致 → 跳过
    // instanceMatrix 上传 + 阴影 + render（画面不变·省 CPU/GPU/带宽）——「低开销」最大单点。
    const post = getPost3D(world);
    const ph = hashPoses(poses);
    // 震屏：先算 trauma 偏移（据壁钟衰减）——active 时折进 renderSig 持续重渲直至回正。
    const shakeOff = this.camShake.update(cam3d?.shake, performance.now());
    // 跟随柔化：follow 模式对 target 位做指数平滑 + lookAhead 预读——settling(未收敛) 时折进 renderSig 持续重渲直至贴合。
    let followCenter: DampedCenter | null = null;
    if (cam3d && cam3d.mode === 'follow' && followPose) {
      followCenter = this.followDamp.update({ x: followPose.x, y: followPose.y, z: followPose.z }, cam3d.follow, performance.now());
    } else { this.followDamp.reset(); }
    // 运镜过渡：据 Camera3D.tween.trigger 算过渡进度——active 时折进 renderSig 持续重渲直至到位（applyOrbit 内做取景混合）。
    const camTweenActive = this.cameras.tickTween(cam3d?.tween, performance.now());
    // 命中闪白：据 Post3D.flash.trigger 算衰减量——>0 时折进 renderSig 持续重渲直至归零。
    const flashAmt = this.flash.update(post?.flash, performance.now());
    const renderSig = `${ph}|${camSig(cam3d)}|${this.lights.lightSig}|${postSig(post)}|${sky?.scroll ? this.frame : (sky ? `${sky.top}.${sky.bottom}` : '')}|${this.debugColliders ? 'd' : ''}|${this.debugNav ? 'n' : ''}|${this.debugIndices ? 'ix' : ''}|${vfxLive > 0 ? this.frame : 'v0'}|${physLive > 0 ? this.frame : 'p0'}|${animLive > 0 ? this.frame : 'a0'}|${animPoseLive > 0 ? this.frame : 'ap0'}|${pathLive > 0 ? this.frame : 'pa0'}|${pivotMap.size > 0 ? this.frame : 'pv0'}|${shakeOff.active ? this.frame : 's0'}|${followCenter?.settling ? this.frame : 'f0'}|${camTweenActive ? this.frame : 'ct0'}|${trailLive > 0 ? this.frame : 't0'}|${decalLive > 0 ? this.frame : 'dc0'}|${billboardLive > 0 ? this.frame : 'bb0'}|${uvLive > 0 ? this.frame : 'uv0'}|${dissolveLive > 0 ? this.frame : 'ds0'}|${this.lines.contentSig(world)}|${this.diegetic.contentSig(world)}|${this.reflectors.contentSig(world)}|${flashAmt > 0 ? this.frame : 'fl0'}|${this.fogSig}|ag${this.assetReady.gen}`;
    const shadowSig = `${ph}|${this.lights.lightSig}`; // 阴影只随投影体姿/灯变（相机/云飘/后处理不触发）
    if (renderSig === this.lastRenderSig) {
      this.rendered = false;
      this.cpuMs = this.cpuMs * 0.9 + (performance.now() - t0) * 0.1;
      return;
    }
    this.lastRenderSig = renderSig;

    this.batches.sync(this.scene, instGroups, pbrBuilders); // W1-A：脏帧才写 instanceMatrix（一次 buffer 上传）+ 移空批·PBR 批按材质签名

    // 相机解释（REQ-3D-Camera）：① Camera3D → 盒庭轨道/跟随（投影/fov/ortho/near-far 全从数据·CameraRig 算矩阵）；
    //   ② 否则原俯视自适配（向后兼容）。follow 模式注视点 = target 实体位（收集期捕获的 followPose）。
    const aspect = this.width / this.height;
    if (cam3d) {
      const b = poseBounds3D(poses);
      const bc = bounds3DCenter(b);
      const center = followCenter
        ? { x: followCenter.x, y: followCenter.y, z: followCenter.z } // 柔化后（follow·含 lag/lookAhead）
        : followPose
          ? { x: followPose.x, y: followPose.y, z: followPose.z }
          : { x: cam3d.pivotX ?? bc.x, y: cam3d.pivotY ?? bc.y, z: cam3d.pivotZ ?? bc.z };
      const radius = Math.max(bounds3DExtent(b), 1);
      const dist = cam3d.distance ?? fitDistance3D(radius, cam3d.fov ?? this.fov);
      this.cameras.applyOrbit(cam3d, center, dist, aspect, radius, this.fov, SKY_RADIUS, shakeOff);
      this.lights.placeShadow(center, radius);
    } else {
      this.cameras.applyFlat(poseBounds(poses), this.fov, aspect);
    }

    // W1-C 阴影门：autoUpdate=false → 仅投影体/灯变才重算阴影贴图（相机/云飘不触发·大省）。骨骼动画在动 → 也刷（蒙皮影跟动）。
    this.gl.shadowMap.needsUpdate = shadowSig !== this.lastShadowSig || animLive > 0;
    this.lastShadowSig = shadowSig;

    // 消失实体释放（2D 扁平层 + 模型实例）。
    for (const [id, mesh] of this.meshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        disposeMesh(mesh);
        this.meshes.delete(id);
        this.modeOf.delete(id);
        this.textSig.delete(id);
      }
    }
    this.models.sweep(this.scene, seen);

    this.colliderDebug.sync(this.scene, world, this.debugColliders); // 碰撞体线框（debug·开则画·关则清）
    this.navDebug.sync(this.scene, world, this.debugNav); // 导航图/路径（debug·开则画·关则清）

    // 渲染：有 Post3D → EffectComposer 管线；否则直渲（向后兼容）。用 CameraRig 当前激活相机（透视/正交）。
    const cam = this.cameras.current;
    this.reflectors.cull(cam); // 镜面视锥剔除（相机定位后·渲染前）：不在视锥的镜子 visible=false → 零 RTT 全场景渲染
    this.trails.build(this.scene, world, cam); // 运动拖尾几何：据历史 + 相机方位重建「朝相机带状」（须相机就绪后·渲染前）。
    this.lines.build(this.scene, world, cam); // 世界折线几何：据给定点 + 相机重建「朝相机带状」（瞄准线/牵引/路径·相机就绪后）。
    if (post) this.post.render(this.scene, cam, post, flashAmt);
    else this.gl.render(this.scene, cam);
    this.worldUi.sync(world, cam, this.width, this.height); // 头顶飘字：锚点投影 + 定位 LayoutNode 宿主（相机就绪后）
    this.indexDebug.sync(world, cam, this.width, this.height, this.debugIndices); // 实体编号徽标（debug·开则画·关则清）
    this.diegetic.sync(world, cam); // UI 贴 3D 面：CSS3DObject 位姿从 Transform3D + 同相机投影渲 DOM 层（相机就绪后）
    this.rendered = true;
    this.cpuMs = this.cpuMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  // 性能剖析快照（profiler·游戏层读 → LayoutNode HUD·像虚幻 stat）。drawCalls/triangles 跨全 pass 累加；
  // 跳渲帧 calls=0（画面复用上帧）。
  // 开关碰撞体调试线框（游戏层菜单调·render-only）。立即失效脏标 → 下帧重渲反映。
  setDebugColliders(on: boolean): void {
    this.debugColliders = on;
    this.lastRenderSig = ''; // 强制下帧重渲（开/关线框）
  }

  // 开关导航可视化（NavGraph 航点/连边 + 路径线·render-only）。立即失效脏标 → 下帧重渲反映。
  setDebugNav(on: boolean): void {
    this.debugNav = on;
    this.lastRenderSig = '';
  }

  // 开关实体编号 debug 徽标（每个带锚实体一枚 `#N`+id·稳定编号供指名反馈·render-only）。立即失效脏标 → 下帧反映。
  setDebugIndices(on: boolean): void {
    this.debugIndices = on;
    this.lastRenderSig = '';
  }

  // 失效脏标 → 强制下帧重渲（调试面板改了 render-only 组件/参数后调·确保立即反映）。
  invalidate(): void { this.lastRenderSig = ''; }

  // 掷骰子（游戏层调·render-only 表现物理）：置位 → 下帧 sync 里把所有刚体抬高 + 随机翻滚重掷。
  rollDice(): void { this.rollPending = true; this.invalidate(); }

  /** 取走本帧物理事件信号（RigidBody3D settleSignal/toppleSignal·REQ-3D-SETTLE-SIGNAL）。游戏输入胶水每帧调 →
   *  `enqueueAction(signal,{arg:entityId})` → Signal → sim。与 pick() 同 pull 通路（本地外源输入·不进 hash·不碰确定性）。 */
  drainPhysicsSignals(): { signal: string; arg: string }[] { return this.physics?.drainSignals() ?? []; }

  // 运行时对某刚体施力（render-only·输入胶水用）：拖拽甩球/点击弹射等**输入时算出方向**的冲量走这条命令式接口
  //   （同 pick/rollDice 先例）；纯数据的定向施力用 `Impulse3D` 组件（bump trigger）。物理未就绪则 no-op。
  applyImpulse(id: string, ix: number, iy: number, iz: number, torque?: readonly [number, number, number], mode: 'impulse' | 'velocity' = 'impulse'): void {
    this.physics?.applyImpulse(id, ix, iy, iz, torque, mode);
    this.invalidate();
  }

  // 屏坐标 → 世界坐标（通用 screen→world seam·render-only 输入胶水）：把光标/触点投射到世界某**轴平面**上的点。
  // axis='z'（缺省·平面 z=coord·透视正视场景用）· 'y'（平面 y=coord·**俯视/顶视场景**取地面点用）· 'x'。
  // 用当前激活相机（透视/正交都对·Raycaster.setFromCamera）。给「粒子跟随鼠标（Vfx3D.attractor）」「点世界拾取」等游戏层输入用——
  // 与 WorldUI3D 的世界→屏锚点互逆（路线图「UI↔世界锚」的输入向）。返回 null = 无 canvas / 射线平行目标平面 / 交点在相机后。
  screenToWorld(clientX: number, clientY: number, coord = 0, axis: 'x' | 'y' | 'z' = 'z'): { x: number; y: number; z: number } | null {
    if (!this.gl) return null;
    const rect = this.gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameras.current);
    const n = axis === 'y' ? new THREE.Vector3(0, 1, 0) : axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(n, -coord), hit) ? { x: hit.x, y: hit.y, z: hit.z } : null;
  }

  /**
   * 3D 对象拾取（Pickable3D·render-only 输入层·**照 2D t2-clickable 先例·raycast 在输入层做**）：把屏坐标经当前相机
   * 投成射线，对本帧所有 Pickable3D 实体的世界 AABB 求交，返回**最近命中**的实体 id + 信号名（arg=实体 id）。
   * 游戏输入胶水据此 `ActionSink.enqueueAction(signal,{arg})` 入队 → Signal → sim 消费。无命中 / 无 canvas → null。
   * 本地 raycast 与鼠标点击同类外源输入，**不进 sim/hash**（确定性不受影响）。
   */
  pick(clientX: number, clientY: number): { entityId: string; signal: string; arg: string } | null {
    if (!this.gl || this.pickables.size === 0) return null;
    const rect = this.gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameras.current);
    const o = ray.ray.origin, d = ray.ray.direction;
    let bestT = Infinity, bestId = '', bestSig = '';
    for (const [eid, b] of this.pickables) {
      const t = rayAabbT(o.x, o.y, o.z, d.x, d.y, d.z, b.cx, b.cy, b.cz, b.hx, b.hy, b.hz);
      if (t !== null && t < bestT) { bestT = t; bestId = eid; bestSig = b.signal; }
    }
    return bestId ? { entityId: bestId, signal: bestSig, arg: bestId } : null;
  }

  readStats(): RenderStats {
    const info = this.gl.info;
    return {
      rendered: this.rendered,
      cpuMs: this.cpuMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      batches: this.batches.count,
      instances: this.batches.instances,
      fallbackMeshes: this.meshes.size,
      models: this.models.count,
    };
  }

  destroy(): void {
    this.resizeObserver?.disconnect(); this.resizeObserver = undefined; // 断开容器观察者·防泄漏
    if (this.sky) { this.scene.remove(this.sky); (this.sky.material as THREE.MeshBasicMaterial).map?.dispose(); disposeMesh(this.sky); this.sky = null; }
    for (const [, m] of this.meshes) { this.scene.remove(m); disposeMesh(m); }
    this.meshes.clear();
    for (const [, sp] of this.glows) { this.scene.remove(sp); (sp.material as THREE.SpriteMaterial).dispose(); }
    this.glows.clear();
    if (this.glowTex) { this.glowTex.dispose(); this.glowTex = null; }
    for (const [, t] of this.texCache) t.dispose();
    this.texCache.clear();
    this.batches.dispose(this.scene);
    this.colliderDebug.dispose(this.scene);
    this.navDebug.dispose(this.scene);
    this.vfx.dispose(this.scene);
    this.trails.dispose(this.scene);
    this.lines.dispose(this.scene);
    this.decals.dispose(this.scene);
    this.billboards.dispose(this.scene);
    this.uvAnim.dispose();
    this.dissolve.dispose();
    this.reflectors.dispose(this.scene);
    this.anim3d.dispose();
    this.paths.dispose();
    this.camShake.dispose();
    this.cameras?.disposeTween();
    this.flash.dispose();
    this.physics?.dispose();
    this.worldUi.dispose();
    this.indexDebug.dispose();
    this.diegetic.dispose();
    this.models.dispose(this.scene);
    this.lights.dispose(this.scene);
    if (this.envTex) { this.envTex.dispose(); this.envTex = null; this.scene.environment = null; }
    if (this.hdriTex) { this.hdriTex.dispose(); this.hdriTex = null; this.hdriKey = ''; }
    this.post.dispose();
    this.gl.dispose();
    this.gl.domElement.remove();
  }

  // 天空盒（Sky3D）：内面朝里的大球裹住盒庭，画布纹理。参数变才重建纹理；scroll 时云缓慢飘（render-only）。
  private syncSky(sky: Sky3D | null): void {
    if (!sky) {
      if (this.sky) { this.scene.remove(this.sky); (this.sky.material as THREE.MeshBasicMaterial).map?.dispose(); disposeMesh(this.sky); this.sky = null; this.skySig = ''; }
      return;
    }
    const sig = `${sky.top}|${sky.bottom}|${sky.clouds ? 1 : 0}|${sky.cloudTint ?? 0xffffff}`;
    if (!this.sky || this.skySig !== sig) {
      if (this.sky) { this.scene.remove(this.sky); (this.sky.material as THREE.MeshBasicMaterial).map?.dispose(); disposeMesh(this.sky); }
      const mat = new THREE.MeshBasicMaterial({ map: buildSkyTexture(sky), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), mat);
      this.scene.add(this.sky);
      this.skySig = sig;
    }
    if (sky.scroll) this.sky.rotation.y = this.frame * sky.scroll * 0.0004; // 云飘（render-only）
  }

  // 环境光照（IBL·TA Phase 5）：Sky3D.env>0 时装中性影室 PMREM 环境贴图（金属/玻璃靠它反射成像·否则乌黑死板）。
  // 贴图懒建一次（RoomEnvironment 烘成 PMREM·中性studio·与 sky 色彩解耦·稳定可预期）；强度由数据驱动、变才写。
  private syncEnv(sky: Sky3D | null): void {
    const intensity = sky?.env ?? 0;
    if (intensity <= 0) {
      if (this.scene.environment) { this.scene.environment = null; this.envIntensity = -1; }
      return;
    }
    // 真 HDRI 资产在场且就绪 → 用它；否则回退程序化中性影室（就绪后自动切·向后兼容）。
    const envTex = (sky?.envMap ? this.hdriEnv(sky.envMap) : null) ?? this.roomEnv();
    if (this.scene.environment !== envTex) this.scene.environment = envTex;
    if (this.envIntensity !== intensity) { this.scene.environmentIntensity = intensity; this.envIntensity = intensity; }
  }

  // 程序化中性影室 PMREM 环境贴图（懒建一次·RoomEnvironment·与 sky 色彩解耦·稳定可预期）。HDRI 缺省/未就绪的 fallback。
  private roomEnv(): THREE.Texture {
    if (!this.envTex) {
      const pmrem = new THREE.PMREMGenerator(this.gl);
      const room = new RoomEnvironment();
      this.envTex = pmrem.fromScene(room, 0.04).texture; // 0.04=轻微模糊·柔反射
      room.dispose();
      pmrem.dispose();
    }
    return this.envTex;
  }

  // 真 HDRI 环境贴图（REQ-3D ⑤）：从 AssetManager 取 .hdr 字节（equirect）→ RGBELoader.parse → PMREM → 环境贴图。
  // 字节未就绪 → null（本帧回退程序化·就绪后自动切）。解析失败容错回退（不崩画面）。按 key 缓存·变才重建。
  private hdriEnv(key: string): THREE.Texture | null {
    if (this.hdriKey === key) return this.hdriTex; // 此 key 已处理（成功=tex·**失败=null 也直接回**·别每帧重 parse 坏图·RENDERHYG 尾）
    const res = this.assets?.get(key);
    if (!res || !isModelHandle(res.handle)) return null; // .hdr 以字节资产(ArrayBuffer)登记·未就绪则回退
    try {
      const hdr = new HDRLoader().parse(res.handle as ArrayBuffer); // equirect HDR → { data,width,height,type }
      const eq = new THREE.DataTexture(hdr.data, hdr.width, hdr.height, THREE.RGBAFormat, hdr.type);
      eq.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(this.gl);
      const tex = pmrem.fromEquirectangular(eq).texture;
      eq.dispose();
      pmrem.dispose();
      if (this.hdriTex) this.hdriTex.dispose();
      this.hdriTex = tex;
      this.hdriKey = key;
      return tex;
    } catch (e) {
      console.warn('[renderer] HDRI 环境贴图解析失败 → 回退程序化影室（纯表现·不影响玩法）', e);
      this.hdriKey = key; // 记下·别每帧重试同一坏图
      this.hdriTex = null;
      return null;
    }
  }

  // 距离雾（scene.fog 线性·TA Phase 4）：无 Fog3D → 清雾；否则设/更新（fogSig 供脏标）。
  private syncFog(fog: Fog3D | null): void {
    if (!fog) { if (this.scene.fog) { this.scene.fog = null; this.fogSig = ''; } return; }
    const sig = `${fog.color}|${fog.near}|${fog.far}`;
    if (this.fogSig !== sig) {
      this.scene.fog = new THREE.Fog(fog.color & 0xffffff, fog.near, fog.far);
      this.fogSig = sig;
    }
  }

  // ── 2D-in-3D 扁平层（sprite/text/shape + 透明 Mesh3D fallback）──────────────────────

  // 建/复用 mesh：模式不变则复用；模式变了（几何形态变）重建。
  private ensureMesh(r: Renderable, mode: string): THREE.Mesh {
    const prev = this.meshes.get(r.entityId);
    if (prev && this.modeOf.get(r.entityId) === mode) return prev;
    if (prev) { this.scene.remove(prev); disposeMesh(prev); }
    const mesh = new THREE.Mesh(buildGeometry(r, mode), new THREE.MeshStandardMaterial({ transparent: true }));
    this.meshes.set(r.entityId, mesh);
    this.modeOf.set(r.entityId, mode);
    this.scene.add(mesh);
    return mesh;
  }

  // 上色/贴图：sprite/text → 纹理；shape/placeholder → Color.tint 纯色；alpha → 透明度。
  // W1-B：仅当贴图引用变（USE_MAP define 翻转）才 needsUpdate；颜色/alpha 是 uniform 不需重编。
  private paint(mesh: THREE.Mesh, r: Renderable, mode: string): void {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = r.color?.alpha ?? 1;
    let map: THREE.Texture | null = null;
    let color = (r.color?.tint ?? 0xcccccc) & 0xffffff;
    if (mode === 'sprite' && r.sprite) { map = this.spriteTexture(r.sprite.textureKey, r.frame?.index); color = 0xffffff; }
    else if (mode === 'text' && r.text) { map = this.textTexture(r); color = 0xffffff; }
    if (mat.map !== map) { mat.map = map; mat.needsUpdate = true; }
    mat.color.setHex(color);
  }

  // 建/复用透明 Mesh3D 单 mesh（实例批不便逐实例 alpha → 少量走老路）。与扁平层共用 meshes/modeOf。
  private ensureMesh3D(r: Renderable, m: Mesh3D): THREE.Mesh {
    const mode = `m3:${m.shape}`;
    const prev = this.meshes.get(r.entityId);
    if (prev && this.modeOf.get(r.entityId) === mode) return prev;
    if (prev) { this.scene.remove(prev); disposeMesh(prev); }
    const mesh = buildMesh3D(m);
    this.meshes.set(r.entityId, mesh);
    this.modeOf.set(r.entityId, mode);
    this.scene.add(mesh);
    return mesh;
  }

  // 3D 命运骰（Mesh3D.dieFaces·render-only·6 面 pip 材质）：按骰面签名池管理，与哑光/PBR 共用 meshes 池。
  private ensureDieMesh3D(r: Renderable, m: Mesh3D): THREE.Mesh {
    const mode = dieMode(m);
    const prev = this.meshes.get(r.entityId);
    if (prev && this.modeOf.get(r.entityId) === mode) return prev;
    if (prev) { this.scene.remove(prev); disposeMesh(prev); }
    const mesh = buildDieMesh3D(m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.meshes.set(r.entityId, mesh);
    this.modeOf.set(r.entityId, mode);
    this.scene.add(mesh);
    return mesh;
  }

  // 加性辉光精灵（Glow3D·render-only·复刻原型 glowSprite）：查 Glow3D 实体 → 建/更朝镜头的加性光晕于其 Transform3D 处。
  private syncGlow3D(world: IWorld): void {
    const seen = new Set<string>();
    for (const [id] of world.query('Glow3D')) {
      const g = world.getComponent<Glow3D>(id, 'Glow3D');
      const t = world.getComponent<Transform3D>(id, 'Transform3D');
      if (!g || !t) continue;
      seen.add(id);
      let sp = this.glows.get(id);
      if (!sp) {
        if (!this.glowTex) this.glowTex = buildGlowTexture();
        const mat = new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        sp = new THREE.Sprite(mat);
        this.scene.add(sp);
        this.glows.set(id, sp);
      }
      const mat = sp.material as THREE.SpriteMaterial;
      mat.color.setHex(g.color & 0xffffff);
      mat.opacity = g.opacity ?? 0.6;
      sp.scale.set(g.scale, g.scale, 1);
      sp.position.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    }
    for (const [id, sp] of this.glows) if (!seen.has(id)) { this.scene.remove(sp); (sp.material as THREE.SpriteMaterial).dispose(); this.glows.delete(id); }
  }

  // 体素表面贴图 mesh（Mesh3D.voxelTex·render-only·顶/侧程序化贴图）：按贴图签名池管理，与哑光/骰/PBR 共用 meshes 池。
  private ensureVoxelMesh3D(r: Renderable, m: Mesh3D): THREE.Mesh {
    const mode = voxelMode(m);
    const prev = this.meshes.get(r.entityId);
    if (prev && this.modeOf.get(r.entityId) === mode) return prev;
    if (prev) { this.scene.remove(prev); disposeMesh(prev); }
    const mesh = buildVoxelMesh3D(m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.meshes.set(r.entityId, mesh);
    this.modeOf.set(r.entityId, mode);
    this.scene.add(mesh);
    return mesh;
  }

  // PBR 单 mesh（Material3D·TA Phase 5）：按材质签名池管理（preset/覆盖/形状/**真实贴图**变才重建）。与哑光 fallback 共用池。
  private ensurePbrMesh(r: Renderable, m: Mesh3D, mat: Material3D): THREE.Mesh {
    // REQ-Resource ④：materialRef 在场 → 从材质目录查 MaterialSpec 作基底合成有效材质（inline 字段覆盖）；否则原样。
    const eff = mat.materialRef ? applyMaterialRef(mat, this.materials?.get(mat.materialRef)) : mat;
    const maps = this.resolvePbrMaps(eff); // REQ-Resource ①：按 key 取真实贴图（色彩空间按用途设）
    // 贴图就绪态并入 mode：异步贴图从未就绪→就绪时 mode 变 → 重建 mesh 挂上图（同 sprite 异步先例）。
    const mode = `${pbrSig(m, eff)}|${maps.map ? 'M' : ''}${maps.normalMap ? 'N' : ''}${maps.roughnessMap ? 'R' : ''}${maps.aoMap ? 'A' : ''}${maps.metalnessMap ? 'E' : ''}${maps.emissiveMap ? 'G' : ''}${maps.ormMap ? 'O' : ''}${maps.dissolveTex ? 'D' : ''}`; // 溶解碎片图就绪 → mode 变重建挂上（增量②·配 AssetReadyTracker）
    const prev = this.meshes.get(r.entityId);
    if (prev && this.modeOf.get(r.entityId) === mode) return prev;
    if (prev) { this.scene.remove(prev); disposeMesh(prev); }
    const mesh = buildPbrMesh3D(m, eff, maps);
    this.meshes.set(r.entityId, mesh);
    this.modeOf.set(r.entityId, mode);
    this.scene.add(mesh);
    return mesh;
  }

  // 解析 Material3D 的真实贴图 key → THREE.Texture（**色彩空间按材质槽位定**：map=albedo→sRGB·normal/roughness/ao→线性）。
  private resolvePbrMaps(mat: Material3D): PbrMaps {
    const maps: PbrMaps = {};
    const tl = mat.tiling; // 平铺作用于本材质所有贴图槽
    if (mat.map) { const t = this.pbrMapTexture(mat.map, true, tl); if (t) maps.map = t; }
    if (mat.normalMap) { const t = this.pbrMapTexture(mat.normalMap, false, tl); if (t) maps.normalMap = t; }
    if (mat.roughnessMap) { const t = this.pbrMapTexture(mat.roughnessMap, false, tl); if (t) maps.roughnessMap = t; }
    if (mat.aoMap) { const t = this.pbrMapTexture(mat.aoMap, false, tl); if (t) maps.aoMap = t; }
    if (mat.metalnessMap) { const t = this.pbrMapTexture(mat.metalnessMap, false, tl); if (t) maps.metalnessMap = t; } // 金属度·线性
    if (mat.emissiveMap) { const t = this.pbrMapTexture(mat.emissiveMap, true, tl); if (t) maps.emissiveMap = t; } // 自发光·sRGB（颜色）
    if (mat.ormMap) { const t = this.pbrMapTexture(mat.ormMap, false, tl); if (t) maps.ormMap = t; } // ORM 打包·线性
    if (mat.dissolve?.tex) { const t = this.pbrMapTexture(mat.dissolve.tex, true, tl); if (t) maps.dissolveTex = t; } // 溶解碎片贴图（增量②·sRGB）
    return maps;
  }

  // 材质整图贴图（区别 spriteTexture 的 atlas 子矩形）：整张图 + RepeatWrapping + 色彩空间。按 key+cs 缓存·未就绪 null。
  // 色彩空间（REQ-Resource ③）：索引 `spec.colorSpace`（→ TextureDescriptor.colorSpace）优先于槽位默认 `srgbDefault`
  // ——供作者对特殊贴图（如线性反照率、sRGB 数据图）显式覆盖；缺省仍按槽位（albedo=sRGB·法线/粗糙/AO=线性）。
  private pbrMapTexture(key: string, srgbDefault: boolean, tiling?: Material3D['tiling']): THREE.Texture | null {
    const res = this.assets?.get(key);
    if (!res || !isImageHandle(res.handle)) { this.assetReady.mark(key, false); return null; } // 未就绪→记待办
    this.assetReady.mark(key, true); // 就绪版本号：迟到贴图就绪 → gen++ → renderSig 变 → 跳渲失效上屏
    const decl = (res.descriptor as { colorSpace?: 'srgb' | 'linear' }).colorSpace;
    const srgb = decl ? decl === 'srgb' : srgbDefault;
    const rep = tiling?.repeat ?? 1, ox = tiling?.offset?.[0] ?? 0, oy = tiling?.offset?.[1] ?? 0;
    const ck = `pm:${key}:${srgb ? 's' : 'l'}:${rep}:${ox}:${oy}`; // tiling 进缓存键（同图不同平铺 → 各自实例·避免共享 repeat 冲突）
    const hit = this.texCache.get(ck);
    if (hit) return hit;
    const tex = new THREE.Texture(res.handle.image as TexImageSource);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; // 法线/粗糙/金属/ORM 线性·反照率/自发光 sRGB
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rep, rep);
    tex.offset.set(ox, oy);
    tex.needsUpdate = true;
    tex.userData['shared'] = true; // 共享缓存标记（RENDERHYG fix①）：disposeMeshMat 见此标不释放·防销毁一网格连累其他共用者
    this.texCache.set(ck, tex);
    return tex;
  }

  // 上色：box → 正/反/四边 各自取色；plane → 单面取正面色。W1-B：颜色/alpha 是 uniform·**不设 needsUpdate**。
  private paintMesh3D(mesh: THREE.Mesh, m: Mesh3D, alpha: number): void {
    const mats = mesh.material;
    if (Array.isArray(mats)) {
      const a = mats as THREE.MeshStandardMaterial[]; // BoxGeometry 面序 px,nx,py,ny,pz,nz
      const s = faceAxisSlots(m.faceAxis); // 正反面槽按 faceAxis（与 buildMesh3D 同一真相·缺省 z=4/5）
      a[s.front]!.color.setHex(m.frontTint & 0xffffff);
      a[s.back]!.color.setHex((m.backTint ?? m.frontTint) & 0xffffff);
      a[s.edge]!.color.setHex((m.edgeTint ?? 0x1f2937) & 0xffffff); // edge 共享材质实例·设一个即全上色
      for (const mat of a) mat.opacity = alpha;
    } else {
      const mat = mats as THREE.MeshStandardMaterial;
      mat.color.setHex(m.frontTint & 0xffffff);
      mat.opacity = alpha;
    }
  }

  private spriteReady(key: string, frame?: number): boolean {
    const res = this.assets?.resolve(key, frame);
    return !!res && isImageHandle(res.asset.handle);
  }

  // 帧子矩形经 UV offset/repeat 裁剪（atlas 友好）。按 key#frame 缓存。
  private spriteTexture(key: string, frame?: number): THREE.Texture | null {
    const res = this.assets?.resolve(key, frame);
    if (!res || !isImageHandle(res.asset.handle)) return null;
    const ck = `s:${key}#${frame ?? 0}`;
    const hit = this.texCache.get(ck);
    if (hit) return hit;
    const img = res.asset.handle.image as HTMLImageElement | ImageBitmap;
    const tex = new THREE.Texture(img as TexImageSource);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(res.sw / img.width, res.sh / img.height);
    tex.offset.set(res.sx / img.width, 1 - (res.sy + res.sh) / img.height);
    tex.needsUpdate = true;
    this.texCache.set(ck, tex);
    return tex;
  }

  // 文本 → 画布纹理面（单行居中，v1 基础版）。内容变才重画。
  private textTexture(r: Renderable): THREE.Texture | null {
    const tx = r.text!;
    const tint = (r.color?.tint ?? 0xffffff) & 0xffffff;
    const sig = `${tx.content}|${tx.fontSize}|${tx.fontFamily}|${tint}`;
    const ck = `t:${r.entityId}`;
    if (this.textSig.get(r.entityId) === sig) return this.texCache.get(ck) ?? null;
    this.texCache.get(ck)?.dispose();
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
    g.font = `bold ${Math.min(96, tx.fontSize * 2)}px ${tx.fontFamily}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(tx.content, 128, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(ck, tex);
    this.textSig.set(r.entityId, sig);
    return tex;
  }
}
