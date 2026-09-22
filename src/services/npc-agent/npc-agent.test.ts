import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/determinism.js';
import type { AgentContext, Intent } from '@engine/protocol/agent.js';
import { NullNpcAgentPort, lowestNeed } from './null-npc-agent.js';
import { HttpNpcAgentPort, parseIntents } from './http-npc-agent.js';
import { openBarrier, deliverIntents, failIntents, type IntentBarrier } from '@skills/tier2/intent-barrier.js';
import { intentBarrierCapability } from '@skills/tier2/intent-barrier.js';
import { eventWhenCapability } from '@skills/tier2/event-when.js';

// services/npc-agent（REQ-111-AINPC 的端口一半）点名测试：
//   ① NullNpcAgentPort 是**确定性桩**（同入参恒同出参·无网·无墙钟）——全库 AI 游戏的 CI 基建
//   ② 需求垫底判据与对象键序无关（同值按 key 名升序）
//   ③ HttpNpcAgentPort 绝不抛：非 2xx / 烂 JSON / 网络异常 / 超时 一律落空数组 + lastError
//   ④ 回包里的 npcId 不被采信（否则后端一句话就能代别的 NPC 下指令）
//   ⑤ 端口**不碰世界**：跑一轮决策，世界 hash 一个字节不动
//   ⑥ 端口 + barrier 串起来：桩产意图 → 门按 id 升序结算

const VERBS = [{ verb: 'move_to', arity: 1 }, { verb: 'rest' }];
const CTX = (over: Partial<AgentContext> = {}): AgentContext => ({
  npcId: 'npc-a', turn: 7, verbs: VERBS, ...over,
});

describe('① NullNpcAgentPort：确定性桩', () => {
  it('同一入参跑两次 → 产出逐字段相同（桩的全部价值就在这一条）', async () => {
    const p = new NullNpcAgentPort({ rules: [{ whenLowest: 'energy', verb: 'rest' }] });
    const a = await p.decide(CTX({ needs: { energy: 10, mood: 90 } }));
    const b = await p.decide(CTX({ needs: { energy: 10, mood: 90 } }));
    expect(a).toEqual(b);
    expect(a).toEqual([{ npcId: 'npc-a', verb: 'rest', args: undefined, turn: 7 }]);
    expect(p.log).toHaveLength(2);
  });

  it('规则按需求垫底项命中；带参规则原样透传参数', async () => {
    const p = new NullNpcAgentPort({
      rules: [{ whenLowest: 'social', verb: 'move_to', args: ['zone-cafe'] }, { whenLowest: 'energy', verb: 'rest' }],
    });
    const out = await p.decide(CTX({ needs: { energy: 80, social: 5 } }));
    expect(out).toEqual([{ npcId: 'npc-a', verb: 'move_to', args: ['zone-cafe'], turn: 7 }]);
  });

  it('规则不命中 / 无需求读数 → 产 fallbackVerb（断网降级那条路，必须恒有产出）', async () => {
    const p = new NullNpcAgentPort({ rules: [{ whenLowest: 'social', verb: 'move_to', args: ['z'] }], fallbackVerb: 'rest' });
    expect((await p.decide(CTX({ needs: { energy: 1 } })))[0].verb).toBe('rest');
    expect((await p.decide(CTX()))[0].verb).toBe('rest');
    const bare = new NullNpcAgentPort();
    expect((await bare.decide(CTX()))[0].verb).toBe('rest');          // 缺省 fallback
  });

  it('script 点名优先于规则表（测试要「这个 NPC 就吐这个」时用）', async () => {
    const p = new NullNpcAgentPort({
      rules: [{ whenLowest: 'energy', verb: 'rest' }],
      script: { 'npc-a': [{ verb: 'move_to', args: ['zone-lib'] }, { verb: 'rest' }] },
    });
    const out = await p.decide(CTX({ needs: { energy: 0 } }));
    expect(out.map((i) => i.verb)).toEqual(['move_to', 'rest']);
    expect((await p.decide(CTX({ npcId: 'npc-b', needs: { energy: 0 } })))[0].verb).toBe('rest'); // 没点名的照规则走
  });

  it('桩**不自我豁免闭集**：配一个闭集外动词，它照样吐出来（拒收链路的测试入口就靠这个）', async () => {
    const p = new NullNpcAgentPort({ script: { 'npc-a': [{ verb: 'hack_world' }] } });
    expect((await p.decide(CTX()))[0].verb).toBe('hack_world');
  });
});

describe('② 需求垫底：与对象键序无关', () => {
  it('同值按 key 名升序定死（否则换一次 JSON 序就换一个决策 → 回放对不上）', () => {
    expect(lowestNeed({ mood: 5, energy: 5 })).toBe('energy');
    expect(lowestNeed({ energy: 5, mood: 5 })).toBe('energy');
    expect(lowestNeed({ energy: 9, mood: 5 })).toBe('mood');
    expect(lowestNeed({})).toBeUndefined();
    expect(lowestNeed(undefined)).toBeUndefined();
  });

  it('两份键序相反的 needs → 桩产出相同意图', async () => {
    const p = new NullNpcAgentPort({ rules: [{ whenLowest: 'energy', verb: 'rest' }] });
    const a = await p.decide(CTX({ needs: { energy: 5, mood: 5, social: 50 } }));
    const b = await p.decide(CTX({ needs: { social: 50, mood: 5, energy: 5 } }));
    expect(a).toEqual(b);
  });
});

describe('③ HttpNpcAgentPort：绝不抛，失败一律落空数组 + lastError', () => {
  const ok = (body: unknown): typeof fetch =>
    (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;

  it('正常回包 → 解析成意图；npcId/turn 用本地的', async () => {
    const p = new HttpNpcAgentPort({ endpoint: 'https://x/decide', fetchImpl: ok({ intents: [{ verb: 'move_to', args: ['zone-lib'] }] }) });
    expect(await p.decide(CTX())).toEqual([{ npcId: 'npc-a', verb: 'move_to', args: ['zone-lib'], turn: 7 }]);
    expect(p.lastError).toBeUndefined();
  });

  it('非 2xx → [] + lastError（不抛·异步异常绝不冲进 sim 的 tick）', async () => {
    const p = new HttpNpcAgentPort({
      endpoint: 'https://x/decide',
      fetchImpl: (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch,
    });
    expect(await p.decide(CTX())).toEqual([]);
    expect(p.lastError).toBe('http 503');
  });

  it('烂 JSON / 网络异常 → [] + lastError', async () => {
    const bad = new HttpNpcAgentPort({
      endpoint: 'https://x/decide',
      fetchImpl: (async () => ({ ok: true, status: 200, json: async () => { throw new Error('Unexpected token'); } })) as unknown as typeof fetch,
    });
    expect(await bad.decide(CTX())).toEqual([]);
    expect(bad.lastError).toContain('Unexpected token');

    const down = new HttpNpcAgentPort({
      endpoint: 'https://x/decide',
      fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch,
    });
    expect(await down.decide(CTX())).toEqual([]);
    expect(down.lastError).toContain('ECONNREFUSED');
  });

  it('请求体带鉴权头与闭集动词表（后端要据此约束输出）', async () => {
    let seen: { url?: string; init?: RequestInit } = {};
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ intents: [] }) };
    }) as unknown as typeof fetch;
    const p = new HttpNpcAgentPort({ endpoint: 'https://x/decide', apiKey: 'k', fetchImpl: spy });
    await p.decide(CTX({ persona: '有边界感的咖啡店主' }));
    expect(seen.url).toBe('https://x/decide');
    expect((seen.init!.headers as Record<string, string>).authorization).toBe('Bearer k');
    const body = JSON.parse(String(seen.init!.body));
    expect(body.verbs).toEqual(VERBS);
    expect(body.persona).toBe('有边界感的咖啡店主');
    expect(body.turn).toBe(7);
  });
});

describe('④ parseIntents：只做形状归一，不判闭集', () => {
  it('裸数组 / {intents:[…]} 两种形状都认', () => {
    expect(parseIntents([{ verb: 'rest' }], 'n', 3)).toEqual([{ npcId: 'n', verb: 'rest', turn: 3 }]);
    expect(parseIntents({ intents: [{ verb: 'rest' }] }, 'n', 3)).toEqual([{ npcId: 'n', verb: 'rest', turn: 3 }]);
  });

  it('**回包里的 npcId 一律不采信**（否则后端一句 npcId:"别人" 就能代别的 NPC 下指令）', () => {
    const out = parseIntents([{ npcId: 'npc-victim', verb: 'rest' }], 'npc-a', 3);
    expect(out[0].npcId).toBe('npc-a');
  });

  it('闭集外动词**照样通过**（判闭集归 barrier：端口先过滤掉，被拒的就永远不留 reject 痕迹）', () => {
    expect(parseIntents([{ verb: 'hack_world' }], 'n', 1)[0].verb).toBe('hack_world');
  });

  it('无动词 / 非字符串动词 → 整条丢；非标量参数被剔掉；NaN/Infinity 不进 args', () => {
    expect(parseIntents([{ args: ['x'] }, { verb: 42 }, { verb: '' }], 'n', 1)).toEqual([]);
    expect(parseIntents([{ verb: 'v', args: ['a', 1, { x: 1 }, null, Number.NaN, Infinity] }], 'n', 1))
      .toEqual([{ npcId: 'n', verb: 'v', args: ['a', 1], turn: 1 }]);
  });

  it('非数组 body（null / 字符串 / 对象没 intents）→ []（不抛）', () => {
    expect(parseIntents(null, 'n', 1)).toEqual([]);
    expect(parseIntents('nope', 'n', 1)).toEqual([]);
    expect(parseIntents({ foo: 1 }, 'n', 1)).toEqual([]);
  });
});

describe('⑤⑥ 端口不碰世界 · 端口 + barrier 串通', () => {
  const world = (): World => {
    const w = new World();
    for (const c of [eventWhenCapability, intentBarrierCapability]) for (const s of c.systems) w.addSystem(s);
    w.createEntity('town');
    openBarrier(w, 'town', { id: 'g', npcIds: ['npc-a', 'npc-b'], turn: 7, deadlineTurns: 1, verbs: VERBS, defaultVerb: 'rest' });
    return w;
  };

  it('跑一轮决策（只调端口，不投递）→ 世界 hash 一个字节不动', async () => {
    const w = world();
    const before = hashSnapshot(w.snapshot());
    const p = new NullNpcAgentPort({ rules: [{ whenLowest: 'energy', verb: 'rest' }] });
    await p.decide(CTX({ needs: { energy: 1 } }));
    expect(hashSnapshot(w.snapshot())).toBe(before);
  });

  it('桩 → 投递 → 门结算：按 npcId 升序，后端挂的那个补默认动词并进 filled', async () => {
    const w = world();
    const p = new NullNpcAgentPort({ script: { 'npc-b': [{ verb: 'move_to', args: ['zone-hill'] }] } });
    const got: Intent[] = [...await p.decide(CTX({ npcId: 'npc-b' }))];
    deliverIntents(w, 'g', 'npc-b', got);
    failIntents(w, 'g', 'npc-a', 'http 503');           // 真后端挂了
    w.tick();
    const b = w.getComponent<IntentBarrier>('town', 'IntentBarrier')!;
    expect(b.resolved.map((r) => `${r.npcId}:${r.verb}`)).toEqual(['npc-a:rest', 'npc-b:move_to']);
    expect(b.filled).toEqual(['npc-a']);
  });
});
