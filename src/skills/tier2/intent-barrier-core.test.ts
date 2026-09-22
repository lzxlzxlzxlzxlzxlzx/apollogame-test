import { describe, it, expect } from 'vitest';
import type { Intent } from '@engine/protocol/agent.js';
import {
  checkIntent, draftSettle, allAccountedFor, normalizePending, orderIntents,
  type IntentBarrier, type IntentInbox,
} from './intent-barrier-core.js';

// intent-barrier-core 纯函数核（零 World）。这里钉**承重墙本身**：
// 「给定 pending + 暂存内容，产物是什么」这个函数必须与回包到达次序无关。
// 壳（intent-barrier.ts）那边再钉一遍 hash 级别的同一性质与系统定序。

const I = (npcId: string, verb: string, args?: (string | number)[], turn = 7): Intent =>
  args ? { npcId, verb, args, turn } : { npcId, verb, turn };

const B = (over: Partial<IntentBarrier> = {}): IntentBarrier => ({
  type: 'IntentBarrier', id: 'g', state: 'waiting', pending: ['npc-a', 'npc-b'],
  openedTurn: 7, deadlineTurns: 1, ticks: 0,
  verbs: [{ verb: 'move_to', arity: 1 }, { verb: 'talk_to', arity: 2 }, { verb: 'rest' }],
  defaultVerb: 'rest', resolved: [], filled: [], settledTurn: -1, ...over,
});
const IB = (deliveries: IntentInbox['deliveries'] = [], failures: IntentInbox['failures'] = []): IntentInbox =>
  ({ type: 'IntentInbox', id: 'g', deliveries, failures });

describe('闭集校验 checkIntent：三道门', () => {
  it('归属 / 动词 / 参数个数 / 参数有限性，逐条', () => {
    const b = B();
    expect(checkIntent(b, I('npc-a', 'move_to', ['z']))).toEqual({ ok: true });
    expect(checkIntent(b, I('npc-a', 'talk_to', ['npc-b', 'topic']))).toEqual({ ok: true });
    expect(checkIntent(b, I('npc-a', 'rest'))).toEqual({ ok: true });
    expect(checkIntent(b, I('ghost', 'rest'))).toEqual({ ok: false, why: 'not-pending' });
    expect(checkIntent(b, I('npc-a', 'hack_world'))).toEqual({ ok: false, why: 'verb-not-in-set' });
    expect(checkIntent(b, I('npc-a', 'move_to'))).toEqual({ ok: false, why: 'arity 0≠1' });
    expect(checkIntent(b, I('npc-a', 'rest', ['extra']))).toEqual({ ok: false, why: 'arity 1≠0' });
    expect(checkIntent(b, I('npc-a', 'move_to', [Number.NaN]))).toEqual({ ok: false, why: 'arg-not-finite' });
    expect(checkIntent(b, I('npc-a', 'move_to', [Infinity]))).toEqual({ ok: false, why: 'arg-not-finite' });
  });

  it('空动词表 = 不校验动词名与参数个数，但归属照查（两道门互不替代）', () => {
    const b = B({ verbs: [] });
    expect(checkIntent(b, I('npc-a', 'whatever', [1, 2, 3]))).toEqual({ ok: true });
    expect(checkIntent(b, I('ghost', 'whatever'))).toEqual({ ok: false, why: 'not-pending' });
  });

  it('arity 缺省 = 0（无参动词写 {verb} 就够，不必写 arity:0）', () => {
    expect(checkIntent(B({ verbs: [{ verb: 'rest' }] }), I('npc-a', 'rest', ['x']))).toEqual({ ok: false, why: 'arity 1≠0' });
  });
});

describe('承重墙 draftSettle：产物与到达次序无关', () => {
  const d = (npcId: string, verb: string, args?: (string | number)[]): IntentInbox['deliveries'][number] =>
    ({ npcId, intents: [I(npcId, verb, args)] });

  it('三份回包的**全部六种次序** → 产物逐字段相同', () => {
    const b = B({ pending: ['npc-a', 'npc-b', 'npc-c'] });
    const parts = [d('npc-a', 'move_to', ['z1']), d('npc-b', 'talk_to', ['npc-a', 't3']), d('npc-c', 'rest')];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const seen = new Set<string>();
    for (const p of perms) {
      const r = draftSettle(b, IB(p.map((i) => parts[i])), 9);
      expect(r.filled).toEqual([]);
      expect(r.rejected).toBe(0);
      seen.add(JSON.stringify(r.resolved));
    }
    expect(seen.size).toBe(1);
    expect(JSON.parse([...seen][0]).map((x: Intent) => x.npcId)).toEqual(['npc-a', 'npc-b', 'npc-c']);
  });

  it('产出序由 pending 决定，**不由回包决定**（pending 乱给也先被 normalizePending 排好）', () => {
    const b = B({ pending: normalizePending(['npc-c', 'npc-a', 'npc-b']) });
    const r = draftSettle(b, IB([d('npc-c', 'rest'), d('npc-b', 'rest'), d('npc-a', 'rest')]), 9);
    expect(r.resolved.map((x) => x.npcId)).toEqual(['npc-a', 'npc-b', 'npc-c']);
  });

  it('同一 id 重复投递：**先到的那次算**，后到的整批计入 rejected', () => {
    const b = B();
    const r = draftSettle(b, IB([d('npc-a', 'rest'), d('npc-a', 'move_to', ['z']), d('npc-b', 'rest')]), 9);
    expect(r.resolved.filter((x) => x.npcId === 'npc-a').map((x) => x.verb)).toEqual(['rest']);
    expect(r.rejected).toBe(1);
  });

  it('没着落的补默认动词并进 filled（回合号用传进来的 now）', () => {
    const b = B({ pending: ['npc-a', 'npc-b', 'npc-c'] });
    const r = draftSettle(b, IB([d('npc-b', 'rest')], [{ npcId: 'npc-c', reason: 'http 503' }]), 11);
    expect(r.resolved.map((x) => `${x.npcId}:${x.verb}:${x.turn}`)).toEqual(['npc-a:rest:11', 'npc-b:rest:7', 'npc-c:rest:11']);
    expect(r.filled).toEqual(['npc-a', 'npc-c']);
  });

  it('闭集外动词 = 等于没决策（该 id 仍补默认·并计 rejected）', () => {
    const b = B();
    const r = draftSettle(b, IB([d('npc-a', 'hack_world'), d('npc-b', 'rest')]), 9);
    expect(r.filled).toEqual(['npc-a']);
    expect(r.rejected).toBe(1);
  });

  it('一个 id 多条意图：有效的全留、顺序按它自己给的（一回合「走过去 + 搭话」）', () => {
    const b = B();
    const ib = IB([{ npcId: 'npc-a', intents: [I('npc-a', 'move_to', ['z']), I('npc-a', 'hack_world'), I('npc-a', 'rest')] }, { npcId: 'npc-b', intents: [I('npc-b', 'rest')] }]);
    const r = draftSettle(b, ib, 9);
    expect(r.resolved.filter((x) => x.npcId === 'npc-a').map((x) => x.verb)).toEqual(['move_to', 'rest']);
    expect(r.rejected).toBe(1);
  });

  it('暂存缺席（undefined）→ 全员降级，不抛', () => {
    const r = draftSettle(B(), undefined, 9);
    expect(r.filled).toEqual(['npc-a', 'npc-b']);
    expect(r.resolved).toHaveLength(2);
  });

  it('冒名顶替：回包说自己是 pending 外的 id → 按**投递键**判归属，整条拒收', () => {
    const b = B();
    const ib = IB([{ npcId: 'npc-a', intents: [{ npcId: 'npc-victim', verb: 'move_to', args: ['z'], turn: 7 }] }]);
    const r = draftSettle(b, ib, 9);
    expect(r.resolved.map((x) => x.npcId)).toEqual(['npc-a', 'npc-b']);      // 落在投递键名下
    expect(r.resolved[0].verb).toBe('move_to');
    expect(r.rejected).toBe(0);
  });
});

describe('收齐判据 allAccountedFor / 归一 normalizePending / 排序 orderIntents', () => {
  it('有效回包与明确失败都算「有着落」；缺暂存 = 没着落', () => {
    const b = B();
    expect(allAccountedFor(b, IB([{ npcId: 'npc-a', intents: [] }]))).toBe(false);
    expect(allAccountedFor(b, IB([{ npcId: 'npc-a', intents: [] }], [{ npcId: 'npc-b', reason: 'x' }]))).toBe(true);
    expect(allAccountedFor(b, IB([], [{ npcId: 'npc-a', reason: 'x' }, { npcId: 'npc-b', reason: 'y' }]))).toBe(true);
    expect(allAccountedFor(b, undefined)).toBe(false);
    expect(allAccountedFor(B({ pending: [] }), IB())).toBe(true);
  });

  it('normalizePending 去重 + 升序', () => {
    expect(normalizePending(['npc-c', 'npc-a', 'npc-c', 'npc-b'])).toEqual(['npc-a', 'npc-b', 'npc-c']);
    expect(normalizePending([])).toEqual([]);
  });

  it('orderIntents 按 npcId 升序且不改入参（广播结果落地时用）', () => {
    const src = [I('npc-c', 'rest'), I('npc-a', 'rest'), I('npc-b', 'rest')];
    expect(orderIntents(src).map((x) => x.npcId)).toEqual(['npc-a', 'npc-b', 'npc-c']);
    expect(src.map((x) => x.npcId)).toEqual(['npc-c', 'npc-a', 'npc-b']);
  });
});
