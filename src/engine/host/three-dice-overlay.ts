/** WebGL + Cannon 的通用物理骰子覆盖层（render-only）。 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mulberry32 } from '@engine/logic/index.js';
import { EXTERNAL_GAME_SESSION_VERSION, startExternalGameSession, type ExternalGameOutput, type ExternalGameSession } from './external-game-session.js';
import { DICE_BRIDGE_RESULT, DICE_BRIDGE_ROLL, judgeDiceTotal, normalizeDiceInput, normalizeDicePreset, type DiceJudgementResult, type DicePreset, type DiceRollInput, type DiceSides } from './dice-overlay.js';

export type PhysicalDiceResult = Readonly<{
  dice: readonly Readonly<{ sides: DiceSides; value: number }>[];
  total: number;
  /** 宿主给定骰面时，物理只负责演出，绝不反写此结果。 */
  randomSource: 'host' | 'physics';
} & Partial<DiceJudgementResult>>;

type PhysicalRequest = Readonly<{ version: number; requestId: string; input: DiceRollInput; preset?: DicePreset }>;
type Poly = { vertices: readonly [number, number, number][]; faces: readonly number[][] };
type Die = { sides: DiceSides; body: CANNON.Body; mesh: THREE.Group; solid: THREE.Mesh; wire: THREE.LineSegments; labels: THREE.Sprite[]; faceNormals: CANNON.Vec3[]; faces: readonly number[][] };
type Active = { request: PhysicalRequest; session: ExternalGameSession<DiceRollInput, PhysicalDiceResult, DicePreset>; target?: Window; origin?: string; dice: Die[]; started: number; settled: boolean; presenting: boolean; recoveryApplied: boolean; guidanceBounceApplied: boolean };

const PHYSICS_STEP = 1 / 60;
const MAX_DICE = 3;
const DIE_SCALE = 0.78;
const MIN_THROW_UP_SPEED = 9;
const MIN_THROW_ANGULAR_SPEED = 42;
const MIN_LAUNCH_HEIGHT = 1.65;
const MAX_PLANAR_SPEED = 0.85;
// 画布在舞台下方多占用这一段，但以等比例扩展后的固定 FOV 补偿，所以骰子不会变大或变小。
const DICE_STAGE_TOP_SAFETY_PX = 76;
/**
 * 骰子窗口的 render-only 英雄机位。约 76° 俯视：结果面基本正对玩家，同时保留少量侧面以表现立体与抛掷。
 * 相机只影响表现；真实点数仍由 Cannon 的世界空间朝上法线判定。
 */
export const DICE_CAMERA_VIEW = {
  eye: [0, 12.5, 2.8] as const,
  target: [0, 0.9, 0] as const,
};
/** 算式与最终判定之间的可读停留；结算只保留两段演出。 */
export const DICE_RESULT_PHASE_MS = 900;
const STACK_RECOVERY_MS = 3000;
const FORCE_SETTLE_MS = 7000;
/** 受控力矩从首段飞行便开始介入，绝不等骰子停稳再改姿态。 */
const GUIDANCE_START_MS = 420;
const GUIDANCE_MIN_SETTLE_MS = 1450;
const GUIDANCE_REBOUND_MS = 2650;
const GUIDANCE_MAX_TORQUE = 42;
const LOCAL_D6_PROTOTYPE = '/games/game-dice/art/d6-prototype.stl';
const LOCAL_D20_PROTOTYPE = '/games/game-dice/art/d20-numbered-v1.stl';
// 授权 d6 模型的本地轴向校准：Cannon 立方体的 [z-, z+, y-, x+, y+, x-] 面序 → 模型真实点数。
const LOCAL_D6_FACE_VALUES = [3, 2, 6, 4, 1, 5] as const;
/** De-20.stl 经逐面目视核对后的真实刻字；数组下标与 poly(20) / Cannon 面序一致。 */
export const LOCAL_D20_FACE_VALUES = [20, 8, 16, 6, 14, 10, 2, 4, 9, 3, 15, 5, 13, 1, 7, 12, 18, 11, 19, 17] as const;
// 将下载模型的二十个主面法线对齐到 poly(20) 的碰撞面；保持视觉刻字与物理朝上面一致。
const LOCAL_D20_ROTATION = new THREE.Matrix4().set(
  -0.3229754846, 0.9463647292, -0.0089797372, 0,
  -0.8032976338, -0.2791416181, -0.5261110801, 0,
  -0.5003995883, -0.1627075794, 0.8503684470, 0,
  0, 0, 0, 1,
);
let prototypeD6: THREE.BufferGeometry | undefined;
let prototypeD20: THREE.BufferGeometry | undefined;

function loadLocalD6Prototype(): Promise<THREE.BufferGeometry | undefined> {
  if (prototypeD6) return Promise.resolve(prototypeD6);
  return new Promise((resolve) => new STLLoader().load(LOCAL_D6_PROTOTYPE, (geometry) => {
    geometry.computeBoundingBox(); geometry.center();
    const size = new THREE.Vector3(); geometry.boundingBox?.getSize(size);
    const scale = 2 / Math.max(size.x, size.y, size.z, 1); geometry.scale(scale, scale, scale); geometry.computeVertexNormals();
    // STL 无材质槽：按凹入表面识别骰孔并赋红色顶点色，外壳保持象牙白。
    const painted = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const positions = painted.getAttribute('position'); const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i += 3) {
      const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
      const y = (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
      const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
      const insidePip = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) < 0.93;
      const color = insidePip ? [0.72, 0.035, 0.045] : [0.98, 0.98, 0.95];
      for (let v = 0; v < 3; v += 1) { colors[(i + v) * 3] = color[0]; colors[(i + v) * 3 + 1] = color[1]; colors[(i + v) * 3 + 2] = color[2]; }
    }
    painted.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.dispose(); prototypeD6 = painted; resolve(painted);
  }, undefined, () => resolve(undefined)));
}

function loadLocalD20Prototype(): Promise<THREE.BufferGeometry | undefined> {
  if (prototypeD20) return Promise.resolve(prototypeD20);
  return new Promise((resolve) => new STLLoader().load(LOCAL_D20_PROTOTYPE, (geometry) => {
    geometry.computeBoundingBox(); geometry.center(); geometry.applyMatrix4(LOCAL_D20_ROTATION); geometry.computeBoundingSphere();
    const targetRadius = Math.sqrt(1 + ((1 + Math.sqrt(5)) / 2) ** 2);
    const scale = targetRadius / Math.max(geometry.boundingSphere?.radius ?? 1, 0.001);
    geometry.scale(scale, scale, scale); geometry.computeVertexNormals();
    prototypeD20 = geometry; resolve(geometry);
  }, undefined, () => resolve(undefined)));
}

function poly(sides: DiceSides): Poly {
  if (sides === 4) return { vertices: [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]], faces: [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]] };
  if (sides === 6) return { vertices: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]], faces: [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]] };
  if (sides === 8) return { vertices: [[0,1,0],[0,-1,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]], faces: [[0,2,3],[0,3,4],[0,4,5],[0,5,2],[1,3,2],[1,4,3],[1,5,4],[1,2,5]] };
  const p = (1 + Math.sqrt(5)) / 2;
  return { vertices: [[-1,p,0],[1,p,0],[-1,-p,0],[1,-p,0],[0,-1,p],[0,1,p],[0,-1,-p],[0,1,-p],[p,0,-1],[p,0,1],[-p,0,-1],[-p,0,1]], faces: [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]] };
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

function parseRequest(value: unknown): PhysicalRequest | undefined {
  if (!record(value) || typeof value.version !== 'number' || typeof value.requestId !== 'string' || value.requestId.trim() === '') return undefined;
  // 物理的职责是演出：指定骰面是宿主的权威结果，而不是本地作弊随机。
  if (value.seed !== undefined) return undefined;
  const input = normalizeDiceInput(value.input);
  if (!input || input.dice.length > MAX_DICE) return undefined;
  const preset = normalizeDicePreset(value.preset, input);
  if (value.preset !== undefined && !preset) return undefined;
  return { version: value.version, requestId: value.requestId, input, ...(preset ? { preset } : {}) };
}

function label(value: number, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#2d155a'; ctx.font = '900 72px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(value), 64, 66);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: true }));
  sprite.scale.setScalar(scale); return sprite;
}

function createDie(sides: DiceSides, index: number): Die {
  const data = poly(sides);
  const vertices = data.vertices.map(([x, y, z]) => new CANNON.Vec3(x * DIE_SCALE, y * DIE_SCALE, z * DIE_SCALE));
  const shape = new CANNON.ConvexPolyhedron({ vertices, faces: data.faces.map((face) => [...face]) });
  const body = new CANNON.Body({ mass: 1, shape, linearDamping: 0.5, angularDamping: 0.8, allowSleep: true, sleepSpeedLimit: 0.14, sleepTimeLimit: 0.45, material: new CANNON.Material('die') });
  const positions: number[] = [];
  for (const face of data.faces) for (let i = 1; i < face.length - 1; i += 1) for (const point of [face[0]!, face[i]!, face[i + 1]!]) positions.push(...data.vertices[point]!);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  // 程序化后备几何没有 color attribute；提前开启 vertexColors 会把白色外壳乘成黑色。
  const material = new THREE.MeshPhysicalMaterial({ color: 0xfafaf5, metalness: 0.02, roughness: 0.3, clearcoat: 0.32, clearcoatRoughness: 0.18, flatShading: true, vertexColors: false });
  const mesh = new THREE.Group();
  mesh.scale.setScalar(DIE_SCALE);
  const solid = new THREE.Mesh(geometry, material); solid.castShadow = true; solid.receiveShadow = true; mesh.add(solid);
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 12), new THREE.LineBasicMaterial({ color: 0x9b9b95, transparent: true, opacity: 0.68 })); mesh.add(wire);
  const labels: THREE.Sprite[] = [];
  data.faces.forEach((face, faceIndex) => {
    const center = face.reduce((out, point) => out.add(new THREE.Vector3(...data.vertices[point]!)), new THREE.Vector3()).multiplyScalar(1 / face.length).normalize().multiplyScalar(1.03);
    const number = label(faceIndex + 1, sides === 20 ? 0.34 : 0.44);
    number.position.copy(center); mesh.add(number); labels.push(number);
  });
  // 多骰初始间距必须大于 d20 的外接球直径，避免尚未投掷时几何体互相穿插。
  body.position.set(index * 2.65, 0.85, 0);
  mesh.position.copy(body.position as unknown as THREE.Vector3);
  return { sides, body, mesh, solid, wire, labels, faceNormals: shape.faceNormals.map((normal) => normal.clone()), faces: data.faces };
}

function topValue(die: Die): number {
  let best = -Infinity; let value = 1;
  die.faceNormals.forEach((normal, index) => {
    const worldNormal = die.body.quaternion.vmult(normal);
    if (worldNormal.y > best) {
      best = worldNormal.y;
      value = die.sides === 6 ? LOCAL_D6_FACE_VALUES[index]!
        : die.sides === 20 ? LOCAL_D20_FACE_VALUES[index]!
          : index + 1;
    }
  });
  return value;
}

function faceValue(die: Die, index: number): number {
  return die.sides === 6 ? LOCAL_D6_FACE_VALUES[index]!
    : die.sides === 20 ? LOCAL_D20_FACE_VALUES[index]!
      : index + 1;
}

/**
 * 让指定面的法线朝向世界上方；追加绕世界 Y 的偏航，保留自然的落点差异但不改变顶面。
 * 这是纯 render-only 几何：不会参与宿主结算，也不从 Cannon 的偶发朝向取结果。
 */
export function targetDieQuaternion(die: Pick<Die, 'faceNormals' | 'sides'>, value: number, yaw = 0): THREE.Quaternion {
  const index = die.faceNormals.findIndex((_, candidate) => faceValue(die as Die, candidate) === value);
  if (index < 0) throw new Error(`Unsupported d${die.sides} target face: ${value}`);
  const normal = die.faceNormals[index]!;
  const align = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(normal.x, normal.y, normal.z).normalize(),
    new THREE.Vector3(0, 1, 0),
  );
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(align);
}

function makeResult(dice: readonly Die[], input: DiceRollInput, preset?: DicePreset): PhysicalDiceResult {
  const settled = dice.map((die, index) => ({ sides: die.sides, value: preset?.values[index] ?? topValue(die) }));
  const total = settled.reduce((sum, die) => sum + die.value, 0);
  const judgement = judgeDiceTotal(input, total);
  return { dice: settled, total, randomSource: preset ? 'host' : 'physics', ...(judgement ?? {}) };
}

/** 只识别“水平几乎重合、垂直明显分层”的骰子对，避免普通并排碰撞误触发恢复。 */
export function stackedDicePairs(positions: readonly Readonly<{ x: number; y: number; z: number }>[]): readonly Readonly<[number, number]>[] {
  const pairs: [number, number][] = [];
  for (let left = 0; left < positions.length; left += 1) for (let right = left + 1; right < positions.length; right += 1) {
    const a = positions[left]!; const b = positions[right]!;
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1.55 && Math.abs(a.y - b.y) > 0.5) pairs.push([left, right]);
  }
  return pairs;
}

/**
 * 物理中心点的飞行上限。它和相机的偏低构图共同形成所有骰型共享的顶部安全区；
 * D20 因外接球更大再多留一点余量。这里限制的是抛物线顶点，不改变模型缩放。
 */
export function diceFlightCeiling(sides: readonly DiceSides[]): number {
  const base = sides.length === 1 ? 2.45 : sides.length === 2 ? 2.65 : 2.9;
  return base - (sides.includes(20) ? 0.25 : 0);
}

/**
 * 静止时保持英雄近景；起掷瞬间改用更宽的镜头，给骰子的完整外接体留出顶部余量。
 * 物理上限只约束刚体中心，不能单独防住 D20 / D6 的旋转顶点越过 Canvas 边缘。
 */
export function expandedDiceStageFov(baseFov: number, stageHeight: number, topSafetyPx = DICE_STAGE_TOP_SAFETY_PX): number {
  const safeHeight = Math.max(1, stageHeight);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * ((safeHeight + topSafetyPx) / safeHeight)));
}

/** 把原始点数、修正和最终值压缩为单个可读算式，避免逐数字重复播报。 */
export function formatDiceResultEquation(total: number, modifier: number | undefined, finalTotal: number): string {
  if (!modifier) return String(finalTotal);
  return `${total} ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)} = ${finalTotal}`;
}

/** 结果文本以舞台中心为锚点；缩放不能吞掉居中所需的反向平移。 */
export function centeredResultTransform(scale: number): string {
  return `translate(-50%, -50%) scale(${scale})`;
}

/** 真 3D 骰子。它透明地嵌入调用方的 UI 窗口；物理停稳后再由判定表解释。 */
export function mountThreeDiceOverlay(container: HTMLElement, options: Readonly<{ autoRoll?: boolean }> = {}): () => void {
  container.replaceChildren();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: false });
  renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 扩展的是固定的舞台视口，不是投掷期间的镜头：上抛时完整骰体可留在可见区，尺寸也不会跳变。
  renderer.domElement.style.cssText = `display:block;position:absolute;top:0;left:0;width:100%;height:calc(100% + ${DICE_STAGE_TOP_SAFETY_PX}px);z-index:0;background:transparent;touch-action:none;cursor:grab;outline:none`; renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '真实三维物理骰子。点击或拖动以投掷。'); container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  // 取景覆盖透明舞台的整块物理围栏：骰子撞边也不会被镜头切掉。
  // 更窄的视角让骰子在悬浮窗中成为视觉主体，同时仍保留完整的低抛物理范围。
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  camera.position.set(...DICE_CAMERA_VIEW.eye);
  camera.lookAt(...DICE_CAMERA_VIEW.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3b3434, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const rim = new THREE.PointLight(0xffa0a0, 7, 13); rim.position.set(-4, 3, -2); scene.add(rim);
  // 只留下接触阴影，不画“骰子平台”：背景和边框由外层 LayoutNode 悬浮窗负责。
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x20103f, opacity: 0.26 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -15.5, 0) }); world.allowSleep = true; world.defaultContactMaterial.restitution = 0.3; world.defaultContactMaterial.friction = 0.42;
  const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() }); floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(floor);
  // 强制成为绝对定位包含块。LayoutNode 可显式给舞台 inline `position:static`；若只在空值时补 relative，
  // 结果文本会退回以整页为参照，短算式似乎居中而完整等式向右溢出。
  container.style.position = 'relative';
  container.style.overflow = 'visible';
  // 内容宽度自身参与 -50% 平移：`8 + 1 = 9` 的整体中心始终落在舞台 50%，
  // 而不会先固定“8 + 1”的起点、再把“= 9”延展到右侧。
  const flash = document.createElement('div'); flash.id = 'dice-result-presentation'; flash.setAttribute('role', 'status'); flash.setAttribute('aria-live', 'polite'); flash.style.cssText = `position:absolute;z-index:1;left:50%;top:50%;width:max-content;pointer-events:none;color:#f4efff;font:900 clamp(54px,16vw,118px) system-ui;text-align:center;white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.78),0 0 18px rgba(167,124,255,.42);opacity:0;transform:${centeredResultTransform(.78)};transform-origin:center;transition:opacity .26s ease,transform .34s cubic-bezier(.17,.67,.3,1.35),color .28s ease,text-shadow .28s ease`; container.appendChild(flash);

  let active: Active | undefined; let raf = 0; let last = performance.now(); let standAlone = 0;
  let resultSequence = 0; const resultTimers = new Set<number>();
  let drag: { start: THREE.Vector3; startScreenY: number; bodies: CANNON.Vec3[]; beganAt: number; last: THREE.Vector3; lastAt: number; lift: number } | undefined;
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const resize = (): void => {
    const w = Math.max(1, container.clientWidth); const h = Math.max(1, container.clientHeight);
    const renderHeight = h + DICE_STAGE_TOP_SAFETY_PX;
    renderer.setSize(w, renderHeight, false);
    camera.aspect = w / renderHeight;
    camera.fov = expandedDiceStageFov(restFov(active?.dice.length ?? 1), h);
    camera.updateProjectionMatrix();
  };
  const emit = (output: ExternalGameOutput<PhysicalDiceResult>, target?: Window, origin?: string): void => { window.dispatchEvent(new CustomEvent(DICE_BRIDGE_RESULT, { detail: output })); if (target && target !== window) target.postMessage({ type: DICE_BRIDGE_RESULT, output }, origin ?? '*'); };
  const reject = (raw: unknown, target?: Window, origin?: string): void => { const requestId = record(raw) && typeof raw.requestId === 'string' ? raw.requestId : ''; emit({ version: EXTERNAL_GAME_SESSION_VERSION, requestId, status: 'rejected', reason: 'invalid-request' }, target, origin); };
  const clearDice = (): void => { active?.dice.forEach((die) => { world.removeBody(die.body); scene.remove(die.mesh); die.mesh.traverse((node) => { const mesh = node as THREE.Mesh; mesh.geometry?.dispose(); const mat = mesh.material; if (Array.isArray(mat)) mat.forEach((item) => item.dispose()); else mat?.dispose(); }); }); };
  const clearResultPresentation = (): void => {
    resultSequence += 1;
    resultTimers.forEach((timer) => window.clearTimeout(timer)); resultTimers.clear();
    flash.style.opacity = '0'; flash.style.transform = centeredResultTransform(.78);
  };
  const later = (delay: number, task: () => void): void => {
    const timer = window.setTimeout(() => { resultTimers.delete(timer); task(); }, delay);
    resultTimers.add(timer);
  };
  const showResultText = (text: string, color: string, sequence: number): void => {
    if (sequence !== resultSequence) return;
    flash.style.opacity = '0'; flash.style.transform = centeredResultTransform(.82);
    later(240, () => {
      if (sequence !== resultSequence) return;
      const isSuccess = color === '#68e59a'; const isFailure = color === '#ff6b72';
      flash.textContent = text; flash.style.color = color;
      flash.style.textShadow = isSuccess
        ? '0 3px 12px rgba(0,0,0,.82),0 0 16px rgba(71,220,139,.38)'
        : isFailure
          ? '0 3px 12px rgba(0,0,0,.82),0 0 16px rgba(255,82,94,.36)'
          : '0 2px 12px rgba(0,0,0,.78),0 0 18px rgba(167,124,255,.42)';
      flash.style.opacity = '1'; flash.style.transform = centeredResultTransform(1);
    });
  };
  const restFov = (count: number): number => count === 1 ? 22 : count === 2 ? 28 : 34;
  const applyD6Prototype = (geometry: THREE.BufferGeometry): void => {
    active?.dice.filter((die) => die.sides === 6).forEach((die) => {
      die.solid.geometry.dispose(); die.solid.geometry = geometry.clone();
      const material = die.solid.material as THREE.MeshPhysicalMaterial; material.vertexColors = true; material.needsUpdate = true;
      // 授权模型自带凹入骰孔；隐藏程序数字和立方体辅助边线。
      die.wire.visible = false;
      die.labels.forEach((item) => { item.visible = false; });
    });
  };
  const applyD20Prototype = (geometry: THREE.BufferGeometry): void => {
    active?.dice.filter((die) => die.sides === 20).forEach((die) => {
      die.solid.geometry.dispose(); die.solid.geometry = geometry.clone();
      const material = die.solid.material as THREE.MeshPhysicalMaterial;
      material.vertexColors = false; material.color.set(0xf8f5e8); material.needsUpdate = true;
      // STL 已真实凹刻 1–20；直接描绘其几何折线，让每个数字在小尺寸下仍清晰。
      die.wire.geometry.dispose(); die.wire.geometry = new THREE.EdgesGeometry(geometry, 28);
      const wireMaterial = die.wire.material as THREE.LineBasicMaterial;
      wireMaterial.color.set(0x9f1420); wireMaterial.opacity = 0.92; die.wire.visible = true;
      die.labels.forEach((item) => { item.visible = false; });
    });
  };
  const open = (raw: unknown, target?: Window, origin?: string): void => {
    const request = parseRequest(raw); if (!request || request.version !== EXTERNAL_GAME_SESSION_VERSION) { reject(raw, target, origin); return; }
    const started = startExternalGameSession<DiceRollInput, PhysicalDiceResult, DicePreset>({ version: request.version, requestId: request.requestId, input: request.input, ...(request.preset ? { preset: request.preset } : {}) }, () => {
      if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return undefined;
      const data = new Uint32Array(1); crypto.getRandomValues(data); return data[0];
    });
    if (!started.ok) { emit(started.output, target, origin); return; }
    // 单骰保留英雄近景；骰池变多时逐级退镜，确保三颗骰子不会互相挤压或切出画框。
    clearResultPresentation();
    resize();
    clearDice(); active = { request, session: started.session, target, origin, dice: request.input.dice.map((die, index) => createDie(die.sides, index - (request.input.dice.length - 1) / 2)), started: 0, settled: false, presenting: false, recoveryApplied: false, guidanceBounceApplied: false };
    active.dice.forEach((die) => { world.addBody(die.body); scene.add(die.mesh); }); flash.style.opacity = '0';
    void loadLocalD6Prototype().then((geometry) => { if (geometry) applyD6Prototype(geometry); });
    void loadLocalD20Prototype().then((geometry) => { if (geometry) applyD20Prototype(geometry); });
    // 正式宿主会话无需玩家点按；延后一帧，确保请求对应的新骰池已完整挂到物理世界。
    if (options.autoRoll) later(0, () => { if (active?.request.requestId === request.requestId) roll(); });
  };
  const roll = (throwVelocity = new THREE.Vector3()): void => {
    if (!active || active.presenting || (active.started > 0 && !active.settled)) return;
    if (active.settled) open({ version: 1, requestId: `standalone-physical-${++standAlone}`, input: active.request.input });
    if (!active) return;
    const random = mulberry32(active.session.seed ?? 1); active.started = performance.now(); active.settled = false; active.presenting = false; active.recoveryApplied = false; active.guidanceBounceApplied = false;
    clearResultPresentation();
    // 释放时保持“手里此刻的位置和朝向”：只施加冲量/角速度，绝不把骰子瞬移到预设发射点。
    active.dice.forEach((die) => {
      // 即使轻点也从离地位置起掷，避免高速自旋在起始帧与地面摩擦并被转换成侧向冲量。
      die.body.position.y = Math.max(die.body.position.y, MIN_LAUNCH_HEIGHT);
      die.body.type = CANNON.Body.DYNAMIC; die.body.updateMassProperties(); die.body.wakeUp();
      // 拖拽只塑造手感，不允许把骰子推离前景舞台；飞行保持短、低、可预期。
      // 未水平拖动时不引入随机侧向速度；水平手势只提供克制的方向感。
      const xSpeed = THREE.MathUtils.clamp(throwVelocity.x * .18, -.55, .55);
      const zSpeed = THREE.MathUtils.clamp(throwVelocity.z * .13, -.35, .35);
      // 固定的起跳下限不依赖鼠标拖拽距离，任何操作都一定会形成可见的上抛。
      die.body.velocity.set(xSpeed, Math.min(11, Math.max(MIN_THROW_UP_SPEED, throwVelocity.y + 3.1) + random() * 1.2), zSpeed);
      // 随机旋转轴 + 保底模长：无论用户拖得多轻，骰子都不会以“几乎不转”的状态飞出。
      const axis = new CANNON.Vec3((random() - .5) * 2 + throwVelocity.z * .05, (random() - .5) * 2, (random() - .5) * 2 - throwVelocity.x * .05);
      if (axis.lengthSquared() < 0.001) axis.set(1, 0, 0);
      axis.normalize();
      const spin = MIN_THROW_ANGULAR_SPEED + random() * 5 + Math.min(9, throwVelocity.length() * .38);
      die.body.angularVelocity.copy(axis.scale(spin));
    });
  };
  const settle = (): void => {
    if (!active || active.settled) return;
    const current = active; current.settled = true; current.presenting = true;
    current.dice.forEach((die) => { die.body.velocity.setZero(); die.body.angularVelocity.setZero(); die.body.type = CANNON.Body.STATIC; die.body.updateMassProperties(); });
    const result = makeResult(current.dice, current.request.input, current.request.preset);
    const sequence = ++resultSequence;
    const modifier = result.modifier ?? 0; const finalTotal = result.finalTotal ?? result.total;
    showResultText(formatDiceResultEquation(result.total, modifier, finalTotal), '#f4efff', sequence);
    const verdictDelay = DICE_RESULT_PHASE_MS;
    later(verdictDelay, () => {
      const passed = result.passed ?? (result.outcome === 'success' ? true : result.outcome === 'failure' ? false : undefined);
      const verdict = passed === true ? '成功' : passed === false ? '失败' : result.outcome;
      if (verdict) showResultText(verdict, passed === true ? '#68e59a' : passed === false ? '#ff6b72' : '#f4efff', sequence);
    });
    // 等最终判定字样已经渐入后再返回，宿主收到的结果与玩家看到的时序一致。
    later(verdictDelay + 280, () => {
      if (sequence !== resultSequence) return;
      const output = current.session.complete(result); emit(output, current.target, current.origin); current.presenting = false;
    });
    later(verdictDelay + 1800, () => { if (sequence === resultSequence) { flash.style.opacity = '0'; flash.style.transform = centeredResultTransform(1.1); } });
  };
  const frame = (now: number): void => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (active && active.started > 0 && !active.settled) {
      const elapsed = now - active.started; const ceiling = diceFlightCeiling(active.dice.map((die) => die.sides));
      if (active.request.preset && elapsed >= GUIDANCE_START_MS) {
        const ramp = Math.min(1, (elapsed - GUIDANCE_START_MS) / 680);
        active.dice.forEach((die, index) => {
          const target = targetDieQuaternion(die, active!.request.preset!.values[index]!, (index - (active!.dice.length - 1) / 2) * 0.36);
          const current = new THREE.Quaternion(die.body.quaternion.x, die.body.quaternion.y, die.body.quaternion.z, die.body.quaternion.w);
          const error = target.multiply(current.invert()).normalize();
          // q 与 -q 是同一朝向；选短弧，避免偶发的反向整圈回正。
          if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w);
          const angle = 2 * Math.atan2(Math.hypot(error.x, error.y, error.z), error.w);
          const axis = new THREE.Vector3(error.x, error.y, error.z);
          if (axis.lengthSq() < 1e-8 || angle < 0.008) return;
          axis.normalize();
          const spinOnAxis = die.body.angularVelocity.x * axis.x + die.body.angularVelocity.y * axis.y + die.body.angularVelocity.z * axis.z;
          const torque = THREE.MathUtils.clamp((angle * 17 - spinOnAxis * 3.8) * ramp, -GUIDANCE_MAX_TORQUE, GUIDANCE_MAX_TORQUE);
          die.body.applyTorque(new CANNON.Vec3(axis.x * torque, axis.y * torque, axis.z * torque));
        });
      }
      world.step(PHYSICS_STEP, dt, 4);
      active.dice.forEach((die) => {
        const planarSpeed = Math.hypot(die.body.velocity.x, die.body.velocity.z);
        if (planarSpeed > MAX_PLANAR_SPEED) { const factor = MAX_PLANAR_SPEED / planarSpeed; die.body.velocity.x *= factor; die.body.velocity.z *= factor; }
        if (die.body.position.y > ceiling) { die.body.position.y = ceiling; die.body.velocity.y = Math.min(0, die.body.velocity.y); }
        die.mesh.position.copy(die.body.position as unknown as THREE.Vector3); die.mesh.quaternion.copy(die.body.quaternion as unknown as THREE.Quaternion);
      });
      if (!active.recoveryApplied && elapsed >= STACK_RECOVERY_MS) {
        const pairs = stackedDicePairs(active.dice.map((die) => die.body.position));
        if (pairs.length > 0) {
          active.recoveryApplied = true;
          pairs.forEach(([left, right], pairIndex) => {
            const direction = pairIndex % 2 === 0 ? 1 : -1;
            active!.dice[left]!.body.velocity.set(-0.48 * direction, 0.72, 0.18 * direction);
            active!.dice[right]!.body.velocity.set(0.48 * direction, 0.58, -0.18 * direction);
            active!.dice[left]!.body.wakeUp(); active!.dice[right]!.body.wakeUp();
          });
        }
      }
      if (active.request.preset) {
        const aligned = active.dice.every((die, index) => topValue(die) === active!.request.preset!.values[index]!);
        const slow = active.dice.every((die) => die.body.velocity.length() < 0.34 && die.body.angularVelocity.length() < 1.25);
        // 若第一次滚动已快停下但仍未对齐，给一次很小的可见回弹；绝不会静止翻面。
        if (!active.guidanceBounceApplied && elapsed >= GUIDANCE_REBOUND_MS && !aligned && slow) {
          active.guidanceBounceApplied = true;
          active.dice.forEach((die, index) => {
            const direction = index % 2 === 0 ? 1 : -1;
            die.body.wakeUp();
            die.body.velocity.set(0.22 * direction, 0.82, -0.14 * direction);
            die.body.angularVelocity.vadd(new CANNON.Vec3(1.8 * direction, 0.45, -1.25 * direction), die.body.angularVelocity);
          });
        }
        if (elapsed >= GUIDANCE_MIN_SETTLE_MS && aligned && slow) settle();
      } else if (active.dice.every((die) => die.body.sleepState === CANNON.Body.SLEEPING) || elapsed >= FORCE_SETTLE_MS) settle();
    }
    renderer.render(scene, camera); raf = requestAnimationFrame(frame);
  };
  const surfacePoint = (event: PointerEvent): THREE.Vector3 | undefined => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3(); return raycaster.ray.intersectPlane(dragPlane, hit) ?? undefined;
  };
  const down = (event: PointerEvent): void => {
    if (!active || active.presenting || (active.started > 0 && !active.settled)) return;
    if (active.settled) open({ version: 1, requestId: `standalone-physical-${++standAlone}`, input: active.request.input });
    const point = surfacePoint(event); if (!active || !point) return;
    drag = { start: point, startScreenY: event.clientY, bodies: active.dice.map((die) => die.body.position.clone()), beganAt: performance.now(), last: point, lastAt: performance.now(), lift: 0 };
    renderer.domElement.setPointerCapture(event.pointerId); renderer.domElement.style.cursor = 'grabbing';
  };
  const move = (event: PointerEvent): void => {
    if (!drag || !active) return;
    const point = surfacePoint(event); if (!point) return;
    // 原地蓄力：水平拖动仅影响松手后的速度，不能把骰子拖到物理舞台边缘。
    // 屏幕向上拖=把骰子提离桌面；跟手阶段仅更新高度，松手不再有 y 轴瞬移。
    drag.lift = THREE.MathUtils.clamp((drag.startScreenY - event.clientY) * 0.012, 0, 1.4);
    active.dice.forEach((die, index) => { const base = drag!.bodies[index]!; die.body.position.set(base.x, base.y + drag!.lift, base.z); die.mesh.position.copy(die.body.position as unknown as THREE.Vector3); });
    drag.last = point; drag.lastAt = performance.now();
  };
  const up = (event: PointerEvent): void => {
    renderer.domElement.style.cursor = 'grab'; if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    if (!drag) return;
    const elapsed = Math.max(.08, (performance.now() - drag.beganAt) / 1000); const velocity = drag.last.clone().sub(drag.start).multiplyScalar(1 / elapsed).clampLength(0, 4.5); velocity.y = 1.3 + drag.lift * 1.25; drag = undefined; roll(velocity);
  };
  const keydown = (event: KeyboardEvent): void => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); roll(); } };
  const message = (event: MessageEvent<unknown>): void => { if (!record(event.data) || event.data.type !== DICE_BRIDGE_ROLL) return; open(event.data.request, event.source instanceof Window ? event.source : undefined, event.origin); };
  const ro = new ResizeObserver(resize); ro.observe(container); renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('keydown', keydown); window.addEventListener('message', message); resize();
  open(window.__APOLLO_DICE_REQUEST__ ?? { version: 1, requestId: `standalone-physical-${++standAlone}`, input: { dice: [{ sides: 6 }] } }); raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); clearResultPresentation(); ro.disconnect(); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('keydown', keydown); window.removeEventListener('message', message); clearDice(); renderer.dispose(); container.replaceChildren(); };
}
