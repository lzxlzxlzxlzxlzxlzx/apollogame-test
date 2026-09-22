/** WebGL + Cannon 的通用物理骰子覆盖层（render-only）。 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mulberry32 } from '@engine/logic/index.js';
import { EXTERNAL_GAME_SESSION_VERSION, startExternalGameSession, type ExternalGameOutput, type ExternalGameSession } from './external-game-session.js';
import { DICE_BRIDGE_RESULT, DICE_BRIDGE_ROLL, normalizeDiceInput, type DiceRollInput, type DiceSides } from './dice-overlay.js';

export type PhysicalDiceResult = Readonly<{
  dice: readonly Readonly<{ sides: DiceSides; value: number }>[];
  total: number;
  randomSource: 'physics';
}>;

type PhysicalRequest = Readonly<{ version: number; requestId: string; input: DiceRollInput }>;
type Poly = { vertices: readonly [number, number, number][]; faces: readonly number[][] };
type Die = { sides: DiceSides; body: CANNON.Body; mesh: THREE.Group; solid: THREE.Mesh; wire: THREE.LineSegments; labels: THREE.Sprite[]; faceNormals: CANNON.Vec3[]; faces: readonly number[][] };
type Active = { request: PhysicalRequest; session: ExternalGameSession<DiceRollInput, PhysicalDiceResult>; target?: Window; origin?: string; dice: Die[]; started: number; settled: boolean };

const PHYSICS_STEP = 1 / 60;
const MAX_DICE = 3;
const DIE_SCALE = 0.78;
const MIN_THROW_UP_SPEED = 9;
const MIN_THROW_ANGULAR_SPEED = 42;
const MIN_LAUNCH_HEIGHT = 1.65;
const MAX_PLANAR_SPEED = 0.85;
// Cannon 立方体的 [z-, z+, y-, x+, y+, x-] 面序对应标准骰点。
const LOCAL_D6_FACE_VALUES = [3, 2, 6, 4, 1, 5] as const;

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
  // 物理模式不接受调用方指定 seed 或结果，避免“动画是真骰子、结果却已写死”。
  if (value.seed !== undefined || value.preset !== undefined) return undefined;
  const input = normalizeDiceInput(value.input);
  if (!input || input.dice.length > MAX_DICE) return undefined;
  return { version: value.version, requestId: value.requestId, input };
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
  const body = new CANNON.Body({ mass: 1, shape, linearDamping: 0.5, angularDamping: 0.8, allowSleep: true, sleepSpeedLimit: 0.08, sleepTimeLimit: 0.55, material: new CANNON.Material('die') });
  const positions: number[] = [];
  for (const face of data.faces) for (let i = 1; i < face.length - 1; i += 1) for (const point of [face[0]!, face[i]!, face[i + 1]!]) positions.push(...data.vertices[point]!);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({ color: 0xfafaf5, metalness: 0.02, roughness: 0.3, clearcoat: 0.32, clearcoatRoughness: 0.18, flatShading: true, vertexColors: true });
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
  body.position.set(index * 2.1, 0.85, 0);
  mesh.position.copy(body.position as unknown as THREE.Vector3);
  return { sides, body, mesh, solid, wire, labels, faceNormals: shape.faceNormals.map((normal) => normal.clone()), faces: data.faces };
}

function topValue(die: Die): number {
  let best = -Infinity; let value = 1;
  die.faceNormals.forEach((normal, index) => {
    const worldNormal = die.body.quaternion.vmult(normal);
    if (worldNormal.y > best) { best = worldNormal.y; value = die.sides === 6 ? LOCAL_D6_FACE_VALUES[index]! : index + 1; }
  });
  return value;
}

function makeResult(dice: readonly Die[]): PhysicalDiceResult {
  const settled = dice.map((die) => ({ sides: die.sides, value: topValue(die) }));
  return { dice: settled, total: settled.reduce((sum, die) => sum + die.value, 0), randomSource: 'physics' };
}

/** 真 3D 骰子。物理停稳前不结算；Cannon 的朝上面才是权威点数。 */
export function mountThreeDiceOverlay(container: HTMLElement): () => void {
  container.replaceChildren();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: false });
  renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;background:transparent;touch-action:none;cursor:grab;outline:none'; renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '真实三维物理骰子。点击或拖动以投掷。'); container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  // 取景覆盖透明舞台的整块物理围栏：骰子撞边也不会被镜头切掉。
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); camera.position.set(0, 8.6, 10.2); camera.lookAt(0, 0.75, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3b3434, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const rim = new THREE.PointLight(0xffa0a0, 7, 13); rim.position.set(-4, 3, -2); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x20103f, opacity: 0.26 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -15.5, 0) }); world.allowSleep = true; world.defaultContactMaterial.restitution = 0.3; world.defaultContactMaterial.friction = 0.42;
  const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() }); floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(floor);
  const flash = document.createElement('div'); flash.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;color:#f4efff;font:900 clamp(96px,24vw,270px) system-ui;text-shadow:0 0 26px #a77cff,0 8px 24px #261045;opacity:0;transform:scale(.65);transition:opacity .22s ease,transform .22s cubic-bezier(.17,.67,.3,1.35)'; container.style.position = container.style.position || 'relative'; container.appendChild(flash);

  let active: Active | undefined; let raf = 0; let last = performance.now(); let standAlone = 0; let displayTimer = 0;
  let drag: { start: THREE.Vector3; startScreenY: number; bodies: CANNON.Vec3[]; beganAt: number; last: THREE.Vector3; lastAt: number; lift: number } | undefined;
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const resize = (): void => { const w = Math.max(1, container.clientWidth); const h = Math.max(1, container.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const emit = (output: ExternalGameOutput<PhysicalDiceResult>, target?: Window, origin?: string): void => { window.dispatchEvent(new CustomEvent(DICE_BRIDGE_RESULT, { detail: output })); if (target && target !== window) target.postMessage({ type: DICE_BRIDGE_RESULT, output }, origin ?? '*'); };
  const reject = (raw: unknown, target?: Window, origin?: string): void => { const requestId = record(raw) && typeof raw.requestId === 'string' ? raw.requestId : ''; emit({ version: EXTERNAL_GAME_SESSION_VERSION, requestId, status: 'rejected', reason: 'invalid-request' }, target, origin); };
  const clearDice = (): void => { active?.dice.forEach((die) => { world.removeBody(die.body); scene.remove(die.mesh); die.mesh.traverse((node) => { const mesh = node as THREE.Mesh; mesh.geometry?.dispose(); const mat = mesh.material; if (Array.isArray(mat)) mat.forEach((item) => item.dispose()); else mat?.dispose(); }); }); };
  const open = (raw: unknown, target?: Window, origin?: string): void => {
    const request = parseRequest(raw); if (!request || request.version !== EXTERNAL_GAME_SESSION_VERSION) { reject(raw, target, origin); return; }
    const started = startExternalGameSession<DiceRollInput, PhysicalDiceResult>({ version: request.version, requestId: request.requestId, input: request.input }, () => {
      if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return undefined;
      const data = new Uint32Array(1); crypto.getRandomValues(data); return data[0];
    });
    if (!started.ok) { emit(started.output, target, origin); return; }
    clearDice(); active = { request, session: started.session, target, origin, dice: request.input.dice.map((die, index) => createDie(die.sides, index - (request.input.dice.length - 1) / 2)), started: 0, settled: false };
    active.dice.forEach((die) => { world.addBody(die.body); scene.add(die.mesh); }); flash.style.opacity = '0';
  };
  const roll = (throwVelocity = new THREE.Vector3()): void => {
    if (!active || (active.started > 0 && !active.settled)) return;
    if (active.settled) open({ version: 1, requestId: `standalone-physical-${++standAlone}`, input: active.request.input });
    if (!active) return;
    const random = mulberry32(active.session.seed ?? 1); active.started = performance.now(); active.settled = false; flash.style.opacity = '0';
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
  const settle = (): void => { if (!active || active.settled) return; active.settled = true; active.dice.forEach((die) => { die.body.velocity.setZero(); die.body.angularVelocity.setZero(); die.body.type = CANNON.Body.STATIC; die.body.updateMassProperties(); }); const result = makeResult(active.dice); emit(active.session.complete(result), active.target, active.origin); flash.textContent = String(result.total); flash.style.opacity = '1'; flash.style.transform = 'scale(1)'; window.clearTimeout(displayTimer); displayTimer = window.setTimeout(() => { flash.style.opacity = '0'; flash.style.transform = 'scale(1.12)'; }, 1800); };
  const frame = (now: number): void => { const dt = Math.min(.05, (now - last) / 1000); last = now; if (active && active.started > 0 && !active.settled) { world.step(PHYSICS_STEP, dt, 4); active.dice.forEach((die) => { const planarSpeed = Math.hypot(die.body.velocity.x, die.body.velocity.z); if (planarSpeed > MAX_PLANAR_SPEED) { const factor = MAX_PLANAR_SPEED / planarSpeed; die.body.velocity.x *= factor; die.body.velocity.z *= factor; } if (die.body.position.y > 4.5) { die.body.position.y = 4.5; die.body.velocity.y = Math.min(0, die.body.velocity.y); } die.mesh.position.copy(die.body.position as unknown as THREE.Vector3); die.mesh.quaternion.copy(die.body.quaternion as unknown as THREE.Quaternion); }); if (active.dice.every((die) => die.body.sleepState === CANNON.Body.SLEEPING)) settle(); } renderer.render(scene, camera); raf = requestAnimationFrame(frame); };
  const surfacePoint = (event: PointerEvent): THREE.Vector3 | undefined => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3(); return raycaster.ray.intersectPlane(dragPlane, hit) ?? undefined;
  };
  const down = (event: PointerEvent): void => {
    if (!active || (active.started > 0 && !active.settled)) return;
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
  return () => { cancelAnimationFrame(raf); window.clearTimeout(displayTimer); ro.disconnect(); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('keydown', keydown); window.removeEventListener('message', message); clearDice(); renderer.dispose(); container.replaceChildren(); };
}
