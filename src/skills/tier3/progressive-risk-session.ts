import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type {
  ProgressiveRiskInput,
  ProgressiveRiskSession,
  RandomSeed,
} from '@engine/protocol/components.js';
import { sortedIds, worldSeed } from '@engine/core/query.js';
import { chancePass } from '@atom-skills/index.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';
import {
  initializeProgressiveRiskRuntime,
  applyProgressivePassiveRisk,
  applyProgressiveQteMiss,
  emitProgressiveRiskSignal,
  finalizeProgressiveRisk,
  progressiveChanceBp,
  progressiveRiskRuntimeProblem,
  validateProgressiveRiskConfig,
  type ProgressiveRiskTraceWriter,
} from './progressive-risk-session-core.js';

export { progressiveChanceBp, validateProgressiveRiskConfig } from './progressive-risk-session-core.js';

const BP = 10_000;
const SYSTEM_ID = 'progressive-risk-session';

export const progressiveRiskSessionCapability = defineCapability({
  id: 't3-progressive-risk-session',
  version: '1.1.0',

  describe: {
    name: 'progressive-risk-session',
    summary: '渐进风险会话：固定 tick 风险与 QTE 时间窗、整数基点成长概率、有序多目标、撤退/暴露/清空终局与确定性回执。',
    semantic: ['tier3', 'session', 'risk', 'qte', 'random', 'determinism'],
    whenToUse: '任何“停留越久风险越高、在固定 tick 时间窗按压以取得有序目标、成功后选择继续或退出”的会话。输入方只发 ProgressiveRiskInput{sessionId,action,seq}；引擎判定 qte-press 命中及周期 timeout；目标严格按 targets 数组序推进；概率抽取需要世界 RandomSeed。',
    examples: [
      "开一局：ProgressiveRiskSession{id:'run',targets:[{id:'a',initialChanceBp:910}],riskRateBpPerSecond:400,ticksPerSecond:60,riskLimitBp:10000,qteMissRiskBp:1000,qteCycleTicks:90,qteWindowStartTick:60,qteWindowEndTick:72,qteDirection:'contract',growthFactorBp:1500,maxRollChanceBp:9500} + ProgressiveRiskInput{sessionId:'run',action:'start',seq:0}",
      "原始按压：ProgressiveRiskInput{sessionId:'run',action:'qte-press',seq:1}；系统按当前 qteTick 判 hit/miss，周期末无按压自动 timeout。",
    ],
  },

  components: {
    provides: {
      ProgressiveRiskSession: {
        category: 'config',
        describe: '声明式渐进风险会话的 12 个作者配置字段；可快照运行态由系统内部维护，不列入作者填写面。',
        fields: {
          id: { type: 'string', describe: '会话语义 id（输入按它路由）' },
          targets: { type: 'string', describe: '有序目标数组 [{id,initialChanceBp}]；解释器不排序、不允许跳过' },
          riskRateBpPerSecond: { type: 'number', describe: '每秒被动风险基点（整数）' },
          ticksPerSecond: { type: 'number', describe: '固定 tick 率；与余数共同精确累计每秒风险' },
          riskLimitBp: { type: 'number', describe: '风险上限；到达即 exposed' },
          qteMissRiskBp: { type: 'number', describe: 'QTE 未命中的固定风险惩罚' },
          qteCycleTicks: { type: 'number', describe: '一个 QTE 周期的固定 tick 数' },
          qteWindowStartTick: { type: 'number', describe: '命中窗口闭区间起点 tick' },
          qteWindowEndTick: { type: 'number', describe: '命中窗口闭区间终点 tick' },
          qteDirection: { type: 'string', describe: '表现投影方向 contract|expand；判定仅看 tick 窗口' },
          growthFactorBp: { type: 'number', describe: '每次抽取未中后的概率成长因子（基点）' },
          maxRollChanceBp: { type: 'number', describe: '单次抽取概率上限（基点）' },
        },
      },
      ProgressiveRiskInput: {
        category: 'intent',
        describe: '会话输入闭集：start|qte-press|continue|withdraw；seq 必须严格递增；调用方不预判 hit。',
        fields: {
          sessionId: { type: 'string', describe: '目标 ProgressiveRiskSession.id' },
          action: { type: 'string', describe: 'start|qte-press|continue|withdraw' },
          seq: { type: 'number', describe: '会话内单调整数序号' },
        },
      },
      ProgressiveRiskReceipt: {
        category: 'event',
        describe: '终局结构化回执；风险/QTE 统计是系统产出的诊断字段，不属于作者配置面。',
        fields: {
          sessionId: { type: 'string', describe: '会话 id' },
          status: { type: 'string', describe: 'withdrew|exposed|cleared|aborted' },
          acquiredIds: { type: 'string[]', describe: '按目录顺序取得的目标 id' },
          riskBp: { type: 'number', describe: '终局风险' },
          elapsedTicks: { type: 'number', describe: '终局风险 tick 数' },
        },
      },
    },
    reads: ['ProgressiveRiskSession', 'ProgressiveRiskInput', 'RandomSeed'],
    writes: ['ProgressiveRiskSession', 'ProgressiveRiskReceipt', 'RandomSeed', 'Signal'],
    consumes: ['ProgressiveRiskInput'],
  },

  config: {},

  systems: [{
    id: SYSTEM_ID,
    // Commit 天然晚于 p0 的 event-when“清旧标新”；本系统产出的新 Signal 再同拍交给 Commit 消费方。
    // 对同相会读 RandomSeed/Signal 的系统显式排前，覆盖 RNG RMW 反向推断边，保证零新增 SCC/告警。
    phase: SystemPhase.Commit,
    runsBefore: [
      'effect-apply', 'craft-recipe', 'weighted-spawn', 'matrix-duel-intent', 'cooldown',
    ],
    reads: ['ProgressiveRiskSession', 'ProgressiveRiskInput', 'RandomSeed'],
    writes: ['ProgressiveRiskSession', 'ProgressiveRiskReceipt', 'RandomSeed', 'Signal'],
    consumes: ['ProgressiveRiskInput'],
    execute(world: IWorld) {
      const traceComponent = findDebugTrace(world);
      let traceCount = 0;
      const trace: ProgressiveRiskTraceWriter = (kind, what, why) => {
        if (!traceComponent || traceCount >= 3) return;
        traceCount++;
        appendTrace(traceComponent, traceComponent.tick ?? world.getVersion(), SYSTEM_ID, kind, what, why);
      };

      const occupied = new Set(world.getAllEntities());
      const sessionEntries = sortedIds(world, 'ProgressiveRiskSession').map((owner) => ({
        owner,
        session: world.getComponent<ProgressiveRiskSession>(owner, 'ProgressiveRiskSession')!,
      }));

      // 上拍瞬时信号先回收；随后风险先于输入结算（同拍风险满值优先于 withdraw）。
      for (const { session } of sessionEntries) {
        initializeProgressiveRiskRuntime(session);
        for (const id of session.emittedSignalIds!) { world.destroyEntity(id); occupied.delete(id); }
        session.emittedSignalIds = [];
      }

      const ownersBySession = new Map<string, Array<{ owner: string; session: ProgressiveRiskSession }>>();
      for (const entry of sessionEntries) {
        const list = ownersBySession.get(entry.session.id) ?? [];
        list.push(entry);
        ownersBySession.set(entry.session.id, list);
      }

      for (const { owner, session } of sessionEntries) {
        if (session.phase !== 'active' && session.phase !== 'awaiting-continue') continue;
        const problem = validateProgressiveRiskConfig(session) ?? progressiveRiskRuntimeProblem(session);
        if (problem) { finalizeProgressiveRisk(world, occupied, owner, session, 'aborted', trace); continue; }
        applyProgressivePassiveRisk(session);
        if (session.riskBp! >= session.riskLimitBp) finalizeProgressiveRisk(world, occupied, owner, session, 'exposed', trace);
      }

      const commands = sortedIds(world, 'ProgressiveRiskInput')
        .map((owner) => ({ owner, input: world.getComponent<ProgressiveRiskInput>(owner, 'ProgressiveRiskInput')! }))
        .sort((a, b) => a.input.seq - b.input.seq || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0));
      const rng: RandomSeed | undefined = commands.length > 0 ? worldSeed(world) : undefined;

      for (const { input } of commands) {
        const matches = ownersBySession.get(input.sessionId) ?? [];
        if (matches.length !== 1) {
          trace('reject', `input:${input.sessionId} 拒收`, matches.length === 0 ? '会话不存在' : '会话 id 不唯一');
          continue;
        }
        const { owner, session } = matches[0]!;
        if (!Number.isSafeInteger(input.seq) || input.seq < 0 || input.seq <= session.lastInputSeq!) {
          trace('reject', `${session.id}:seq=${String(input.seq)} 拒收`, `last=${session.lastInputSeq}`);
          continue;
        }
        // 合法新 seq 即使动作词/相位非法也记为已见，避免同一坏包无限重放。
        session.lastInputSeq = input.seq;
        if (session.phase === 'terminal') {
          trace('reject', `${session.id}:${String(input.action)} 拒收`, '会话已终局');
          continue;
        }

        if (input.action === 'start') {
          if (session.phase !== 'idle') { trace('reject', `${session.id}:start 拒收`, `phase=${session.phase}`); continue; }
          const problem = validateProgressiveRiskConfig(session) ?? progressiveRiskRuntimeProblem(session);
          if (problem) { finalizeProgressiveRisk(world, occupied, owner, session, 'aborted', trace); continue; }
          session.phase = 'active';
          emitProgressiveRiskSignal(world, occupied, owner, session, 'started');
          trace('transition', `${session.id}:idle→active`);
          continue;
        }

        if (input.action === 'withdraw') {
          if (session.phase !== 'active' && session.phase !== 'awaiting-continue') { trace('reject', `${session.id}:withdraw 拒收`, `phase=${session.phase}`); continue; }
          finalizeProgressiveRisk(world, occupied, owner, session, 'withdrew', trace);
          continue;
        }

        if (input.action === 'continue') {
          if (session.phase !== 'awaiting-continue') { trace('reject', `${session.id}:continue 拒收`, `phase=${session.phase}`); continue; }
          session.targetIndex!++;
          if (session.targetIndex! >= session.targets.length) { finalizeProgressiveRisk(world, occupied, owner, session, 'cleared', trace); continue; }
          session.phase = 'active';
          session.qteTick = 0;
          session.qteResolved = false;
          emitProgressiveRiskSignal(world, occupied, owner, session, 'continued', session.targets[session.targetIndex!]!.id);
          trace('transition', `${session.id}:awaiting-continue→active`, `target=${session.targets[session.targetIndex!]!.id}`);
          continue;
        }

        if (input.action !== 'qte-press') {
          trace('reject', `${session.id}:${String(input.action)} 拒收`, '动作不在闭集');
          continue;
        }
        if (session.phase !== 'active') { trace('reject', `${session.id}:qte-press 拒收`, `phase=${session.phase}`); continue; }
        if (session.qteResolved) { trace('reject', `${session.id}:qte-press 拒收`, '本周期已结算'); continue; }
        session.qteResolved = true;
        const hit = session.qteTick! >= session.qteWindowStartTick && session.qteTick! <= session.qteWindowEndTick;
        if (!hit) {
          applyProgressiveQteMiss(world, occupied, owner, session, 'press-miss', trace);
          continue;
        }

        session.qteAttempts!++;
        session.qteHits!++;
        emitProgressiveRiskSignal(world, occupied, owner, session, 'qte', 'hit');
        if (!rng) {
          trace('reject', `${session.id}:loot-roll 拒收`, '缺 RandomSeed');
          continue;
        }
        const target = session.targets[session.targetIndex!]!;
        const failed = session.failedRollsByTarget![session.targetIndex!]!;
        const chance = progressiveChanceBp(target.initialChanceBp, failed, session.growthFactorBp, session.maxRollChanceBp);
        session.lootRolls!++;
        const won = chancePass(rng, chance, BP);
        trace('decision', `${session.id}:roll=${won ? 'hit' : 'miss'}`, `target=${target.id},chance=${chance}`);
        if (!won) {
          session.failedRollsByTarget![session.targetIndex!] = failed + 1;
          emitProgressiveRiskSignal(world, occupied, owner, session, 'roll', `failed:${target.id}`);
          trace('commit', `${session.id}:failedRolls=${failed + 1}`, `target=${target.id}`);
          continue;
        }

        session.failedRollsByTarget![session.targetIndex!] = 0;
        session.acquiredIds!.push(target.id);
        emitProgressiveRiskSignal(world, occupied, owner, session, 'acquired', target.id);
        if (session.targetIndex === session.targets.length - 1) {
          finalizeProgressiveRisk(world, occupied, owner, session, 'cleared', trace);
        } else {
          const from = session.phase;
          session.phase = 'awaiting-continue';
          trace('transition', `${session.id}:${from}→awaiting-continue`, `target=${target.id}`);
          trace('commit', `${session.id}:acquired=${target.id}`);
        }
      }

      // 输入之后推进固定 tick QTE 游标：让最后一个窗口 tick 仍可按压；周期末未按压自动 miss。
      for (const { owner, session } of sessionEntries) {
        if (session.phase !== 'active') continue;
        if (session.qteTick! < session.qteCycleTicks - 1) {
          session.qteTick!++;
          continue;
        }
        if (!session.qteResolved) applyProgressiveQteMiss(world, occupied, owner, session, 'timeout', trace);
        if (session.phase === 'active') {
          session.qteTick = 0;
          session.qteResolved = false;
        }
      }
    },
  }],
});
