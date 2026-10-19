import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { OrderedActionSession, Signal } from '@engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

const SYSTEM_ID = 'ordered-action-session';
const OUTPUT_PREFIX = 'ordered-action:signal:';
type Entry = { owner: string; session: OrderedActionSession };
type TraceKind = 'decision' | 'transition' | 'reject' | 'commit';

/** 装载期与运行期共用一把尺子；坏配方 fail-closed，不部分解释。 */
export function validateOrderedActionSession(session: OrderedActionSession): string | undefined {
  if (typeof session.id !== 'string' || !session.id.trim() || session.id.length > 128) return 'id 必须为 1..128 字符';
  if (!Array.isArray(session.acceptedActions) || session.acceptedActions.length < 1 || session.acceptedActions.length > 256) return 'acceptedActions 必须有 1..256 项';
  if (session.acceptedActions.some((name) => typeof name !== 'string' || !name.trim() || name.length > 128)) return 'acceptedActions 动作名必须为 1..128 字符';
  const actions = new Set(session.acceptedActions);
  if (actions.size !== session.acceptedActions.length) return 'acceptedActions 不得重复';
  if (!Array.isArray(session.steps) || session.steps.length < 1 || session.steps.length > 128) return 'steps 必须有 1..128 项';
  for (let index = 0; index < session.steps.length; index++) {
    const step = session.steps[index];
    if (!step || typeof step.expectedAction !== 'string' || !actions.has(step.expectedAction)) return `steps[${index}].expectedAction 不在 acceptedActions`;
    if (!Number.isSafeInteger(step.requiredCount) || step.requiredCount < 1 || step.requiredCount > 64) return `steps[${index}].requiredCount 必须为 1..64`;
    if (step.completedSignal !== undefined && (typeof step.completedSignal !== 'string' || !step.completedSignal.trim() || step.completedSignal.length > 128)) return `steps[${index}].completedSignal 必须为 1..128 字符`;
  }
  if (typeof session.successSignal !== 'string' || !session.successSignal.trim() || session.successSignal.length > 128 || typeof session.failureSignal !== 'string' || !session.failureSignal.trim() || session.failureSignal.length > 128) return '终局 Signal 必须为 1..128 字符';
  if (session.successSignal === session.failureSignal || actions.has(session.successSignal) || actions.has(session.failureSignal)) return '终局 Signal 必须互异且不得与输入动作重名';
  const completed = session.steps.map((step) => step.completedSignal).filter((name): name is string => name !== undefined);
  if (new Set(completed).size !== completed.length || completed.some((name) => actions.has(name) || name === session.successSignal || name === session.failureSignal)) return '步骤完成 Signal 必须互异且不得与输入动作或终局 Signal 重名';
  if (session.status !== undefined && !['active', 'success', 'failure'].includes(session.status)) return 'status 不在闭集';
  const runtime = [session.status, session.stepIndex, session.confirmedCount];
  if (runtime.some((value) => value !== undefined) && runtime.some((value) => value === undefined)) return '运行态字段必须同时存在';
  if (session.stepIndex !== undefined && (!Number.isSafeInteger(session.stepIndex) || session.stepIndex < 0 || session.stepIndex > session.steps.length)) return 'stepIndex 越界';
  if (session.confirmedCount !== undefined && (!Number.isSafeInteger(session.confirmedCount) || session.confirmedCount < 0 || session.confirmedCount > 63)) return 'confirmedCount 越界';
  if (session.status === 'active' && (session.stepIndex! >= session.steps.length || session.confirmedCount! >= session.steps[session.stepIndex!]!.requiredCount)) return 'active 游标越界';
  if (session.status === 'success' && (session.stepIndex !== session.steps.length || session.confirmedCount !== 0)) return 'success 终态游标必须在尾后';
  return undefined;
}

const sessionDef = defineComponent('OrderedActionSession', {
  id: t.str('会话唯一 id'),
  acceptedActions: t.arr(t.str('本会话会消费的完整具名动作')),
  steps: t.arr(t.obj({ expectedAction: t.str('完整动作名'), requiredCount: t.num('该动作连续提交次数'), completedSignal: t.opt(t.str('该步正确完成时发出的唯一具名信号；缺省不发')) })),
  successSignal: t.str(), failureSignal: t.str(),
  status: t.opt(t.enum(['active', 'success', 'failure'] as const)),
  stepIndex: t.opt(t.num()), confirmedCount: t.opt(t.num()),
  lastAction: t.opt(t.str()), failureExpected: t.opt(t.str()),
}, {
  category: 'config',
  describe: '有序具名动作会话；配置与有限运行态同在组件中，快照可续跑。',
  refine: (value) => {
    const problem = validateOrderedActionSession({ type: 'OrderedActionSession', ...value } as OrderedActionSession);
    return problem ? [{ path: '', message: problem, severity: 'error' }] : [];
  },
});

function emitOutput(world: IWorld, owner: string, name: string, label: string): void {
  const base = `${OUTPUT_PREFIX}${owner}:${label}`;
  const occupied = new Set(world.getAllEntities());
  let id = base;
  for (let suffix = 1; occupied.has(id); suffix++) id = `${base}:${suffix}`;
  world.createEntity(id);
  world.addComponent<Signal>(id, { type: 'Signal', name, source: owner });
}

function emitTerminal(world: IWorld, owner: string, session: OrderedActionSession): void {
  emitOutput(world, owner, session.status === 'success' ? session.successSignal : session.failureSignal, session.status!);
}

export const orderedActionSessionCapability = defineCapability({
  id: 't2-ordered-action-session',
  version: '1.0.0',
  describe: {
    name: 'ordered-action-session',
    summary: '按运行时声明的完整具名动作序列逐次判定，错误立即失败，末步成功仅一次。',
    semantic: ['tier2', 'session', 'sequence', 'signal', 'determinism'],
    whenToUse: '炼药、烹饪、装配或仪式的有序操作：把材料与方向动作都列入 acceptedActions，steps 逐项指定 expectedAction/requiredCount；其它 UI Signal 不参与判定。上游 Clickable/DropZone/KeyBinding 须发完整动作名，且每个同拍输入有稳定 Signal 实体 id 与 source。',
    examples: ["OrderedActionSession{id:'brew',acceptedActions:['brew.add.moon','brew.add.ash','brew.stir.clockwise','brew.stir.counterclockwise'],steps:[{expectedAction:'brew.add.moon',requiredCount:1},{expectedAction:'brew.stir.clockwise',requiredCount:2}],successSignal:'brew.success',failureSignal:'brew.failure'}"],
  },
  components: {
    provides: { OrderedActionSession: sessionDef },
    reads: ['OrderedActionSession', 'Signal'],
    writes: ['OrderedActionSession', 'Signal'],
    consumes: [],
  },
  config: {},
  systems: [{
    id: SYSTEM_ID,
    phase: SystemPhase.Commit,
    runsAfter: ['discrete-combination-session'],
    runsBefore: ['effect-apply', 'craft-recipe', 'weighted-spawn', 'cooldown', 'presentation-track'],
    reads: ['OrderedActionSession', 'Signal'],
    writes: ['OrderedActionSession', 'Signal'],
    consumes: [],
    execute(world: IWorld) {
      const traceComponent = findDebugTrace(world);
      let traceCount = 0;
      const traceStart = traceComponent?.events.length ?? 0;
      const trace = (kind: TraceKind, what: string, why?: string, terminal = false) => {
        if (!traceComponent) return;
        if (traceCount >= 3 && terminal && traceComponent.events.length > traceStart) {
          traceComponent.events.splice(traceComponent.events.length - 1, 1);
          traceCount--;
        }
        if (traceCount >= 3) return;
        appendTrace(traceComponent, traceComponent.tick ?? world.getVersion(), SYSTEM_ID, kind, what, why);
        traceCount++;
      };
      // 本能力的终局 Signal 只活一拍，未装 event-when 时也不泄漏。
      for (const id of sortedIds(world, 'Signal')) if (id.startsWith(OUTPUT_PREFIX)) world.destroyEntity(id);

      const sessions: Entry[] = sortedIds(world, 'OrderedActionSession').map((owner) => ({ owner, session: world.getComponent<OrderedActionSession>(owner, 'OrderedActionSession')! }));
      const idCounts = new Map<string, number>();
      for (const { session } of sessions) idCounts.set(session.id, (idCounts.get(session.id) ?? 0) + 1);
      const routes = new Map<string, Entry | null>();
      for (const entry of sessions) {
        const { session } = entry;
        const problem = validateOrderedActionSession(session);
        if (problem || idCounts.get(session.id) !== 1) { trace('reject', `${session.id}:配置拒收`, problem ?? '会话 id 不唯一'); continue; }
        if (session.status === undefined) { session.status = 'active'; session.stepIndex = 0; session.confirmedCount = 0; trace('transition', `${session.id}:ready→active`); }
        for (const action of session.acceptedActions) routes.set(action, routes.has(action) ? null : entry);
      }

      const seen = new Set<string>();
      for (const inputId of sortedIds(world, 'Signal')) {
        const signal = world.getComponent<Signal>(inputId, 'Signal')!;
        if (!routes.has(signal.name)) continue;
        const entry = routes.get(signal.name);
        if (!entry) { trace('reject', `${signal.name}:路由拒收`, '动作属于多个会话'); continue; }
        world.removeComponent(inputId, 'Signal');
        const { owner, session } = entry;
        if (typeof signal.source !== 'string' || !signal.source) { trace('reject', `${session.id}:动作拒收`, 'Signal.source 缺失'); continue; }
        const dedupKey = `${signal.source}\u0000${signal.name}`;
        if (seen.has(dedupKey)) { trace('reject', `${session.id}:${signal.name} 重复`, '同拍同源同名只计一次'); continue; }
        seen.add(dedupKey);
        if (session.status !== 'active') { trace('reject', `${session.id}:${signal.name} 终局拒收`, `status=${session.status}`); continue; }
        const step = session.steps[session.stepIndex!]!;
        session.lastAction = signal.name;
        if (signal.name !== step.expectedAction) {
          session.status = 'failure'; session.failureExpected = step.expectedAction;
          emitTerminal(world, owner, session);
          trace('transition', `${session.id}:active→failure`, `expected=${step.expectedAction},received=${signal.name}`, true);
          continue;
        }
        session.confirmedCount!++;
        trace('commit', `${session.id}:${signal.name}`, `step=${session.stepIndex},count=${session.confirmedCount}`);
        if (session.confirmedCount! < step.requiredCount) continue;
        if (step.completedSignal) emitOutput(world, owner, step.completedSignal, `step:${session.stepIndex}`);
        session.stepIndex!++; session.confirmedCount = 0;
        if (session.stepIndex === session.steps.length) {
          session.status = 'success';
          emitTerminal(world, owner, session);
          trace('transition', `${session.id}:active→success`, `last=${signal.name}`, true);
        } else trace('transition', `${session.id}:step→${session.stepIndex}`, `next=${session.steps[session.stepIndex!]!.expectedAction}`);
      }
    },
  }],
});
