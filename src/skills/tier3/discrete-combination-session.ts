import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds, worldSeed } from '@engine/core/query.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type {
  DiscreteCombinationInput,
  DiscreteCombinationReceipt,
  DiscreteCombinationSession,
  Signal,
} from '@engine/protocol/components.js';
import { randomInt } from '@atom-skills/index.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

const SYSTEM_ID = 'discrete-combination-session';
type TraceKind = 'decision' | 'transition' | 'reject' | 'commit';
type TraceWriter = (kind: TraceKind, what: string, why?: string) => void;

export function validateDiscreteCombinationConfig(session: DiscreteCombinationSession): string | undefined {
  if (!session.id) return 'id 必须是非空字符串';
  if (!Number.isSafeInteger(session.slotCount) || session.slotCount < 1 || session.slotCount > 64) return 'slotCount 必须为 1..64 的安全整数';
  if (!Number.isSafeInteger(session.valueCount) || session.valueCount < 2 || session.valueCount > 64) return 'valueCount 必须为 2..64 的安全整数';
  if (!Number.isSafeInteger(session.initialValue) || session.initialValue < 0 || session.initialValue >= session.valueCount) return 'initialValue 必须在值域内';
  if (session.initialStrategy !== undefined && session.initialStrategy !== 'constant' && session.initialStrategy !== 'random') return 'initialStrategy 必须为 constant|random';
  for (const name of ['setSignal', 'giveUpSignal', 'feedbackSignal', 'successSignal', 'failureSignal'] as const) if (!session[name]) return `${name} 必须是非空字符串`;
  if (new Set([session.setSignal, session.giveUpSignal, session.feedbackSignal, session.successSignal, session.failureSignal]).size !== 5) return '五个具名 Signal 必须互异';
  return undefined;
}

function initializeRuntime(session: DiscreteCombinationSession, seed: NonNullable<ReturnType<typeof worldSeed>>): void {
  if (session.status === undefined) session.status = 'ready';
  if (session.current !== undefined && session.target !== undefined && session.matchCount !== undefined) return;
  session.current = session.initialStrategy === 'random'
    ? Array.from({ length: session.slotCount }, () => randomInt(seed, 0, session.valueCount))
    : Array.from({ length: session.slotCount }, () => session.initialValue);
  session.target = [];
  session.matchCount = 0;
}

function exactMatches(current: readonly number[], target: readonly number[]): number {
  let count = 0;
  for (let index = 0; index < current.length; index++) if (current[index] === target[index]) count++;
  return count;
}

function emit(world: IWorld, occupied: Set<string>, owner: string, inputId: string, name: string, arg?: string): void {
  let id: string;
  let suffix = 0;
  do { id = `discrete-combination:signal:${owner}:${inputId}:${suffix++}`; } while (occupied.has(id));
  occupied.add(id);
  world.createEntity(id);
  world.addComponent(id, { type: 'Signal', name, source: owner, ...(arg === undefined ? {} : { arg }) } as Signal);
}

function finalize(world: IWorld, occupied: Set<string>, owner: string, inputId: string, session: DiscreteCombinationSession, outcome: 'success' | 'failure', traceTerminal?: TraceWriter): void {
  if (session.status === 'success' || session.status === 'failure') return;
  const from = session.status!;
  session.status = outcome;
  const receipt: DiscreteCombinationReceipt = { type: 'DiscreteCombinationReceipt', sessionId: session.id, outcome };
  const old = world.getComponent<DiscreteCombinationReceipt>(owner, 'DiscreteCombinationReceipt');
  if (old) Object.assign(old, receipt); else world.addComponent(owner, receipt);
  emit(world, occupied, owner, inputId, outcome === 'success' ? session.successSignal : session.failureSignal);
  if (traceTerminal) traceTerminal('transition', `${session.id}:${from}→${outcome}`, `outcome=${outcome}`);
}

function targetFor(session: DiscreteCombinationSession, current: readonly number[], seed: NonNullable<ReturnType<typeof worldSeed>>): number[] {
  const target: number[] = [];
  do {
    target.length = 0;
    for (let index = 0; index < session.slotCount; index++) target.push(randomInt(seed, 0, session.valueCount));
  } while (target.every((value, index) => value === current[index]));
  return target;
}

export const discreteCombinationSessionCapability = defineCapability({
  id: 't3-discrete-combination-session',
  version: '1.1.0',
  describe: {
    name: 'discrete-combination-session',
    summary: '确定性离散组合会话：以常量或随机初始向量生成不同的隐藏目标，接收单槽设值，产出整体 exact-match 反馈及唯一主动放弃终局。',
    semantic: ['tier3', 'session', 'combination', 'puzzle', 'random', 'determinism'],
    whenToUse: '密码盘、符文校准、机关滑钮或 Mastermind 类玩法：消费方填槽数、值域、初值和可选初始策略；输入只发 set(slot,value) 或 give-up，不在游戏层生成/比较向量。',
    examples: [
      "三档五槽随机开局：DiscreteCombinationSession{id:'lock',slotCount:5,valueCount:3,initialValue:1,initialStrategy:'random',setSignal:'lock.set',giveUpSignal:'lock.give-up',feedbackSignal:'lock.feedback',successSignal:'lock.success',failureSignal:'lock.failure'}；启动后系统用世界 RandomSeed 依次生成 current 和不同 target。",
      "改第三槽：DiscreteCombinationInput{sessionId:'lock',action:'set',slot:2,value:0}；主动放弃：{sessionId:'lock',action:'give-up'}。",
    ],
  },
  components: {
    provides: {
      DiscreteCombinationSession: { category: 'config', describe: '离散组合会话的作者配置字段；id 是输入路由所必需的唯一寻址元数据，隐藏目标和运行态由系统生成并随快照保存。', fields: {
        id: { type: 'string', describe: '会话唯一寻址 id' },
        slotCount: { type: 'number', describe: '槽位数，1..64' },
        valueCount: { type: 'number', describe: '每槽合法值数量，2..64，值域 0..valueCount-1' },
        initialValue: { type: 'number', describe: 'constant 策略下所有槽的初值；为兼容既有内容始终必填且在值域内' },
        initialStrategy: { type: 'string', describe: '可选 constant|random；缺省 constant。random 逐槽消费世界 RandomSeed 生成初始 current，再生成不同 target' },
        setSignal: { type: 'string', describe: '接收 set 的具名 Signal；arg 必须为 slot:value' },
        giveUpSignal: { type: 'string', describe: '接收主动放弃的具名 Signal；不得带 arg' },
        feedbackSignal: { type: 'string', describe: '合法 set 后发出的整体反馈 Signal' },
        successSignal: { type: 'string', describe: '首次成功终局 Signal' },
        failureSignal: { type: 'string', describe: '首次主动放弃终局 Signal' },
      } },
      DiscreteCombinationInput: { category: 'intent', describe: '闭集会话输入：set 需 slot/value；give-up 是唯一失败路径。', fields: {
        sessionId: { type: 'string', describe: '目标 DiscreteCombinationSession.id' }, action: { type: 'string', describe: 'set|give-up' },
        slot: { type: 'number', describe: 'set 的 0 基槽位' }, value: { type: 'number', describe: 'set 的离散值' },
      } },
      DiscreteCombinationReceipt: { category: 'event', describe: '首次终局唯一回执；outcome 仅 success|failure。', fields: {
        sessionId: { type: 'string', describe: '会话 id' }, outcome: { type: 'string', describe: 'success|failure' },
      } },
    },
    reads: ['DiscreteCombinationSession', 'DiscreteCombinationInput', 'RandomSeed', 'Signal'],
    writes: ['DiscreteCombinationSession', 'DiscreteCombinationReceipt', 'RandomSeed', 'Signal'],
    consumes: ['DiscreteCombinationInput'],
  },
  config: {},
  systems: [{
    id: SYSTEM_ID,
    phase: SystemPhase.Commit,
    runsAfter: ['progressive-risk-session', 'risk-reveal-wheel'],
    runsBefore: ['effect-apply', 'craft-recipe', 'weighted-spawn', 'matrix-duel-intent', 'cooldown'],
    reads: ['DiscreteCombinationSession', 'DiscreteCombinationInput', 'RandomSeed', 'Signal'],
    writes: ['DiscreteCombinationSession', 'DiscreteCombinationReceipt', 'RandomSeed', 'Signal'],
    consumes: ['DiscreteCombinationInput'],
    execute(world: IWorld) {
      const traceComponent = findDebugTrace(world);
      let trace: TraceWriter | undefined;
      let traceTerminal: TraceWriter | undefined;
      if (traceComponent) {
        let traceCount = 0;
        const traceStart = traceComponent.events.length;
        trace = (kind, what, why) => {
          if (traceCount >= 3) return;
          traceCount++;
          appendTrace(traceComponent, traceComponent.tick ?? world.getVersion(), SYSTEM_ID, kind, what, why);
        };
        traceTerminal = (kind, what, why) => {
          if (traceCount >= 3 && traceComponent.events.length > traceStart) { traceComponent.events.splice(traceComponent.events.length - 1, 1); traceCount--; }
          trace!(kind, what, why);
        };
      }
      // 终局是诊断承重信息；同拍多输入压满三条时宁可替换本系统最晚一条普通记录，也不能丢终局原因。
      const occupied = new Set(world.getAllEntities());
      const sessions = sortedIds(world, 'DiscreteCombinationSession').map((owner) => ({ owner, session: world.getComponent<DiscreteCombinationSession>(owner, 'DiscreteCombinationSession')! }));
      const owners = new Map<string, Array<{ owner: string; session: DiscreteCombinationSession }>>();
      for (const entry of sessions) {
        const list = owners.get(entry.session.id) ?? [];
        list.push(entry); owners.set(entry.session.id, list);
      }
      // 本能力发出的 Signal 是瞬时事件：无 event-when 装配时也自行回收，且不在 session 留隐式运行态。
      for (const [signalId] of world.query('Signal')) if (signalId.startsWith('discrete-combination:signal:')) {
        world.destroyEntity(signalId); occupied.delete(signalId);
      }
      for (const { owner, session } of sessions) {
        const fresh = session.status === undefined;
        if (fresh) session.status = 'ready';
        const problem = validateDiscreteCombinationConfig(session);
        if (problem) { if (trace) trace('reject', `${session.id}:启动拒收`, problem); continue; }
        if (owners.get(session.id)!.length !== 1) { if (trace) trace('reject', `${session.id}:启动拒收`, '会话 id 不唯一'); continue; }
        if (session.status !== 'ready') continue;
        const rng = worldSeed(world);
        if (!rng) { if (trace) trace('reject', `${session.id}:启动拒收`, '缺 RandomSeed'); continue; }
        // 无 seed 的首次启动会停在 ready；之后 seed 到位时仍须完整初始化，不能把
        // undefined current 当作旧快照。已完整快照的 playing/success/failure 不会走这里。
        if (fresh || session.current === undefined || session.target === undefined || session.matchCount === undefined) initializeRuntime(session, rng);
        session.target = targetFor(session, session.current!, rng);
        session.matchCount = exactMatches(session.current!, session.target);
        session.status = 'playing';
        if (trace) trace('decision', `${session.id}:initial=${session.initialStrategy ?? 'constant'},target 已生成`, `slots=${session.slotCount},values=${session.valueCount}`);
        // 同拍若紧接首个 winning set，3 条上限必须为终局 transition 留位；生成 decision 已能重建 ready→playing。
      }
      const inputs = sortedIds(world, 'DiscreteCombinationInput').map((owner) => ({ owner, input: world.getComponent<DiscreteCombinationInput>(owner, 'DiscreteCombinationInput')! }));
      for (const [signalOwner] of sortedIds(world, 'Signal').map((id) => [id] as const)) {
        const signal = world.getComponent<Signal>(signalOwner, 'Signal')!;
        const candidates = sessions.filter(({ session }) => signal.name === session.setSignal || signal.name === session.giveUpSignal);
        if (candidates.length !== 1) continue;
        const { session } = candidates[0]!;
        world.removeComponent(signalOwner, 'Signal');
        if (signal.name === session.giveUpSignal) {
          if (signal.arg !== undefined && trace) trace('reject', `${session.id}:give-up Signal 拒收`, 'give-up 不接收 arg');
          else inputs.push({ owner: `signal:${signalOwner}`, input: { type: 'DiscreteCombinationInput', sessionId: session.id, action: 'give-up' } });
          continue;
        }
        const match = /^(\d+):(\d+)$/.exec(signal.arg ?? '');
        if (!match) { if (trace) trace('reject', `${session.id}:set Signal 拒收`, 'arg 必须为 slot:value'); continue; }
        inputs.push({ owner: `signal:${signalOwner}`, input: { type: 'DiscreteCombinationInput', sessionId: session.id, action: 'set', slot: Number(match[1]), value: Number(match[2]) } });
      }
      inputs.sort((a, b) => a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0);
      for (const { owner: inputOwner, input } of inputs) {
        if (!inputOwner.startsWith('signal:')) world.removeComponent(inputOwner, 'DiscreteCombinationInput');
        const candidates = owners.get(input.sessionId) ?? [];
        if (candidates.length !== 1) { if (trace) trace('reject', `input:${input.sessionId} 拒收`, candidates.length ? '会话 id 不唯一' : '会话不存在'); continue; }
        const { owner, session } = candidates[0]!;
        if (session.status !== 'playing') { if (trace) trace('reject', `${session.id}:${String(input.action)} 拒收`, `status=${session.status}`); continue; }
        if (input.action === 'give-up') { finalize(world, occupied, owner, inputOwner, session, 'failure', traceTerminal); continue; }
        if (input.action !== 'set') { if (trace) trace('reject', `${session.id}:${String(input.action)} 拒收`, '动作不在闭集'); continue; }
        if (!Number.isSafeInteger(input.slot) || !Number.isSafeInteger(input.value) || input.slot! < 0 || input.slot! >= session.slotCount || input.value! < 0 || input.value! >= session.valueCount) {
          if (trace) trace('reject', `${session.id}:set 拒收`, `slot=${String(input.slot)},value=${String(input.value)}`); continue;
        }
        session.current![input.slot!] = input.value!;
        session.matchCount = exactMatches(session.current!, session.target!);
        const tier = session.matchCount === 0 ? 'none' : session.matchCount === session.slotCount ? 'all' : 'some';
        emit(world, occupied, owner, inputOwner, session.feedbackSignal, tier);
        if (trace) trace('commit', `${session.id}:slot=${input.slot}`, `matchTier=${tier}`);
        if (session.matchCount === session.slotCount) finalize(world, occupied, owner, inputOwner, session, 'success', traceTerminal);
      }
    },
  }],
});
