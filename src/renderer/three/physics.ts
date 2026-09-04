import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import type * as CANNON from 'cannon-es';
import type { IWorld } from '@engine/core/types.js';
import type { RigidBody3D, Mesh3D, Transform3D, Impulse3D, Joint3D, PhysicsWorld3D } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/PhysicsSystem —— 真物理刚体（cannon-es 驱动·TA·**纯表现**）。
//  owner 2026-06-30「为表现非同步」：滚色子/掉落/翻滚 —— **不进 sim/hash·不为联机一致**（RigidBody3D 已入 NON_DETERMINISTIC）。
//  render-only 自由区：可用随机/壁钟。每帧步进 cannon 世界 → 把每个刚体的位置+四元数写回同实体 Transform3D（render-only）
//  → 渲染器照常据 Transform3D 画（含 quat·无万向锁）。体形/尺寸取同实体 Mesh3D（box→半尺寸·sphere→半径）。
//  cannon-es **懒加载**（首个 RigidBody3D 出现才 `import('cannon-es')`）：① 进 3D code-split chunk，2D 游戏不连带打包；
//  ② **可选重依赖**——未安装/解析失败时仅跳过刚体物理、不拖垮整个 app（vite dev 也不会因缺包而白屏）。
// ═══════════════════════════════════════════════════════════════

const STEP = 1 / 60; // 固定物理步长

// 懒加载的 cannon-es 运行时句柄（`import type` 只留类型·运行时靠 dynamic import 取模块）。
let C: typeof import('cannon-es') | null = null;
let loading = false;
function ensureCannon(): void {
  if (C || loading) return;
  loading = true;
  void import('cannon-es').then((m) => { C = m; }).catch((e) => { console.warn('[physics] cannon-es 未安装/解析失败 → 跳过刚体物理（纯表现·不影响玩法）', e); });
}
/** 预加载 cannon-es（返回 Promise）——测试/需要首帧即步进物理时 `await` 它，绕过懒加载首帧跳过。 */
export async function preloadPhysics(): Promise<void> { if (!C) C = await import('cannon-es'); }

export class PhysicsSystem {
  private world: CANNON.World | null = null;
  private readonly bodies = new Map<string, CANNON.Body>();
  private readonly impulseSeen = new Map<string, number>(); // Impulse3D 已施加的 trigger（同 shake/flash 触发范式·防每帧重复施力）
  private readonly joints = new Map<string, { c: CANNON.Constraint; anchor?: CANNON.Body; sig: string }>(); // Joint3D 约束池
  // 物理事件出口（REQ-3D-SETTLE-SIGNAL）：落定/失稳信号队列 + 已发状态（去重·睡醒/回正后重新武装）。
  private readonly pendingSignals: { signal: string; arg: string }[] = [];
  private readonly settledArmed = new Set<string>(); // 已发过 settle·待睡醒重新武装
  private readonly toppledArmed = new Set<string>(); // 已发过 topple·待回正重新武装
  private last = 0;

  // 每帧步进 + 写回 Transform3D。返回活跃刚体数（>0 → 渲染器把帧号折进 renderSig 持续重渲）。nowMs=performance.now()。
  sync(world: IWorld, nowMs: number): number {
    const ents = world.query('RigidBody3D');
    if (ents.length === 0) { if (this.world) this.disposeWorld(); return 0; }
    if (!C) { ensureCannon(); return 0; } // cannon-es 懒加载中/缺失 → 本帧跳过刚体物理
    if (!this.world) this.initWorld(world);
    const cw = this.world!;
    const seen = new Set<string>();
    for (const [id] of ents) {
      seen.add(id);
      if (!this.bodies.has(id)) this.spawn(world, id);
    }
    for (const [id, b] of this.bodies) if (!seen.has(id)) { cw.removeBody(b); this.bodies.delete(id); this.impulseSeen.delete(id); this.settledArmed.delete(id); this.toppledArmed.delete(id); }
    // 数据驱动施力（Impulse3D·nonce 触发）：trigger 变即施加一次线性/角冲量或直接设速度——弹/射/跳/击退的可复用原语。
    for (const [id] of ents) {
      const imp = world.getComponent<Impulse3D>(id, 'Impulse3D');
      if (!imp) continue;
      const prev = this.impulseSeen.get(id);
      if (prev === imp.trigger) continue; // 同 trigger 不重复施力
      this.impulseSeen.set(id, imp.trigger);
      if (prev === undefined) continue; // 首见=基线·不施力（静态带 trigger 的场景装载不自射；出生初速用 RigidBody3D.vx·bump 才施力）
      this.applyImpulse(id, imp.x ?? 0, imp.y ?? 0, imp.z ?? 0, imp.torque, imp.mode);
    }
    this.syncJoints(world); // 物理关节（Joint3D·两刚体间/本体↔世界锚·绳/秋千/布娃娃）——须在刚体 spawn 后（两端就绪才建）。
    const dt = this.last ? Math.min(0.05, (nowMs - this.last) / 1000) : STEP;
    this.last = nowMs;
    cw.step(STEP, dt, 4);
    const SLEEPING = C!.Body.SLEEPING;
    let live = 0; // fix③（RENDERHYG）：脏标 live 数**只计未入睡刚体**——入睡的骰子/碎片不再每帧白烧 GPU/刷阴影。
    for (const [id, b] of this.bodies) {
      const t = world.getComponent<Transform3D>(id, 'Transform3D');
      if (!t) continue;
      t.x = b.position.x; t.y = b.position.y; t.z = b.position.z;
      t.quat = [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w];
      const sleeping = b.sleepState === SLEEPING;
      if (!sleeping) live++;
      // 物理事件出口（REQ-3D-SETTLE-SIGNAL）：落定=入睡沿（发一次·睡醒重新武装）；失稳=倾角超阈值（发一次·回正重新武装）。
      const rb = world.getComponent<RigidBody3D>(id, 'RigidBody3D');
      if (rb?.settleSignal) {
        if (sleeping) { if (!this.settledArmed.has(id)) { this.settledArmed.add(id); this.pendingSignals.push({ signal: rb.settleSignal, arg: id }); } }
        else this.settledArmed.delete(id); // 睡醒 → 重新武装（再落定重发）
      }
      if (rb?.toppleSignal) {
        const upY = 1 - 2 * (b.quaternion.x * b.quaternion.x + b.quaternion.z * b.quaternion.z); // 本体竖轴(0,1,0)转到世界后的 y 分量
        const toppled = upY < Math.cos(rb.toppleTilt ?? 0.6); // 偏离竖直超阈值
        if (toppled) { if (!this.toppledArmed.has(id)) { this.toppledArmed.add(id); this.pendingSignals.push({ signal: rb.toppleSignal, arg: id }); } }
        else this.toppledArmed.delete(id); // 回正 → 重新武装
      }
    }
    return live;
  }

  /** 取走并清空本帧累计的物理事件信号（落定/失稳）。游戏输入胶水每帧调 → enqueueAction(signal,{arg}) → Signal → sim。
   *  与 Pickable3D 同通路（本地外源输入·不进 hash·不碰确定性）。返回空数组表示无事件。 */
  drainSignals(): { signal: string; arg: string }[] {
    if (this.pendingSignals.length === 0) return [];
    const out = this.pendingSignals.slice();
    this.pendingSignals.length = 0;
    return out;
  }

  /** True only after every requested body exists and has entered Cannon's sleep state. */
  areBodiesSleeping(ids: Iterable<string>): boolean {
    if (!C || !this.world) return false;
    const SLEEPING = C.Body.SLEEPING;
    for (const id of ids) {
      const body = this.bodies.get(id);
      if (!body || body.sleepState !== SLEEPING) return false;
    }
    return true;
  }

  // 重掷（掷骰子按钮）：所有刚体抬回各自起点上方 + 随机翻滚（render-only·随机自由）。bodies 为空（未步进过）则 no-op。
  roll(world: IWorld): void {
    for (const [id, b] of this.bodies) {
      if (b.mass === 0 || b.type === C!.Body.STATIC) continue; // 静态体（围栏/地台/地形）不重落——否则做物理沙盘的墙会被甩飞
      const t = world.getComponent<Transform3D>(id, 'Transform3D');
      b.position.set(t?.x ?? 0, 15 + Math.random() * 6, t?.z ?? 0);
      b.quaternion.setFromEuler(Math.random() * 6.283, Math.random() * 6.283, Math.random() * 6.283);
      b.velocity.set((Math.random() - 0.5) * 7, 1, (Math.random() - 0.5) * 7);
      b.angularVelocity.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      b.wakeUp();
    }
  }

  // 运行时施力核（可复用·render-only）：对某刚体施加线性冲量（mode='impulse'·缺省）或直接设速度（mode='velocity'·发射固定初速），
  // 可选角冲量 torque（翻滚/旋转）。body 不存在/物理未就绪 → no-op。供 ① Impulse3D 数据触发 ② 渲染器输入胶水（拖拽弹射）共用。
  applyImpulse(id: string, ix: number, iy: number, iz: number, torque?: readonly [number, number, number], mode: 'impulse' | 'velocity' = 'impulse'): void {
    const b = this.bodies.get(id);
    if (!b || !C) return;
    if (mode === 'velocity') b.velocity.set(ix, iy, iz);
    else b.applyImpulse(new C.Vec3(ix, iy, iz)); // 质心冲量（Δv = J/m）
    if (torque) b.angularVelocity.set(b.angularVelocity.x + torque[0], b.angularVelocity.y + torque[1], b.angularVelocity.z + torque[2]);
    b.wakeUp();
  }

  // 物理关节同步（Joint3D→cannon 约束）：两端刚体就绪才建；参数变重建；实体/组件消失移除。缺失 bodyB → 下帧重试。
  private syncJoints(world: IWorld): void {
    const cw = this.world!;
    const seen = new Set<string>();
    for (const [id] of world.query('Joint3D')) {
      const j = world.getComponent<Joint3D>(id, 'Joint3D');
      if (!j) continue;
      const bodyA = this.bodies.get(id);
      const bodyB = j.bodyB ? this.bodies.get(j.bodyB) : undefined;
      if (!bodyA || (j.bodyB && !bodyB)) { if (this.joints.has(id)) this.removeJoint(id); continue; } // 端点未就绪/已消失 → 拆约束(防悬垂引用崩)·等重建
      const sig = jointSig(j);
      const cur = this.joints.get(id);
      if (cur) { if (cur.sig === sig) { seen.add(id); continue; } this.removeJoint(id); } // 参数变 → 重建
      const built = this.buildJoint(j, bodyA, bodyB);
      if (built) { cw.addConstraint(built.c); this.joints.set(id, { ...built, sig }); seen.add(id); }
    }
    for (const [id] of [...this.joints]) if (!seen.has(id)) this.removeJoint(id);
  }

  private buildJoint(j: Joint3D, bodyA: CANNON.Body, bodyB?: CANNON.Body): { c: CANNON.Constraint; anchor?: CANNON.Body } | null {
    const cw = this.world!;
    const maxForce = j.maxForce ?? 1e6;
    const pivotA = vec(j.pivotA), pivotB = vec(j.pivotB), axis = vec(j.axis ?? [0, 1, 0]);
    let bB = bodyB, anchor: CANNON.Body | undefined;
    if (!bB) { // 世界固定锚：mass-0 静态体（无 shape·仅作约束端点）
      anchor = new C!.Body({ mass: 0 });
      const a = j.anchor ?? [bodyA.position.x, bodyA.position.y, bodyA.position.z];
      anchor.position.set(a[0], a[1], a[2]);
      cw.addBody(anchor);
      bB = anchor;
    }
    let c: CANNON.Constraint;
    switch (j.kind) {
      case 'point': c = new C!.PointToPointConstraint(bodyA, pivotA, bB, pivotB, maxForce); break;
      case 'hinge': c = new C!.HingeConstraint(bodyA, bB, { pivotA, pivotB, axisA: axis, axisB: axis, maxForce }); break;
      case 'distance': c = new C!.DistanceConstraint(bodyA, bB, j.distance as number, maxForce); break;
      case 'lock': c = new C!.LockConstraint(bodyA, bB, { maxForce }); break;
      case 'cone': c = new C!.ConeTwistConstraint(bodyA, bB, { pivotA, pivotB, axisA: axis, axisB: axis, maxForce }); break;
      default: if (anchor) cw.removeBody(anchor); return null;
    }
    return { c, anchor };
  }

  private removeJoint(id: string): void {
    const j = this.joints.get(id);
    if (!j) return;
    this.world?.removeConstraint(j.c);
    if (j.anchor) this.world?.removeBody(j.anchor);
    this.joints.delete(id);
  }

  private initWorld(world: IWorld): void {
    // 物理世界配置（PhysicsWorld3D 场景级单例·REQ-3D-TOWER-STACK）：不挂 = 现行硬编码值（行为逐位不变·护掷骰 -42）；
    // 挂则按数据配（堆叠场景 gravity≈-9.82 + restitution 0 + solverIterations≥40 才立得住）。
    let cfg: PhysicsWorld3D | undefined;
    for (const [id] of world.query('PhysicsWorld3D')) { cfg = world.getComponent<PhysicsWorld3D>(id, 'PhysicsWorld3D'); break; }
    const cw = new C!.World({ gravity: new C!.Vec3(0, cfg?.gravity ?? -42, 0) }); // 缺省 -42（世界单位大→色子下落干脆）
    cw.defaultContactMaterial.restitution = cfg?.restitution ?? 0.4; // 缺省弹一点
    cw.defaultContactMaterial.friction = cfg?.friction ?? 0.35;
    cw.allowSleep = true; // 世界级睡眠开关（cannon 缺此则 per-body allowSleep 形同虚设·刚体永不入睡）——落定省算力 + 使
    //   settleSignal 落定事件 + 脏标 live 排除入睡体（REQ-3D-SETTLE-SIGNAL / RENDERHYG fix③）真正生效。
    if (cfg?.solverIterations !== undefined) (cw.solver as unknown as { iterations: number }).iterations = cfg.solverIterations; // 堆叠需 ≥40（缺省 cannon GSSolver 10·iterations 在 GSSolver 子类上）
    const ground = new C!.Body({ mass: 0, shape: new C!.Plane() }); // 地面：静态·法线朝上·y=0
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    cw.addBody(ground);
    this.world = cw;
    this.last = 0;
  }

  private spawn(world: IWorld, id: string): void {
    const rb = world.getComponent<RigidBody3D>(id, 'RigidBody3D')!;
    const m = world.getComponent<Mesh3D>(id, 'Mesh3D');
    const t = world.getComponent<Transform3D>(id, 'Transform3D');
    const shape = rb.shape ?? (m?.shape === 'sphere' ? 'sphere' : m?.shape === 'cylinder' ? 'cylinder' : 'box');
    const w = m?.width ?? 4, h = m?.height ?? 4;
    const r = Math.max(0.1, w / 2);
    // 地形（heightfield）恒静态（mass 0）；其余取 rb.mass。
    const body = new C!.Body({ mass: shape === 'heightfield' ? 0 : (rb.mass ?? 1) });
    body.position.set(t?.x ?? 0, t?.y ?? 10, t?.z ?? 0);
    if (shape === 'capsule') { // 胶囊=Y 向圆柱 + 两端半球（角色控制器·cannon 无原生胶囊）
      const cylH = Math.max(0.01, h - 2 * r);
      body.addShape(new C!.Cylinder(r, r, cylH, 12));
      body.addShape(new C!.Sphere(r), new C!.Vec3(0, cylH / 2, 0));
      body.addShape(new C!.Sphere(r), new C!.Vec3(0, -cylH / 2, 0));
    } else if (shape === 'heightfield' && rb.heights && rb.heights.length > 1) { // 地形网格（静态·高度沿世界 Y）
      body.addShape(new C!.Heightfield(rb.heights as number[][], { elementSize: rb.elementSize ?? 1 }));
      body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // 网格平铺（同 ground plane·局部 Z 高度→世界 Y）
    } else if (shape === 'convex' && rb.hull && rb.hull.length >= 4) { // 任意凸包（不规则道具·三 ConvexHull 算面）
      body.addShape(convexFromHull(rb.hull));
    } else if (shape === 'sphere') {
      body.addShape(new C!.Sphere(r));
    } else if (shape === 'cylinder') {
      body.addShape(new C!.Cylinder(r, r, Math.max(0.1, h), 12)); // 立柱（桶/冰球/硬币）
    } else {
      body.addShape(new C!.Box(new C!.Vec3(w / 2, h / 2, (m?.depth ?? w) / 2))); // 盒（体素与渲染盒一致）
    }
    if (rb.vx || rb.vy || rb.vz) body.velocity.set(rb.vx ?? 0, rb.vy ?? 0, rb.vz ?? 0);
    if (rb.avx || rb.avy || rb.avz) body.angularVelocity.set(rb.avx ?? 0, rb.avy ?? 0, rb.avz ?? 0);
    if (rb.angularFactor) body.angularFactor.set(rb.angularFactor[0], rb.angularFactor[1], rb.angularFactor[2]); // 锁转轴（[0,1,0]=只平旋永不立边·REQ-3D-RB-ANGFACTOR）
    body.allowSleep = true; body.sleepSpeedLimit = 0.6; body.sleepTimeLimit = 0.4; // 静下来就睡（省算力·色子停稳）
    this.world!.addBody(body);
    this.bodies.set(id, body);
  }

  private disposeWorld(): void {
    if (!this.world) return;
    for (const [id] of [...this.joints]) this.removeJoint(id); // 先拆约束（含世界锚体）再移刚体
    for (const [, b] of this.bodies) this.world.removeBody(b);
    this.bodies.clear();
    this.impulseSeen.clear();
    this.world = null;
    this.last = 0;
  }

  dispose(): void { this.disposeWorld(); }
}

// 凸包顶点 → cannon ConvexPolyhedron（三 ConvexHull 算面·去重顶点·任意不规则凸形）。
function convexFromHull(pts: ReadonlyArray<readonly [number, number, number]>): CANNON.ConvexPolyhedron {
  const hull = new ConvexHull().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const vertices: CANNON.Vec3[] = [];
  const vmap = new Map<string, number>();
  const idxOf = (v: THREE.Vector3): number => {
    const key = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
    let i = vmap.get(key);
    if (i === undefined) { i = vertices.length; vmap.set(key, i); vertices.push(new C!.Vec3(v.x, v.y, v.z)); }
    return i;
  };
  const faces: number[][] = [];
  for (const face of hull.faces) {
    const idxs: number[] = [];
    let e = face.edge;
    do { idxs.push(idxOf(e.head().point)); e = e.next; } while (e !== face.edge);
    faces.push(idxs);
  }
  return new C!.ConvexPolyhedron({ vertices, faces });
}

// Joint3D 局部向量 → cannon Vec3（缺省 0）。
function vec(a?: readonly [number, number, number]): CANNON.Vec3 { return new C!.Vec3(a?.[0] ?? 0, a?.[1] ?? 0, a?.[2] ?? 0); }
// 关节参数签名（供重建脏标）。
function jointSig(j: Joint3D): string {
  return `${j.kind}|${j.bodyB ?? ''}|${(j.pivotA ?? []).join(',')}|${(j.pivotB ?? []).join(',')}|${(j.anchor ?? []).join(',')}|${(j.axis ?? []).join(',')}|${j.distance ?? ''}|${j.maxForce ?? ''}`;
}
