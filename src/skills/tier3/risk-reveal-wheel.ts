import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds, worldSeed } from '@engine/core/query.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type {
  RiskRevealInput,
  RiskRevealReceipt,
  RiskRevealTerminal,
  RiskRevealWheel,
  Signal,
} from '@engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';
import { randomInt } from '../atoms/random/index.js';
import {
  placeRiskRevealSlots,
  riskRevealQtePenaltyBp,
  riskRevealRuntimeProblem,
  validateRiskRevealConfig,
} from './risk-reveal-wheel-core.js';

export { riskRevealQtePenaltyBp, validateRiskRevealConfig } from './risk-reveal-wheel-core.js';

const BP = 10_000;
const SYSTEM_ID = 'risk-reveal-wheel';
type TraceWriter = (kind: 'decision' | 'transition' | 'reject' | 'commit', what: string, why?: string) => void;


function initializeRuntime(session: RiskRevealWheel): void {
  if (session.phase !== undefined) {
    // 可选配置是增量演进：旧快照没有这个运行态时按缺省零暂停继续。
    session.qtePauseTicks ??= 0;
    return;
  }
  session.phase = 'idle';
  session.riskBp = 0;
  session.riskRemainder = 0;
  session.elapsedTicks = 0;
  session.qteTick = 0;
  session.qtePauseTicks = 0;
  session.qteAttempts = 0;
  session.perfectQtes = 0;
  session.lastQteOffsetTicks = 0;
  session.lastQtePenaltyBp = 0;
  session.revealCredits = 0;
  session.blackSlots = [];
  session.slotTargetIds = [];
  session.revealedSlots = [];
  session.acquiredIds = [];
  session.lastInputSeq = -1;
  session.signalSeq = 0;
  session.emittedSignalIds = [];
  delete session.terminal;
}


function emitSignal(world: IWorld, occupied: Set<string>, owner: string, session: RiskRevealWheel, name: string, arg?: string): void {
  let id: string;
  do { id = `risk-reveal:signal:${owner}:${session.signalSeq!++}`; } while (occupied.has(id));
  occupied.add(id);
  world.createEntity(id);
  world.addComponent(id, { type: 'Signal', name: `risk-reveal:${name}`, source: owner, ...(arg === undefined ? {} : { arg }) } as Signal);
  session.emittedSignalIds!.push(id);
}

function receiptOf(session: RiskRevealWheel, status: RiskRevealTerminal): RiskRevealReceipt {
  return {
    type: 'RiskRevealReceipt', sessionId: session.id, status,
    acquiredIds: [...session.acquiredIds!], revealedSlots: [...session.revealedSlots!],
    riskBp: session.riskBp!, elapsedTicks: session.elapsedTicks!,
    qteAttempts: session.qteAttempts!, perfectQtes: session.perfectQtes!,
  };
}

function finalize(world: IWorld, occupied: Set<string>, owner: string, session: RiskRevealWheel,
  status: RiskRevealTerminal, trace: TraceWriter): void {
  const from = session.phase!;
  session.phase = 'terminal';
  session.terminal = status;
  const receipt = receiptOf(session, status);
  const current = world.getComponent<RiskRevealReceipt>(owner, 'RiskRevealReceipt');
  if (current) Object.assign(current, receipt); else world.addComponent(owner, receipt);
  emitSignal(world, occupied, owner, session, 'terminal', status);
  trace('transition', `${session.id}:${from}→terminal`, status);
  trace('commit', `${session.id}:terminal=${status}`, `acquired=${session.acquiredIds!.length},risk=${session.riskBp}`);
}

function applyPassiveRisk(session: RiskRevealWheel): void {
  const total = session.riskRemainder! + session.riskRateBpPerSecond;
  session.riskBp = Math.min(session.riskLimitBp, session.riskBp! + Math.floor(total / session.ticksPerSecond));
  session.riskRemainder = total % session.ticksPerSecond;
  session.elapsedTicks!++;
}

function settleQte(world: IWorld, occupied: Set<string>, owner: string, session: RiskRevealWheel,
  tick: number, timeout: boolean, trace: TraceWriter): void {
  const offset = timeout
    ? Math.max(session.qteIdealTick, session.qteCycleTicks - 1 - session.qteIdealTick)
    : Math.abs(tick - session.qteIdealTick);
  const penalty = timeout ? session.qteMaxPenaltyBp : riskRevealQtePenaltyBp(session, tick);
  const perfect = !timeout && offset <= session.qtePerfectRadiusTicks;
  session.qteAttempts!++;
  session.lastQteOffsetTicks = offset;
  session.lastQtePenaltyBp = penalty;
  if (perfect) session.perfectQtes!++;
  session.riskBp = Math.min(session.riskLimitBp, session.riskBp! + penalty);
  const outcome = timeout ? 'timeout' : perfect ? 'perfect' : 'offset';
  emitSignal(world, occupied, owner, session, 'qte', `${outcome}:${offset}:${penalty}`);
  trace('decision', `${session.id}:qte=${outcome}`, `offset=${offset},risk+${penalty}`);
  if (session.riskBp! >= session.riskLimitBp) { finalize(world, occupied, owner, session, 'exposed', trace); return; }
  if (session.revealRule === 'bank-perfect-during-qte') {
    if (perfect) session.revealCredits!++;
    if (perfect && session.qteTargetRule === 'reshuffle-on-perfect') {
      const rng = worldSeed(world);
      if (rng) {
        const previous = session.qteIdealTick;
        // 取 [0, cycle-1) 再跨过旧点，保证每次成功的金色扇区都会换向。
        const sample = randomInt(rng, 0, session.qteCycleTicks - 1);
        session.qteIdealTick = sample >= previous ? sample + 1 : sample;
        trace('decision', `${session.id}:qte-target`, `${previous}→${session.qteIdealTick}`);
      }
    }
    if (session.qtePressRule !== 'continue-from-press') session.qteTick = 0;
    if (!timeout && (session.qtePressPauseTicks ?? 0) > 0) session.qtePauseTicks = session.qtePressPauseTicks!;
    trace('transition', `${session.id}:qte→qte`, `${perfect ? `credit=${session.revealCredits}` : 'no-credit'},press=${session.qtePressRule ?? 'reset-to-start'},pause=${session.qtePauseTicks ?? 0}`);
    return;
  }
  session.revealCredits = 1;
  session.phase = 'reveal';
  trace('transition', `${session.id}:qte→reveal`, `credit=1`);
}

/** 未按下时仅回到周期起点；不伪造成玩家失误，也不写 QTE 统计。 */
function resetQteCycle(world: IWorld, occupied: Set<string>, owner: string, session: RiskRevealWheel, trace: TraceWriter): void {
  session.qteTick = 0;
  emitSignal(world, occupied, owner, session, 'qte', 'cycle-reset');
  trace('decision', `${session.id}:qte-cycle-reset`, 'timeout 无惩罚');
}

export const riskRevealWheelCapability = defineCapability({
  id: 't3-risk-reveal-wheel',
  version: '1.1.0',
  describe: {
    name: 'risk-reveal-wheel',
    summary: '持续风险下的种子化隐藏槽位：可选的阶段式翻格或持续 QTE 精准开门权，均可撤退并保留所得。',
    semantic: ['tier3', 'session', 'risk', 'qte', 'reveal', 'random', 'determinism'],
    whenToUse: '任何“公开部分空位、其余隐藏目标、循环精准检定后逐格探索、停留越久风险越高”的拆弹、潜取、勘探或搜刮会话。',
    examples: [
      "双环布局：RiskRevealWheel{id:'run',slotCount:16,ringSizes:[4,12],targets:[{id:'a'}],blackSlotCount:6,...}",
      "阶段式：RiskRevealInput{sessionId:'run',action:'qte-press',seq:1} 后，再发 action:'reveal',slot:8。",
      "持续式：RiskRevealWheel{revealRule:'bank-perfect-during-qte'}；黄区命中累积 credit，任意 QTE 时刻可 reveal。",
    ],
  },
  components: {
    provides: {
      RiskRevealWheel: { category: 'config', describe: '风险翻格会话的作者配置字段；可快照运行态由系统内部维护，不列入作者填写面。难度映射由消费方完成。', fields: {
        id: { type: 'string', describe: '会话 id' }, slotCount: { type: 'number', describe: '总槽位数' },
        ringSizes: { type: 'number[]', describe: '逻辑环/组大小，总和必须等于槽位数' }, targets: { type: 'string', describe: '唯一目标 id 数组' },
        blackSlotCount: { type: 'number', describe: '公开封锁且必空的槽位数' }, riskRateBpPerSecond: { type: 'number', describe: '每秒被动风险基点' },
        ticksPerSecond: { type: 'number', describe: '固定 tick 率' }, riskLimitBp: { type: 'number', describe: '风险上限' },
        qteCycleTicks: { type: 'number', describe: 'QTE 周期 tick 数' }, qteIdealTick: { type: 'number', describe: '零偏移理想 tick' },
        qtePerfectRadiusTicks: { type: 'number', describe: '零惩罚半径' }, qteMaxPenaltyBp: { type: 'number', describe: '最远偏移/超时的最大风险惩罚' },
        revealRule: { type: 'string', describe: '可选：phase-after-qte（旧行为）或 bank-perfect-during-qte（仅精准命中累计开门权且不中断 QTE）' },
        qteTargetRule: { type: 'string', describe: '可选：fixed 或 reshuffle-on-perfect（完美后以世界种子抽取不同的下一理想刻度）' },
        qteTimeoutRule: { type: 'string', describe: '可选：penalize（旧行为）或 reset-no-penalty（周期结束只复位指针）' },
        qtePressRule: { type: 'string', describe: '可选：reset-to-start（旧行为）或 continue-from-press（QTE 后持续当前指针相位）' },
        qtePressPauseTicks: { type: 'number', describe: '可选：按下后锁住 QTE 刻度的固定 tick 数；被动风险/计时仍持续，缺省 0' },
      } },
      RiskRevealInput: { category: 'intent', describe: 'start|qte-press|reveal|withdraw；reveal 必须带 slot。', fields: {
        sessionId: { type: 'string', describe: '会话 id' }, action: { type: 'string', describe: '闭集动作' },
        seq: { type: 'number', describe: '单调输入序号' }, slot: { type: 'number', describe: 'reveal 的槽位下标' },
      } },
      RiskRevealReceipt: { category: 'event', describe: '不可变终局回执；暴露仍保留所得。风险/QTE 统计是系统产出的诊断字段，不属于作者配置面。', fields: {
        sessionId: { type: 'string', describe: '会话 id' }, status: { type: 'string', describe: 'withdrew|exposed|cleared|aborted' },
        acquiredIds: { type: 'string[]', describe: '已取得目标' }, revealedSlots: { type: 'number[]', describe: '已翻槽位' },
      } },
    },
    reads: ['RiskRevealWheel', 'RiskRevealInput', 'RandomSeed'],
    writes: ['RiskRevealWheel', 'RiskRevealReceipt', 'RandomSeed', 'Signal'],
    consumes: ['RiskRevealInput'],
  },
  config: {},
  systems: [{
    id: SYSTEM_ID,
    phase: SystemPhase.Commit,
    // 两个会话能力都可能 RMW 世界 RandomSeed；固定旧渐进会话先、本会话后，消除全局超集软环。
    runsAfter: ['progressive-risk-session'],
    runsBefore: ['effect-apply', 'craft-recipe', 'weighted-spawn', 'matrix-duel-intent', 'cooldown'],
    reads: ['RiskRevealWheel', 'RiskRevealInput', 'RandomSeed'],
    writes: ['RiskRevealWheel', 'RiskRevealReceipt', 'RandomSeed', 'Signal'],
    consumes: ['RiskRevealInput'],
    execute(world: IWorld) {
      const traceComponent = findDebugTrace(world);
      let traceCount = 0;
      const trace: TraceWriter = (kind, what, why) => {
        if (!traceComponent || traceCount >= 3) return;
        traceCount++;
        appendTrace(traceComponent, traceComponent.tick ?? world.getVersion(), SYSTEM_ID, kind, what, why);
      };
      const occupied = new Set(world.getAllEntities());
      const sessions = sortedIds(world, 'RiskRevealWheel').map((owner) => ({
        owner, session: world.getComponent<RiskRevealWheel>(owner, 'RiskRevealWheel')!,
      }));
      for (const { session } of sessions) {
        initializeRuntime(session);
        for (const id of session.emittedSignalIds!) { world.destroyEntity(id); occupied.delete(id); }
        session.emittedSignalIds = [];
      }
      const byId = new Map<string, Array<{ owner: string; session: RiskRevealWheel }>>();
      for (const entry of sessions) {
        const list = byId.get(entry.session.id) ?? [];
        list.push(entry); byId.set(entry.session.id, list);
      }

      // 风险永远先于同拍输入；玩家不能在已经满值的一拍抢先撤退。
      for (const { owner, session } of sessions) {
        if (session.phase !== 'qte' && session.phase !== 'reveal') continue;
        const problem = validateRiskRevealConfig(session) ?? riskRevealRuntimeProblem(session);
        if (problem) { finalize(world, occupied, owner, session, 'aborted', trace); continue; }
        applyPassiveRisk(session);
        if (session.riskBp! >= session.riskLimitBp) finalize(world, occupied, owner, session, 'exposed', trace);
      }

      const commands = sortedIds(world, 'RiskRevealInput').map((owner) => ({
        owner, input: world.getComponent<RiskRevealInput>(owner, 'RiskRevealInput')!,
      })).sort((a, b) => a.input.seq - b.input.seq || a.owner.localeCompare(b.owner));

      for (const { input } of commands) {
        const matches = byId.get(input.sessionId) ?? [];
        if (matches.length !== 1) { trace('reject', `input:${input.sessionId} 拒收`, matches.length ? '会话 id 不唯一' : '会话不存在'); continue; }
        const { owner, session } = matches[0]!;
        if (!Number.isSafeInteger(input.seq) || input.seq < 0 || input.seq <= session.lastInputSeq!) {
          trace('reject', `${session.id}:seq=${String(input.seq)} 拒收`, `last=${session.lastInputSeq}`); continue;
        }
        session.lastInputSeq = input.seq;
        if (session.phase === 'terminal') { trace('reject', `${session.id}:${String(input.action)} 拒收`, '会话已终局'); continue; }

        if (input.action === 'start') {
          if (session.phase !== 'idle') { trace('reject', `${session.id}:start 拒收`, `phase=${session.phase}`); continue; }
          const problem = validateRiskRevealConfig(session) ?? riskRevealRuntimeProblem(session);
          const rng = worldSeed(world);
          if (problem || !rng) { trace('reject', `${session.id}:start 拒收`, problem ?? '缺 RandomSeed'); finalize(world, occupied, owner, session, 'aborted', trace); continue; }
          placeRiskRevealSlots(session, rng);
          session.phase = 'qte';
          emitSignal(world, occupied, owner, session, 'started');
          trace('decision', `${session.id}:layout`, `black=${session.blackSlotCount},targets=${session.targets.length}`);
          trace('transition', `${session.id}:idle→qte`);
          continue;
        }

        if (input.action === 'withdraw') {
          if (session.phase !== 'qte' && session.phase !== 'reveal') { trace('reject', `${session.id}:withdraw 拒收`, `phase=${session.phase}`); continue; }
          finalize(world, occupied, owner, session, 'withdrew', trace); continue;
        }

        if (input.action === 'qte-press') {
          if (session.phase !== 'qte') { trace('reject', `${session.id}:qte-press 拒收`, `phase=${session.phase}`); continue; }
          if (session.qtePauseTicks! > 0) { trace('reject', `${session.id}:qte-press 拒收`, `pause=${session.qtePauseTicks}`); continue; }
          settleQte(world, occupied, owner, session, session.qteTick!, false, trace); continue;
        }

        if (input.action !== 'reveal') { trace('reject', `${session.id}:${String(input.action)} 拒收`, '动作不在闭集'); continue; }
        const continuous = session.revealRule === 'bank-perfect-during-qte';
        const canReveal = continuous
          ? session.phase === 'qte' && session.revealCredits! > 0
          : session.phase === 'reveal' && session.revealCredits === 1;
        if (!canReveal) { trace('reject', `${session.id}:reveal 拒收`, `phase=${session.phase},credit=${session.revealCredits}`); continue; }
        const slot = input.slot;
        if (!Number.isSafeInteger(slot) || slot! < 0 || slot! >= session.slotCount) { trace('reject', `${session.id}:reveal 拒收`, `slot=${String(slot)}`); continue; }
        if (session.blackSlots!.includes(slot!)) { trace('reject', `${session.id}:reveal 拒收`, `slot=${slot} 为封锁位`); continue; }
        if (session.revealedSlots!.includes(slot!)) { trace('reject', `${session.id}:reveal 拒收`, `slot=${slot} 已翻开`); continue; }

        session.revealCredits = session.revealCredits! - 1;
        session.revealedSlots!.push(slot!);
        const targetId = session.slotTargetIds![slot!] ?? undefined;
        if (targetId) session.acquiredIds!.push(targetId);
        emitSignal(world, occupied, owner, session, 'revealed', targetId ? `${slot}:${targetId}` : `${slot}:empty`);
        trace('decision', `${session.id}:slot=${slot}`, targetId ? `target=${targetId}` : 'empty');
        trace('commit', `${session.id}:revealed=${slot}`, targetId ? `acquired=${targetId}` : 'empty');
        if (session.acquiredIds!.length === session.targets.length) { finalize(world, occupied, owner, session, 'cleared', trace); continue; }
        if (!continuous) {
          session.phase = 'qte';
          session.qteTick = 0;
          trace('transition', `${session.id}:reveal→qte`);
        } else trace('commit', `${session.id}:credit=${session.revealCredits}`, '持续 QTE 保持转动');
      }

      for (const { owner, session } of sessions) {
        if (session.phase !== 'qte') continue;
        if (session.qtePauseTicks! > 0) { session.qtePauseTicks!--; continue; }
        if (session.qteTick! < session.qteCycleTicks - 1) session.qteTick!++;
        else if (session.qteTimeoutRule === 'reset-no-penalty') resetQteCycle(world, occupied, owner, session, trace);
        else settleQte(world, occupied, owner, session, session.qteTick!, true, trace);
      }
    },
  }],
});
