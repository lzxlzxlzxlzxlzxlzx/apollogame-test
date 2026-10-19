import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { AngularGesture, InputQueue, OrderedActionSession, RawInputData, Signal, Transform } from '@engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

const SYSTEM_ID = 'angular-gesture';
const OUTPUT_PREFIX = 'angular-gesture:signal:';
const FULL = 360_000;
const HALF = FULL / 2;
const SAMPLE_SCALE = 256;
// 固定 CORDIC 角表；sim 仅做四则运算、比较与 round，不调用平台相关的运行时三角函数。
const ATAN = [
  0.7853981633974483, 0.4636476090008061, 0.24497866312686414, 0.12435499454676144,
  0.06241880999595735, 0.031239833430268277, 0.015623728620476831, 0.007812341060101111,
  0.0039062301319669718, 0.0019531225164788188, 0.0009765621895593195, 0.0004882812111948983,
  0.00024414062014936177, 0.00012207031189367021, 0.00006103515617420877, 0.000030517578115526096,
  0.000015258789061315762, 0.00000762939453110197, 0.000003814697265606496, 0.000001907348632810187,
] as const;
const CORDIC_GAIN_INVERSE = 0.607252935009249;

function normalizedAngle(value: number): number { return ((value % FULL) + FULL) % FULL; }
function shortestDelta(next: number, prior: number): number {
  let delta = next - prior;
  if (delta > HALF) delta -= FULL;
  if (delta < -HALF) delta += FULL;
  return delta;
}
function quantized(value: number): number { return Math.round(value * SAMPLE_SCALE) / SAMPLE_SCALE; }

/** 向量模式 CORDIC；屏幕 y 向下，所以正角即顺时针。 */
export function angleOfEllipsePoint(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  let vx = x, vy = y, angle = 0;
  if (vx < 0) { const oldY = vy; vx = -vx; vy = -vy; angle = oldY >= 0 ? Math.PI : -Math.PI; }
  let power = 1;
  for (let i = 0; i < ATAN.length; i++) {
    const direction = vy >= 0 ? 1 : -1;
    const nextX = vx + direction * vy * power;
    const nextY = vy - direction * vx * power;
    vx = nextX; vy = nextY; angle += direction * ATAN[i];
    power /= 2;
  }
  return normalizedAngle(Math.round(angle * HALF / Math.PI));
}

/** 旋转模式 CORDIC；仅由整数角派生表现位置，不保存第二份位置真相。 */
export function pointOnEllipse(centerX: number, centerY: number, radiusX: number, radiusY: number, angleMilliDegrees: number): { x: number; y: number } {
  let remaining = normalizedAngle(angleMilliDegrees) * Math.PI / HALF;
  if (remaining > Math.PI) remaining -= 2 * Math.PI;
  let sign = 1;
  if (remaining > Math.PI / 2) { remaining -= Math.PI; sign = -1; }
  if (remaining < -Math.PI / 2) { remaining += Math.PI; sign = -1; }
  let x = CORDIC_GAIN_INVERSE, y = 0;
  let power = 1;
  for (let i = 0; i < ATAN.length; i++) {
    const direction = remaining >= 0 ? 1 : -1;
    const nextX = x - direction * y * power;
    const nextY = y + direction * x * power;
    x = nextX; y = nextY; remaining -= direction * ATAN[i];
    power /= 2;
  }
  return { x: quantized(centerX + radiusX * sign * x), y: quantized(centerY + radiusY * sign * y) };
}

export function validateAngularGesture(gesture: AngularGesture): string | undefined {
  if (typeof gesture.id !== 'string' || !gesture.id.trim() || gesture.id.length > 128) return 'id 必须为 1..128 字符';
  for (const key of ['centerX', 'centerY', 'radiusX', 'radiusY', 'angleMilliDegrees', 'grabTolerance', 'centerDeadZone', 'maxJumpMilliDegrees', 'jitterMilliDegrees', 'fullTurnMilliDegrees'] as const) {
    if (!Number.isFinite(gesture[key])) return `${key} 必须有限`;
  }
  if (Math.abs(gesture.centerX) > 1_000_000 || Math.abs(gesture.centerY) > 1_000_000) return '椭圆中心坐标越界';
  if (gesture.radiusX <= 0 || gesture.radiusY <= 0 || gesture.radiusX > 100_000 || gesture.radiusY > 100_000) return '椭圆半轴必须在 (0,100000]';
  if (!Number.isSafeInteger(gesture.angleMilliDegrees) || gesture.angleMilliDegrees < 0 || gesture.angleMilliDegrees >= FULL) return 'angleMilliDegrees 必须在 [0,360000)';
  if (gesture.grabTolerance < 0 || gesture.grabTolerance > 1 || gesture.centerDeadZone < 0 || gesture.centerDeadZone >= 1) return '握持容差/中心死区越界';
  if (gesture.grabSegment) {
    const segment = gesture.grabSegment;
    if (Object.values(segment).some((value) => !Number.isFinite(value) || Math.abs(value) > 100_000)
      || segment.radius <= 0 || segment.radius > 1_000) return '棒身握持线段必须为有限有界坐标和正半径';
  }
  if (!Number.isSafeInteger(gesture.maxJumpMilliDegrees) || gesture.maxJumpMilliDegrees < 1 || gesture.maxJumpMilliDegrees >= HALF) return 'maxJumpMilliDegrees 越界';
  if (!Number.isSafeInteger(gesture.jitterMilliDegrees) || gesture.jitterMilliDegrees < 0 || gesture.jitterMilliDegrees >= gesture.maxJumpMilliDegrees) return 'jitterMilliDegrees 越界';
  if (!Number.isSafeInteger(gesture.fullTurnMilliDegrees) || gesture.fullTurnMilliDegrees < HALF || gesture.fullTurnMilliDegrees > FULL) return 'fullTurnMilliDegrees 越界';
  if (!gesture.clockwiseSignal?.trim() || !gesture.counterclockwiseSignal?.trim() || gesture.clockwiseSignal.length > 128 || gesture.counterclockwiseSignal.length > 128 || gesture.clockwiseSignal === gesture.counterclockwiseSignal) return '顺逆时针 Signal 必须在 1..128 字符且互异';
  if (gesture.sessionEntity !== undefined && (!gesture.sessionEntity.trim() || gesture.sessionEntity.length > 128)) return 'sessionEntity 非法';
  if (gesture.heldSource !== undefined && (!gesture.heldSource || gesture.lastPointerAngleMilliDegrees === undefined)) return '握持运行态不完整';
  for (const key of ['heldPointerId', 'lastPointerAngleMilliDegrees', 'accumulatedMilliDegrees', 'heldStepIndex', 'emittedTurns'] as const) {
    if (gesture[key] !== undefined && !Number.isSafeInteger(gesture[key])) return `${key} 必须为安全整数`;
  }
  if (gesture.lastPointerAngleMilliDegrees !== undefined && (gesture.lastPointerAngleMilliDegrees < 0 || gesture.lastPointerAngleMilliDegrees >= FULL)) return 'lastPointerAngleMilliDegrees 越界';
  if (gesture.accumulatedMilliDegrees !== undefined && Math.abs(gesture.accumulatedMilliDegrees) > FULL) return 'accumulatedMilliDegrees 越界';
  if (gesture.heldStepIndex !== undefined && gesture.heldStepIndex < 0) return 'heldStepIndex 越界';
  if (gesture.emittedTurns !== undefined && gesture.emittedTurns < 0) return 'emittedTurns 越界';
  return undefined;
}

const gestureDef = defineComponent('AngularGesture', {
  id: t.str(), centerX: t.num(), centerY: t.num(), radiusX: t.num(), radiusY: t.num(), angleMilliDegrees: t.num(),
  grabTolerance: t.num(), grabSegment: t.opt(t.obj({ startX: t.num(), startY: t.num(), endX: t.num(), endY: t.num(), radius: t.num() })),
  centerDeadZone: t.num(), maxJumpMilliDegrees: t.num(), jitterMilliDegrees: t.num(), fullTurnMilliDegrees: t.num(),
  clockwiseSignal: t.str(), counterclockwiseSignal: t.str(), sessionEntity: t.opt(t.str()),
  heldSource: t.opt(t.str()), heldPointerId: t.opt(t.num()), lastPointerAngleMilliDegrees: t.opt(t.num()),
  accumulatedMilliDegrees: t.opt(t.num()), heldStepIndex: t.opt(t.num()), emittedTurns: t.opt(t.num()),
}, {
  category: 'config', describe: '椭圆轨道单角度手势：位置只存整数毫度，Transform 按角度确定性派生。',
  refine: (value) => {
    const issue = validateAngularGesture({ type: 'AngularGesture', ...value } as AngularGesture);
    return issue ? [{ path: '', message: issue, severity: 'error' }] : [];
  },
});

function release(gesture: AngularGesture): void {
  gesture.heldSource = undefined;
  gesture.heldPointerId = undefined;
  gesture.lastPointerAngleMilliDegrees = undefined;
  gesture.accumulatedMilliDegrees = 0;
  gesture.heldStepIndex = undefined;
}

function sample(gesture: AngularGesture, input: RawInputData): { angle: number; radiusSquared: number } | undefined {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y) || Math.abs(input.x!) > 1_000_000 || Math.abs(input.y!) > 1_000_000) return undefined;
  const nx = (quantized(input.x!) - gesture.centerX) / gesture.radiusX;
  const ny = (quantized(input.y!) - gesture.centerY) / gesture.radiusY;
  return { angle: angleOfEllipsePoint(nx, ny), radiusSquared: nx * nx + ny * ny };
}

/** 不读 Sprite 或像素；作者显式给出相对轨道锚点的胶囊，命中只改变起握边界。 */
function onGrabSegment(gesture: AngularGesture, transform: Transform, input: RawInputData): boolean {
  const segment = gesture.grabSegment;
  if (!segment || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return false;
  const ax = transform.x + segment.startX, ay = transform.y + segment.startY;
  const dx = segment.endX - segment.startX, dy = segment.endY - segment.startY;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((input.x! - ax) * dx + (input.y! - ay) * dy) / lengthSquared));
  const ex = input.x! - (ax + t * dx), ey = input.y! - (ay + t * dy);
  return ex * ex + ey * ey <= segment.radius * segment.radius;
}

export const angularGestureCapability = defineCapability({
  id: 't2-angular-gesture', version: '1.0.0',
  describe: {
    name: 'angular-gesture', summary: 'tick 指针采样驱动椭圆单角度轨道，正反方向圈数产具名 Signal；位置只由角度派生。',
    semantic: ['tier2', 'input', 'gesture', 'ellipse', 'determinism'],
    whenToUse: '搅拌棒/旋钮/磨盘：PointerInputSource 开 move:true，宿主先逆投影为世界坐标；配置椭圆轴、中心死区、跳变/抖动/满圈阈值。可选 grabSegment 用相对轨道锚点的胶囊接收棒身 down，后续移动仍只累计轨道角；缺省仍仅锅口环。可选 sessionEntity 防本次握持在步骤推进后误提交下一步。',
    examples: ["AngularGesture{id:'brew-rod',centerX:760,centerY:423,radiusX:105,radiusY:43,angleMilliDegrees:322758,grabTolerance:0.2,centerDeadZone:0.16,maxJumpMilliDegrees:129600,jitterMilliDegrees:500,fullTurnMilliDegrees:330000,clockwiseSignal:'brew.stir.clockwise',counterclockwiseSignal:'brew.stir.counterclockwise',sessionEntity:'cauldron'}"],
  },
  components: { provides: { AngularGesture: gestureDef }, reads: ['AngularGesture', 'InputQueue', 'Transform', 'OrderedActionSession'], writes: ['AngularGesture', 'Transform', 'Signal'], consumes: [] },
  config: {}, systems: [{
    id: SYSTEM_ID, phase: SystemPhase.Input,
    reads: ['AngularGesture', 'InputQueue', 'Transform', 'OrderedActionSession'], writes: ['AngularGesture', 'Transform', 'Signal'], consumes: [],
    execute(world: IWorld) {
      const traceComponent = findDebugTrace(world);
      let traceCount = 0;
      const trace = (kind: 'decision' | 'transition' | 'reject' | 'commit', what: string, why?: string) => {
        if (!traceComponent || traceCount >= 3) return;
        appendTrace(traceComponent, traceComponent.tick ?? world.getVersion(), SYSTEM_ID, kind, what, why);
        traceCount++;
      };
      for (const id of world.getAllEntities().filter((entity) => entity.startsWith(OUTPUT_PREFIX)).sort()) world.destroyEntity(id);
      const qid = world.singleton('InputQueue');
      const queue = qid === undefined ? undefined : world.getComponent<InputQueue>(qid, 'InputQueue');
      for (const owner of sortedIds(world, 'AngularGesture', 'Transform')) {
        const gesture = world.getComponent<AngularGesture>(owner, 'AngularGesture')!;
        const transform = world.getComponent<Transform>(owner, 'Transform')!;
        let emittedThisRun = false;
        const problem = validateAngularGesture(gesture);
        if (problem) { trace('reject', `${gesture.id}:配置拒收`, problem); continue; }
        if (gesture.sessionEntity && !world.getComponent<OrderedActionSession>(gesture.sessionEntity, 'OrderedActionSession')) {
          release(gesture); trace('reject', `${gesture.id}:会话缺失`, gesture.sessionEntity); continue;
        }
        const place = () => {
          const point = pointOnEllipse(gesture.centerX, gesture.centerY, gesture.radiusX, gesture.radiusY, gesture.angleMilliDegrees);
          transform.x = point.x; transform.y = point.y;
        };
        place();
        if (!queue) continue;
        for (const action of queue.actions) {
          if (!['down', 'move', 'up', 'cancel', 'blur', 'drag'].includes(action.phase ?? '')) continue;
          if (action.phase === 'down') {
            if (gesture.heldSource !== undefined) { trace('reject', `${gesture.id}:多指针拒收`); continue; }
            const first = sample(gesture, action);
            const maxRadius = 1 + gesture.grabTolerance;
            const minRadius = Math.max(gesture.centerDeadZone, 1 - gesture.grabTolerance);
            const ringHit = !!first && first.radiusSquared >= minRadius * minRadius && first.radiusSquared <= maxRadius * maxRadius;
            const shaftHit = onGrabSegment(gesture, transform, action);
            if (!first || (!ringHit && !shaftHit)) { trace('reject', `${gesture.id}:握持拒收`, '未命中椭圆锅口或可选棒身'); continue; }
            gesture.heldSource = action.source;
            gesture.heldPointerId = action.pointerId;
            gesture.lastPointerAngleMilliDegrees = first.angle;
            gesture.accumulatedMilliDegrees = 0;
            const session = gesture.sessionEntity ? world.getComponent<OrderedActionSession>(gesture.sessionEntity, 'OrderedActionSession') : undefined;
            gesture.heldStepIndex = session?.stepIndex ?? 0;
            if (ringHit && !shaftHit) gesture.angleMilliDegrees = first.angle;
            place(); trace('transition', `${gesture.id}:idle→held`);
            continue;
          }
          if (gesture.heldSource !== action.source || (gesture.heldPointerId !== undefined && gesture.heldPointerId !== action.pointerId)) {
            if (gesture.heldSource !== undefined) trace('reject', `${gesture.id}:非握持指针拒收`);
            continue;
          }
          if (action.phase === 'cancel' || action.phase === 'blur') {
            release(gesture); trace('transition', `${gesture.id}:held→idle`, action.phase); continue;
          }
          const ending = action.phase === 'up' || action.phase === 'drag';
          const motion = action.phase === 'drag' ? { ...action, x: action.values?.[0], y: action.values?.[1] } : action;
          try {
            const session = gesture.sessionEntity ? world.getComponent<OrderedActionSession>(gesture.sessionEntity, 'OrderedActionSession') : undefined;
            if (session && (session.status !== 'active' || session.stepIndex !== gesture.heldStepIndex)) {
              trace('reject', `${gesture.id}:跨步采样拒收`, `step=${session.stepIndex}`); continue;
            }
            const next = sample(gesture, motion);
            if (!next || next.radiusSquared < gesture.centerDeadZone * gesture.centerDeadZone) { trace('reject', `${gesture.id}:中心死区`); continue; }
            const delta = shortestDelta(next.angle, gesture.lastPointerAngleMilliDegrees!);
            gesture.lastPointerAngleMilliDegrees = next.angle;
            if (Math.abs(delta) > gesture.maxJumpMilliDegrees) { trace('reject', `${gesture.id}:角差跳变`, `delta=${delta}`); continue; }
            gesture.angleMilliDegrees = normalizedAngle(gesture.angleMilliDegrees + delta);
            place();
            if (Math.abs(delta) < gesture.jitterMilliDegrees) { trace('reject', `${gesture.id}:抖动拒收`, `delta=${delta}`); continue; }
            gesture.accumulatedMilliDegrees = (gesture.accumulatedMilliDegrees ?? 0) + delta;
            if (Math.abs(gesture.accumulatedMilliDegrees) < gesture.fullTurnMilliDegrees || emittedThisRun) continue;
            const clockwise = gesture.accumulatedMilliDegrees > 0;
            const name = clockwise ? gesture.clockwiseSignal : gesture.counterclockwiseSignal;
            const nextTurn = (gesture.emittedTurns ?? 0) + 1;
            const id = `${OUTPUT_PREFIX}${owner}:${nextTurn}`;
            if (!world.getAllEntities().includes(id)) {
              world.createEntity(id);
              world.addComponent<Signal>(id, { type: 'Signal', name, source: owner });
              gesture.emittedTurns = nextTurn;
              emittedThisRun = true;
              gesture.accumulatedMilliDegrees = 0;
              trace('commit', `${gesture.id}:${name}`, '满圈提交');
            }
          } finally {
            if (ending) {
              if ((gesture.accumulatedMilliDegrees ?? 0) !== 0) trace('reject', `${gesture.id}:短弧未提交`, `累计=${gesture.accumulatedMilliDegrees}`);
              release(gesture); trace('transition', `${gesture.id}:held→idle`, action.phase);
            }
          }
        }
      }
    },
  }],
});
